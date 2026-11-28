/** Sample sorted pixel positions without dropping any clinical points. */
export function chartDateIndices(positions: readonly number[], labelWidth: number): number[] {
  if (positions.length === 0) return [];
  const last = positions.length - 1;
  const start = positions[0]!;
  const end = positions[last]!;
  // End labels extend inward by a full width; a centred neighbour by half.
  const spacing = Math.max(labelWidth, 1) * 1.5 + 8;
  if (end - start < spacing) return [last];
  const indices = [0];
  let previous = start;
  for (let i = 1; i < last && indices.length < 4; i++) {
    const position = positions[i]!;
    if (position - previous < spacing) continue;
    if (end - position < spacing) break;
    indices.push(i);
    previous = position;
  }
  return [...indices, last];
}
