import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Alert, Linking, Pressable, StyleSheet } from 'react-native';

import { Avatar, Badge, Card, Column, Row, Text } from '@/components/ui';
import type { Patient } from '@/db/schema';
import { formatAge } from '@/lib/jalali';
import { formatPhone, normalizePhone, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { PATIENT_STATUS, SEX_LABELS } from './labels';
import { setPatientStarred } from './queries';

/** Identity block at the top of the patient record. */
export function PatientHeader({ patient }: { patient: Patient }) {
  const { colors, spacing } = useTheme();
  const status = PATIENT_STATUS[patient.status];
  const age = formatAge(patient.birthDate, patient.ageYears);

  const meta = [age !== '—' ? age : null, patient.sex ? SEX_LABELS[patient.sex] : null, patient.bloodType]
    .filter(Boolean)
    .join(' • ');

  return (
    <Card>
      <Column gap="md">
        <Row gap="md" align="flex-start">
          <Avatar
            first={patient.firstName}
            last={patient.lastName}
            size={56}
            tone={status.tone === 'neutral' ? 'primary' : status.tone}
          />

          <Column gap="xxs" style={styles.grow}>
            <Text variant="title" numberOfLines={2}>
              {patient.firstName} {patient.lastName}
            </Text>
            {meta ? (
              <Text variant="caption" color="textMuted">
                {meta}
              </Text>
            ) : null}
            <Row gap="xs" wrap style={{ marginTop: spacing.xxs }}>
              <Badge label={status.label} tone={status.tone} />
              {patient.fileNumber ? (
                <Badge label={`پرونده ${toPersianDigits(patient.fileNumber)}`} tone="neutral" />
              ) : null}
            </Row>
          </Column>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={patient.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
            hitSlop={12}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void setPatientStarred(patient.id, !patient.starred);
            }}
          >
            <Ionicons
              name={patient.starred ? 'star' : 'star-outline'}
              size={22}
              color={patient.starred ? colors.accent : colors.textFaint}
            />
          </Pressable>
        </Row>

        {patient.summary ? (
          <Text variant="body" color="textMuted">
            {patient.summary}
          </Text>
        ) : null}

        {patient.allergies ? <AllergyBanner text={patient.allergies} /> : null}

        {patient.phone ? <CallRow phone={patient.phone} label="بیمار" /> : null}
      </Column>
    </Card>
  );
}

/**
 * Allergies get their own banner rather than sitting in a list of fields.
 * It is the one piece of the record that has to be impossible to miss before
 * anything is prescribed.
 */
function AllergyBanner({ text }: { text: string }) {
  const { colors, radii, spacing } = useTheme();
  const isNone = /^\s*(nkda|nkfa|none|ندارد|هیچ)\s*$/i.test(text.trim());

  return (
    <Row
      gap="sm"
      align="flex-start"
      style={{
        backgroundColor: isNone ? colors.successSoft : colors.dangerSoft,
        borderRadius: radii.md,
        padding: spacing.md,
      }}
    >
      <Ionicons
        name={isNone ? 'shield-checkmark-outline' : 'warning-outline'}
        size={18}
        color={isNone ? colors.success : colors.danger}
      />
      <Column gap="xxs" style={styles.grow}>
        <Text variant="captionStrong" style={{ color: isNone ? colors.success : colors.danger }}>
          آلرژی
        </Text>
        <Text variant="body" style={{ color: isNone ? colors.success : colors.danger }}>
          {text}
        </Text>
      </Column>
    </Row>
  );
}

/** A phone number with call / copy affordances, since both get used. */
export function CallRow({ phone, label, relation }: { phone: string; label: string; relation?: string | null }) {
  const { colors, radii, spacing } = useTheme();
  const normalized = normalizePhone(phone);

  return (
    <Row
      gap="sm"
      justify="space-between"
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Column gap="xxs" style={styles.grow}>
        <Text variant="tiny" color="textFaint">
          {relation ? `${label} — ${relation}` : label}
        </Text>
        <Text variant="bodyStrong" ltr>
          {formatPhone(normalized)}
        </Text>
      </Column>

      <Row gap="xs">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="کپی شماره"
          hitSlop={10}
          onPress={() => {
            void Clipboard.setStringAsync(normalized);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
          style={[styles.action, { backgroundColor: colors.surface, borderRadius: radii.sm }]}
        >
          <Ionicons name="copy-outline" size={17} color={colors.textMuted} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تماس"
          hitSlop={10}
          onPress={() => {
            Linking.openURL(`tel:${normalized}`).catch(() =>
              Alert.alert('تماس برقرار نشد', 'شماره را کپی کنید و دستی بگیرید.'),
            );
          }}
          style={[styles.action, { backgroundColor: colors.primary, borderRadius: radii.sm }]}
        >
          <Ionicons name="call" size={17} color={colors.primaryText} />
        </Pressable>
      </Row>
    </Row>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  action: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
