import { describe, expect, it } from '@jest/globals';

import { palette } from './tokens';

// WCAG sRGB conversion, independent of UI rendering and the chosen hex values.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

describe.each(['light', 'dark'] as const)('%s secondary text contrast', (scheme) => {
  it.each(['background', 'surface', 'surfaceAlt', 'surfaceSunken'] as const)('is readable on %s', (surface) => {
    const foreground = luminance(palette[scheme].textFaint);
    const background = luminance(palette[scheme][surface]);
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
