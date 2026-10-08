import { describe, expect, it } from '@jest/globals';

import {
  containedImageRect,
  cropBetween,
  decodeImageDocument,
  decodeImageDraft,
  displayToSource,
  encodeImageDocument,
  encodeImageDraft,
  imagePanBound,
  initialImageDocument,
  sourceToDisplay,
  viewportToSource,
} from './image-edit';

describe('non-destructive image documents', () => {
  it('round-trips exact Persian/English text and incomplete typing separately from published marks', () => {
    const image = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    const pendingText = {
      id: 'synthetic-text',
      x: 20,
      y: 30,
      size: 25,
      width: 400,
      color: 'red' as const,
      text: '  ضایعه ECG 12.5\nدست چپ  ',
    };
    expect(decodeImageDraft(encodeImageDraft({ version: 1, image, pendingText }))).toEqual({
      version: 1,
      image,
      pendingText,
    });
    expect(image.marks).toHaveLength(0);
  });
  it.each([NaN, Infinity, -1])('rejects invalid image coordinates %s instead of storing a plausible mark', (x) => {
    const image = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    expect(() =>
      encodeImageDocument({
        ...image,
        marks: [{ id: 'bad', kind: 'pen', color: 'red', width: 2, points: [{ x, y: 20 }] }],
      }),
    ).toThrow();
  });
  it('rejects out-of-frame crop, marks, future versions and unsafe file paths', () => {
    const image = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    expect(() => encodeImageDocument({ ...image, crop: { x: 639, y: 0, width: 2, height: 30 } })).toThrow();
    expect(() => decodeImageDocument(JSON.stringify({ ...image, version: 2 }))).toThrow();
    expect(() => initialImageDocument('media/../private.txt', 640, 480)).toThrow();
    expect(() => initialImageDocument('file:///outside.jpg', 640, 480)).toThrow();
    expect(() => decodeImageDocument('broken')).toThrow();
  });
  it('round-trips an escaped document larger than the old asymmetric decode limit', () => {
    const image = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    image.marks = Array.from({ length: 200 }, (_, i) => ({
      id: `text-${i}`,
      kind: 'text' as const,
      color: 'red' as const,
      x: 0,
      y: 0,
      size: 20,
      width: 500,
      text: '\\'.repeat(2000),
    }));
    const body = encodeImageDocument(image);
    expect(body.length).toBeGreaterThan(600000);
    expect(decodeImageDocument(body)).toEqual(image);
    expect(decodeImageDraft(encodeImageDraft({ version: 1, image, pendingText: null })).image).toEqual(image);
  });
  it('rejects repeated mark ids and rejects oversized content before it reaches persistence', () => {
    const image = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    image.marks = Array.from({ length: 200 }, (_, i) => ({
      id: `text-${i}`,
      kind: 'text' as const,
      color: 'red' as const,
      x: 0,
      y: 0,
      size: 20,
      width: 500,
      text: '\u0001'.repeat(2000),
    }));
    expect(() => encodeImageDocument(image)).toThrow('بزرگ');
    image.marks = [image.marks[0]!, image.marks[0]!];
    expect(() => encodeImageDocument(image)).toThrow('تکراری');
  });
});

describe('image-space geometry', () => {
  it('cannot pan a thin landscape image completely outside a portrait viewport', () => {
    const fit = containedImageRect(400, 800, 400, 100);
    expect(fit).toEqual({ x: 0, y: 350, width: 400, height: 100 });
    expect(imagePanBound(fit.height, 800, 6)).toBe(0);
    expect(imagePanBound(fit.width, 400, 6)).toBe(1000);
    expect(imagePanBound(100, 800, 1)).toBe(0);
  });
  it.each([0, 1, 2, 3] as const)(
    'maps cropped source coordinates through rotation %s without mirrored RTL coordinates',
    (rotation) => {
      const doc = {
        ...initialImageDocument('media/synthetic/grid.jpg', 640, 480),
        crop: { x: 80, y: 40, width: 320, height: 240 },
        rotation,
      };
      for (const p of [
        { x: 80, y: 40 },
        { x: 400, y: 280 },
        { x: 250, y: 133 },
      ])
        expect(displayToSource(sourceToDisplay(p, doc), doc)).toEqual(p);
    },
  );
  it('rejects letterbox touches and inverts zoom and pan before placing a mark', () => {
    const doc = initialImageDocument('media/synthetic/thin.jpg', 400, 100);
    expect(viewportToSource({ x: 200, y: 100 }, doc, { width: 400, height: 800 })).toBeNull();
    expect(viewportToSource({ x: 200, y: 400 }, doc, { width: 400, height: 800 })).toEqual({ x: 200, y: 50 });
    expect(viewportToSource({ x: 310, y: 430 }, doc, { width: 400, height: 800 }, 2, 10, 10)).toEqual({
      x: 250,
      y: 60,
    });
  });
  it('creates the same crop in either dragging direction and ignores accidental taps', () => {
    const doc = initialImageDocument('media/synthetic/grid.jpg', 640, 480);
    expect(cropBetween({ x: 400, y: 300 }, { x: 100, y: 50 }, doc)).toEqual({ x: 100, y: 50, width: 300, height: 250 });
    expect(cropBetween({ x: 100, y: 50 }, { x: 400, y: 300 }, doc)).toEqual({ x: 100, y: 50, width: 300, height: 250 });
    expect(cropBetween({ x: 100, y: 50 }, { x: 101, y: 51 }, doc)).toBeNull();
  });
});
