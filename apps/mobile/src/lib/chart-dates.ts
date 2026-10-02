/** Date-label indices only; all clinical points remain on the chart. */
export function chartDateIndices(pointCount: number, plotWidth: number, labelWidth: number): number[] {
  if (!Number.isSafeInteger(pointCount) || pointCount < 1) return [];
  if (pointCount === 1) return [0];
  // End labels extend inward by a full width; an adjacent centred label by
  // half a width. Leave a gap and account for rounding to actual point indices.
  const spacing = Math.max(labelWidth, 1) * 1.5 + 8;
  const capacity = Math.min(5, pointCount, 1 + Math.floor(Math.max(plotWidth, 0) / spacing));
  for (let count = capacity; count >= 2; count--) {
    const indices = Array.from({ length: count }, (_, i) => Math.round((i * (pointCount - 1)) / (count - 1)));
    const fits = indices.every(
      (index, i) => i === 0 || ((index - indices[i - 1]!) * plotWidth) / (pointCount - 1) >= spacing,
    );
    if (fits) return indices;
  }
  return [pointCount - 1];
}
