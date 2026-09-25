import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Row, Text } from '@/components/ui';
import { toPersianDigits } from '@/lib/persian';
import { prepareAudioForPlayback } from '@/platform/audio';
import { MIN_TOUCH, useTheme } from '@/theme';

export type Recording = { uri: string; durationMs: number };

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return toPersianDigits(`${m}:${String(s).padStart(2, '0')}`);
}

/**
 * A record button that turns into a live timer with stop / discard.
 *
 * The finished file is handed to `onRecorded` as a temp URI; the caller moves
 * it into permanent storage. Keeping storage out of this component is what lets
 * the note editor record *before* the note exists and attach on save.
 */
export function VoiceRecorder({
  onRecorded,
  label = 'وویس',
  compact = false,
}: {
  onRecorded: (recording: Recording) => void;
  label?: string;
  compact?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);

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
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      notify('دسترسی میکروفون لازم است', 'از تنظیمات گوشی، دسترسی میکروفون را برای MedOS فعال کنید.');
      return;
    }
    setBusy(true);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      alertError('ضبط شروع نشد', e);
    } finally {
      setBusy(false);
    }
  }

  async function finish(keep: boolean) {
    setBusy(true);
    // The polled state can be up to one interval behind the recorder itself,
    // and a length read too early is how a real recording gets thrown away as
    // an accidental tap.
    const durationMs = Math.max(state.durationMillis, Math.round(recorder.currentTime * 1000));
    try {
      await recorder.stop();
      // Back to a session that can play: the next thing anyone does after
      // recording is press play on what they just recorded.
      await prepareAudioForPlayback();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Anything under half a second is an accidental tap, not a note.
      if (keep && recorder.uri && durationMs >= 500) onRecorded({ uri: recorder.uri, durationMs });
    } catch (e) {
      alertError('ضبط تمام نشد', e);
    } finally {
      setBusy(false);
    }
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
          onPress={() => void finish(true)}
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
      accessibilityLabel="ضبط وویس"
      disabled={busy}
      onPress={() => void start()}
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
      <Ionicons name="mic-outline" size={compact ? 16 : 19} color={colors.primary} />
      <Text variant={compact ? 'captionStrong' : 'bodyStrong'} color="primary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  stop: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
