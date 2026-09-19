import { Image } from 'expo-image';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
export function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const width = useSharedValue(1);
  const height = useSharedValue(1);

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    height.value = e.nativeEvent.layout.height;
  };

  const boundX = (s: number) => {
    'worklet';
    return ((s - 1) * width.value) / 2;
  };
  const boundY = (s: number) => {
    'worklet';
    return ((s - 1) * height.value) / 2;
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
        <Image source={{ uri }} style={styles.fill} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
