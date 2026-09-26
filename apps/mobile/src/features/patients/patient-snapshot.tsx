import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { Card, Column, Divider, Row, SectionHeader, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Note } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { currentEncounterQuery } from '@/features/encounters/queries';
import { ORDER_STATUS_LABELS } from '@/features/kardex/labels';
import { isRunning } from '@/features/kardex/logic';
import { patientOrdersQuery } from '@/features/kardex/queries';
import { FLAG_LABEL, flagTone, type LabFlag } from '@/features/labs/flags';
import { labsToReview } from '@/features/labs/logic';
import { patientLabValuesQuery } from '@/features/labs/queries';
import { NOTE_TYPE_LABELS } from '@/features/notes/labels';
import { notePreview, SOAP_NOTE_TYPES } from '@/features/notes/logic';
import { latestPatientNoteQuery } from '@/features/notes/queries';
import { vitalChips } from '@/features/vitals/logic';
import { patientVitalsQuery } from '@/features/vitals/queries';
import { formatRelativeTime } from '@/lib/jalali';
import { joinLabels, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

type RecordTab = 'vitals' | 'labs' | 'kardex';

/** How many lab results and orders one glance can take in; the rest are counted. */
const SHOWN = 6;

/**
 * The patient at a glance: the last vitals, the lab results that need a look,
 * what they are on, and the last thing written — each with how old it is, and
 * each one tap from its full tab.
 *
 * Everything here is read back as it was recorded. It picks and orders, it
 * does not judge: a lab result shows as abnormal only by the flag stored with
 * it, and a missing reading is left out rather than shown as normal.
 */
export function PatientSnapshot({ patientId }: { patientId: string }) {
  const router = useRouter();
  const now = new Date(useNow());

  const vitals = useLive(patientVitalsQuery(patientId, 1), [patientId]);
  const labs = useLive(patientLabValuesQuery(patientId), [patientId]);
  const encounters = useLive(currentEncounterQuery(patientId), [patientId]);
  const encounterId = encounters.data?.[0]?.id ?? null;
  const orders = useLive(patientOrdersQuery(patientId, encounterId), [patientId, encounterId]);
  const notes = useLive(latestPatientNoteQuery(patientId), [patientId]);

  const open = (tab: RecordTab) => router.setParams({ tab });

  const lastVital = vitals.data?.[0];
  const chips = lastVital ? vitalChips(lastVital) : [];
  const review = labsToReview(labs.data ?? []);
  const running = (orders.data ?? []).filter(isRunning);
  const lastNote = notes.data?.[0];

  const rows: ReactNode[] = [];

  if (lastVital && chips.length > 0) {
    rows.push(
      <SnapshotRow
        key="vitals"
        icon="pulse-outline"
        title="علائم"
        when={formatRelativeTime(lastVital.measuredAt, now)}
        onPress={() => open('vitals')}
      >
        <Row gap="sm" wrap>
          {chips.map((chip) => (
            <Row key={chip.key} gap="xxs" align="baseline">
              <Text variant="tiny" color="textFaint">
                {chip.label}
              </Text>
              <Text numeric variant="bodyStrong">
                {chip.value}
              </Text>
            </Row>
          ))}
        </Row>
      </SnapshotRow>,
    );
  }

  if (review.analytes > 0 && review.latestAt) {
    rows.push(
      <SnapshotRow
        key="labs"
        icon="flask-outline"
        title="آزمایش"
        when={formatRelativeTime(review.latestAt, now)}
        onPress={() => open('labs')}
      >
        {review.rows.length > 0 ? (
          <Row gap="md" wrap>
            {review.rows.slice(0, SHOWN).map((r) => (
              <LabResult key={r.value.id} analyte={r.value.analyte} value={r.value.value} flag={r.value.flag} />
            ))}
            <More count={review.rows.length - SHOWN} />
          </Row>
        ) : (
          <Text variant="caption" color="textMuted">
            آخرین نتیجه‌ی {toPersianDigits(review.analytes)} آزمایش: بدون H یا L
          </Text>
        )}
      </SnapshotRow>,
    );
  }

  if (running.length > 0) {
    rows.push(
      <SnapshotRow
        key="kardex"
        icon="medical-outline"
        title="کاردکس"
        when={`${toPersianDigits(running.length)} دستور جاری`}
        onPress={() => open('kardex')}
      >
        <Row gap="sm" wrap>
          {running.slice(0, SHOWN).map((o) => (
            <Text key={o.id} variant="bodyStrong" ltr color={o.status === 'held' ? 'textFaint' : 'text'}>
              {o.status === 'held' ? `${o.name} (${ORDER_STATUS_LABELS.held})` : o.name}
            </Text>
          ))}
          <More count={running.length - SHOWN} />
        </Row>
      </SnapshotRow>,
    );
  }

  if (lastNote) {
    rows.push(
      <SnapshotRow
        key="note"
        icon="document-text-outline"
        title={joinLabels(['آخرین نوت', NOTE_TYPE_LABELS[lastNote.type]])}
        when={formatRelativeTime(lastNote.noteDate, now)}
        onPress={() => router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId: lastNote.id } })}
      >
        <Text variant="caption" color="textMuted" numberOfLines={3}>
          {assessmentAndPlan(lastNote) || notePreview(lastNote) || lastNote.title || '—'}
        </Text>
      </SnapshotRow>,
    );
  }

  const error = vitals.error ?? labs.error ?? orders.error ?? notes.error;
  if (rows.length === 0 && !error) return null;

  return (
    <>
      <SectionHeader title="در یک نگاه" />
      <ErrorNotice error={error} what="خلاصه‌ی بیمار" />
      {rows.length > 0 ? (
        <Card padded={false}>
          {rows.map((row, i) => (
            <Column key={i} gap="none">
              {i > 0 ? <Divider /> : null}
              {row}
            </Column>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/** A SOAP note's conclusion is what the next reader wants; the story is one tap away. */
function assessmentAndPlan(note: Pick<Note, 'type' | 'assessment' | 'plan'>): string {
  if (!SOAP_NOTE_TYPES.includes(note.type)) return '';
  return [note.assessment ? `A: ${note.assessment}` : null, note.plan ? `P: ${note.plan}` : null]
    .filter(Boolean)
    .join('\n');
}

function SnapshotRow({
  icon,
  title,
  when,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  when?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [{ padding: spacing.lg }, pressed && styles.pressed]}
    >
      <Row gap="md" align="flex-start">
        <Ionicons name={icon} size={18} color={colors.primary} style={styles.icon} />
        <Column gap="xs" style={styles.grow}>
          <Row justify="space-between" gap="sm">
            <Text variant="captionStrong" color="textMuted" style={styles.grow} numberOfLines={1}>
              {title}
            </Text>
            {when ? (
              <Text variant="tiny" color="textFaint">
                {when}
              </Text>
            ) : null}
          </Row>
          {children}
        </Column>
        <Ionicons name="chevron-back" size={16} color={colors.textFaint} style={styles.icon} />
      </Row>
    </Pressable>
  );
}

function LabResult({ analyte, value, flag }: { analyte: string; value: string | null; flag: LabFlag | null }) {
  const { colors } = useTheme();
  const tone = flagTone(flag);
  // A flagged value carries its letter; one that could not be read as a number carries "?".
  const mark = tone && flag ? FLAG_LABEL[flag] : '?';
  const color = tone === 'info' ? colors.info : tone === 'warning' ? colors.warning : colors.danger;
  return (
    <Text numeric variant="bodyStrong">
      <Text numeric variant="caption" color="textMuted">
        {analyte}{' '}
      </Text>
      <Text numeric variant="bodyStrong" style={{ color }}>
        {value ?? '—'} {mark}
      </Text>
    </Text>
  );
}

function More({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Text variant="caption" color="textFaint">
      +{toPersianDigits(count)}
    </Text>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  icon: { marginTop: 2 },
  pressed: { opacity: 0.6 },
});
