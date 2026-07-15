import { frameToCrop, type FrameLayout } from '../frameCrop';

// Portrait preview (iPhone), frame centered horizontally, upper-middle vertically.
const frame: FrameLayout = {
  pageX: 46, pageY: 264, width: 300, height: 172,
  previewX: 0, previewY: 0, previewWidth: 393, previewHeight: 852,
};

describe('frameToCrop orientation handling', () => {
  it('maps a landscape (raw sensor) photo into upright portrait crop space', () => {
    // takePictureAsync reports raw landscape dims; manipulateAsync crops upright.
    const crop = frameToCrop(frame, 1920, 1080, 20);
    // Upright space is 1080w x 1920h. The frame sits ~28-53% down the screen,
    // so the crop must land in the vertical MIDDLE of a 1920-tall image — not
    // the top (the pre-fix bug grabbed the very top of a 1080-tall landscape).
    expect(crop.originY).toBeGreaterThan(400);
    expect(crop.originY).toBeLessThan(700);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(1080);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(1920);
    // Plate-shaped crop (wider than tall).
    expect(crop.width).toBeGreaterThan(crop.height);
  });

  it('gives the same crop whether photo dims arrive as WxH or HxW', () => {
    const a = frameToCrop(frame, 1920, 1080, 20);
    const b = frameToCrop(frame, 1080, 1920, 20);
    expect(a).toEqual(b);
  });

  it('keeps the crop within image bounds', () => {
    const crop = frameToCrop(frame, 1920, 1080, 20);
    expect(crop.originX).toBeGreaterThanOrEqual(0);
    expect(crop.originY).toBeGreaterThanOrEqual(0);
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
  });
});
