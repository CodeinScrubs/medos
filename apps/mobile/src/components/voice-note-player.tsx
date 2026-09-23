import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { prepareAudioForPlayback } from '@/platform/audio';
import { logError } from '@/platform/error-log';
import { mediaExists } from '@/platform/media';
import { useTheme } from '@/theme';

import { formatDuration } from './voice-recorder';

/**
 * Play / pause with a progress bar. Rewinds to the start when it finishes, so
 * the next tap replays rather than doing nothing.
 *
 * Two things here are deliberate, both learned from a voice note that would
 * not play:
 *
 * 1. **The audio session is set for playback on every press.** Recording
 *    switches the session to record, and nothing switched it back for
 *    playback — the very next thing the user does after recording is press
 *    play, on the same screen.
 * 2. **The press reads `player.playing`, not the status snapshot.** The status
 *    arrives by event; if one is missed the button would toggle against a
 *    stale idea of what the player is doing, which looks exactly like a dead
 *    button.
 *
 * And when it still cannot play, it says so in the row instead of doing
 * nothing quietly.
 */
export function VoiceNotePlayer({
  uri,
  relativePath,
  durationMs,
  caption,
  onLongPress,
}: {
  uri: string | null;
  /** When given, the file is checked on disk before playing. */
  relativePath?: string | null;
  durationMs?: number | null;
  caption?: string | null;
  onLongPress?: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const player = useAudioPlayer(uri ?? null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  async function toggle() {
    try {
      if (player.playing) {
        player.pause();
        return;
      }
      if (!uri || (relativePath && !mediaExists(relativePath))) {
        setProblem('فایل صدا پیدا نشد');
        return;
      }
      setProblem(null);
      await prepareAudioForPlayback();
      // A player that never finished loading — the file arrived a moment ago,
      // or the session was busy — gets its source again rather than silence.
      if (!status.isLoaded) player.replace(uri);
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
    } catch (e) {
      setProblem('پخش نشد');
      logError(e, { source: 'handled', context: 'voice note playback' });
    }
  }

  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const elapsed = status.currentTime * 1000;
  const progress = total > 0 ? Math.min(elapsed / total, 1) : 0;

  return (
    <Pressable
      onLongPress={onLongPress}
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: radii.md,
        padding: spacing.sm,
      }}
    >
      <Row gap="sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'توقف' : 'پخش'}
          onPress={() => void toggle()}
          hitSlop={8}
          style={[styles.play, { backgroundColor: colors.primary, borderRadius: radii.full }]}
        >
          <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={colors.primaryText} />
        </Pressable>

        <View style={styles.grow}>
          {caption ? (
            <Text variant="caption" numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
          {problem ? (
            <Text variant="tiny" style={{ color: colors.danger }}>
              {problem}
            </Text>
          ) : null}
          {/* Progress runs left-to-right like every audio scrubber, even in RTL. */}
          <View style={[styles.track, { backgroundColor: colors.border, direction: 'ltr' }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>

        <Text variant="tiny" color="textMuted">
          {status.playing || elapsed > 0 ? formatDuration(elapsed) : formatDuration(total)}
        </Text>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 4 },
  play: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
