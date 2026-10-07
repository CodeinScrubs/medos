import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, IconButton, Row, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import type { Doctor, Occasion, ScheduledMessage } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { daysBetween, formatJalaliDateTime, formatJalaliLong } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { GreetingComposer, type GreetingTarget } from './greeting-composer';
import { OCCASION_KIND_LABELS } from './labels';
import { DEFAULT_GREETING, daysUntilLabel, doctorDisplayName, greetingText, occasionNextDate } from './logic';
import { confirmGreetingSent, doctorMessagesQuery, markGreetingSkipped } from './messages-queries';
import { OccasionReminderStatus } from './occasion-reminder-status';
import { deleteOccasion, doctorOccasionsQuery } from './occasions-queries';

const CHANNEL_LABELS: Record<ScheduledMessage['channel'], string> = {
  sms: 'پیامک',
  whatsapp: 'واتس‌اپ',
  telegram: 'تلگرام',
  call: 'تماس',
  email: 'ایمیل',
  inperson: 'حضوری',
};
const STATUS_LABELS: Record<ScheduledMessage['status'], string> = {
  pending: 'در انتظار',
  ready: 'آماده؛ ارسال تأیید نشده',
  sent: 'فرستادم',
  skipped: 'نفرستادم',
  failed: 'کامل نشد',
};

