import { choosePlateRectangle, type PlateRectangle } from '../plateGeometry';

const rect = (
  left: number,
  top: number,
  right: number,
  bottom: number,
  confidence = 0.9,
): PlateRectangle => ({
  confidence,
  corners: [left, top, right, top, right, bottom, left, bottom],
});

describe('choosePlateRectangle', () => {
  it('uses a partial OCR text box to select the encompassing physical plate', () => {
    const centeredVehicleTrim = rect(0.2, 0.4, 0.8, 0.62, 0.98);
    const plateAroundHint = rect(0.08, 0.26, 0.92, 0.7, 0.78);

    const result = choosePlateRectangle(
      [centeredVehicleTrim, plateAroundHint],
      { left: 0.58, top: 0.38, width: 0.24, height: 0.18 },
      1200,
      600,
    );

    expect(result?.corners).toEqual(plateAroundHint.corners);
  });

  it('rejects tiny, square, and low-confidence rectangles', () => {
    expect(
      choosePlateRectangle(
        [
          rect(0.49, 0.49, 0.53, 0.53),
          rect(0.35, 0.2, 0.65, 0.8),
          rect(0.1, 0.3, 0.9, 0.7, 0.2),
        ],
        null,
        1200,
        600,
      ),
    ).toBeNull();
  });

  it('prefers a centered plate-like rectangle when OCR has no hint', () => {
    const edge = rect(0.02, 0.05, 0.55, 0.3, 0.9);
    const center = rect(0.18, 0.28, 0.82, 0.72, 0.9);
    const result = choosePlateRectangle([edge, center], null, 1200, 600);
    expect(result?.corners).toEqual(center.corners);
  });
});
