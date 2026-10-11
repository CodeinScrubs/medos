import Ionicons from '@expo/vector-icons/Ionicons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { Button, Column, Text } from '@/components/ui';
import { audit } from '@/db/audit';
import { writeSetting } from '@/db/settings';
import { useSetting } from '@/db/use-setting';
import { RLM } from '@/lib/persian';
import { logError } from '@/platform/error-log';
import { useTheme } from '@/theme';

import { lockEnabled, lockGraceSeconds } from './settings';

/**
 * Covers the app with a lock screen until the phone's own biometric or
 * screen-lock check passes.
 *
 * The grace period matters in practice: opening the camera, the photo picker
 * or the share sheet sends the app to the background, and relocking on every
 * return from the camera would make photographing a lab sheet unbearable.
 * The app content stays mounted underneath, so nothing in progress is lost.
 *
 * Authentication is entirely the OS's — fingerprint, face, or the device
 * PIN/pattern as fallback. MedOS stores no PIN of its own.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authenticating = useRef(false);
  const mounted = useRef(false);

  // Reactive, so switching the lock on or off in settings applies at once.
  const enabled = useSetting(lockEnabled);
  const grace = useSetting(lockGraceSeconds);
  const graceMs = grace.value * 1000;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const unlock = useCallback(async () => {
    // One prompt at a time: the lock screen opens it automatically, and the
    // button can be tapped while it is still coming up.
    if (!mounted.current || authenticating.current) return;
    authenticating.current = true;
    try {
      // With no screen lock on the phone there is nothing to authenticate
      // against, and the lock would shut its owner out for good — which
      // happens after restoring a backup onto a phone without a PIN. The lock
      // cannot protect anything on such a phone, so it steps aside and says so.
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (!mounted.current) return;
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setLocked(false);
        notify(
          'قفل MedOS کار نمی‌کند',
          'روی این گوشی قفل صفحه (پین، الگو یا اثر انگشت) تنظیم نشده است. تا وقتی آن را در تنظیمات گوشی فعال نکنید، MedOS هم قفل نمی‌شود.',
        );
        return;
      }
      setBusy(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'باز کردن MedOS',
        cancelLabel: 'انصراف',
        disableDeviceFallback: false,
      });
      if (mounted.current && result.success) setLocked(false);
    } catch (error) {
      if (mounted.current) alertError('باز کردن قفل کامل نشد', error);
      else logError(error, { source: 'handled', context: 'باز کردن قفل کامل نشد' });
    } finally {
      authenticating.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  // Cold start: lock as soon as the setting is known — decided once, while
  // rendering. Turning the lock on later from settings does not lock at once:
  // the user has just authenticated to do it.
  const [decided, setDecided] = useState(false);
  if (!decided && enabled.loaded && !enabled.error) {
    setDecided(true);
    if (enabled.value) setLocked(true);
  }

  // Prompt as soon as the lock screen appears, rather than waiting for a tap.
  useEffect(() => {
    // A native binding may throw synchronously; don't update state in this effect.
    if (locked && !enabled.error) void Promise.resolve().then(unlock);
  }, [locked, enabled.error, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!enabled.value) return;
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current != null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > graceMs) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled.value, graceMs]);

  // Until the setting has loaded, cover everything: a locked app must never
  // flash patient data for the few milliseconds before it knows it is locked.
  const covered = !enabled.loaded || !!enabled.error || (enabled.value && locked);

  // The hardware back button does not go through the cover — it would pop the
  // screen underneath, so the app would come back unlocked onto a different
  // screen than the one that was left. While covered, back does nothing.
  useEffect(() => {
    if (!covered) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [covered]);

  return (
    <View style={styles.flex}>
      {/* Hidden from screen readers while covered: the lock must not read out a chart.
          Touches are blocked here as well as by the cover: a modal, a bottom sheet or
          anything else rendered into a portal sits above the cover, not below it. */}
      <View
        style={[styles.flex, covered ? styles.inert : null]}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {covered ? (
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}
        >
          {enabled.error ? (
            <Column gap="md" style={{ padding: spacing.xxl }}>
              <ErrorNotice error={enabled.error} what="تنظیم قفل اپ" onRetry={enabled.retry} />
            </Column>
          ) : enabled.loaded ? (
            <Column gap="md" style={{ alignItems: 'center', padding: spacing.xxl }}>
              <Ionicons name="lock-closed" size={48} color={colors.primary} />
              <Text variant="title">{RLM}MedOS قفل است</Text>
              <Text variant="caption" color="textMuted" align="center">
                با اثر انگشت یا قفل صفحه‌ی گوشی باز کنید.
              </Text>
              <Button label="باز کردن" icon="finger-print" onPress={() => void unlock()} loading={busy} />
            </Column>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** For the settings toggle: turning the lock on first proves the user can unlock. */
export async function enableAppLock(): Promise<{ ok: boolean; reason?: string }> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return { ok: false, reason: 'روی گوشی قفل صفحه تنظیم نشده. اول در تنظیمات گوشی یک پین یا الگو بگذارید.' };
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'تأیید برای فعال کردن قفل',
    cancelLabel: 'انصراف',
    disableDeviceFallback: false,
  });
  if (!result.success) return { ok: false };
  await writeSetting(lockEnabled, true);
  await audit('lock.enabled');
  return { ok: true };
}

export async function disableAppLock(): Promise<boolean> {
  // A restored or changed phone may have no screen lock. The cover already
  // steps aside then; the owner must still be able to turn this setting off.
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level !== LocalAuthentication.SecurityLevel.NONE) {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'تأیید برای خاموش کردن قفل',
      cancelLabel: 'انصراف',
      disableDeviceFallback: false,
    });
    if (!result.success) return false;
  }
  await writeSetting(lockEnabled, false);
  await audit('lock.disabled');
  return true;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inert: { pointerEvents: 'none' },
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
});
