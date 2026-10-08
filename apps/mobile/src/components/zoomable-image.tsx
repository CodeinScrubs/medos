import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { containedImageRect, imagePanBound } from '@/lib/image-edit';

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(v, min), max);
}

/**
 * Pinch to zoom, drag to pan, double-tap to toggle — the minimum needed to read
 * a photographed lab sheet or a radiology film on a phone screen.
 *
 * Panning is bounded so the image cannot be dragged off into the void; the
 * bound grows with the zoom level.
 */
export function ZoomableImage({
  uri,
  imageSize,
  renderImage,
}: {
  uri: string;
  imageSize?: { width: number; height: number };
  renderImage?: (viewport: { width: number; height: number }) => ReactNode;
}) {
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const width = useSharedValue(1);
  const height = useSharedValue(1);
  const imageWidth = useSharedValue(imageSize?.width ?? 1);
  const imageHeight = useSharedValue(imageSize?.height ?? 1);

  const onLayout = (e: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, e.nativeEvent.layout.width);
    const nextHeight = Math.max(1, e.nativeEvent.layout.height);
    // A keyboard/window resize changes the contain rectangle and pan bounds.
    // Recenter instead of retaining an offset that can hide a thin image.
    if (width.value !== nextWidth || height.value !== nextHeight) {
      scale.value = savedScale.value = 1;
      tx.value = savedTx.value = 0;
      ty.value = savedTy.value = 0;
    }
    width.value = nextWidth;
    height.value = nextHeight;
    setViewport({ width: width.value, height: height.value });
  };

  const boundX = (s: number) => {
    'worklet';
    const fit = containedImageRect(width.value, height.value, imageWidth.value, imageHeight.value);
    return imagePanBound(fit.width, width.value, s);
  };
  const boundY = (s: number) => {
    'worklet';
    const fit = containedImageRect(width.value, height.value, imageWidth.value, imageHeight.value);
    return imagePanBound(fit.height, height.value, s);
  };

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 0.8, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        reset();
        return;
      }
      savedScale.value = scale.value;
      tx.value = withTiming(clamp(tx.value, -boundX(scale.value), boundX(scale.value)));
      ty.value = withTiming(clamp(ty.value, -boundY(scale.value), boundY(scale.value)));
      savedTx.value = clamp(tx.value, -boundX(scale.value), boundX(scale.value));
      savedTy.value = clamp(ty.value, -boundY(scale.value), boundY(scale.value));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      tx.value = clamp(savedTx.value + e.translationX, -boundX(scale.value), boundX(scale.value));
      ty.value = clamp(savedTy.value + e.translationY, -boundY(scale.value), boundY(scale.value));
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fill, style]} onLayout={onLayout}>
        {renderImage ? (
          renderImage(viewport)
        ) : (
          <Image
            source={{ uri }}
            style={styles.fill}
            contentFit="contain"
            onLoad={(event) => {
              imageWidth.value = event.source.width;
              imageHeight.value = event.source.height;
            }}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
