import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { Text } from './text';

/* -------------------------------------------------------------------------- */
/*  Screen                                                                      */
/* -------------------------------------------------------------------------- */

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.lg } : null;
  // The app draws edge to edge, so on a screen without a tab bar the last rows
  // of a form would end up behind Android's navigation bar. `edges` decides
  // whether SafeAreaView already handles it.
  const insets = useSafeAreaInsets();
  const bottomInset = edges.includes('bottom') ? 0 : insets.bottom;

  if (scroll) {
    // Keyboard-aware: since Android 15 apps draw edge-to-edge and the window
    // no longer shrinks for the keyboard, so a plain ScrollView would leave the
    // lower fields of a long form hidden behind it.
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.background }, style]}>
        <KeyboardAwareScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { paddingBottom: spacing.huge + bottomInset }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bottomOffset={spacing.xl}
        >
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={edges}
      // Same reason as the scrolling branch: with three-button navigation the
      // last row of a screen that does not scroll sits under the system bar,
      // where it cannot be tapped at all.
      style={[styles.flex, { backgroundColor: colors.background, paddingBottom: bottomInset }, pad, style]}
    >
      {children}
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  padded = true,
  tone = 'surface',
  style,
  ...rest
}: ViewProps & {
  children: ReactNode;
  padded?: boolean;
  tone?: 'surface' | 'alt' | 'sunken';
}) {
  const { colors, radii, spacing } = useTheme();
  const background = tone === 'alt' ? colors.surfaceAlt : tone === 'sunken' ? colors.surfaceSunken : colors.surface;

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: background,
          borderRadius: radii.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Spacing and dividers                                                        */
/* -------------------------------------------------------------------------- */

export function Gap({ size = 'md' }: { size?: keyof ReturnType<typeof useTheme>['spacing'] }) {
  const { spacing } = useTheme();
  return <View style={{ height: spacing[size] }} />;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginStart: inset,
      }}
    />
  );
}

/** Horizontal stack. RTL is handled by the platform, so `row` reads right-to-left. */
export function Row({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  style,
  ...rest
}: ViewProps & {
  children: ReactNode;
  gap?: keyof ReturnType<typeof useTheme>['spacing'];
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}) {
  const { spacing } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap: spacing[gap],
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Column({
  children,
  gap = 'sm',
  style,
  ...rest
}: ViewProps & { children: ReactNode; gap?: keyof ReturnType<typeof useTheme>['spacing'] }) {
  const { spacing } = useTheme();
  return (
    <View {...rest} style={[{ gap: spacing[gap] }, style]}>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section header                                                              */
/* -------------------------------------------------------------------------- */

export function SectionHeader({ title, action, count }: { title: string; action?: ReactNode; count?: number }) {
  const { spacing } = useTheme();
  return (
    <Row justify="space-between" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <Row gap="xs">
        <Text variant="heading">{title}</Text>
        {count != null && count > 0 && (
          <Text variant="caption" color="textFaint">
            {toPersianDigits(count)}
          </Text>
        )}
      </Row>
      {action}
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
