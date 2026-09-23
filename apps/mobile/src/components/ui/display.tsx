import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials as toInitials } from '@/lib/persian';
import { useTheme, type Colors } from '@/theme';

import { Column, Row } from './layout';
import { Text } from './text';

/* -------------------------------------------------------------------------- */
/*  Badge                                                                       */
/* -------------------------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONE_MAP: Record<BadgeTone, { bg: keyof Colors; fg: keyof Colors }> = {
  neutral: { bg: 'neutralSoft', fg: 'textMuted' },
  primary: { bg: 'primarySoft', fg: 'primary' },
  success: { bg: 'successSoft', fg: 'success' },
  warning: { bg: 'warningSoft', fg: 'warning' },
  danger: { bg: 'dangerSoft', fg: 'danger' },
  info: { bg: 'infoSoft', fg: 'info' },
  accent: { bg: 'accentSoft', fg: 'accent' },
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
  ltr,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  ltr?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  const t = TONE_MAP[tone];
  return (
    <Row
      gap="xxs"
      style={{
        backgroundColor: colors[t.bg],
        borderRadius: radii.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        alignSelf: 'flex-start',
      }}
    >
      {icon && <Ionicons name={icon} size={12} color={colors[t.fg]} />}
      <Text variant="tiny" style={{ color: colors[t.fg] }} ltr={ltr}>
        {label}
      </Text>
    </Row>
  );
}

/** A small coloured dot, for status in a dense list where a badge is too loud. */
export function Dot({ tone = 'neutral' }: { tone?: BadgeTone }) {
  const { colors } = useTheme();
  return <View style={[styles.dot, { backgroundColor: colors[TONE_MAP[tone].fg] }]} />;
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({
  first,
  last,
  size = 44,
  tone = 'primary',
}: {
  first?: string | null;
  last?: string | null;
  size?: number;
  tone?: BadgeTone;
}) {
  const { colors } = useTheme();
  const t = TONE_MAP[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[t.bg],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={size >= 44 ? 'subheading' : 'caption'} style={{ color: colors[t.fg] }}>
        {toInitials(first, last)}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Key/value row, the workhorse of every detail screen                         */
/* -------------------------------------------------------------------------- */

export function DataRow({
  label,
  value,
  icon,
  ltr,
  numeric,
  multiline,
  action,
}: {
  label: string;
  value?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  ltr?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  action?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  if (!value) return null;

  if (multiline) {
    return (
      <Column gap="xxs" style={{ paddingVertical: spacing.xs }}>
        <Row gap="xs">
          {icon && <Ionicons name={icon} size={14} color={colors.textFaint} />}
          <Text variant="caption" color="textMuted">
            {label}
          </Text>
        </Row>
        <Text variant="body" ltr={ltr}>
          {value}
        </Text>
      </Column>
    );
  }

  return (
    <Row justify="space-between" gap="md" style={{ paddingVertical: spacing.xs }}>
      <Row gap="xs" style={styles.shrink}>
        {icon && <Ionicons name={icon} size={14} color={colors.textFaint} />}
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
      </Row>
      <Row gap="sm" style={styles.grow} justify="flex-end">
        <Text
          variant="bodyStrong"
          ltr={ltr}
          numeric={numeric}
          align={ltr || numeric ? 'left' : 'right'}
          style={styles.grow}
          numberOfLines={2}
        >
          {value}
        </Text>
        {action}
      </Row>
    </Row>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  action,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Column gap="sm" style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.huge }, style]}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
      <Text variant="subheading" color="textMuted" align="center">
        {title}
      </Text>
      {description && (
        <Text variant="caption" color="textFaint" align="center" style={styles.description}>
          {description}
        </Text>
      )}
      {action && <View style={{ marginTop: spacing.sm }}>{action}</View>}
    </Column>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  grow: { flex: 1 },
  shrink: { flexShrink: 0 },
  description: { maxWidth: 280 },
});
