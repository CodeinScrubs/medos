import { describe, expect, it, jest } from '@jest/globals';
import { Circle, Text as SvgText } from 'react-native-svg';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrendChart } from './trend-chart';

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  Line: 'Line',
  Path: 'Path',
  Rect: 'Rect',
  Text: 'SvgText',
}));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: {}, typography: { tiny: { fontFamily: 'Vazirmatn' } } }) }));

describe('trend date layout (SVG stand-ins, not native font measurement)', () => {
  it.each([2, 6, 8, 10, 11, 22, 100])('keeps %i readings, but dates stay inside and apart', async (count) => {
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <TrendChart
            points={Array.from({ length: count }, (_, i) => ({ at: new Date(2026, 0, i + 1), value: i + 1 }))}
            formatDate={() => '۱۴۰۵/۰۷/۱۰'}
          />,
        );
      });
      await act(async () => {
        tree.root
          .findAll((node) => typeof node.props.onLayout === 'function')[0]!
          .props.onLayout({
            nativeEvent: { layout: { width: 280 } },
          });
      });
      const labels = tree.root.findAll((node) => node.type === SvgText && node.props.fontFamily);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels.length).toBeLessThanOrEqual(5);
      const intervals = labels.map((node) => {
        // Conservative width budget for ten date glyphs at size 10.
        const width = 65;
        const x = node.props.x as number;
        const left =
          node.props.textAnchor === 'start' ? x : node.props.textAnchor === 'end' ? x - width : x - width / 2;
        return { left, right: left + width };
      });
      intervals.forEach((bounds, i) => {
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(280);
        if (i > 0) expect(bounds.left - intervals[i - 1]!.right).toBeGreaterThanOrEqual(8);
      });
      expect(tree.root.findAllByType(Circle)).toHaveLength(count);
      expect(labels[0]!.props.textAnchor).toBe('start');
      expect(labels[labels.length - 1]!.props.textAnchor).toBe('end');
    } finally {
      if (tree) await act(async () => tree.unmount());
    }
  });
});
