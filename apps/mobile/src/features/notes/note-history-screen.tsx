import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, Divider, EmptyState, Row, Screen, Text } from '@/components/ui';
import type { NoteVersion } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { restoreNoteVersion } from './queries';
import { noteVersionsQuery } from './version-queries';

const REASON_LABEL: Record<NoteVersion['reason'], string> = {
  created: 'اولین ثبت',
  edited: 'ویرایش',
  restored: 'برگرداندن نسخه‌ی قبلی',
  baseline: 'متن قبل از شروع تاریخچه',
};

/**
 * Everything one note has said.
 *
 * Restoring does not remove anything: the text on screen is already a version,
 * and the restore writes another on top of it. So there is no destructive
 * action on this screen at all, which is why the confirmation says what will
 * happen rather than warning about what will be lost.
 *
 * Params: `id` (patient), `noteId`.
 */
export function NoteHistoryScreen() {
  const { noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const { data, error } = useLive(noteVersionsQuery(noteId ?? ''), [noteId]);
  const [busy, setBusy] = useState(false);

  const versions = data ?? [];

  function restore(version: NoteVersion) {
    Alert.alert('برگرداندن این نسخه؟', 'متن فعلی هم در تاریخچه می‌ماند و هر وقت خواستید برمی‌گردد.', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'برگردان',
        onPress: () => {
          setBusy(true);
          void restoreNoteVersion(version.id)
            .then(() => router.back())
            .catch((e: unknown) => alertError('برنگشت', e))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'تاریخچه‌ی نوت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error} what="تاریخچه" />

        {versions.length === 0 && data !== undefined ? (
          <EmptyState
            icon="time-outline"
            title="هنوز نسخه‌ای ثبت نشده"
            description="از این به بعد هر بار که نوت را ذخیره کنید، متن آن لحظه اینجا می‌ماند."
          />
        ) : null}

        {versions.map((version, i) => (
          <Card key={version.id}>
            <Column gap="sm">
              <Row justify="space-between" align="center">
                <Column gap="xxs" style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{formatJalaliDateTime(version.createdAt)}</Text>
                  <Text variant="tiny" color="textFaint">
                    {REASON_LABEL[version.reason]}
                    {i === 0 ? ' — همین متن الان در پرونده است' : ''}
                  </Text>
                </Column>
                {i === 0 ? <Badge label="فعلی" tone="success" /> : null}
              </Row>

              <Divider />

              <Column gap="xxs">
                {version.title ? <Text variant="captionStrong">{version.title}</Text> : null}
                {[version.body, version.subjective, version.objective, version.assessment, version.plan]
                  .filter((part): part is string => Boolean(part?.trim()))
                  .map((part, j) => (
                    <Text key={j} variant="caption" color="textMuted">
                      {part}
                    </Text>
                  ))}
              </Column>

              {i > 0 ? (
                <View>
                  <Button
                    label="برگرداندن این نسخه"
                    icon="arrow-undo-outline"
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    onPress={() => restore(version)}
                  />
                </View>
              ) : null}
            </Column>
          </Card>
        ))}

        {versions.length > 0 ? (
          <Text variant="tiny" style={{ color: colors.textFaint }}>
            {toPersianDigits(versions.length)} نسخه. هیچ‌کدام پاک نمی‌شوند و همه داخل بکاپ می‌آیند.
          </Text>
        ) : null}
      </Column>
    </Screen>
  );
}
