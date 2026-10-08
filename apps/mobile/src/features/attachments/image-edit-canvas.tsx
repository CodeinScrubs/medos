import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AnnotatedImage } from '@/components/annotated-image';
import { notify } from '@/components/feedback';
import { newId } from '@/lib/ids';
import {
  containedImageRect,
  cropBetween,
  imageDisplaySize,
  imagePanBound,
  MAX_IMAGE_MARKS,
  MAX_IMAGE_POINTS,
  pointSegmentDistance,
  textMarkHeight,
  viewportToSource,
  type ImageColor,
  type ImageDocument,
  type ImageMark,
  type ImagePoint,
  type PendingImageText,
} from '@/lib/image-edit';
import { mediaUri } from '@/platform/media';

export type ImageTool = 'view' | 'pen' | 'highlight' | 'arrow' | 'text' | 'crop' | 'erase';
type Zoom = { scale: number; x: number; y: number };
export function ImageEditCanvas({
  document,
  tool,
  color,
  thick,
  disabled,
  onChange,
  onText,
  onLoad,
  onActivity,
}: {
  document: ImageDocument;
  tool: ImageTool;
  color: ImageColor;
  thick: boolean;
  disabled: boolean;
  onChange: (doc: ImageDocument, beginCommand?: boolean) => boolean;
  onText: (text: PendingImageText) => void;
  onLoad: () => void;
  onActivity: (active: boolean) => void;
}) {
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState<Zoom>({ scale: 1, x: 0, y: 0 });
  const currentZoom = useRef(zoom);
  const panOrigin = useRef(zoom),
    pinchOrigin = useRef(zoom);
  const gestureImage = useRef(document);
  const stroke = useRef<ImageMark | null>(null);
  const start = useRef<ImagePoint | null>(null);
  const [cropPreview, setCropPreview] = useState<ImageMark | null>(null);
  // Crop selection shows the whole image, preserving rotation and annotations.
  const display =
    tool === 'crop' ? { ...document, crop: { x: 0, y: 0, width: document.width, height: document.height } } : document;
  const size = imageDisplaySize(display);
  const fit = containedImageRect(viewport.width, viewport.height, size.width, size.height);
  const uri = mediaUri(document.sourcePath)!;
  const pointAt = (x: number, y: number) => {
    const z = currentZoom.current;
    const p = viewportToSource({ x, y }, display, viewport, z.scale, z.x, z.y);
    // Two decimal places are more precise than source pixels and keep saved
    // pointer paths compact enough for the shared encode/decode size contract.
    return p ? { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 } : null;
  };
  function applyZoom(next: Zoom) {
    currentZoom.current = next;
    setZoom(next);
  }
  function bound(next: Zoom) {
    return {
      scale: next.scale,
      x: Math.max(
        -imagePanBound(fit.width, viewport.width, next.scale),
        Math.min(imagePanBound(fit.width, viewport.width, next.scale), next.x),
      ),
      y: Math.max(
        -imagePanBound(fit.height, viewport.height, next.scale),
        Math.min(imagePanBound(fit.height, viewport.height, next.scale), next.y),
      ),
    };
  }
  function begin(x: number, y: number) {
    gestureImage.current = document;
    stroke.current = null;
    start.current = pointAt(x, y);
    if (!start.current || ['view', 'crop', 'text', 'erase'].includes(tool)) return;
    if (document.marks.length >= MAX_IMAGE_MARKS) {
      notify('تعداد علامت‌ها زیاد شده است', 'علامت‌های اضافی را پاک کنید.');
      start.current = null;
      return;
    }
    const minSide = Math.min(document.width, document.height);
    const width = minSide * (tool === 'highlight' ? (thick ? 0.07 : 0.035) : thick ? 0.012 : 0.005);
    stroke.current =
      tool === 'arrow'
        ? { id: newId(), kind: 'arrow', color, width, start: start.current, end: start.current }
        : { id: newId(), kind: tool as 'pen' | 'highlight', color, width, points: [start.current] };
    if (!onChange({ ...document, marks: [...document.marks, stroke.current] }, true)) {
      stroke.current = null;
      start.current = null;
    }
  }
  function move(x: number, y: number) {
    const point = pointAt(x, y);
    if (!point || !start.current) return;
    if (tool === 'crop') {
      const c = cropBetween(start.current, point, document);
      setCropPreview(
        c
          ? {
              id: 'crop-preview',
              kind: 'pen',
              color: 'white',
              width: Math.min(document.width, document.height) * 0.003,
              points: [
                { x: c.x, y: c.y },
                { x: c.x + c.width, y: c.y },
                { x: c.x + c.width, y: c.y + c.height },
                { x: c.x, y: c.y + c.height },
                { x: c.x, y: c.y },
              ],
            }
          : null,
      );
      return;
    }
    const mark = stroke.current;
    if (!mark || mark.kind === 'text') return;
    if (mark.kind === 'arrow') stroke.current = { ...mark, end: point };
    else {
      const last = mark.points[mark.points.length - 1]!;
      if (Math.hypot(last.x - point.x, last.y - point.y) < Math.min(document.width, document.height) * 0.002) return;
      const used = gestureImage.current.marks.reduce(
        (sum, m) => sum + (m.kind === 'pen' || m.kind === 'highlight' ? m.points.length : m.kind === 'arrow' ? 2 : 0),
        0,
      );
      if (mark.points.length >= 4000 || used + mark.points.length >= MAX_IMAGE_POINTS) return;
      stroke.current = { ...mark, points: [...mark.points, point] };
    }
    if (!onChange({ ...gestureImage.current, marks: [...gestureImage.current.marks, stroke.current] }, false)) {
      stroke.current = null;
      start.current = null;
    }
  }
  // These builders register pointer callbacks; they never invoke them during
  // render. The compiler's ref rule cannot infer that third-party contract.
  /* eslint-disable react-hooks/refs */
  const pan = Gesture.Pan()
    .enabled(!disabled && tool !== 'text' && tool !== 'erase')
    .maxPointers(tool === 'view' ? 2 : 1)
    .minDistance(1)
    .runOnJS(true)
    .onStart((e) => {
      if (tool === 'view') panOrigin.current = currentZoom.current;
      else {
        onActivity(true);
        begin(e.x, e.y);
      }
    })
    .onUpdate((e) => {
      if (tool === 'view')
        applyZoom(
          bound({
            ...currentZoom.current,
            x: panOrigin.current.x + e.translationX,
            y: panOrigin.current.y + e.translationY,
          }),
        );
      else move(e.x, e.y);
    })
    .onEnd((e) => {
      if (tool === 'crop' && start.current) {
        const end = pointAt(e.x, e.y),
          crop = end && cropBetween(start.current, end, document);
        if (crop) {
          onChange({ ...document, crop });
          applyZoom({ scale: 1, x: 0, y: 0 });
        }
      }
      setCropPreview(null);
      start.current = null;
      stroke.current = null;
    })
    .onFinalize(() => {
      setCropPreview(null);
      start.current = null;
      stroke.current = null;
      onActivity(false);
    });
  const pinch = Gesture.Pinch()
    .enabled(!disabled && tool === 'view')
    .runOnJS(true)
    .onStart(() => {
      pinchOrigin.current = currentZoom.current;
    })
    .onUpdate((e) =>
      applyZoom(
        bound({ ...currentZoom.current, scale: Math.max(1, Math.min(6, pinchOrigin.current.scale * e.scale)) }),
      ),
    );
  const tap = Gesture.Tap()
    .enabled(!disabled && (tool === 'text' || tool === 'erase'))
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      const point = pointAt(e.x, e.y);
      if (!point) return;
      if (tool === 'text') {
        const existing = [...document.marks]
          .reverse()
          .find(
            (m) =>
              m.kind === 'text' &&
              point.x >= m.x &&
              point.x <= m.x + m.width &&
              point.y >= m.y &&
              point.y <= m.y + textMarkHeight(m),
          );
        if (existing?.kind === 'text')
          onText({
            id: existing.id,
            x: existing.x,
            y: existing.y,
            size: existing.size,
            width: existing.width,
            color: existing.color,
            text: existing.text,
          });
        else {
          if (document.marks.length >= MAX_IMAGE_MARKS) {
            notify('تعداد علامت‌ها زیاد شده است', 'علامت‌های اضافی را پاک کنید.');
            return;
          }
          const size = Math.min(document.width, document.height) * (thick ? 0.06 : 0.04);
          const x = Math.min(point.x, document.width - size),
            y = Math.min(point.y, document.height - size * 1.5);
          onText({
            id: newId(),
            x,
            y,
            size,
            width: Math.min(document.width * 0.7, document.width - x),
            color,
            text: '',
          });
        }
      } else {
        const limit = Math.min(document.width, document.height) * 0.06;
        const distance = (m: ImageMark) => {
          if (m.kind === 'text')
            return point.x >= m.x && point.x <= m.x + m.width && point.y >= m.y && point.y <= m.y + textMarkHeight(m)
              ? 0
              : Infinity;
          if (m.kind === 'arrow') return pointSegmentDistance(point, m.start, m.end);
          const points = m.points;
          return Math.min(...points.map((p) => Math.hypot(p.x - point.x, p.y - point.y)));
        };
        const chosen = [...document.marks].reverse().find((m) => distance(m) <= limit);
        if (chosen) onChange({ ...document, marks: document.marks.filter((m) => m.id !== chosen.id) });
      }
    });
  /* eslint-enable react-hooks/refs */
  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        setViewport({
          width: Math.max(1, e.nativeEvent.layout.width),
          height: Math.max(1, e.nativeEvent.layout.height),
        });
        applyZoom({ scale: 1, x: 0, y: 0 });
      }}
    >
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, tap)}>
        <View collapsable={false} style={styles.fill}>
          <View
            pointerEvents="none"
            style={[
              styles.fill,
              { transform: [{ translateX: zoom.x }, { translateY: zoom.y }, { scale: zoom.scale }] },
            ]}
          >
            <AnnotatedImage
              document={display}
              uri={uri}
              width={viewport.width}
              height={viewport.height}
              preview={cropPreview}
              onLoad={onLoad}
            />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1, width: '100%', overflow: 'hidden', direction: 'ltr' } });
