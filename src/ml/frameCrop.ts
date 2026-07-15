/**
 * Maps the ScannerFrame's on-screen position to a crop rectangle in camera
 * image pixel space, accounting for the camera preview's cover (fill) behavior.
 *
 * Cover mode: the image is scaled up until BOTH axes fill the preview, then the
 * overflowing axis is center-cropped. The px-per-pt scale is therefore the
 * SMALLER of imgW/previewW and imgH/previewH (the axis that needs more zoom
 * dictates the scale). Screen points outside the preview's visible image map
 * into the overflow margins.
 */

export interface FrameLayout {
  /** Frame position in window coordinates (View.measure pageX/pageY). */
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  /** Camera preview's own box in window coordinates. */
  previewX: number;
  previewY: number;
  previewWidth: number;
  previewHeight: number;
}

export interface ImageCrop {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * The image dimensions in the UPRIGHT space that manipulateAsync crops in.
 * `takePictureAsync` may report raw sensor dims (landscape); if that orientation
 * doesn't match the preview, the upright dims are swapped.
 */
export function uprightDims(
  rawImgW: number,
  rawImgH: number,
  previewWidth: number,
  previewHeight: number,
): { width: number; height: number } {
  const previewPortrait = previewHeight >= previewWidth;
  const photoPortrait = rawImgH >= rawImgW;
  return previewPortrait === photoPortrait
    ? { width: rawImgW, height: rawImgH }
    : { width: rawImgH, height: rawImgW };
}

/**
 * Convert a screen-space frame rect into an image-pixel crop rect.
 * @param padding Extra margin around the frame, in screen points.
 *
 * NOTE ON ORIENTATION: `takePictureAsync` reports `photo.width/height` in the
 * RAW sensor space (landscape on iOS, e.g. 1920×1080) with an EXIF rotation
 * flag. `manipulateAsync` applies that rotation FIRST, so it crops in the
 * UPRIGHT space (portrait 1080×1920). We must therefore do all math in upright
 * space: if the photo's orientation doesn't match the preview's, swap w/h.
 */
export function frameToCrop(
  frame: FrameLayout,
  rawImgW: number,
  rawImgH: number,
  padX = 40,
  padY = padX,
): ImageCrop {
  const { pageX, pageY, width, height, previewX, previewY, previewWidth, previewHeight } = frame;

  // Match the image orientation to the preview (upright space that crop uses).
  const { width: imgW, height: imgH } = uprightDims(rawImgW, rawImgH, previewWidth, previewHeight);

  // px per pt. min, not max: the axis that must zoom further to cover wins.
  const coverScale = Math.min(imgW / previewWidth, imgH / previewHeight);

  // How far the image extends beyond each preview edge, in screen points.
  const overflowX = (imgW / coverScale - previewWidth) / 2;
  const overflowY = (imgH / coverScale - previewHeight) / 2;

  // Frame position relative to the preview's top-left.
  const fx = pageX - previewX;
  const fy = pageY - previewY;

  const cropLeft   = Math.max(0,    Math.round((fx          - padX + overflowX) * coverScale));
  const cropTop    = Math.max(0,    Math.round((fy          - padY + overflowY) * coverScale));
  const cropRight  = Math.min(imgW, Math.round((fx + width  + padX + overflowX) * coverScale));
  const cropBottom = Math.min(imgH, Math.round((fy + height + padY + overflowY) * coverScale));

  return {
    originX: cropLeft,
    originY: cropTop,
    width: Math.max(1, cropRight - cropLeft),
    height: Math.max(1, cropBottom - cropTop),
  };
}
