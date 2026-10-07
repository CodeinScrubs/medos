import { useEffect, useRef, useState } from 'react';
import { Alert, Modal } from 'react-native';

import { alertError } from '@/components/feedback';
import { Button, Column, Screen, Text } from '@/components/ui';
import type { Doctor, Occasion, ScheduledMessage } from '@/db/schema';
import { withDatasetWrite } from '@/lib/dataset-write';
import { useTheme } from '@/theme';

import { copyText, sendSms, sendTelegram, sendWhatsApp } from './actions';
import { assertGreetingContext, logGreetingPrepared } from './messages-queries';
import { occasionQuery } from './occasions-queries';
import { doctorQuery } from './queries';

export type GreetingTarget = { doctor: Doctor; occasion: Occasion; body: string };

/** Android alerts have only three buttons; a real sheet keeps every channel accessible. */
export function GreetingComposer({
  target,
  generation,
  stale,
  onClose,
}: {
  target: GreetingTarget;
  generation: number;
  stale: boolean;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const busy = useRef(false);
  const handedOver = useRef<ScheduledMessage['channel'] | null>(null);
  const recorded = useRef(false);
  const closeIntent = useRef<symbol | null>(null);
  useEffect(
    () => () => {
      closeIntent.current = null;
    },
    [],
  );
  const [working, setWorking] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const smsPhone = target.doctor.phone || target.doctor.phoneAlt;
  const whatsappPhone = target.doctor.whatsapp || smsPhone;

  async function hand(channel: ScheduledMessage['channel'], open: () => Promise<boolean>) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      if (recorded.current) {
        onClose();
        return;
      }
      await withDatasetWrite(generation, async () => {
        const input = { doctorId: target.doctor.id, occasionId: target.occasion.id, channel, body: target.body };
        assertGreetingContext(input);
        const doctor = doctorQuery(target.doctor.id).get();
        const occasion = occasionQuery(target.occasion.id).get();
        if (
          !doctor ||
          !occasion ||
          doctor.title !== target.doctor.title ||
          doctor.firstName !== target.doctor.firstName ||
          doctor.lastName !== target.doctor.lastName ||
          doctor.phone !== target.doctor.phone ||
          doctor.phoneAlt !== target.doctor.phoneAlt ||
          doctor.whatsapp !== target.doctor.whatsapp ||
          doctor.telegram !== target.doctor.telegram ||
          occasion.title !== target.occasion.title ||
          occasion.kind !== target.occasion.kind ||
          occasion.messageTemplate !== target.occasion.messageTemplate
        )
          throw new Error('اطلاعات مخاطب یا مناسبت تغییر کرده است؛ متن را دوباره باز کنید.');
        if (!handedOver.current) {
          if (!(await open())) return;
          handedOver.current = channel;
        }
        await logGreetingPrepared(input, generation);
        recorded.current = true;
        handedOver.current = null;
        onClose();
      });
    } catch (error) {
      setRecordingFailed(handedOver.current !== null);
      alertError(handedOver.current ? 'پیام‌رسان باز شد؛ ثبت سابقه کامل نشد' : 'آماده‌سازی انجام نشد', error);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  function close() {
    if (busy.current || closeIntent.current) return;
    if (!handedOver.current) {
      onClose();
      return;
    }
    const intent = Symbol();
    closeIntent.current = intent;
    const consume = (accepted: boolean) => {
      if (closeIntent.current !== intent) return;
      closeIntent.current = null;
      if (accepted) onClose();
    };
    Alert.alert(
      'بستن بدون ثبت سابقه؟',
      'متن را می‌توانید کپی کنید؛ باز شدن پیام‌رسان در سابقه ثبت نشده است.',
      [
        { text: 'ماندن', style: 'cancel', onPress: () => consume(false) },
        { text: 'بستن', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  const disabled = stale || working || recordingFailed;
  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Screen scroll>
        <Column gap="md" style={{ paddingTop: spacing.lg }}>
          <Text variant="heading">{target.occasion.title}</Text>
          <Text variant="body" selectable>
            {target.body}
          </Text>
          <Text variant="caption" color="textMuted">
            پس از ارسال در پیام‌رسان، «فرستادم» را ثبت کنید.
          </Text>
          {stale ? (
            <Text variant="caption" color="danger">
              اطلاعات بازگردانی شده؛ این متن اجازهٔ ارسال ندارد.
            </Text>
          ) : null}
          {smsPhone ? (
            <Button
              label="بازکردن پیامک"
              icon="chatbubble-outline"
              disabled={disabled}
              onPress={() => void hand('sms', () => sendSms(smsPhone, target.body))}
            />
          ) : null}
          {whatsappPhone ? (
            <Button
              label="بازکردن واتس‌اپ"
              icon="logo-whatsapp"
              disabled={disabled}
              onPress={() => void hand('whatsapp', () => sendWhatsApp(whatsappPhone, target.body))}
            />
          ) : null}
          {target.doctor.telegram ? (
            <Button
              label="بازکردن تلگرام"
              icon="paper-plane-outline"
              disabled={disabled}
              onPress={() => void hand('telegram', () => sendTelegram(target.doctor.telegram, target.body))}
            />
          ) : null}
          <Button
            label="کپی متن"
            icon="copy-outline"
            variant="secondary"
            disabled={working}
            onPress={() => void copyText(target.body).catch((e) => alertError('کپی نشد', e))}
          />
          {recordingFailed ? (
            <Button
              label="ثبت سابقه؛ تلاش دوباره"
              disabled={stale || working}
              onPress={() => void hand(handedOver.current!, async () => true)}
            />
          ) : null}
          <Button label="بستن" variant="ghost" disabled={working} onPress={close} />
        </Column>
      </Screen>
    </Modal>
  );
}
