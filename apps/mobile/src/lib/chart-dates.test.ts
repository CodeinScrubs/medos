import { describe, expect, it } from '@jest/globals';

import { chartDateIndices } from './chart-dates';

describe('date label sampling', () => {
  it('handles empty/single/narrow series without manufacturing point indices', () => {
    expect(chartDateIndices(0, 240, 65)).toEqual([]);
    expect(chartDateIndices(1, 240, 65)).toEqual([0]);
    expect(chartDateIndices(6, 40, 65)).toEqual([5]);
    expect(chartDateIndices(22, 220, 65)).toEqual([0, 21]);
  });

  it('keeps rounded indices distinct and spaced across dense and sparse phone/tablet series', () => {
    for (const width of [80, 180, 220, 264, 320, 600]) {
      for (const labelWidth of [26, 65]) {
        for (let count = 2; count <= 120; count++) {
          const labels = chartDateIndices(count, width, labelWidth);
          expect(labels.length).toBeGreaterThan(0);
          expect(labels.length).toBeLessThanOrEqual(5);
          expect(labels[labels.length - 1]).toBe(count - 1);
          if (labels.length > 1) expect(labels[0]).toBe(0);
          labels.forEach((index, i) => {
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(count);
            if (i > 0) {
              expect(index).toBeGreaterThan(labels[i - 1]!);
              expect(((index - labels[i - 1]!) * width) / (count - 1)).toBeGreaterThanOrEqual(labelWidth * 1.5 + 8);
            }
          });
        }
      }
    }
  });
});
