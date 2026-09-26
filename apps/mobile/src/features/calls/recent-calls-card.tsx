import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { Card, Row, Text } from '@/components/ui';
import { useSetting } from '@/db/use-setting';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { listRecordingNames } from './folder';
import { unfiledRecentCount } from './logic';
import { callsFiled, callsFolderUri } from './settings';

/**
 * On Today after a recorded call: how many of the last two days' recordings
 * are not in a record yet, one tap from filing them. Silent until the
 * recordings folder has been chosen, and when there is nothing to file.
 */
export function RecentCallsCard({ now }: { now: Date }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const folder = useSetting(callsFolderUri).value;
  const filed = useSetting(callsFiled).value;
  const filedSet = useMemo(() => new Set(filed), [filed]);
  const [names, setNames] = useState<string[] | null>(null);

  // Read when Today comes back into view: that is when a call has just ended.
  useFocusEffect(
    useCallback(() => {
      setNames(folder ? listRecordingNames(folder) : null);
    }, [folder]),
  );

  const count = names ? unfiledRecentCount(names, filedSet, now) : 0;
  if (count === 0) return null;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/calls')}>
      <Card style={{ marginTop: spacing.lg }}>
        <Row gap="md">
          <Ionicons name="call-outline" size={20} color={colors.primary} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {toPersianDigits(count)} تماسِ ضبط‌شده هنوز در پرونده نیست
          </Text>
          <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
        </Row>
      </Card>
    </Pressable>
  );
}
