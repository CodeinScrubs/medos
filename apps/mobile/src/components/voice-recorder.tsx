import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingStatus,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Row, Text } from '@/components/ui';
import { reserveFileJob } from '@/lib/file-work';
import { toPersianDigits } from '@/lib/persian';
import { RecordingCompletion } from '@/lib/recording-completion';
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
  const [busy, setBusy] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [terminalError, setTerminalError] = useState<Error | null>(null);
  const [completion] = useState(() => new RecordingCompletion());
  const active = useRef(false);
  const startedAt = useRef<Date | undefined>(undefined);
  const pending = useRef<Recording | null>(null);
  const stopped = useRef<{ durationMs: number; capturedAt?: Date } | null>(null);
  const work = useRef<Promise<boolean> | null>(null);
  const flushing = useRef(0);
  const mounted = useRef(false);
  const releaseFiles = useRef<(() => void) | null>(null);
  const scope = useAutosaveScope();
  // expo-audio retains the listener from the initial render: use stable refs,
  // not a captured React state snapshot. Native stop errors can resolve stop().
  function receiveStatus(status: RecordingStatus) {
    if (!active.current && !stopped.current) return;
    completion.receive(status);
    if (completion.error && mounted.current) setTerminalError(completion.error);
  }
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, receiveStatus);
  const state = useAudioRecorderState(recorder, 250);

  function releaseFileOwnership() {
    releaseFiles.current?.();
    releaseFiles.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // expo-audio's earlier lifecycle hook releases the native object. A
      // permission/preparation or metadata promise may still be running: do
      // not permit maintenance until it settles, or start after unmount.
      const releaseWhenGone = () => {
        if (!mounted.current) releaseFileOwnership();
      };
      if (work.current) void work.current.then(releaseWhenGone, releaseWhenGone);
      else releaseWhenGone();
      void prepareAudioForPlayback().catch(() => undefined);
    };
  }, []);

  async function start() {
    if (!mounted.current || work.current || stopped.current || pending.current || active.current) return;
    setBusy(true);
    const operation = (async () => {
      try {
        releaseFiles.current = reserveFileJob();
        const permission = await requestRecordingPermissionsAsync();
        if (!mounted.current) return true;
        if (!permission.granted) {
          notify('دسترسی میکروفون لازم است', 'از تنظیمات گوشی، دسترسی میکروفون را برای MedOS فعال کنید.');
          return true;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!mounted.current) return true;
        await recorder.prepareToRecordAsync();
        if (!mounted.current) return true;
        completion.begin(recorder.uri);
        recorder.record();
        active.current = true;
        startedAt.current = new Date();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        return true;
      } catch (e) {
        if (mounted.current) alertError('ضبط شروع نشد', e);
        void prepareAudioForPlayback().catch(() => undefined);
        return false;
      }
    })();
    work.current = operation;
    try {
      await operation;
    } finally {
      if (work.current === operation) work.current = null;
      if (!active.current || !mounted.current) releaseFileOwnership();
      if (mounted.current) setBusy(false);
    }
  }

  async function finish(keep: boolean, manual = false): Promise<boolean> {
    if (work.current) return work.current;
    if (!mounted.current) return false;
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
          if (keep && (durationMs >= 500 || completion.error)) {
            stopped.current = { durationMs, capturedAt: startedAt.current };
          }
          // Playback setup is housekeeping: it must not prevent file acknowledgement.
          void prepareAudioForPlayback().catch(() => undefined);
        }
        if (!keep) {
          // Only explicit discard may leave an unconfirmed/failed native capture.
          stopped.current = null;
          pending.current = null;
          completion.begin(null);
          if (mounted.current) setTerminalError(null);
        }
        if (stopped.current) {
          // Wait for the SDK's successful terminal event, never its cached URI.
          const uri = await completion.waitForUri(5000);
          pending.current = { uri, ...stopped.current };
          stopped.current = null;
        }
        if (pending.current) {
          await onRecorded(pending.current);
          pending.current = null;
          acknowledged = true;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }
        if (mounted.current) setNeedsRetry(false);
        return true;
      } catch (e) {
        if (mounted.current) {
          setNeedsRetry(true);
          alertError(pending.current ? 'وویس ذخیره نشد؛ دوباره تلاش کنید' : 'ضبط تمام نشد', e);
        }
        return false;
      }
    })();
    work.current = operation;
    let saved: boolean;
    try {
      saved = await operation;
    } finally {
      if (work.current === operation) work.current = null;
      if ((!active.current && !stopped.current && !pending.current) || !mounted.current) releaseFileOwnership();
      if (mounted.current) setBusy(false);
    }
    if (saved && acknowledged && manual && flushing.current === 0 && mounted.current) {
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

  if (terminalError) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="صرف‌نظر از ضبط ناموفق"
        disabled={busy}
        onPress={() =>
          Alert.alert('از این ضبط صرف‌نظر شود؟', 'پایان این ضبط تأیید نشده و وویس ذخیره نشده است.', [
            { text: 'انصراف', style: 'cancel' },
            { text: 'صرف‌نظر', style: 'destructive', onPress: () => void finish(false) },
          ])
        }
        style={{ minHeight: MIN_TOUCH, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
      >
        <Text color="danger">ضبط تأیید نشد — صرف‌نظر از این ضبط</Text>
      </Pressable>
    );
  }

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
