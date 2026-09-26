import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { notify } from '@/components/feedback';
import { Avatar, Badge, Card, Column, Row, Text } from '@/components/ui';
import type { Patient } from '@/db/schema';
import { formatAge } from '@/lib/jalali';
import { formatPhone, normalizePhone, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { PATIENT_STATUS, SEX_LABELS } from './labels';
import { setPatientStarred } from './queries';

/**
 * Identity block at the top of the patient record.
 *
 * Kept short on purpose: it sits above the record's tabs, so every line here
 * pushes what the tab shows further down the screen. Who, how old, what
 * status, the one-line summary and the allergies — the rest is in the tabs.
 */
export function PatientHeader({ patient }: { patient: Patient }) {
  const { colors, spacing } = useTheme();
  const status = PATIENT_STATUS[patient.status];
  const age = formatAge(patient.birthDate, patient.ageYears);

  const meta = [
    age !== '—' ? age : null,
    patient.sex ? SEX_LABELS[patient.sex] : null,
    patient.bloodType,
    patient.fileNumber ? `پرونده ${toPersianDigits(patient.fileNumber)}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <Card style={{ padding: spacing.md }}>
      <Column gap="sm">
        <Row gap="md" align="center">
          <Avatar
            first={patient.firstName}
            last={patient.lastName}
            size={48}
            tone={status.tone === 'neutral' ? 'primary' : status.tone}
          />

          <Column gap="xxs" style={styles.grow}>
            <Text variant="heading" numberOfLines={2}>
              {patient.firstName} {patient.lastName}
            </Text>
            <Row gap="xs" wrap>
              {meta ? (
                <Text variant="caption" color="textMuted">
                  {meta}
                </Text>
              ) : null}
              <Badge label={status.label} tone={status.tone} />
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
 * anything is prescribed — red, with its own icon, on one line when it fits.
 */
export function AllergyBanner({ text }: { text: string }) {
  const { colors, radii, spacing } = useTheme();
  const isNone = /^\s*(nkda|nkfa|none|ندارد|هیچ)\s*$/i.test(text.trim());
  const color = isNone ? colors.success : colors.danger;

  return (
    <Row
      gap="sm"
      align="flex-start"
      style={{
        backgroundColor: isNone ? colors.successSoft : colors.dangerSoft,
        borderRadius: radii.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Ionicons
        name={isNone ? 'shield-checkmark-outline' : 'warning-outline'}
        size={18}
        color={color}
        style={{ marginTop: 2 }}
      />
      <Text variant="body" style={[styles.grow, { color }]}>
        <Text variant="bodyStrong" style={{ color }}>
          آلرژی:{' '}
        </Text>
        {text}
      </Text>
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
              notify('تماس برقرار نشد', 'شماره را کپی کنید و دستی بگیرید.'),
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
