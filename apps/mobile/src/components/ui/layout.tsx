import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

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
  tabRoot = false,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  /** The root screen of a tab: the tab bar already sits above Android's navigation bar. */
  tabRoot?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const pad = padded ? { paddingHorizontal: spacing.lg } : null;
  // The app draws edge to edge. Content used to scroll on underneath Android's
  // navigation bar, and with three-button navigation a button that sat there
  // mid-scroll was not pressed at all — the tap went to Back or Recents. So a
  // screen ends where the navigation bar begins; only a tab's root, which has
  // the tab bar below it, does not take the edge.
  const safeEdges: Edge[] = tabRoot || edges.includes('bottom') ? edges : [...edges, 'bottom'];

  if (scroll) {
    // Keyboard-aware: since Android 15 apps draw edge-to-edge and the window
    // no longer shrinks for the keyboard, so a plain ScrollView would leave the
    // lower fields of a long form hidden behind it.
    return (
      <SafeAreaView edges={safeEdges} style={[styles.flex, { backgroundColor: colors.background }, style]}>
        <KeyboardAwareScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { paddingBottom: spacing.huge }, contentStyle]}
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
    <SafeAreaView edges={safeEdges} style={[styles.flex, { backgroundColor: colors.background }, pad, style]}>
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
    <Row justify="space-between" gap="sm" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
      {/*
       * The title takes the free width rather than its own measured width:
       * sized to fit, Android sometimes laid it out a hair narrower than it
       * needed and dropped the last word ("کارهای این بیمار" → "کارهای این").
       */}
      <Text variant="heading" style={styles.flex}>
        {title}
        {count != null && count > 0 ? (
          <Text variant="caption" color="textFaint">
            {'  '}
            {toPersianDigits(count)}
          </Text>
        ) : null}
      </Text>
      {action}
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
