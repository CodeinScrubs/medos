import { setAudioModeAsync } from 'expo-audio';

/**
 * The audio session this app expects when it is playing something back.
 *
 * Android keeps one session per app, and recording changes it: while a voice
 * note is being recorded the session is in communication mode, which routes
 * audio to the earpiece. Nothing set it back, so the first thing the user does
 * after recording — press play on what they just recorded — could come out of
 * the earpiece at the wrong volume, or not at all.
 *
 * Applied once at startup and again before each playback, because between
 * those two moments a recording may have happened.
 *
 * `duckOthers` rather than `doNotMix`: a voice note is short, and interrupting
 * whatever the owner was listening to for four seconds is worse than playing
 * over it quietly.
 */
export async function prepareAudioForPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'duckOthers',
  });
}
