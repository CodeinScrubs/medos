import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { Badge, Button, Card, Column, Divider, Row, Text } from '@/components/ui';
import { useSetting } from '@/db/use-setting';
import { backupFolderUri } from '@/features/backup/settings';
import { RLM } from '@/lib/persian';
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

type Status = 'granted' | 'denied' | 'ask' | 'unknown';

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
  const { colors, spacing } = useTheme();
  const [state, setState] = useState<Grants | null>(null);
  const [reload, setReload] = useState(0);
  const folder = useSetting(backupFolderUri).value;

  useEffect(() => {
    void read().then(setState);
  }, [reload]);

  const again = () => setReload((n) => n + 1);

  const lines: Line[] = [
    {
      key: 'notifications',
      title: 'اعلان‌ها',
      why: 'بدون این، یادآور پیگیری‌ها هیچ‌وقت روی گوشی ظاهر نمی‌شود',
      status: state?.notifications.status ?? 'unknown',
      fix: async () => {
        if (state?.notifications.canAsk) await Notifications.requestPermissionsAsync();
        else await Linking.openSettings();
        again();
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
        again();
      },
    },
    {
      key: 'microphone',
      title: 'میکروفون',
      why: 'برای وویس‌نوت روی پرونده',
      status: state?.microphone.status ?? 'unknown',
      fix: async () => {
        if (state?.microphone.canAsk) await requestRecordingPermissionsAsync();
        else await Linking.openSettings();
        again();
      },
    },
    {
      key: 'folder',
      title: 'پوشه‌ی بکاپ',
      why: 'اجازه‌ی نوشتن در پوشه‌ای که خودتان انتخاب می‌کنید؛ بدون آن بکاپ خودکار جایی نوشته نمی‌شود',
      status: folder ? 'granted' : 'ask',
    },
  ];

  return (
    <Card>
      <Column gap="sm">
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
              {line.status === 'granted' ? (
                <Badge label="داده شده" tone="success" />
              ) : line.status === 'unknown' ? (
                <Badge label="…" />
              ) : line.fix ? (
                <Button
                  label={line.status === 'denied' ? 'در تنظیمات' : 'اجازه بده'}
                  size="sm"
                  variant="secondary"
                  onPress={() => void line.fix!()}
                />
              ) : (
                <Badge label="انتخاب نشده" tone="warning" />
              )}
            </Row>
          </Column>
        ))}

        <Divider />
        <Text variant="tiny" color="textFaint" style={{ marginTop: spacing.xxs }}>
          برای اینکه یادآورها سر ساعت برسند، در صفحه‌ی «Alarms & reminders» اندروید، MedOS را روشن کنید. بدون آن اندروید
          اجازه دارد یادآور را تا چند دقیقه عقب بیندازد.
        </Text>
        {/*
         * Straight to the list where the switch lives. It shows every app; one
         * more tap on MedOS. (With the package in the intent's data it would open
         * MedOS's own page, but Linking cannot set intent data.)
         */}
        <Button
          label="باز کردن «Alarms & reminders»"
          icon="alarm-outline"
          variant="ghost"
          onPress={() =>
            void Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() => Linking.openSettings())
          }
        />
        <Button
          label="باز کردن تنظیمات اپ در اندروید"
          icon="open-outline"
          variant="ghost"
          onPress={() => void Linking.openSettings()}
        />
        <Text variant="tiny" style={{ color: colors.textFaint }}>
          {RLM}MedOS به حافظه‌ی گوشی دسترسی کلی نمی‌خواهد؛ فقط همان پوشه‌ای که خودتان برای بکاپ انتخاب می‌کنید.
        </Text>
      </Column>
    </Card>
  );
}
