import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type Svg from 'react-native-svg';

import { AnnotatedImage } from '@/components/annotated-image';
import { imageDisplaySize, validateImageDocument, type ImageDocument } from '@/lib/image-edit';
import { writeImageExport } from '@/platform/image-export';
import { mediaExists, mediaUri } from '@/platform/media';

type Request = {
  document: ImageDocument;
  width: number;
  height: number;
  resolve: (uri: string) => void;
  reject: (error: unknown) => void;
};
/** Export is explicit and bounded, not a PNG re-encode on every pen or keyboard event. */
export function useImageExport() {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  const svg = useRef<Svg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function settle(error: unknown, uri?: string) {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRequest(null);
    if (error) current.reject(error);
    else current.resolve(uri!);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pending.current?.reject(new Error('صفحه پیش از آماده‌شدن خروجی بسته شد.'));
      pending.current = null;
    },
    [],
  );
  function render(document: ImageDocument): Promise<string> {
    if (pending.current) return Promise.reject(new Error('یک خروجی دیگر در حال آماده شدن است.'));
    validateImageDocument(document);
    if (!mediaExists(document.sourcePath)) return Promise.reject(new Error('فایل پایهٔ عکس پیدا نشد.'));
    const size = imageDisplaySize(document),
      ratio = Math.min(1, 2400 / Math.max(size.width, size.height));
    const width = Math.max(1, Math.round(size.width * ratio)),
      height = Math.max(1, Math.round(size.height * ratio));
    return new Promise((resolve, reject) => {
      const next = { document, width, height, resolve, reject };
      pending.current = next;
      setRequest(next);
      timer.current = setTimeout(() => settle(new Error('خروجی عکس آماده نشد؛ دوباره تلاش کنید.')), 15000);
    });
  }
  const scene = request ? (
    <View pointerEvents="none" style={{ position: 'absolute', opacity: 0 }}>
      <AnnotatedImage
        document={request.document}
        uri={mediaUri(request.document.sourcePath)!}
        width={request.width * Math.min(1, 240 / Math.max(request.width, request.height))}
        height={request.height * Math.min(1, 240 / Math.max(request.width, request.height))}
        svgRef={svg}
        onLoad={() => {
          const current = pending.current;
          if (!current) return;
          // Native image decoding must finish before toDataURL; otherwise SVG can omit the photo.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (pending.current !== current) return;
              try {
                if (!svg.current) throw new Error('نمای خروجی آماده نیست.');
                svg.current.toDataURL(
                  (base64) => {
                    if (pending.current !== current) return;
                    try {
                      settle(null, writeImageExport(base64, current.width, current.height));
                    } catch (error) {
                      settle(error);
                    }
                  },
                  { width: current.width, height: current.height },
                );
              } catch (error) {
                settle(error);
              }
            }),
          );
        }}
      />
    </View>
  ) : null;
  return { render, scene, busy: !!request };
}
