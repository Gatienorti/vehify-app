export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PlateRectangle {
  confidence: number;
  /** TL, TR, BR, BL in normalized top-left image coordinates. */
  corners: readonly number[];
}

export interface PlateRectangleHint {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RankedPlateRectangle extends PlateRectangle {
  aspect: number;
  area: number;
  score: number;
}

function pointsOf(corners: readonly number[]): NormalizedPoint[] | null {
  if (corners.length !== 8 || corners.some((value) => !Number.isFinite(value))) return null;
  const points: NormalizedPoint[] = [];
  for (let i = 0; i < corners.length; i += 2) {
    const x = corners[i]!;
    const y = corners[i + 1]!;
    if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return null;
    points.push({ x, y });
  }
  return points;
}

function polygonArea(points: readonly NormalizedPoint[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function distance(
  a: NormalizedPoint,
  b: NormalizedPoint,
  imageWidth: number,
  imageHeight: number,
): number {
  return Math.hypot((a.x - b.x) * imageWidth, (a.y - b.y) * imageHeight);
}

function containsPoint(points: readonly NormalizedPoint[], point: NormalizedPoint): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Rank Vision rectangle observations as physical US plates. The OCR text box
 * is a hint, not a requirement: a clipped text read like AC392 should pull the
 * encompassing 8B AC392 rectangle upward without preventing detector recovery
 * when OCR found nothing.
 */
export function choosePlateRectangle(
  rectangles: readonly PlateRectangle[],
  hint: PlateRectangleHint | null,
  imageWidth: number,
  imageHeight: number,
): RankedPlateRectangle | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;
  const hintCenter = hint
    ? { x: hint.left + hint.width / 2, y: hint.top + hint.height / 2 }
    : null;

  const ranked: RankedPlateRectangle[] = [];
  for (const rectangle of rectangles) {
    const points = pointsOf(rectangle.corners);
    if (!points || rectangle.confidence < 0.35) continue;

    const area = polygonArea(points);
    if (area < 0.025 || area > 0.94) continue;

    const top = distance(points[0]!, points[1]!, imageWidth, imageHeight);
    const right = distance(points[1]!, points[2]!, imageWidth, imageHeight);
    const bottom = distance(points[2]!, points[3]!, imageWidth, imageHeight);
    const left = distance(points[3]!, points[0]!, imageWidth, imageHeight);
    const width = (top + bottom) / 2;
    const height = (left + right) / 2;
    const aspect = width / Math.max(1, height);
    if (aspect < 1.25 || aspect > 4.5) continue;

    const center = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    const centerDistance = Math.hypot(center.x - 0.5, center.y - 0.5);
    const aspectFit = Math.max(0, 1 - Math.abs(Math.log(aspect / 2.0)));
    const containsHint = hintCenter ? containsPoint(points, hintCenter) : false;

    const score =
      rectangle.confidence * 2.2 +
      aspectFit * 1.5 +
      Math.sqrt(area) * 0.8 -
      centerDistance * 0.7 +
      (containsHint ? 3 : 0);
    ranked.push({ ...rectangle, aspect, area, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0] ?? null;
}
