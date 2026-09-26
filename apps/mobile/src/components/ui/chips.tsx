import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/theme';

import { Field } from './field';
import { Text } from './text';

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * A single-select row of chips.
 *
 * Used wherever the choice set is small and known — routes, frequencies,
 * channels — because one tap on a visible option beats opening a dropdown,
 * especially one-handed. `scroll` keeps long sets on one line; `wrap` shows
 * everything at once when the set is short enough to fit.
 */
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  allowDeselect = false,
  layout = 'scroll',
  ltr = false,
  hint,
}: {
  label?: string;
  options: readonly ChipOption<T>[] | readonly T[];
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  allowDeselect?: boolean;
  layout?: 'scroll' | 'wrap';
  /** For Latin option labels such as routes (IV, PO) and frequencies (BD, TDS). */
  ltr?: boolean;
  hint?: string;
}) {
  const { colors, radii, spacing } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const content = useRef(0);
  const selected = useRef<{ x: number; width: number } | null>(null);
  const revealed = useRef(false);

  /*
   * A long strip opened on a choice past its visible end — a phone note in the
   * note editor, where the first four chips are SOAP types — showed no chip
   * selected at all. Bring the selected one into view, once, as soon as the
   * chip, the strip and its content all have a size; after that the strip
   * stays where the user scrolled it.
   *
   * In a right-to-left strip the first chips are at the right end, and that
   * is where it starts: the visible window is [content - viewport, content].
   */
  function reveal() {
    const chip = selected.current;
    const view = viewport.current;
    const total = content.current;
    if (revealed.current || !chip || view === 0 || total === 0) return;
    revealed.current = true;
    const start = I18nManager.isRTL ? Math.max(0, total - view) : 0;
    if (chip.x >= start && chip.x + chip.width <= start + view) return;
    const max = Math.max(0, total - view);
    const left = Math.min(
      Math.max(0, I18nManager.isRTL ? chip.x + chip.width + spacing.lg - view : chip.x - spacing.lg),
      max,
    );
    // After this frame: a right-to-left strip moves itself to its right end
    // once its content is measured, which would undo a scroll made now.
    setTimeout(() => scroller.current?.scrollTo({ x: left, animated: false }), 60);
  }

  function onSelectedLayout(e: LayoutChangeEvent) {
    selected.current = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
    reveal();
  }

  const normalized: ChipOption<T>[] = (options as readonly (ChipOption<T> | T)[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  const chips = normalized.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={o.label}
        onLayout={active && layout === 'scroll' ? onSelectedLayout : undefined}
        onPress={() => {
          void Haptics.selectionAsync();
          if (active && allowDeselect) onChange(null);
          else onChange(o.value);
        }}
        style={({ pressed }) => [
          styles.chip,
          {
            borderRadius: radii.full,
            paddingHorizontal: spacing.md,
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text variant="captionStrong" ltr={ltr} style={{ color: active ? colors.primaryText : colors.textMuted }}>
          {o.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <Field label={label} hint={hint}>
      {layout === 'scroll' ? (
        <ScrollView
          ref={scroller}
          horizontal
          onLayout={(e) => {
            viewport.current = e.nativeEvent.layout.width;
            reveal();
          }}
          onContentSizeChange={(width) => {
            content.current = width;
            reveal();
          }}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.xxs }}
        >
          {chips}
        </ScrollView>
      ) : (
        <View style={[styles.wrap, { gap: spacing.xs }]}>{chips}</View>
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
