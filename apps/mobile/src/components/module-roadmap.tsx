import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Column, Row, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type PlannedFeature = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  /** `ready` means the data model exists and only the screens are missing. */
  state: 'ready' | 'planned';
};

/**
 * Placeholder for a tab whose screens are not built yet.
 *
 * It lists exactly what is coming rather than showing a blank page, so the
 * roadmap is visible from inside the app and it is obvious which parts of the
 * database are already waiting for a UI.
 */
export function ModuleRoadmap({
  title,
  intro,
  features,
}: {
  title: string;
  intro: string;
  features: PlannedFeature[];
}) {
  const { colors, spacing, radii } = useTheme();

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Text variant="display">{title}</Text>
        <Text variant="body" color="textMuted">
          {intro}
        </Text>

        <Column gap="sm" style={{ marginTop: spacing.sm }}>
          {features.map((f) => (
            <Card key={f.title}>
              <Row gap="md" align="flex-start">
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radii.md,
                    backgroundColor: f.state === 'ready' ? colors.primarySoft : colors.neutralSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={f.icon} size={18} color={f.state === 'ready' ? colors.primary : colors.textFaint} />
                </View>

                <Column gap="xxs" style={styles.grow}>
                  <Row gap="xs">
                    <Text variant="subheading">{f.title}</Text>
                    <Text variant="tiny" color={f.state === 'ready' ? 'success' : 'textFaint'}>
                      {f.state === 'ready' ? 'دیتابیس آماده' : 'در برنامه'}
                    </Text>
                  </Row>
                  <Text variant="caption" color="textMuted">
                    {f.description}
                  </Text>
                </Column>
              </Row>
            </Card>
          ))}
        </Column>
      </Column>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
