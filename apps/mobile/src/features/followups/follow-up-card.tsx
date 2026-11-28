import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Badge, Card, Column, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { FollowUp, Patient } from '@/db/schema';
import { withDatasetWrite } from '@/lib/dataset-write';
import { formatJalaliWithWeekday, formatRelative, formatTime } from '@/lib/jalali';
import { joinLabels, normalizePhone } from '@/lib/persian';
import { MIN_TOUCH, useTheme } from '@/theme';

import { FOLLOWUP_CHANNEL_LABELS, resultStageLabel } from './labels';
import { postponedDueDate, resultDecisionRecorded, urgencyOf } from './logic';
import {
  changeFollowUpResultStage,
  completeFollowUp,
  deleteFollowUp,
  setFollowUpStatus,
  updateFollowUp,
} from './queries';
import { reconcileFollowUpReminder } from './reminder-queries';

const CHANNEL_ICONS: Record<FollowUp['channel'], keyof typeof Ionicons.glyphMap> = {
  call: 'call-outline',
  sms: 'chatbubble-outline',
  visit: 'walk-outline',
  message: 'paper-plane-outline',
  lab: 'flask-outline',
  other: 'ellipse-outline',
};

const CLOSE_RESULT = { icon: 'checkmark', label: 'بستن پیگیری', next: 'close' } as const;
const RESULT_ACTIONS = {
  waiting: { icon: 'download-outline', label: 'ثبت دریافت', next: 'received' },
  received: { icon: 'eye-outline', label: 'ثبت مرور', next: 'reviewed' },
  reviewed: { icon: 'list-outline', label: 'ثبت تصمیم', next: 'decision' },
  actionTaken: CLOSE_RESULT,
  noActionNeeded: CLOSE_RESULT,
} as const;

/**
 * One follow-up with the next action, postponement and a completion summary.
 *
 * `showPatient` is for lists outside the record — the Today screen — where the
 * card has to say whose follow-up it is and tapping it opens that record.
 */
