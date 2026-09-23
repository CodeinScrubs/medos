import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Row, Text } from '@/components/ui';
import { VoiceNotePlayer } from '@/components/voice-note-player';
import type { Attachment, Capture, Patient } from '@/db/schema';
import { formatJalaliDateTime } from '@/lib/jalali';
import { fullName } from '@/lib/persian';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { discardCapture, fileCaptureAsNote, fileCaptureAsTask } from './queries';

const ICON = {
  text: 'create-outline',
  voice: 'mic-outline',
  photo: 'image-outline',
} as const;

/** Which patient a card is asking its list for. */
export type PatientAsk = { captureId: string; purpose: 'note' | 'assign'; selectedId: string | null };

/**
 * One line of the inbox, with the things that can happen to it.
 *
 * Filing as a note needs a patient, so a capture that has none asks for one
 * instead of guessing — a note under the wrong person is worse than a capture
 * still waiting. Filing as a task does not ask: half of what gets caught in a
 * corridor has no patient at all.
 *
 * The picker itself belongs to the list, not the card. One patient query for a
 * screen rather than one per row.
 */
export function CaptureCard({
  capture,
  patient,
  media,
  onAskPatient,
}: {
  capture: Capture;
  patient: Patient | null;
  media: Attachment[];
  onAskPatient: (ask: PatientAsk) => void;
}) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const [busy, setBusy] = useState(false);

  const voices = media.filter((m) => m.kind === 'voice');
  const photos = media.filter((m) => m.kind !== 'voice');
  const filed = capture.filedAt != null;

  async function toTask() {
    setBusy(true);
    try {
      await fileCaptureAsTask(capture.id);
    } catch (e) {
      alertError('به کار تبدیل نشد', e);
    } finally {
      setBusy(false);
    }
  }

  async function toNote() {
    if (!capture.patientId) {
      onAskPatient({ captureId: capture.id, purpose: 'note', selectedId: null });
      return;
    }
    setBusy(true);
    try {
      const noteId = await fileCaptureAsNote(capture.id);
      router.push({ pathname: '/patient/[id]/note', params: { id: capture.patientId, noteId } });
    } catch (e) {
      alertError('به نوت تبدیل نشد', e);
    } finally {
      setBusy(false);
    }
  }

  function openFiled() {
    if (!capture.filedId) return;
    if (capture.filedAs === 'note' && capture.patientId) {
      router.push({ pathname: '/patient/[id]/note', params: { id: capture.patientId, noteId: capture.filedId } });
    } else if (capture.patientId) {
      router.push({ pathname: '/patient/[id]', params: { id: capture.patientId } });
    }
  }

  return (
    <Card style={filed ? styles.faded : undefined}>
      <Column gap="sm">
        <Row gap="sm" align="flex-start">
          <Ionicons name={ICON[capture.kind]} size={18} color={colors.primary} style={styles.icon} />
          <Column gap="xxs" style={styles.grow}>
            {capture.text ? (
              <Text variant="body" numberOfLines={filed ? 2 : 8}>
                {capture.text}
              </Text>
            ) : (
              <Text variant="body" color="textFaint">
                {voices.length > 0 ? 'وویس بدون متن' : 'بدون متن'}
              </Text>
            )}
            <Row gap="xs" wrap>
              <Text variant="tiny" color="textFaint">
                {formatJalaliDateTime(capture.capturedAt)}
              </Text>
              {patient ? <Badge label={fullName(patient.firstName, patient.lastName)} /> : null}
              {filed ? <Badge label={capture.filedAs === 'note' ? 'شد نوت' : 'شد کار'} tone="success" /> : null}
            </Row>
          </Column>
        </Row>

        {voices.map((v) => (
          <VoiceNotePlayer
            key={v.id}
            uri={mediaUri(v.relativePath)}
            relativePath={v.relativePath}
            durationMs={v.durationMs}
          />
        ))}

        {photos.length > 0 ? (
          <Row gap="xs" wrap>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push({ pathname: '/media/[attachmentId]', params: { attachmentId: p.id } })}
              >
                <Image
                  source={{ uri: mediaUri(p.thumbnailPath ?? p.relativePath) ?? undefined }}
                  style={[styles.thumb, { borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }]}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </Row>
        ) : null}

        {filed ? (
          <Button label="رفتن به آن" variant="ghost" size="sm" haptic={false} onPress={openFiled} />
        ) : (
          <Row gap="sm" wrap style={{ marginTop: spacing.xxs }}>
            <Button
              label="کار"
              icon="checkbox-outline"
              variant="secondary"
              size="sm"
              disabled={busy || !capture.text}
              onPress={() => void toTask()}
              loading={busy}
            />
            <Button
              label="نوت"
              disabled={busy}
              icon="document-text-outline"
              variant="secondary"
              size="sm"
              onPress={() => void toNote()}
            />
            <Button
              label={patient ? 'تغییر بیمار' : 'بیمار'}
              disabled={busy}
              icon="person-outline"
              variant="ghost"
              size="sm"
              haptic={false}
              onPress={() => onAskPatient({ captureId: capture.id, purpose: 'assign', selectedId: capture.patientId })}
            />
            <Button
              label="دور انداختن"
              disabled={busy}
              variant="ghost"
              size="sm"
              haptic={false}
              onPress={() =>
                Alert.alert('دور انداخته شود؟', 'به سطل زباله می‌رود و برگرداندنی است.', [
                  { text: 'انصراف', style: 'cancel' },
                  { text: 'دور انداختن', style: 'destructive', onPress: () => void discardCapture(capture.id) },
                ])
              }
            />
          </Row>
        )}
      </Column>
    </Card>
  );
}

/** Attachments grouped by the capture they hang off, for a list that fetched them all at once. */
export function groupMedia(media: Attachment[] | undefined): Map<string, Attachment[]> {
  const byCapture = new Map<string, Attachment[]>();
  for (const m of media ?? []) {
    const list = byCapture.get(m.entityId);
    if (list) list.push(m);
    else byCapture.set(m.entityId, [m]);
  }
  return byCapture;
}

export const NO_MEDIA: Attachment[] = [];

const styles = StyleSheet.create({
  faded: { opacity: 0.7 },
  grow: { flex: 1 },
  icon: { marginTop: 2 },
  thumb: { width: 72, height: 72 },
});
