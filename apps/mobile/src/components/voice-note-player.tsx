import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Row, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { formatDuration } from './voice-recorder';

/**
 * Play / pause with a progress bar. Rewinds to the start when it finishes, so
 * the next tap replays rather than doing nothing.
 */
export function VoiceNotePlayer({
  uri,
  durationMs,
  caption,
  onLongPress,
}: {
  uri: string;
  durationMs?: number | null;
  caption?: string | null;
  onLongPress?: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

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
          onPress={() => (status.playing ? player.pause() : player.play())}
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