export function FollowUpCard({
  followUp,
  patient,
  showPatient = false,
  onPromptChange,
}: {
  followUp: FollowUp;
  patient?: Patient;
  showPatient?: boolean;
  onPromptChange?: (id: string, open: boolean) => void;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const mounted = useRef(true);
  const { generation } = useDatasetIntent();
  const { colors, spacing } = useTheme();
  const [outcome, setOutcome] = useState<FollowUp | null>(null);
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const outcomeBasis = useRef<FollowUp | null>(null);
  const now = new Date(useNow());
  const prompting = outcome !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    onPromptChange?.(followUp.id, prompting);
    return () => onPromptChange?.(followUp.id, false);
  }, [onPromptChange, followUp.id, prompting]);

  const pending = followUp.status === 'pending';
  const tracksResult = followUp.channel === 'lab';
  const stage = followUp.resultStage;
  const closesResult = outcome?.channel === 'lab';
  const resultAction = RESULT_ACTIONS[stage ?? 'waiting'];
  const urgency = urgencyOf(followUp, now);
  const reminderDirty = followUp.reminderRevision !== followUp.reminderAppliedRevision;
  const reminderUnavailable = pending && followUp.dueAt > now && !followUp.notificationId;
  const overdue = urgency === 'overdue';
  const dueToday = urgency === 'today';

  const tone = overdue ? 'danger' : dueToday ? 'warning' : 'neutral';

  async function perform(action: () => Promise<unknown>) {
    if (busy.current || !mounted.current || !navigation.isFocused()) return;
    busy.current = true;
    setWorking(true);
    try {
      await withDatasetWrite(generation, action);
    } catch (error) {
      if (mounted.current && navigation.isFocused()) alertError('عملیات انجام نشد', error);
    } finally {
      busy.current = false;
      if (mounted.current) setWorking(false);
    }
  }

  function openOutcome() {
    if (!mounted.current || busy.current || !navigation.isFocused()) return;
    const basis = { ...followUp };
    outcomeBasis.current = basis;
    setOutcome(basis);
  }

  function recordDecision() {
    if (!mounted.current || busy.current || !navigation.isFocused()) return;
    let used = false;
    const choose = (decision: 'actionTaken' | 'noActionNeeded') => {
      if (used) return;
      used = true;
      void perform(() => changeFollowUpResultStage(followUp, decision, new Date()));
    };
    const dismiss = () => {
      used = true;
    };
    Alert.alert(
      'تصمیم پس از مرور نتیجه',
      undefined,
      [
        { text: 'انصراف', style: 'cancel', onPress: dismiss },
        { text: 'اقدامی لازم نبود', onPress: () => choose('noActionNeeded') },
        { text: 'اقدام انجام شد', onPress: () => choose('actionTaken') },
      ],
      { cancelable: true, onDismiss: dismiss },
    );
  }

  function performResultAction() {
    const next = resultAction?.next;
    if (next === 'close') openOutcome();
    else if (next === 'decision') recordDecision();
    else if (next) void perform(() => changeFollowUpResultStage(followUp, next, new Date()));
  }

  function postpone() {
    if (!mounted.current || busy.current || !navigation.isFocused()) return;
    let used = false;
    const choose = (days: number) => {
      if (used) return;
      used = true;
      void perform(() => updateFollowUp(followUp.id, { dueAt: postponedDueDate(followUp.dueAt, days) }, followUp));
    };
    Alert.alert(
      'تعویق پیگیری',
      undefined,
      [
        {
          text: 'فردا',
          onPress: () => choose(1),
        },
        {
          text: '۳ روز',
          onPress: () => choose(3),
        },
        {
          text: '۱ هفته',
          onPress: () => choose(7),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          used = true;
        },
      },
    );
  }

  function more() {
    if (!mounted.current || busy.current || !navigation.isFocused()) return;
    let used = false;
    const choose = (work: () => Promise<void>) => {
      if (used) return;
      used = true;
      void perform(work);
    };
    const canGoBack = pending && tracksResult && stage !== null;
    Alert.alert(
      followUp.reason,
      undefined,
      [
        {
          text: canGoBack ? 'برگشت به مرحلهٔ قبل' : pending ? 'انجام نشد' : 'دوباره فعال شود',
          onPress: () =>
            choose(() =>
              canGoBack
                ? changeFollowUpResultStage(followUp, 'previous', new Date())
                : setFollowUpStatus(followUp.id, pending ? 'missed' : 'pending', new Date(), followUp),
            ),
        },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => choose(() => deleteFollowUp(followUp.id, followUp)),
        },
        {
          text: 'انصراف',
          style: 'cancel',
          onPress: () => {
            used = true;
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          used = true;
        },
      },
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
                label={
                  pending
                    ? formatRelative(followUp.dueAt, now)
                    : followUp.status === 'done'
                      ? tracksResult && resultDecisionRecorded(stage)
                        ? 'بسته شد'
                        : 'انجام شد'
                      : 'انجام نشد'
                }
                tone={pending ? tone : followUp.status === 'done' ? 'success' : 'neutral'}
                icon={overdue ? 'alert-circle' : undefined}
              />
              <Badge label={FOLLOWUP_CHANNEL_LABELS[followUp.channel]} tone="neutral" />
              {tracksResult && (pending || stage !== null) ? (
                <Badge label={resultStageLabel(stage)} tone="neutral" />
              ) : null}
              {followUp.priority === 'high' && <Badge label="مهم" tone="accent" icon="flag" />}
              <Text variant="tiny" color="textFaint">
                {joinLabels([formatJalaliWithWeekday(followUp.dueAt), formatTime(followUp.dueAt)])}
              </Text>
            </Row>

            {followUp.outcome ? (
              <Text variant="caption" color="textMuted">
                نتیجه: {followUp.outcome}
              </Text>
            ) : null}

            {(reminderDirty || reminderUnavailable) && (
              <Row gap="sm" wrap>
                <Text variant="caption" color="textMuted">
                  {reminderDirty ? 'اعلان نیاز به هماهنگی دارد' : 'اعلان فعال نیست'}
                </Text>
                <Action
                  icon="refresh-outline"
                  label="تلاش مجدد"
                  onPress={() => void perform(() => reconcileFollowUpReminder(followUp.id, true))}
                />
              </Row>
            )}

            {pending && (
              <Row gap="sm" wrap style={{ marginTop: spacing.xs }}>
                {tracksResult && resultAction ? (
                  <Action
                    icon={resultAction.icon}
                    label={resultAction.label}
                    tone={resultAction.next === 'close' ? 'success' : 'neutral'}
                    onPress={performResultAction}
                  />
                ) : !tracksResult ? (
                  <Action icon="checkmark" label="انجام شد" tone="success" onPress={openOutcome} />
                ) : null}
                <Action icon="time-outline" label="تعویق" onPress={postpone} />
                {phone && followUp.channel === 'call' ? (
                  <Action
                    icon="call"
                    label="تماس"
                    onPress={() => void perform(() => Linking.openURL(`tel:${phone}`))}
                  />
                ) : null}
              </Row>
            )}
          </Column>
        </Card>
      </Pressable>

      <PromptModal
        visible={prompting}
        busy={working}
        title={closesResult ? 'بستن پیگیری نتیجه' : 'پیگیری انجام شد'}
        message={closesResult ? 'خلاصهٔ مرور یا اقدام را وارد کنید (اختیاری).' : 'در یک خط بنویسید چه شد (اختیاری).'}
        initialValue={outcome?.outcome ?? ''}
        onCancel={() => {
          if (!busy.current && outcomeBasis.current === outcome) {
            outcomeBasis.current = null;
            setOutcome(null);
          }
        }}
        onSubmit={(text) => {
          void perform(async () => {
            const basis = outcomeBasis.current;
            if (!basis || basis !== outcome || basis.id !== followUp.id)
              throw new Error('پیگیری مربوط به این نتیجه در دسترس نیست؛ متن نگه داشته شد.');
            await completeFollowUp(basis.id, text || null, new Date(), basis);
            outcomeBasis.current = null;
            // Closing this acknowledged local prompt is not a navigation action.
            // Leave no completed input dialog behind when the owner returns.
            if (mounted.current) {
              setOutcome(null);
              if (navigation.isFocused())
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            }
          });
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
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xxs,
          paddingHorizontal: spacing.sm,
          minHeight: MIN_TOUCH,
          minWidth: MIN_TOUCH,
          paddingVertical: spacing.xs,
          borderRadius: radii.sm,
          backgroundColor: tone === 'success' ? colors.successSoft : colors.surfaceAlt,
        },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={14} color={fg} />
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
