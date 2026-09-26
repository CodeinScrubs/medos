import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, MIN_TOUCH, useTheme } from '@/theme';

import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconEnd?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fires a light haptic tick. On by default for anything that writes. */
  haptic?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  disabled = false,
  full = false,
  style,
  haptic = true,
}: ButtonProps) {
  const { colors, radii, spacing, typography } = useTheme();

  const height = size === 'sm' ? 38 : size === 'lg' ? 56 : MIN_TOUCH;
  const textVariant = size === 'sm' ? 'captionStrong' : 'bodyStrong';

  const tones: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  };
  const tone = tones[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={label}
      disabled={inactive}
      hitSlop={HIT_SLOP}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: radii.md,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          gap: spacing.sm,
        },
        full && styles.full,
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={tone.fg} />}
          <Text variant={textVariant} style={{ color: tone.fg, fontFamily: typography.bodyStrong.fontFamily }}>
            {label}
          </Text>
          {iconEnd && <Ionicons name={iconEnd} size={size === 'sm' ? 16 : 19} color={tone.fg} />}
        </>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icon button                                                                 */
/* -------------------------------------------------------------------------- */

export function IconButton({
  icon,
  onPress,
  label,
  color,
  background,
  size = 20,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  /** Required: this is the only text a screen reader has to work with. */
  label: string;
  color?: string;
  background?: string;
  size?: number;
  disabled?: boolean;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          borderRadius: radii.full,
          backgroundColor: background ?? 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.textMuted} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Floating action button                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The screen's one main action, floating at the bottom corner.
 *
 * It sits above Android's navigation bar: on a screen pushed over the tabs
 * the bar is right below it, and with three-button navigation a button half
 * under it sent the tap to Back. A tab's root screen passes `tabRoot`, since
 * the tab bar already lifts it clear.
 */
export function Fab({
  icon = 'add',
  onPress,
  label,
  tabRoot = false,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string;
  tabRoot?: boolean;
}) {
  const { colors, spacing, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fabWrap, { bottom: spacing.xl + (tabRoot ? 0 : insets.bottom), insetInlineEnd: spacing.lg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress?.();
        }}
        style={({ pressed }) => [
          styles.fab,
          shadows.lg,
          { backgroundColor: colors.primary },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name={icon} size={26} color={colors.primaryText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  full: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  inactive: { opacity: 0.45 },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: { position: 'absolute' },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
