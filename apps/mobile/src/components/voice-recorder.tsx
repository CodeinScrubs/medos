import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Row, Text } from '@/components/ui';
import { toPersianDigits } from '@/lib/persian';
import { prepareAudioForPlayback } from '@/platform/audio';
import { MIN_TOUCH, useTheme } from '@/theme';

import { useAutosaveScope } from './autosave-scope';

export type Recording = { uri: string; durationMs: number; capturedAt?: Date };

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return toPersianDigits(`${m}:${String(s).padStart(2, '0')}`);
}

/**
 * A record button that turns into a live timer with stop / discard.
 *
 * The caller acknowledges permanent storage through its returned promise.
 * Until then the same stopped recording is retained for retry, and the screen's
 * single save group blocks removal. This is not a process-death recovery journal.
 */
export function VoiceRecorder({
  onRecorded,
  onSaved,
  label = 'وویس',
  compact = false,
}: {
  onRecorded: (recording: Recording) => Promise<void>;
  /** Optional post-ack action; never called by the screen's own exit flush. */
  onSaved?: () => void;
  label?: string;
  compact?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const active = useRef(false);
  const startedAt = useRef<Date | undefined>(undefined);
  const pending = useRef<Recording | null>(null);
  const stopped = useRef<{ durationMs: number; capturedAt?: Date } | null>(null);
  const work = useRef<Promise<boolean> | null>(null);
  const flushing = useRef(0);
  const scope = useAutosaveScope();

  // Leaving the screen while recording (the back gesture, a notification tap)
  // unmounts this. expo-audio releases the recorder itself, but the audio mode
  // stays switched to recording until something switches it back — harmless to
  // repeat when nothing was being recorded.
  useEffect(
    () => () => {
      void prepareAudioForPlayback().catch(() => undefined);
    },
    [],
  );

  async function start() {
    if (work.current || stopped.current || pending.current || active.current) return;
    setBusy(true);
    const operation = (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          notify('دسترسی میکروفون لازم است', 'از تنظیمات گوشی، دسترسی میکروفون را برای MedOS فعال کنید.');
          return true;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        active.current = true;
        startedAt.current = new Date();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        return true;
      } catch (e) {
        alertError('ضبط شروع نشد', e);
        void prepareAudioForPlayback().catch(() => undefined);
        return false;
      }
    })();
    work.current = operation;
    try {
      await operation;
    } finally {
      if (work.current === operation) work.current = null;
      setBusy(false);
    }
  }

  async function finish(keep: boolean, manual = false): Promise<boolean> {
    if (work.current) return work.current;
    if (!active.current && !stopped.current && !pending.current) return true;
    setBusy(true);
    let acknowledged = false;
    const operation = (async () => {
      try {
        if (active.current) {
          // Read before stop resets the native clock; polling can lag behind.
          const durationMs = Math.max(state.durationMillis, Math.round(recorder.currentTime * 1000));
          await recorder.stop();
          active.current = false;
          if (keep && durationMs >= 500) {
            stopped.current = { durationMs, capturedAt: startedAt.current };
          }
          // Playback setup is housekeeping: it must not prevent file acknowledgement.
          void prepareAudioForPlayback().catch(() => undefined);
        }
        if (stopped.current) {
          if (!recorder.uri) throw new Error('فایل ضبط‌شده در دسترس نیست.');
          pending.current = { uri: recorder.uri, ...stopped.current };
          stopped.current = null;
        }
        if (pending.current) {
          await onRecorded(pending.current);
          pending.current = null;
          acknowledged = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }
        setNeedsRetry(false);
        return true;
      } catch (e) {
        setNeedsRetry(true);
        alertError(pending.current ? 'وویس ذخیره نشد؛ دوباره تلاش کنید' : 'ضبط تمام نشد', e);
        return false;
      }
    })();
    work.current = operation;
    let saved: boolean;
    try {
      saved = await operation;
    } finally {
      if (work.current === operation) work.current = null;
      setBusy(false);
    }
    if (saved && acknowledged && manual && flushing.current === 0) {
      try {
        onSaved?.();
      } catch (e) {
        alertError('وویس ذخیره شد؛ بازگشت انجام نشد', e);
      }
    }
    return saved;
  }

  async function flush(): Promise<boolean> {
    flushing.current += 1;
    try {
      if (work.current && !(await work.current)) return false;
      if (active.current || stopped.current || pending.current) return await finish(true);
      return true;
    } finally {
      flushing.current -= 1;
    }
  }

  const latest = useRef({ flush });
  useLayoutEffect(() => {
    latest.current = { flush };
  });
  useEffect(() => {
    return scope?.group.register({
      get unsaved() {
        return active.current || stopped.current != null || pending.current != null || work.current != null;
      },
      flush: () => latest.current.flush(),
    });
  }, [scope]);

  if (state.isRecording) {
    return (
      <Row
        gap="sm"
        style={{
          backgroundColor: colors.dangerSoft,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          minHeight: MIN_TOUCH,
        }}
      >
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <Text variant="bodyStrong" style={{ color: colors.danger, flex: 1 }}>
          در حال ضبط {formatDuration(state.durationMillis)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="دور انداختن"
          disabled={busy}
          onPress={() => void finish(false)}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="پایان ضبط"
          disabled={busy}
          onPress={() => void finish(true, true)}
          style={[styles.stop, { backgroundColor: colors.danger, borderRadius: radii.full }]}
        >
          <Ionicons name="stop" size={18} color={colors.textInverse} />
        </Pressable>
      </Row>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={needsRetry ? 'تلاش دوباره برای ذخیرهٔ وویس' : 'ضبط وویس'}
      disabled={busy}
      onPress={() => void (needsRetry ? finish(true, true) : start())}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          minHeight: compact ? 38 : MIN_TOUCH,
          paddingHorizontal: spacing.md,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: pressed || busy ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons name={needsRetry ? 'refresh' : 'mic-outline'} size={compact ? 16 : 19} color={colors.primary} />
      <Text variant={compact ? 'captionStrong' : 'bodyStrong'} color="primary">
        {needsRetry ? 'وویس ذخیره نشد — تلاش دوباره' : busy ? 'لطفاً صبر کنید…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  stop: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
