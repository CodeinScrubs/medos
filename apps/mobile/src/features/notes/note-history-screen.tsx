import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, Divider, EmptyState, Row, Screen, Text } from '@/components/ui';
import type { NoteVersion } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { datasetGeneration } from '@/lib/dataset-write';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { sameNoteSnapshot } from './logic';
import { noteQuery, restoreNoteVersion } from './queries';
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
  const { id: patientId, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const [context] = useState(() => ({ patientId: patientId ?? '', noteId: noteId ?? '' }));
  const contextChanged = context.patientId !== (patientId ?? '') || context.noteId !== (noteId ?? '');
  const { generation, stale } = useDatasetIntent();
  const router = useRouter();
  const navigation = useNavigation();
  const { spacing, colors } = useTheme();
  const { data, error, retry } = useLive(noteVersionsQuery(context.noteId, context.patientId), [
    context.noteId,
    context.patientId,
  ]);
  const {
    data: noteRows,
    error: noteError,
    retry: retryNote,
  } = useLive(noteQuery(context.noteId, context.patientId), [context.noteId, context.patientId]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const attempt = useRef<symbol | null>(null);
  const readable = !contextChanged && !stale && !error && !noteError && data !== undefined && Boolean(noteRows?.[0]);
  const read = useRef({ readable, versions: data, note: noteRows?.[0] });
  useLayoutEffect(() => {
    read.current = { readable, versions: data, note: noteRows?.[0] };
  }, [readable, data, noteRows]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current = null;
    };
  }, []);

  const versions = data ?? [];

  function restore(version: NoteVersion) {
    const basis = read.current.note;
    if (!mounted.current || attempt.current || !navigation.isFocused() || !read.current.readable || !basis) return;
    const token = Symbol('note version restore');
    attempt.current = token;
    let used = false;
    const release = () => {
      if (attempt.current === token) attempt.current = null;
    };
    const owns = () =>
      mounted.current &&
      attempt.current === token &&
      navigation.isFocused() &&
      generation === datasetGeneration() &&
      read.current.readable;
    Alert.alert(
      'برگرداندن این نسخه؟',
      'متن فعلی هم در تاریخچه می‌ماند و هر وقت خواستید برمی‌گردد.',
      [
        { text: 'انصراف', style: 'cancel', onPress: release },
        {
          text: 'برگردان',
          onPress: () => {
            if (used) return;
            if (!owns()) {
              release();
              return;
            }
            used = true;
            if (
              !read.current.note ||
              !sameNoteSnapshot(read.current.note, basis) ||
              !read.current.versions?.some((row) => sameNoteSnapshot(row, version))
            ) {
              release();
              retry();
              retryNote();
              notify('نوت تغییر کرده', 'تاریخچه دوباره خوانده می‌شود؛ نسخهٔ جدید را بررسی کنید.');
              return;
            }
            setBusy(true);
            void restoreNoteVersion(version, basis, generation)
              .then(() => {
                // The underlying editor owns its old text; do not reopen it as the restored note.
                if (owns()) router.dismissTo({ pathname: '/patient/[id]', params: { id: context.patientId } });
              })
              .catch((e: unknown) => {
                if (mounted.current && navigation.isFocused()) alertError('برنگشت', e);
              })
              .finally(() => {
                release();
                if (mounted.current) setBusy(false);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: release },
    );
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'تاریخچه‌ی نوت' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <ErrorNotice error={error} what="تاریخچه" onRetry={retry} />
        <ErrorNotice error={noteError} what="نوت" onRetry={retryNote} />
        {stale || contextChanged ? (
          <Text color="danger">پرونده یا داده‌ها تغییر کرده؛ این تاریخچه فقط برای مرور است.</Text>
        ) : null}
        {!error && !noteError && (data === undefined || noteRows === undefined) ? (
          <Text color="textMuted">در حال خواندن…</Text>
        ) : null}
        {noteRows !== undefined && !noteRows[0] && !noteError ? (
          <Text color="danger">نوت یا پرونده در دسترس نیست.</Text>
        ) : null}

        {versions.length === 0 && data !== undefined && readable ? (
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
                    disabled={busy || !readable}
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
