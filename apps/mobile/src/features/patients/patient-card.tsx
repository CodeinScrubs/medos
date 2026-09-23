import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar, Badge, Card, Column, Row, Text } from '@/components/ui';
import type { Patient } from '@/db/schema';
import { formatAge, formatRelativeTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { PATIENT_STATUS, SEX_LABELS } from './labels';

/**
 * One row in the patient list.
 *
 * Optimised for scanning rather than completeness: name, how old, where they
 * are, and the one-line reminder of who they are. Everything else is one tap
 * away.
 */
export function PatientCard({ patient, location }: { patient: Patient; location?: string | null }) {
  const { colors, spacing } = useTheme();
  const status = PATIENT_STATUS[patient.status];
  const age = formatAge(patient.birthDate, patient.ageYears);

  // Ward and bed come first for someone on a ward: on a round it is the field
  // that decides where to walk next, and looking it up meant opening the file.
  const meta = [location, age !== '—' ? age : null, patient.sex ? SEX_LABELS[patient.sex] : null]
    .filter(Boolean)
    .join(' • ');

  return (
    <Link href={{ pathname: '/patient/[id]', params: { id: patient.id } }} asChild>
      <Pressable style={({ pressed }) => [pressed && styles.pressed]}>
        <Card style={{ marginBottom: spacing.sm }}>
          <Row gap="md" align="flex-start">
            <Avatar
              first={patient.firstName}
              last={patient.lastName}
              tone={status.tone === 'neutral' ? 'primary' : status.tone}
            />

            <Column gap="xxs" style={styles.grow}>
              <Row justify="space-between" gap="sm">
                <Row gap="xs" style={styles.grow}>
                  <Text variant="subheading" numberOfLines={1} style={styles.grow}>
                    {patient.firstName} {patient.lastName}
                  </Text>
                  {patient.starred && <Ionicons name="star" size={14} color={colors.accent} />}
                </Row>
                <Badge label={status.short} tone={status.tone} />
              </Row>

              {meta ? (
                <Text variant="caption" color="textMuted">
                  {meta}
                </Text>
              ) : null}

              {patient.summary ? (
                <Text variant="caption" color="textMuted" numberOfLines={2}>
                  {patient.summary}
                </Text>
              ) : null}

              <Text variant="tiny" color="textFaint">
                آخرین تغییر: {formatRelativeTime(patient.updatedAt)}
              </Text>
            </Column>
          </Row>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
