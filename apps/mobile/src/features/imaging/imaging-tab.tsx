import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, EmptyState, Row, Text } from '@/components/ui';
import type { ImagingStudy } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { formatJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { IMAGING_STATUS_LABELS, MODALITY_LABELS } from './labels';
import { deleteImagingStudy, patientImagingQuery } from './queries';

const MODALITY_ICON: Record<ImagingStudy['modality'], keyof typeof Ionicons.glyphMap> = {
  xray: 'scan-outline',
  ct: 'disc-outline',
  mri: 'magnet-outline',
  us: 'pulse-outline',
  echo: 'heart-outline',
  endoscopy: 'eye-outline',
  nuclear: 'nuclear-outline',
  angio: 'git-branch-outline',
  other: 'image-outline',
};

export function ImagingTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const { data, error } = useLive(patientImagingQuery(patientId), [patientId]);
  const studies = data ?? [];

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <ErrorNotice error={error} what="تصویربرداری" />
      <Button
        label="تصویربرداری جدید"
        icon="add"
        variant="secondary"
        full
        onPress={() => router.push({ pathname: '/patient/[id]/imaging', params: { id: patientId } })}
      />
      {studies.length === 0 ? (
        <EmptyState
          icon="scan-outline"
          title="تصویربرداری ثبت نشده"
          description="سی‌تی، ام‌آر‌آی، سونو و بقیه — با گزارش، و اینکه دقیقاً کجاست و روی چه سیستمی می‌شود دیدش."
        />
      ) : (
        studies.map((s) => <StudyCard key={s.id} study={s} patientId={patientId} />)
      )}
    </Column>
  );
}

function StudyCard({ study, patientId }: { study: ImagingStudy; patientId: string }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const where = [study.storageLocation, study.storagePlatform].filter(Boolean).join(' — ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/patient/[id]/imaging', params: { id: patientId, studyId: study.id } })}
      onLongPress={() =>
        Alert.alert('حذف این تصویربرداری؟', undefined, [
          { text: 'انصراف', style: 'cancel' },
          {
            text: 'حذف',
            style: 'destructive',
            onPress: () => void deleteImagingStudy(study.id).catch((e) => alertError('حذف نشد', e)),
          },
        ])
      }
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card>
        <Column gap="xs">
          <Row gap="sm" align="flex-start">
            <Ionicons name={MODALITY_ICON[study.modality]} size={20} color={colors.primary} style={{ marginTop: 3 }} />
            <Column gap="xxs" style={styles.grow}>
              <Text variant="subheading">{MODALITY_LABELS[study.modality]}</Text>
              {study.region ? (
                <Text variant="caption" color="textMuted" ltr>
                  {study.region}
                </Text>
              ) : null}
            </Column>
            <Column gap="xxs" style={{ alignItems: 'flex-end' }}>
              <Badge
                label={IMAGING_STATUS_LABELS[study.status]}
                tone={study.status === 'ordered' ? 'warning' : study.status === 'reviewed' ? 'success' : 'neutral'}
              />
              {study.studyDate ? (
                <Text variant="tiny" color="textFaint">
                  {formatJalali(study.studyDate)}
                </Text>
              ) : null}
            </Column>
          </Row>

          {where ? (
            <Row gap="xs" style={{ backgroundColor: colors.surfaceAlt, borderRadius: radii.sm, padding: spacing.sm }}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" style={styles.grow}>
                {where}
              </Text>
            </Row>
          ) : (
            <Text variant="tiny" color="warning">
              محل نگهداری ثبت نشده
            </Text>
          )}

          {study.impression ? (
            <Text variant="caption" color="textMuted" ltr numberOfLines={3}>
              {study.impression}
            </Text>
          ) : null}

          {study.accessionNumber || study.accessUrl ? (
            <Row gap="sm" wrap>
              {study.accessionNumber ? (
                <Pressable
                  onPress={() => void Clipboard.setStringAsync(study.accessionNumber!)}
                  hitSlop={6}
                  accessibilityLabel="کپی شماره پذیرش"
                >
                  <Badge label={`# ${study.accessionNumber}`} tone="neutral" icon="copy-outline" ltr />
                </Pressable>
              ) : null}
              {study.accessUrl ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(study.accessUrl!).catch(() => Alert.alert('لینک باز نشد', study.accessUrl!))
                  }
                  hitSlop={6}
                  accessibilityLabel="باز کردن لینک"
                >
                  <Badge label="باز کردن لینک" tone="info" icon="open-outline" />
                </Pressable>
              ) : null}
            </Row>
          ) : null}
        </Column>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
