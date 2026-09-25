import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import {
  Badge,
  Button,
  Card,
  Column,
  Divider,
  Input,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  Toggle,
} from '@/components/ui';
import { useNow } from '@/components/use-now';
import { writeSetting } from '@/db/settings';
import { useLive } from '@/db/use-live';
import { useSetting } from '@/db/use-setting';
import { formatBytes } from '@/lib/format';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import {
  backupHistoryQuery,
  chooseBackupFolder,
  createBackup,
  markBackupDelivered,
  openBackupFolder,
  restoreBackup,
  type BackupConfig,
  type BackupProgress,
  type RestoreProgress,
} from './engine';
import { WrongPassphraseError } from './format';
import { checkBackupPassphrase, hasBackupKey, setBackupPassphrase } from './keys';
import { backupFreshness, deliveryStrength } from './logic';
import {
  backupAutoEnabled,
  backupAutoIncludeMedia,
  backupFolderUri,
  backupIntervalHours,
  backupLastSuccessAt,
  backupLastDelivery,
} from './settings';

/** `content://…/tree/primary%3ADocuments%2FMedOS` -> `Documents/MedOS`. */
function folderLabel(uri: string | null): string | null {
  if (!uri) return null;
  const decoded = decodeURIComponent(uri);
  const tree = decoded.split('/tree/')[1] ?? decoded;
  return tree.replace(/^primary:/, '').replace(/^[^:]+:/, '') || 'حافظه‌ی اصلی';
}

/** The document picker hands us a copy in the app cache; it is not needed once used. */
function discardPickedCopy(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The cache is cleared by the system eventually anyway.
  }
}

/** The backup settings, live: a finished backup or a flipped toggle shows at once. */
function useBackupConfig(): BackupConfig | null {
  const folderUri = useSetting(backupFolderUri);
  const autoEnabled = useSetting(backupAutoEnabled);
  const autoIncludeMedia = useSetting(backupAutoIncludeMedia);
  const intervalHours = useSetting(backupIntervalHours);
  const lastSuccessAt = useSetting(backupLastSuccessAt);
  const lastDelivery = useSetting(backupLastDelivery);
  const all = [folderUri, autoEnabled, autoIncludeMedia, intervalHours, lastSuccessAt, lastDelivery];
  if (!all.every((s) => s.loaded)) return null;
  return {
    folderUri: folderUri.value,
    autoEnabled: autoEnabled.value,
    autoIncludeMedia: autoIncludeMedia.value,
    intervalHours: intervalHours.value,
    lastSuccessAt: lastSuccessAt.value,
    lastDelivery: lastDelivery.value,
  };
}

/**
 * Whether a backup passphrase is set. The key lives in the Android Keystore,
 * not the database, so nothing announces a change: call `recheck` after
 * setting a passphrase or restoring.
 */
function useHasBackupKey(): { keyReady: boolean | null; recheck: () => void } {
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [checks, setChecks] = useState(0);
  useEffect(() => {
    let alive = true;
    void hasBackupKey().then((has) => {
      if (alive) setKeyReady(has);
    });
    return () => {
      alive = false;
    };
  }, [checks]);
  return { keyReady, recheck: () => setChecks((n) => n + 1) };
}

/** The phases of a restore, where the database is being replaced underneath. */
const RESTORE_PHASES = new Set(['key', 'files', 'database']);

const PHASE_LABEL: Record<string, string> = {
  snapshot: 'آماده‌سازی دیتابیس…',
  encrypt: 'رمزنگاری…',
  copy: 'ذخیره در پوشه…',
  key: 'بررسی رمز…',
  files: 'بازکردن فایل‌ها…',
  database: 'جایگزینی اطلاعات…',
  done: 'تمام شد',
};

