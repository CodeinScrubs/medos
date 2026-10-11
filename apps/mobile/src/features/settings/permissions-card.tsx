import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useNavigation } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, Divider, Row, Text } from '@/components/ui';
import { useSetting } from '@/db/use-setting';
import { backupFolderUri } from '@/features/backup/settings';
import { useTheme } from '@/theme';

/*
 * What Android has actually granted, in one place.
 *
 * Android asks for each of these at the moment it is first needed, which is
 * the right time — a wall of requests on first launch teaches people to tap
 * "deny". The problem with asking late is that a refusal is silent afterwards:
 * a reminder that never buzzes looks like a bug in the app, not like a
 * permission the owner declined months ago on a ward round.
 *
 * So this screen states the position plainly and offers the one action that
 * fixes each row. Anything Android will not let the app ask for twice ends at
 * the system settings page, because that is genuinely where it is decided.
 */

type Status = 'granted' | 'denied' | 'ask' | 'unknown' | 'chosen';

type Line = {
  key: string;
  title: string;
  why: string;
  status: Status;
  fix?: () => Promise<void>;
};

type Known = { status: Status; canAsk: boolean };
type Grants = { notifications: Known; camera: Known; microphone: Known };

async function read(): Promise<Grants> {
  const [notifications, camera, microphone] = await Promise.all([
    Notifications.getPermissionsAsync(),
    ImagePicker.getCameraPermissionsAsync(),
    getRecordingPermissionsAsync(),
  ]);
  const of = (p: { granted: boolean; canAskAgain: boolean }) => ({
    status: (p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied') as Status,
    canAsk: p.canAskAgain,
  });
  return { notifications: of(notifications), camera: of(camera), microphone: of(microphone) };
}

export function PermissionsCard() {
  const { spacing } = useTheme();
  const navigation = useNavigation();
  const [state, setState] = useState<Grants | null>(null);
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const readVersion = useRef(0);
  const actionRunning = useRef(false);
  const folder = useSetting(backupFolderUri).value;

  const refresh = useCallback(() => {
    if (!mounted.current) return;
    // Native reads cannot be cancelled; only the newest mounted read may publish.
    const version = ++readVersion.current;
    setState(null);
    setError(undefined);
    void read()
      .then((grants) => {
        if (mounted.current && version === readVersion.current) setState(grants);
      })
      .catch((failure: unknown) => {
        if (mounted.current && version === readVersion.current)
          setError(failure instanceof Error ? failure : new Error('وضعیت دسترسی‌ها بررسی نشد.'));
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [refresh]);

  async function perform(action: () => Promise<void>): Promise<void> {
    if (!mounted.current || actionRunning.current || !navigation.isFocused()) return;
    // React state alone cannot reject two taps before the next render.
    actionRunning.current = true;
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      if (mounted.current && navigation.isFocused()) alertError('تنظیم دسترسی کامل نشد', failure);
    } finally {
      actionRunning.current = false;
      if (mounted.current) {
        setBusy(false);
        refresh();
      }
    }
  }

  const lines: Line[] = [
    {
      key: 'notifications',
      title: 'اعلان‌ها',
      why: 'نمایش یادآورها',
      status: state?.notifications.status ?? 'unknown',
      fix: async () => {
        if (state?.notifications.canAsk) await Notifications.requestPermissionsAsync();
        else await Linking.openSettings();
      },
    },
    {
      key: 'camera',
      title: 'دوربین',
      why: 'برای عکس گرفتن از برگه‌ی آزمایش، نوار قلب و ضایعه',
      status: state?.camera.status ?? 'unknown',
      fix: async () => {
        if (state?.camera.canAsk) await ImagePicker.requestCameraPermissionsAsync();
        else await Linking.openSettings();
      },
    },
    {
      key: 'microphone',
      title: 'میکروفون',
      why: 'ضبط وویس‌نوت',
      status: state?.microphone.status ?? 'unknown',
      fix: async () => {
        if (state?.microphone.canAsk) await requestRecordingPermissionsAsync();
        else await Linking.openSettings();
      },
    },
    {
      key: 'folder',
      title: 'پوشه‌ی بکاپ',
      why: 'پوشهٔ انتخابی بکاپ خودکار',
      status: folder ? 'chosen' : 'ask',
    },
  ];

  return (
    <Card>
      <Column gap="sm">
        <ErrorNotice error={error} what="وضعیت دسترسی‌ها" onRetry={refresh} />
        {lines.map((line, i) => (
          <Column key={line.key} gap="xs">
            {i > 0 ? <Divider /> : null}
            <Row justify="space-between" align="center">
              <Column gap="xxs" style={{ flex: 1 }}>
                <Text variant="bodyStrong">{line.title}</Text>
                <Text variant="tiny" color="textFaint">
                  {line.why}
                </Text>
              </Column>
              {line.status === 'granted' || line.status === 'chosen' ? (
                <Badge
                  label={line.status === 'chosen' ? 'انتخاب شده' : 'داده شده'}
                  tone={line.status === 'granted' ? 'success' : undefined}
                />
              ) : line.status === 'unknown' ? (
                <Badge label="…" />
              ) : line.fix ? (
                <Button
                  label={line.status === 'denied' ? 'در تنظیمات' : 'اجازه بده'}
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void perform(line.fix!)}
                />
              ) : (
                <Badge label="انتخاب نشده" tone="warning" />
              )}
            </Row>
          </Column>
        ))}

        <Divider />
        <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xxs }}>
          زمان‌بندی دقیق‌تر به دسترسی «Alarms & reminders» نیاز دارد؛ بدون آن اعلان ممکن است با تأخیر برسد.
        </Text>
        {/*
         * Straight to the list where the switch lives. It shows every app; one
         * more tap on MedOS. (With the package in the intent's data it would open
         * MedOS's own page, but Linking cannot set intent data.)
         */}
        <Button
          label="تنظیم یادآور دقیق"
          icon="alarm-outline"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void perform(() =>
              Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() => Linking.openSettings()),
            )
          }
        />
        <Button
          label="باز کردن تنظیمات اپ در اندروید"
          icon="open-outline"
          variant="ghost"
          disabled={busy}
          onPress={() => void perform(() => Linking.openSettings())}
        />
      </Column>
    </Card>
  );
}
