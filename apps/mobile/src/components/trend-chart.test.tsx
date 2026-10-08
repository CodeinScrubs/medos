import { describe, expect, it, jest } from '@jest/globals';
import { Circle, Path, Text as SvgText } from 'react-native-svg';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TrendChart } from './trend-chart';
import { Text } from './ui/text';

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
jest.mock('./ui/text', () => ({ Text: 'AppText' }));

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

describe('numeric chart stability (SVG stand-ins)', () => {
  async function render(points: { value: number; at: Date }[], formatDate = jest.fn(() => 'date'), refLow?: number) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<TrendChart points={points} formatDate={formatDate} refLow={refLow} />);
    });
    await act(async () => {
      tree.root
        .findAll((node) => typeof node.props.onLayout === 'function')[0]!
        .props.onLayout({
          nativeEvent: { layout: { width: 280 } },
        });
    });
    return tree;
  }
  const points = (...values: number[]) => values.map((value) => ({ value, at: new Date('2026-10-01T08:00:00Z') }));
  const axis = (tree: ReactTestRenderer) => tree.root.findAllByType(SvgText).filter((node) => !node.props.fontFamily);

  it('finishes when a nice step is smaller than the spacing of adjacent large floats', async () => {
    const tree = await render(points(1e20, 1e20 + 16384));
    try {
      expect(axis(tree).length).toBeLessThanOrEqual(11);
      expect(tree.root.findByType(Path).props.d).not.toMatch(/NaN|Infinity/);
      expect(tree.root.findAllByType(Circle)).toHaveLength(2);
    } finally {
      await act(async () => tree.unmount());
    }
  });
  it('keeps nearby fractional labels distinct instead of rounding them all to an integer', async () => {
    const tree = await render(points(125.5, 125.6));
    try {
      const labels = axis(tree).map((node) => node.props.children);
      expect(labels).toContain('125.55');
      expect(new Set(labels).size).toBe(labels.length);
    } finally {
      await act(async () => tree.unmount());
    }
  });
  it('does not label a small nonzero scale as a series of zeroes', async () => {
    const tree = await render(points(1e-7, 2e-7));
    try {
      expect(axis(tree).some((node) => node.props.children !== '0')).toBe(true);
    } finally {
      await act(async () => tree.unmount());
    }
  });
  it.each(['NaN', 'infinity', 'invalid date', 'invalid reference', 'overflow', 'equal subnormal'] as const)(
    'keeps %s out of SVG geometry and does not format invalid dates',
    async (kind) => {
      const formatDate = jest.fn(() => 'date');
      const input =
        kind === 'overflow'
          ? points(0, Number.MAX_VALUE)
          : kind === 'equal subnormal'
            ? points(Number.MIN_VALUE, Number.MIN_VALUE)
            : points(kind === 'NaN' ? NaN : kind === 'infinity' ? Infinity : 5);
      if (kind === 'invalid date') input[0]!.at = new Date('invalid');
      const tree = await render(input, formatDate, kind === 'invalid reference' ? NaN : undefined);
      try {
        expect(tree.root.findAllByType(Path)).toHaveLength(0);
        expect(tree.root.findByType(Text).props.children).toBe('این مقادیر قابل رسم نیستند.');
        expect(formatDate).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree.unmount());
      }
    },
  );
});
