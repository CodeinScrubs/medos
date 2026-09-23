import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';

import { Card, Column, Row, Text } from '@/components/ui';
import { useTheme } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Optional detail, folded away until asked for.
 *
 * The patient form has thirty-odd fields but only four are needed to save a
 * usable record. Collapsing the rest keeps the common path to a single screen
 * without hiding anything permanently.
 */
export function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  filledCount,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultOpen?: boolean;
  /** Shown as a dot when the section holds data but is collapsed. */
  filledCount?: number;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card padded={false} style={{ marginBottom: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [{ padding: spacing.lg, opacity: pressed ? 0.7 : 1 }]}
      >
        <Row justify="space-between" gap="sm">
          <Row gap="sm" style={{ flex: 1 }}>
            {icon && <Ionicons name={icon} size={18} color={colors.primary} />}
            <Column gap="xxs" style={{ flex: 1 }}>
              <Text variant="subheading">{title}</Text>
              {subtitle && !open ? (
                <Text variant="tiny" color="textFaint" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </Column>
          </Row>

          <Row gap="xs">
            {!open && filledCount ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.primary,
                }}
              />
            ) : null}
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
          </Row>
        </Row>
      </Pressable>

      {open ? (
        <Column gap="md" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          {children}
        </Column>
      ) : null}
    </Card>
  );
}
