import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
          horizontal
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
