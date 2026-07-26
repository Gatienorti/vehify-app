import PlateDetectorNative, {
  type NativeRectangle,
  type NativeRectification,
} from 'vehify-plate-detector';
import type { OcrBounding } from './plateScore';
import { choosePlateRectangle } from './plateGeometry';

export interface DetectedPlateCrop extends NativeRectification {
  confidence: number;
  aspect: number;
  area: number;
}

function normalizeHint(
  hint: OcrBounding | null,
  imageWidth: number,
  imageHeight: number,
) {
  if (!hint) return null;
  return {
    left: hint.left / imageWidth,
    top: hint.top / imageHeight,
    width: hint.width / imageWidth,
    height: hint.height / imageHeight,
  };
}

/** iOS-only for now. Missing module, no rectangle, or native error = fallback. */
export async function detectAndRectifyPlate(
  uri: string,
  hint: OcrBounding | null,
  imageWidth: number,
  imageHeight: number,
): Promise<DetectedPlateCrop | null> {
  if (!PlateDetectorNative) return null;
  try {
    const rectangles = (await PlateDetectorNative.detectRectanglesAsync(
      uri,
    )) as NativeRectangle[];
    const selected = choosePlateRectangle(
      rectangles,
      normalizeHint(hint, imageWidth, imageHeight),
      imageWidth,
      imageHeight,
    );
    if (!selected) return null;

    const output = await PlateDetectorNative.rectifyPlateAsync(uri, [...selected.corners]);
    if (
      !output?.rectifiedUri ||
      !output.previewUri ||
      output.width <= 0 ||
      output.height <= 0
    ) {
      return null;
    }
    return {
      ...output,
      confidence: selected.confidence,
      aspect: selected.aspect,
      area: selected.area,
    };
  } catch (error) {
    if (__DEV__) console.log('[plateCorners] native detector fallback:', error);
    return null;
  }
}