/** Dates and the complete honest message history stay together, with no extra route. */
export function OccasionsSection({
  doctor,
  generation,
  stale,
}: {
  doctor: Doctor;
  generation: number;
  stale: boolean;
}) {
  const router = useRouter();
  const clock = useNow();
  const now = new Date(clock);
  const { colors } = useTheme();
  const { data, error, retry } = useLive(doctorOccasionsQuery(doctor.id), [doctor.id]);
  const {
    data: messages,
    error: messagesError,
    retry: retryMessages,
  } = useLive(doctorMessagesQuery(doctor.id), [doctor.id]);
  const [target, setTarget] = useState<GreetingTarget | null>(null);
  const [historyCount, setHistoryCount] = useState(5);
  const rows = useMemo(
    () =>
      (data ?? [])
        .map((occasion) => ({ occasion, at: occasionNextDate(occasion, new Date(clock)) }))
        .sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity)),
    [data, clock],
  );

  function greet(occasion: Occasion) {
    setTarget({
      doctor,
      occasion,
      body: greetingText(occasion.messageTemplate || DEFAULT_GREETING[occasion.kind], {
        name: doctorDisplayName(doctor),
        occasion: occasion.title,
      }),
    });
  }

  return (
    <>
      <CollapsibleSection
        title="مناسبت‌ها"
        icon="gift-outline"
        defaultOpen
        filledCount={error || data === undefined ? undefined : rows.length}
        subtitle={error ? 'خواندن کامل نشد' : data === undefined ? 'در حال خواندن…' : undefined}
      >
        <Column gap="sm">
          <ErrorNotice error={error} what="مناسبت‌ها" onRetry={retry} />
          {data === undefined && !error ? (
            <Text variant="caption" color="textMuted">
              در حال خواندن…
            </Text>
          ) : null}
          {rows.map(({ occasion, at }) => {
            const days = at ? daysBetween(at, now) : null;
            const ready = messages?.find((m) => m.occasionId === occasion.id && m.status === 'ready');
            const sent = messages?.reduce<ScheduledMessage | undefined>(
              (last, message) =>
                message.occasionId === occasion.id &&
                message.status === 'sent' &&
                message.sentAt &&
                (!last?.sentAt || message.sentAt > last.sentAt)
                  ? message
                  : last,
              undefined,
            );
            return (
              <Card key={occasion.id} tone="alt">
                <Column gap="xs">
                  <Row gap="xs" justify="space-between">
                    <Column gap="xxs" style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{occasion.title}</Text>
                      <Text variant="caption" color="textMuted">
                        {at ? formatJalaliLong(at) : 'تاریخ معتبر ثبت نشده'}
                        {days != null ? ` — ${daysUntilLabel(days)}` : ''}
                      </Text>
                    </Column>
                    <IconButton
                      icon="send-outline"
                      label={`متن تبریک ${occasion.title}`}
                      disabled={stale}
                      onPress={() => greet(occasion)}
                    />
                    <IconButton
                      icon="create-outline"
                      label={`ویرایش ${occasion.title}`}
                      disabled={stale}
                      onPress={() =>
                        router.push({
                          pathname: '/doctor/occasion',
                          params: { doctorId: doctor.id, occasionId: occasion.id },
                        })
                      }
                    />
                    <IconButton
                      icon="trash-outline"
                      label={`حذف ${occasion.title}`}
                      color={colors.danger}
                      disabled={stale}
                      onPress={() =>
                        Alert.alert('حذف مناسبت؟', occasion.title, [
                          { text: 'انصراف', style: 'cancel' },
                          {
                            text: 'حذف',
                            style: 'destructive',
                            onPress: () =>
                              void withDatasetWrite(generation, () => deleteOccasion(occasion.id, generation)).catch(
                                (e) => alertError('حذف نشد', e),
                              ),
                          },
                        ])
                      }
                    />
                  </Row>
                  <Row gap="xs">
                    <Badge label={OCCASION_KIND_LABELS[occasion.kind]} />
                    {!occasion.isEnabled ? <Badge label="یادآور خاموش" /> : null}
                  </Row>
                  <OccasionReminderStatus occasion={occasion} generation={generation} disabled={stale} />
                  {sent?.sentAt ? (
                    <Text variant="tiny" color="textFaint">
                      آخرین ارسال تأییدشده: {formatJalaliDateTime(sent.sentAt)}
                    </Text>
                  ) : null}
                  {ready ? (
                    <MessageConfirmation message={ready} generation={generation} disabled={stale || !!messagesError} />
                  ) : null}
                </Column>
              </Card>
            );
          })}
          <Button
            label="افزودن مناسبت"
            icon="add"
            variant="secondary"
            full
            disabled={stale}
            onPress={() => router.push({ pathname: '/doctor/occasion', params: { doctorId: doctor.id } })}
          />
        </Column>
      </CollapsibleSection>
      {messagesError || (messages?.length ?? 0) > 0 ? (
        <CollapsibleSection
          title="سابقهٔ پیام‌ها"
          icon="chatbubbles-outline"
          filledCount={messagesError ? undefined : messages?.length}
          subtitle={messagesError ? 'خواندن کامل نشد' : undefined}
        >
          <ErrorNotice error={messagesError} what="سابقهٔ پیام‌ها" onRetry={retryMessages} />
          {(messages ?? []).slice(0, historyCount).map((message) => (
            <Card key={message.id} tone="alt">
              <Column gap="xs">
                <Row gap="sm" justify="space-between">
                  <Text variant="captionStrong">{CHANNEL_LABELS[message.channel]}</Text>
                  <Badge
                    label={STATUS_LABELS[message.status]}
                    tone={message.status === 'sent' ? 'success' : 'neutral'}
                  />
                </Row>
                <Text variant="caption" selectable>
                  {message.body}
                </Text>
                <Text variant="tiny" color="textFaint">
                  {formatJalaliDateTime(message.sentAt ?? message.createdAt)}
                </Text>
                {message.status === 'ready' ? (
                  <MessageConfirmation message={message} generation={generation} disabled={stale || !!messagesError} />
                ) : null}
              </Column>
            </Card>
          ))}
          {(messages?.length ?? 0) > historyCount ? (
            <Button label="پیام‌های قدیمی‌تر" variant="ghost" onPress={() => setHistoryCount((n) => n + 10)} />
          ) : null}
        </CollapsibleSection>
      ) : null}
      {target ? (
        <GreetingComposer
          key={`${target.occasion.id}:${target.body}`}
          target={target}
          generation={generation}
          stale={stale}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

function MessageConfirmation({
  message,
  generation,
  disabled,
}: {
  message: ScheduledMessage;
  generation: number;
  disabled: boolean;
}) {
  return (
    <Row gap="sm" wrap>
      <Text variant="tiny" color="textMuted">
        ارسال هنوز تأیید نشده
      </Text>
      <Button
        label="فرستادم"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onPress={() => void confirmGreetingSent(message.id, generation).catch((e) => alertError('ثبت نشد', e))}
      />
      <Button
        label="نفرستادم"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onPress={() => void markGreetingSkipped(message.id, generation).catch((e) => alertError('ثبت نشد', e))}
      />
    </Row>
  );
}
