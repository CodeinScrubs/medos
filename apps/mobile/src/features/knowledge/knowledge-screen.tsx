import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Column, Row, Segmented, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { IdeasList } from './ideas-list';
import { PrescriptionsList } from './prescriptions-list';
import { SpecialtyProfilesList } from './specialty-profiles-list';
import { TopicsList } from './topics-list';

type Section = 'topics' | 'specialties' | 'prescriptions' | 'ideas';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'topics', label: 'مباحث' },
  { value: 'specialties', label: 'رشته‌ها' },
  { value: 'prescriptions', label: 'نسخه‌ها' },
  { value: 'ideas', label: 'ایده‌ها' },
];

/**
 * The knowledge tab: four notebooks that share nothing but a place to live.
 *
 * They are one tab rather than four because none of them is opened daily, and
 * a segmented control keeps the bottom bar from growing a tab for every kind
 * of note the owner keeps.
 */
export function KnowledgeScreen() {
  const { colors, spacing } = useTheme();
  const [section, setSection] = useState<Section>('topics');

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <Column gap="sm" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Row justify="space-between">
          <Text variant="display">دانش</Text>
        </Row>
        <Segmented options={SECTIONS} value={section} onChange={setSection} />
      </Column>

      <View style={styles.flex}>
        {section === 'topics' && <TopicsList />}
        {section === 'specialties' && <SpecialtyProfilesList />}
        {section === 'prescriptions' && <PrescriptionsList />}
        {section === 'ideas' && <IdeasList />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