export function BackupScreen() {
  const { colors, radii, spacing } = useTheme();
  const config = useBackupConfig();
  const { keyReady, recheck: recheckKey } = useHasBackupKey();
  const now = useNow();
  const [progress, setProgress] = useState<{ phase: string; fraction: number } | null>(null);
  const [restoreUri, setRestoreUri] = useState<string | null>(null);
  const [checkingPassphrase, setCheckingPassphrase] = useState(false);

  const { data: history } = useLive(backupHistoryQuery(8));

  if (!config || keyReady == null) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.huge }} />
      </Screen>
    );
  }

  const folderOk = openBackupFolder(config.folderUri) != null;
  const busy = progress != null && progress.phase !== 'done';

  async function runBackup(includeMedia: boolean, share: boolean) {
    setProgress({ phase: 'snapshot', fraction: 0 });
    try {
      const result = await createBackup({
        includeMedia,
        trigger: 'manual',
        onProgress: (p: BackupProgress) => setProgress(p),
      });
      if (share && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(result.file.uri, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'کجا ذخیره شود؟',
        });
        /*
         * The share sheet closing proves nothing: it returns the same way
         * whether the file was sent to Telegram or the sheet was dismissed.
         * Counting it as a backup is how "اطلاعات شما پشتیبان دارد" ends up
         * lying. One question, and only a yes moves the date.
         */
        Alert.alert('فرستاده شد؟', 'اگر فایل را واقعاً جایی ذخیره یا ارسال کردید، «بله» را بزنید.', [
          { text: 'نه', style: 'cancel' },
          { text: 'بله', onPress: () => void markBackupDelivered().catch((e) => alertError('تأیید ثبت نشد', e)) },
        ]);
      } else if (!result.savedTo) {
        notify(
          'بکاپ ساخته شد ولی جایی ذخیره نشد',
          'پوشه‌ی بکاپ انتخاب نشده است. یا یک پوشه انتخاب کنید، یا از «بکاپ و ارسال» استفاده کنید.',
        );
      }
    } catch (e) {
      alertError('بکاپ انجام نشد', e);
    } finally {
      setProgress(null);
    }
  }

  async function pickRestoreFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
    if (result.canceled || !result.assets?.[0]) return;
    // No check on the file name: sync apps and messengers rename files. The
    // header is what identifies a backup, and restore checks it first.
    const asset = result.assets[0];
    Alert.alert(
      'بازگردانی بکاپ',
      'همه‌ی اطلاعات فعلی این گوشی با محتوای بکاپ جایگزین می‌شود. قبل از شروع، یک نسخه‌ی ایمنی از اطلاعات فعلی داخل گوشی نگه داشته می‌شود.',
      [
        { text: 'انصراف', style: 'cancel', onPress: () => discardPickedCopy(asset.uri) },
        { text: 'ادامه', style: 'destructive', onPress: () => setRestoreUri(asset.uri) },
      ],
    );
  }

  async function runRestore(passphrase: string) {
    const uri = restoreUri;
    setRestoreUri(null);
    if (!uri) return;
    setProgress({ phase: 'key', fraction: 0 });
    try {
      const result = await restoreBackup({
        fileUri: uri,
        passphrase,
        onProgress: (p: RestoreProgress) => setProgress(p),
      });
      recheckKey();
      const summary =
        `بکاپ ${formatJalaliDateTime(result.manifest.createdAt)}\n` +
        `${toPersianDigits(result.manifest.counts.patients ?? 0)} بیمار، ` +
        `${toPersianDigits(result.files)} فایل.\n\n` +
        'یک نسخه از اطلاعات قبلی هم داخل گوشی نگه داشته شد.';
      notify(
        result.warnings.length === 0 ? 'بازگردانی کامل شد' : 'اطلاعات برگشت، با چند کار ناتمام',
        result.warnings.length === 0
          ? summary
          : `${summary}\n\nاین‌ها کامل نشد: ${result.warnings.join('، ')}. یک بار اپ را ببندید و باز کنید؛ اگر ماند، از «گزارش خطاها» بفرستید.`,
      );
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        notify('رمز اشتباه است', 'اطلاعات فعلی گوشی دست نخورده است.');
      } else {
        alertError('بازگردانی انجام نشد', e);
      }
    } finally {
      discardPickedCopy(uri);
      setProgress(null);
    }
  }

  async function testPassphrase(passphrase: string) {
    setCheckingPassphrase(false);
    setProgress({ phase: 'key', fraction: 0 });
    try {
      const ok = await checkBackupPassphrase(passphrase);
      notify(
        ok ? 'رمز درست است' : 'رمز درست نیست',
        ok
          ? 'با همین رمز می‌توانید بکاپ‌ها را روی هر گوشی باز کنید.'
          : 'این رمز با رمز بکاپ‌ها یکی نیست. اگر رمز واقعی را به یاد نمی‌آورید، تا گوشی سالم است یک رمز تازه بگذارید و بلافاصله یک بکاپ کامل بگیرید.',
      );
    } catch (e) {
      alertError('بررسی رمز انجام نشد', e);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Screen scroll>
      <Column gap="none" style={{ paddingTop: spacing.md }}>
        <StatusCard config={config} keyReady={keyReady} folderOk={folderOk} now={now} />

        {progress && (
          <Card style={{ marginTop: spacing.md }}>
            <Column gap="sm">
              <Text variant="bodyStrong">{PHASE_LABEL[progress.phase] ?? progress.phase}</Text>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.border,
                  overflow: 'hidden',
                  direction: 'ltr',
                }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${Math.round(progress.fraction * 100)}%`,
                    backgroundColor: colors.primary,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Text variant="tiny" color="textFaint">
                {RESTORE_PHASES.has(progress.phase)
                  ? 'اپ را نبندید و تا تمام شدن صبر کنید؛ اطلاعات در حال جایگزینی است.'
                  : 'اپ را نبندید. بقیه‌ی صفحه‌ها قابل استفاده‌اند.'}
              </Text>
            </Column>
          </Card>
        )}

        {!keyReady ? (
          <PassphraseSetup onDone={recheckKey} />
        ) : (
          <>
            <SectionHeader title="پوشه‌ی بکاپ" />
            <Card>
              <Column gap="sm">
                <Text variant="body">{folderLabel(config.folderUri) ?? 'انتخاب نشده'}</Text>
                {config.folderUri && !folderOk ? (
                  <Text variant="caption" color="danger">
                    این پوشه در دسترس نیست (مثلاً بعد از بازگردانی روی گوشی جدید). دوباره انتخابش کنید.
                  </Text>
                ) : null}
                <Text variant="tiny" color="textFaint">
                  بهترین انتخاب پوشه‌ای است که یک برنامه‌ی همگام‌سازی (Google Drive، OneDrive، Syncthing) آن را با
                  لپ‌تاپ یا فضای ابری همگام می‌کند؛ آن‌وقت هر بکاپ خودکار بیرون از گوشی هم یک نسخه دارد.
                </Text>
                <Button
                  label={config.folderUri ? 'تغییر پوشه' : 'انتخاب پوشه'}
                  icon="folder-open-outline"
                  variant="secondary"
                  onPress={() => void chooseBackupFolder()}
                />
              </Column>
            </Card>

            <SectionHeader title="بکاپ خودکار" />
            <Card>
              <Column gap="xs">
                <Toggle
                  label="فعال"
                  description="هر بار که اپ باز می‌شود، اگر موعد رسیده باشد"
                  value={config.autoEnabled}
                  onChange={(v) => void writeSetting(backupAutoEnabled, v).catch((e) => alertError('تنظیم ثبت نشد', e))}
                />
                <Divider />
                <Toggle
                  label="همراه با عکس‌ها و صداها"
                  description="وقتی تعداد عکس‌ها زیاد شد، خاموشش کنید و هفته‌ای یک بار بکاپ کامل دستی بگیرید"
                  value={config.autoIncludeMedia}
                  onChange={(v) =>
                    void writeSetting(backupAutoIncludeMedia, v).catch((e) => alertError('تنظیم ثبت نشد', e))
                  }
                />
                <Divider />
                <Segmented
                  label="هر چند وقت"
                  value={String(config.intervalHours)}
                  onChange={(v) =>
                    void writeSetting(backupIntervalHours, Number(v)).catch((e) => alertError('تنظیم ثبت نشد', e))
                  }
                  options={[
                    { value: '12', label: '۱۲ ساعت' },
                    { value: '24', label: 'روزانه' },
                    { value: '168', label: 'هفتگی' },
                  ]}
                />
              </Column>
            </Card>

            <SectionHeader title="بکاپ دستی" />
            <Column gap="sm">
              <Button
                label="بکاپ کامل الان"
                icon="cloud-upload-outline"
                full
                disabled={busy}
                onPress={() => void runBackup(true, false)}
              />
              <Button
                label="بکاپ کامل و ارسال (تلگرام، درایو، ایمیل…)"
                icon="share-outline"
                variant="secondary"
                full
                disabled={busy}
                onPress={() => void runBackup(true, true)}
              />
              <Button
                label="فقط دیتابیس (سریع، بدون عکس)"
                icon="document-outline"
                variant="ghost"
                full
                disabled={busy}
                onPress={() => void runBackup(false, false)}
              />
            </Column>

            <SectionHeader title="رمز بکاپ" />
            <Card>
              <Column gap="sm">
                <Text variant="caption" color="textMuted">
                  هر چند وقت یک بار رمز را از حافظه امتحان کنید. رمزی که فراموش شده، همه‌ی بکاپ‌ها را بی‌استفاده می‌کند.
                </Text>
                <Button
                  label="آزمایش رمز بکاپ"
                  icon="key-outline"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setCheckingPassphrase(true)}
                />
              </Column>
            </Card>
          </>
        )}

        <SectionHeader title="بازگردانی" />
        <Card>
          <Column gap="sm">
            <Text variant="caption" color="textMuted">
              برای انتقال به گوشی جدید یا برگرداندن اطلاعات: فایل بکاپ (با پسوند medosbak) را انتخاب کنید و رمز بکاپ را
              وارد کنید.
            </Text>
            <Button
              label="انتخاب فایل بکاپ"
              icon="download-outline"
              variant="ghost"
              disabled={busy}
              onPress={() => void pickRestoreFile()}
            />
          </Column>
        </Card>

        {history && history.length > 0 && (
          <>
            <SectionHeader title="تاریخچه" count={history.length} />
            <Card padded={false}>
              {history.map((run, i) => (
                <View key={run.id}>
                  {i > 0 && <Divider />}
                  <Row justify="space-between" gap="sm" style={{ padding: spacing.md }}>
                    <Column gap="xxs" style={{ flex: 1 }}>
                      <Text variant="caption">{formatJalaliDateTime(run.startedAt)}</Text>
                      <Text variant="tiny" color="textFaint">
                        {run.trigger === 'auto' ? 'خودکار' : 'دستی'} • {run.includesMedia ? 'کامل' : 'فقط دیتابیس'}
                        {run.sizeBytes ? ` • ${formatBytes(run.sizeBytes)}` : ''}
                      </Text>
                      {run.errorText ? (
                        <Text variant="tiny" color="danger">
                          {run.errorText}
                        </Text>
                      ) : null}
                    </Column>
                    <Badge
                      label={
                        run.status === 'success'
                          ? run.destination === 'cache'
                            ? 'ساخته شد'
                            : 'کپی شد'
                          : run.status === 'running'
                            ? 'در حال انجام'
                            : 'ناموفق'
                      }
                      tone={run.status === 'success' ? 'success' : run.status === 'running' ? 'info' : 'danger'}
                    />
                  </Row>
                </View>
              ))}
            </Card>
          </>
        )}

        <View style={{ height: spacing.xl, borderRadius: radii.md }} />
      </Column>

      <PromptModal
        visible={restoreUri != null}
        title="رمز بکاپ"
        message="رمزی که هنگام تنظیم بکاپ انتخاب کرده بودید."
        submitLabel="بازگردانی"
        optional={false}
        secret
        onCancel={() => {
          if (restoreUri) discardPickedCopy(restoreUri);
          setRestoreUri(null);
        }}
        onSubmit={(text) => void runRestore(text)}
      />

      <PromptModal
        visible={checkingPassphrase}
        title="آزمایش رمز بکاپ"
        message="رمز بکاپ را از حافظه وارد کنید. چیزی تغییر نمی‌کند؛ فقط معلوم می‌شود رمز را درست به خاطر دارید."
        submitLabel="بررسی"
        optional={false}
        secret
        onCancel={() => setCheckingPassphrase(false)}
        onSubmit={(text) => void testPassphrase(text)}
      />
    </Screen>
  );
}

function StatusCard({
  config,
  keyReady,
  folderOk,
  now,
}: {
  config: BackupConfig;
  keyReady: boolean;
  folderOk: boolean;
  now: number;
}) {
  const { colors } = useTheme();
  const last = config.lastSuccessAt;
  const stale = backupFreshness(last, now) !== 'fresh';
  const strength = deliveryStrength(last, config.lastDelivery);

  let title: string;
  let detail: string;
  let tone: 'danger' | 'warning' | 'success';

  if (!keyReady) {
    title = 'بکاپ هنوز فعال نشده';
    detail = 'همه‌ی اطلاعات فقط روی همین گوشی است. اگر گوشی گم یا خراب شود، چیزی قابل برگشت نیست.';
    tone = 'danger';
  } else if (!last) {
    title = 'هنوز بکاپی گرفته نشده';
    detail = folderOk ? 'اولین بکاپ کامل را همین حالا بگیرید.' : 'یک پوشه انتخاب کنید و اولین بکاپ را بگیرید.';
    tone = 'danger';
  } else {
    title = `آخرین بکاپ: ${formatRelativeTime(last, new Date(now))}`;
    detail = stale
      ? 'زمان بکاپ تازه رسیده است.'
      : strength === 'bytes'
        ? 'محتوای فایل مقصد بررسی شد.'
        : strength === 'size'
          ? 'فقط اندازهٔ کپی تأیید شد؛ بکاپ‌های قبلی نگه داشته شدند.'
          : strength === 'confirmed'
            ? 'ذخیره یا ارسال فایل را تأیید کرده‌اید.'
            : 'بررسی محتوای این نسخه ثبت نشده است.';
    tone = stale || strength === 'size' || strength == null ? 'warning' : 'success';
  }

  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'warning' ? colors.warningSoft : colors.successSoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.success;

  return (
    <Card style={{ backgroundColor: bg, borderColor: fg }}>
      <Column gap="xs">
        <Text variant="heading" style={{ color: fg }}>
          {title}
        </Text>
        <Text variant="caption" style={{ color: fg }}>
          {detail}
        </Text>
      </Column>
    </Card>
  );
}

/**
 * First-time passphrase setup. The warning is blunt on purpose: a forgotten
 * passphrase makes every backup unrecoverable, and there is no reset.
 */
function PassphraseSetup({ onDone }: { onDone: () => void }) {
  const { spacing } = useTheme();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [working, setWorking] = useState(false);

  const tooShort = first.length > 0 && first.length < 8;
  const mismatch = second.length > 0 && first !== second;
  const canSave = first.length >= 8 && first === second && !working;

  return (
    <>
      <SectionHeader title="رمز بکاپ" />
      <Card>
        <Column gap="md">
          <Text variant="body">
            فایل‌های بکاپ با این رمز قفل می‌شوند تا اگر به دست کسی افتاد، اطلاعات بیماران خوانا نباشد.
          </Text>
          <Text variant="bodyStrong" color="danger">
            اگر این رمز را فراموش کنید، هیچ راهی برای باز کردن بکاپ‌ها وجود ندارد — حتی برای سازنده‌ی اپ. آن را جایی غیر
            از همین گوشی بنویسید.
          </Text>
          <Input
            label="رمز"
            value={first}
            onChangeText={setFirst}
            secureTextEntry
            autoCapitalize="none"
            error={tooShort ? 'حداقل ۸ کاراکتر؛ چند کلمه‌ی بی‌ربط کنار هم بهترین است' : undefined}
            ltr
          />
          <Input
            label="تکرار رمز"
            value={second}
            onChangeText={setSecond}
            secureTextEntry
            autoCapitalize="none"
            error={mismatch ? 'با رمز اول یکی نیست' : undefined}
            ltr
          />
          <Button
            label="تنظیم رمز"
            icon="lock-closed-outline"
            loading={working}
            disabled={!canSave}
            style={{ marginTop: spacing.xs }}
            onPress={async () => {
              setWorking(true);
              try {
                await setBackupPassphrase(first);
                setFirst('');
                setSecond('');
                onDone();
              } catch (e) {
                alertError('تنظیم نشد', e);
              } finally {
                setWorking(false);
              }
            }}
          />
        </Column>
      </Card>
    </>
  );
}
