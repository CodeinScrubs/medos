import { describe, expect, it } from '@jest/globals';

import { chartDateIndices } from './chart-dates';

describe('date label sampling', () => {
  it('handles empty/single/narrow series without manufacturing point indices', () => {
    expect(chartDateIndices([], 65)).toEqual([]);
    expect(chartDateIndices([140], 65)).toEqual([0]);
    expect(chartDateIndices([4, 5, 6, 6, 16, 40], 65)).toEqual([5]);
    expect(
      chartDateIndices(
        Array.from({ length: 22 }, (_, i) => (i * 220) / 21),
        65,
      ),
    ).toEqual([0, 21]);
  });

  it('keeps rounded indices distinct and spaced across dense and sparse phone/tablet series', () => {
    for (const width of [80, 180, 220, 264, 320, 600]) {
      for (const labelWidth of [26, 65]) {
        for (let count = 2; count <= 120; count++) {
          const positions = Array.from({ length: count }, (_, i) => (i * width) / (count - 1));
          const labels = chartDateIndices(positions, labelWidth);
          expect(labels.length).toBeGreaterThan(0);
          expect(labels.length).toBeLessThanOrEqual(5);
          expect(labels[labels.length - 1]).toBe(count - 1);
          if (labels.length > 1) expect(labels[0]).toBe(0);
          labels.forEach((index, i) => {
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(count);
            if (i > 0) {
              expect(index).toBeGreaterThan(labels[i - 1]!);
              expect(positions[index]! - positions[labels[i - 1]!]!).toBeGreaterThanOrEqual(labelWidth * 1.5 + 8);
            }
          });
        }
      }
    }
  });

  it('does not put several labels on a cluster of simultaneous or closely timed readings', () => {
    expect(chartDateIndices([44, 44, 44.1, 46, 50, 158, 263], 52)).toEqual([0, 5, 6]);
    expect(chartDateIndices([140, 140, 140], 52)).toEqual([2]);
  });
});
