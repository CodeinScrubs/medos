import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AnnotatedImage } from '@/components/annotated-image';
import { initialImageDocument, type ImageDocument } from '@/lib/image-edit';

import { ImageEditCanvas, type ImageTool } from './image-edit-canvas';

type Pointer = { x: number; y: number; scale: number; translationX: number; translationY: number };
type Callbacks = Record<string, (event: Pointer, success?: boolean) => void>;
type Builder = { enabledValue: boolean; callbacks: Callbacks };
const mockGestures: Record<string, Builder> = {};
jest.mock('react-native-gesture-handler', () => {
  function builder(kind: string) {
    const b = {
      enabledValue: true,
      callbacks: {} as Callbacks,
      enabled(value: boolean) {
        this.enabledValue = value;
        return this;
      },
      maxPointers() {
        return this;
      },
      minDistance() {
        return this;
      },
      runOnJS() {
        return this;
      },
      onBegin(fn: Callbacks[string]) {
        this.callbacks.begin = fn;
        return this;
      },
      onStart(fn: Callbacks[string]) {
        this.callbacks.start = fn;
        return this;
      },
      onUpdate(fn: Callbacks[string]) {
        this.callbacks.update = fn;
        return this;
      },
      onEnd(fn: Callbacks[string]) {
        this.callbacks.end = fn;
        return this;
      },
      onFinalize(fn: Callbacks[string]) {
        this.callbacks.finalize = fn;
        return this;
      },
    };
    mockGestures[kind] = b;
    return b;
  }
  return {
    GestureDetector: 'GestureDetector',
    Gesture: {
      Pan: () => builder('pan'),
      Pinch: () => builder('pinch'),
      Tap: () => builder('tap'),
      Simultaneous: () => ({}),
    },
  };
});
jest.mock('@/components/annotated-image', () => ({ AnnotatedImage: 'AnnotatedImage' }));
jest.mock('@/components/feedback', () => ({ notify: jest.fn() }));
jest.mock('@/platform/media', () => ({ mediaUri: (path: string) => `file://${path}` }));
jest.mock('@/lib/ids', () => ({ newId: () => 'synthetic-stroke' }));
let tree: ReactTestRenderer | undefined;
const change = jest.fn<(doc: ImageDocument, begin?: boolean) => boolean>();
const text = jest.fn();
const activity = jest.fn();
const pointer = (x: number, y: number, extra: Partial<Pointer> = {}): Pointer => ({
  x,
  y,
  scale: 1,
  translationX: 0,
  translationY: 0,
  ...extra,
});
async function render(tool: ImageTool, document = initialImageDocument('media/synthetic.jpg', 1000, 500)) {
  change.mockReset().mockReturnValue(true);
  text.mockClear();
  activity.mockClear();
  await act(async () => {
    tree = create(
      <ImageEditCanvas
        document={document}
        tool={tool}
        color="red"
        thick={false}
        disabled={false}
        onChange={change}
        onText={text}
        onLoad={() => {}}
        onActivity={activity}
      />,
    );
  });
  await act(async () =>
    tree!.root.findAllByType(View)[0]!.props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }),
  );
}
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
});
describe('post-render pointer contracts', () => {
  it.each(['pen', 'highlight', 'arrow'] as const)('keeps the original touch-down point of a %s', async (tool) => {
    await render(tool);
    await act(async () => mockGestures.pan!.callbacks.begin?.(pointer(100, 200)));
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(110, 205)));
    const mark = change.mock.calls[0]![0].marks[0]!;
    expect(mark.kind === 'arrow' ? mark.start : mark.kind === 'text' ? null : mark.points[0]).toEqual({
      x: 250,
      y: 250,
    });
  });
  it('refuses to reinterpret a touch-down after a resize before activation', async () => {
    await render('arrow');
    await act(async () => mockGestures.pan!.callbacks.begin?.(pointer(100, 200)));
    await act(async () =>
      tree!.root.findAllByType(View)[0]!.props.onLayout({ nativeEvent: { layout: { width: 400, height: 360 } } }),
    );
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(110, 205)));
    expect(change).not.toHaveBeenCalled();
  });
  it('does not turn a letterbox touch into a stroke when activation occurs over the photo', async () => {
    await render('arrow');
    await act(async () => mockGestures.pan!.callbacks.begin?.(pointer(100, 50)));
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(110, 205)));
    expect(change).not.toHaveBeenCalled();
  });
  it.each(['pen', 'highlight'] as const)('erases the middle of a sparse %s segment', async (kind) => {
    await render('erase', {
      ...initialImageDocument('media/synthetic.jpg', 1000, 500),
      marks: [
        {
          id: 'sparse-stroke',
          kind,
          color: 'red',
          width: 4,
          points: [
            { x: 50, y: 200 },
            { x: 950, y: 200 },
          ],
        },
      ],
    });
    await act(async () => mockGestures.tap!.callbacks.end!(pointer(200, 180), true));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ marks: [] }));
  });
  it.each(['pen', 'highlight', 'arrow'] as const)('keeps the final release point of a %s gesture', async (tool) => {
    await render(tool);
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(100, 200)));
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(200, 200)));
    await act(async () => mockGestures.pan!.callbacks.end!(pointer(300, 220)));
    const mark = change.mock.calls.at(-1)![0].marks[0]!;
    expect(
      mark.kind === 'arrow' ? mark.end : mark.kind === 'pen' || mark.kind === 'highlight' ? mark.points.at(-1) : null,
    ).toEqual({ x: 750, y: 300 });
  });
  it('keeps text taps independent of pan finalization and ignores letterboxing', async () => {
    await render('text');
    expect(mockGestures.pan!.enabledValue).toBe(false);
    await act(async () => mockGestures.tap!.callbacks.end!(pointer(100, 10), true));
    expect(text).not.toHaveBeenCalled();
    await act(async () => mockGestures.tap!.callbacks.end!(pointer(100, 200), true));
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ x: 250, y: 250, text: '' }));
    expect(activity).not.toHaveBeenCalled();
  });
  it('cannot advance a stroke whose first command was refused', async () => {
    await render('pen');
    change.mockReturnValue(false);
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(100, 200)));
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(200, 200)));
    expect(change).toHaveBeenCalledTimes(1);
    await act(async () => mockGestures.pan!.callbacks.finalize!(pointer(200, 200)));
    expect(activity.mock.calls).toEqual([[true], [false]]);
  });
  it('serializes the initial point and continued stroke as one undo command', async () => {
    await render('highlight');
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(100, 200)));
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(200, 200)));
    expect(change.mock.calls[0]![1]).toBe(true);
    expect(change.mock.calls[1]![1]).toBe(false);
    expect(change.mock.calls[1]![0].marks[0]).toEqual(
      expect.objectContaining({
        kind: 'highlight',
        points: [
          { x: 250, y: 250 },
          { x: 500, y: 250 },
        ],
      }),
    );
  });
  it('does not let interleaved pan updates reset pinch scale', async () => {
    await render('view');
    await act(async () => {
      mockGestures.pan!.callbacks.start!(pointer(200, 200));
      mockGestures.pinch!.callbacks.start!(pointer(200, 200));
      mockGestures.pinch!.callbacks.update!(pointer(200, 200, { scale: 2 }));
    });
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(220, 200, { translationX: 20 })));
    const scene = tree!.root.findByType(AnnotatedImage);
    const transform = scene.parent!.props.style[1].transform;
    expect(transform).toEqual([{ translateX: 20 }, { translateY: 0 }, { scale: 2 }]);
  });
  it('keeps accepted points and stops a gesture when the coordinate frame resizes', async () => {
    await render('pen');
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(100, 200)));
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(200, 200)));
    await act(async () =>
      tree!.root.findAllByType(View)[0]!.props.onLayout({ nativeEvent: { layout: { width: 400, height: 360 } } }),
    );
    await act(async () => mockGestures.pan!.callbacks.update!(pointer(300, 200)));
    expect(change).toHaveBeenCalledTimes(2);
    expect(activity.mock.calls.at(-1)).toEqual([false]);
  });
  it('commits a source-space crop from the full letterboxed image', async () => {
    await render('crop');
    await act(async () => mockGestures.pan!.callbacks.start!(pointer(40, 120)));
    await act(async () => mockGestures.pan!.callbacks.end!(pointer(360, 280)));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ crop: { x: 100, y: 50, width: 800, height: 400 } }));
  });
});
