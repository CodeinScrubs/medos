import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, EmptyState, Row, SectionHeader, Text } from '@/components/ui';
import type { Order } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { currentEncounterQuery } from '@/features/encounters/queries';
import { formatJalali } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { ORDER_KIND_LABELS, ORDER_STATUS_LABELS } from './labels';
import { isRunning, orderSig, therapyDay } from './logic';
import { deleteOrder, patientOrdersQuery, setOrderStatus } from './queries';

/**
 * The kardex: what the patient is on right now, and what was stopped.
 *
 * Active and held orders are the working list. Stopped orders are kept — they
 * answer "what antibiotics has this patient already had" — but folded away.
 */
export function KardexTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const [showStopped, setShowStopped] = useState(false);

  const { data: encounters } = useLive(currentEncounterQuery(patientId), [patientId]);
  const encounterId = encounters?.[0]?.id ?? null;
  const { data, error } = useLive(patientOrdersQuery(patientId, encounterId), [patientId, encounterId]);
  const all = data ?? [];
  const current = all.filter(isRunning);
  const stopped = all.filter((o) => !isRunning(o));

  const openNew = () => router.push({ pathname: '/patient/[id]/order', params: { id: patientId } });

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <Button label="دستور جدید" icon="add" variant="secondary" full onPress={openNew} />
      <ErrorNotice error={error} what="کاردکس" />

      {all.length === 0 ? (
        <EmptyState
          icon="medical-outline"
          title="کاردکس خالی است"
          description="داروها، سرم‌ها، رژیم غذایی و دستورات پرستاری را اینجا ثبت کنید."
        />
      ) : (
        <>
          <SectionHeader title="در جریان" count={current.length} />
          {current.length === 0 ? (
            <Card tone="alt">
              <Text variant="caption" color="textFaint">
                دستور فعالی نیست.
              </Text>
            </Card>
          ) : (
            current.map((o) => <OrderCard key={o.id} order={o} patientId={patientId} />)
          )}

          {stopped.length > 0 && (
            <>
              <Pressable onPress={() => setShowStopped((v) => !v)} accessibilityRole="button">
                <SectionHeader
                  title="قطع‌شده"
                  count={stopped.length}
                  action={
                    <Text variant="caption" color="primary">
                      {showStopped ? 'بستن' : 'نمایش'}
                    </Text>
                  }
                />
              </Pressable>
              {showStopped && stopped.map((o) => <OrderCard key={o.id} order={o} patientId={patientId} />)}
            </>
          )}
        </>
      )}
    </Column>
  );
}

function OrderCard({ order, patientId }: { order: Order; patientId: string }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const day = therapyDay(order);
  const sig = orderSig(order);
  const stopped = order.status === 'discontinued' || order.status === 'completed';
  const held = order.status === 'held';
  const showDay = (order.kind === 'drug' || order.kind === 'fluid') && day != null;

  function change(status: Order['status']) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setOrderStatus(order.id, status);
  }

  function confirmDiscontinue() {
    Alert.alert('قطع دستور', `${order.name} قطع شود؟`, [
      { text: 'انصراف', style: 'cancel' },
      { text: 'قطع', style: 'destructive', onPress: () => change('discontinued') },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'حذف از کاردکس',
      'اگر این دستور اشتباه ثبت شده حذفش کنید. اگر فقط قطع شده، «قطع» بهتر است تا در سابقه بماند.',
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => void deleteOrder(order.id).catch((e) => alertError('حذف نشد', e)),
        },
      ],
    );
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/patient/[id]/order', params: { id: patientId, orderId: order.id } })}
      onLongPress={confirmDelete}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={{ opacity: stopped ? 0.6 : 1 }}>
        <Column gap="xs">
          <Row justify="space-between" gap="sm" align="flex-start">
            <Column gap="xxs" style={styles.grow}>
              <Text variant="subheading" ltr style={stopped ? { textDecorationLine: 'line-through' } : undefined}>
                {order.name}
              </Text>
              {sig ? (
                <Text variant="caption" color="textMuted" ltr>
                  {sig}
                </Text>
              ) : null}
            </Column>

            {showDay && (
              <View
                style={{
                  backgroundColor: stopped ? colors.neutralSoft : colors.primarySoft,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs,
                  alignItems: 'center',
                }}
              >
                {/* D-count stays Latin: it is read aloud on rounds as "D5". */}
                <Text variant="captionStrong" ltr style={{ color: stopped ? colors.textMuted : colors.primary }}>
                  D{day}
                </Text>
              </View>
            )}
          </Row>

          <Row gap="xs" wrap>
            {order.kind !== 'drug' && <Badge label={ORDER_KIND_LABELS[order.kind]} tone="info" />}
            {held && <Badge label={ORDER_STATUS_LABELS.held} tone="warning" icon="pause" />}
            {stopped && <Badge label={ORDER_STATUS_LABELS[order.status]} tone="neutral" />}
            {order.indication ? <Badge label={order.indication} tone="neutral" ltr /> : null}
            {order.startAt ? (
              <Text variant="tiny" color="textFaint">
                از {formatJalali(order.startAt)}
                {order.endAt ? ` تا ${formatJalali(order.endAt)}` : ''}
              </Text>
            ) : null}
          </Row>

          {order.notes ? (
            <Text variant="caption" color="textMuted">
              {order.notes}
            </Text>
          ) : null}

          {!stopped && (
            <Row gap="sm" style={{ marginTop: spacing.xs }}>
              <QuickAction
                icon={held ? 'play' : 'pause'}
                label={held ? 'ادامه' : 'توقف موقت'}
                onPress={() => change(held ? 'active' : 'held')}
              />
              <QuickAction icon="close" label="قطع" tone="danger" onPress={confirmDiscontinue} />
              <QuickAction icon="checkmark-done" label="تمام شد" onPress={() => change('completed')} />
            </Row>
          )}
          {stopped && (
            <Row gap="sm" style={{ marginTop: spacing.xs }}>
              <QuickAction icon="refresh" label="شروع دوباره" onPress={() => change('active')} />
            </Row>
          )}
        </Column>
      </Card>
    </Pressable>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger';
}) {
  const { colors, radii, spacing } = useTheme();
  const fg = tone === 'danger' ? colors.danger : colors.textMuted;
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
          backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.surfaceAlt,
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
