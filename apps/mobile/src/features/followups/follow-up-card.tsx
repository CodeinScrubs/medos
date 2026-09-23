import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet } from 'react-native';

import { PromptModal } from '@/components/prompt-modal';
import { Badge, Card, Column, Row, Text } from '@/components/ui';
import type { FollowUp, Patient } from '@/db/schema';
import { formatJalaliWithWeekday, formatRelative, formatTime } from '@/lib/jalali';
import { normalizePhone } from '@/lib/persian';
import { useTheme } from '@/theme';

import { FOLLOWUP_CHANNEL_LABELS } from './labels';
import { postponedDueDate, urgencyOf } from './logic';
import { completeFollowUp, deleteFollowUp, setFollowUpStatus, updateFollowUp } from './queries';

const CHANNEL_ICONS: Record<FollowUp['channel'], keyof typeof Ionicons.glyphMap> = {
  call: 'call-outline',
  sms: 'chatbubble-outline',
  visit: 'walk-outline',
  message: 'paper-plane-outline',
  lab: 'flask-outline',
  other: 'ellipse-outline',
};

/**
 * One follow-up, with the three things you actually do to it: call, mark
 * done (with a line on what happened), or push it back.
 *
 * `showPatient` is for lists outside the record — the Today screen — where the
 * card has to say whose follow-up it is and tapping it opens that record.
 */
export function FollowUpCard({
  followUp,
  patient,
  showPatient = false,
}: {
  followUp: FollowUp;
  patient?: Patient;
  showPatient?: boolean;
}) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [prompting, setPrompting] = useState(false);

  const pending = followUp.status === 'pending';
  const urgency = urgencyOf(followUp);
  const overdue = urgency === 'overdue';
  const dueToday = urgency === 'today';

  const tone = overdue ? 'danger' : dueToday ? 'warning' : 'neutral';

  function postpone() {
    Alert.alert(
      'تعویق پیگیری',
      undefined,
      [
        {
          text: 'فردا',
          onPress: () => void updateFollowUp(followUp.id, { dueAt: postponedDueDate(followUp.dueAt, 1) }),
        },
        {
          text: '۳ روز',
          onPress: () => void updateFollowUp(followUp.id, { dueAt: postponedDueDate(followUp.dueAt, 3) }),
        },
        {
          text: '۱ هفته',
          onPress: () => void updateFollowUp(followUp.id, { dueAt: postponedDueDate(followUp.dueAt, 7) }),
        },
      ],
      { cancelable: true },
    );
  }

  function more() {
    Alert.alert(
      followUp.reason,
      undefined,
      [
        {
          text: pending ? 'انجام نشد' : 'دوباره فعال شود',
          onPress: () => void setFollowUpStatus(followUp.id, pending ? 'missed' : 'pending'),
        },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => void deleteFollowUp(followUp.id),
        },
        { text: 'انصراف', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  const phone = patient?.phone ? normalizePhone(patient.phone) : null;

  return (
    <>
      <Pressable
        onLongPress={more}
        onPress={
          showPatient ? () => router.push({ pathname: '/patient/[id]', params: { id: followUp.patientId } }) : undefined
        }
        style={({ pressed }) => [pressed && showPatient && styles.pressed]}
      >
        <Card style={{ opacity: pending ? 1 : 0.6 }}>
          <Column gap="xs">
            {showPatient && patient ? (
              <Text variant="subheading">
                {patient.firstName} {patient.lastName}
              </Text>
            ) : null}

            <Row gap="sm" align="flex-start">
              <Ionicons
                name={CHANNEL_ICONS[followUp.channel]}
                size={18}
                color={colors.primary}
                style={{ marginTop: 3 }}
              />
              <Text variant={showPatient ? 'body' : 'bodyStrong'} style={styles.grow}>
                {followUp.reason}
              </Text>
            </Row>

            <Row gap="xs" wrap>
              <Badge
                label={pending ? formatRelative(followUp.dueAt) : followUp.status === 'done' ? 'انجام شد' : 'انجام نشد'}
                tone={pending ? tone : followUp.status === 'done' ? 'success' : 'neutral'}
                icon={overdue ? 'alert-circle' : undefined}
              />
              <Badge label={FOLLOWUP_CHANNEL_LABELS[followUp.channel]} tone="neutral" />
              {followUp.priority === 'high' && <Badge label="مهم" tone="accent" icon="flag" />}
              <Text variant="tiny" color="textFaint">
                {formatJalaliWithWeekday(followUp.dueAt)} • {formatTime(followUp.dueAt)}
              </Text>
            </Row>

            {followUp.outcome ? (
              <Text variant="caption" color="textMuted">
                نتیجه: {followUp.outcome}
              </Text>
            ) : null}

            {pending && (
              <Row gap="sm" style={{ marginTop: spacing.xs }}>
                <Action icon="checkmark" label="انجام شد" tone="success" onPress={() => setPrompting(true)} />
                <Action icon="time-outline" label="تعویق" onPress={postpone} />
                {phone && followUp.channel === 'call' ? (
                  <Action icon="call" label="تماس" onPress={() => void Linking.openURL(`tel:${phone}`)} />
                ) : null}
              </Row>
            )}
          </Column>
        </Card>
      </Pressable>

      <PromptModal
        visible={prompting}
        title="پیگیری انجام شد"
        message="در یک خط بنویسید چه شد (اختیاری)."
        placeholder="مثلاً حالش خوب است، آزمایش نرمال"
        onCancel={() => setPrompting(false)}
        onSubmit={(text) => {
          setPrompting(false);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void completeFollowUp(followUp.id, text || null);
        }}
      />
    </>
  );
}

function Action({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'success';
}) {
  const { colors, radii, spacing } = useTheme();
  const fg = tone === 'success' ? colors.success : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xxs,
          paddingHorizontal: spacing.sm,
          height: 32,
          borderRadius: radii.sm,
          backgroundColor: tone === 'success' ? colors.successSoft : colors.surfaceAlt,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={14} color={fg} />
      <Text variant="tiny" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
