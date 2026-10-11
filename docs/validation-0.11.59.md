# Validation: current permission state (0.11.59)

Application candidate: 0.11.59 / Android code 75, continuing delivered .58
commit 7d1dfc4 on codex/permission-state-recovery. No dependency, schema,
route, permission or archive/key scheme changes.

## Problem and implementation

The prior permission card read grants only on mount or immediately after opening
Android Settings. It retained stale grants after return. Permission reads and
several native actions could reject without handled feedback. A stored backup
folder was presented as verified access. The alarm text understated inexact
delay and implied exact delivery. Image settings claimed an unmeasured universal
8-10x storage ratio.

The same card now rereads notification/camera/microphone grants on foreground.
Only its newest mounted read publishes; read failure hides stale badges and
uses the existing retry notice. Native actions are handled and admitted once,
with mount/focus checks for retained handlers and delayed error feedback.
The folder has a neutral selected badge, not a native-access assertion. Shorter
copy avoids the alarm guarantee and universal image-size claim. No new screen
or permission framework was introduced.

## Software evidence

- The unchanged .58 baseline passed 178 suites / 2,684 tests, typecheck,
  lint, formatting and five workflow checks (Jest 204.898s).
- The original external-grant/resume witness fails before this patch, then
  passes on the actual changed card. The native-module stand-ins are explicit.
- The new focused suite passes 14 tests (5.962s): resume, inactive lifecycle,
  read failure/retry, stale result/rejection, repeated native action, focus loss,
  unmount, retained handlers, intent/fallback failure, selected folder and cleanup.
- Full changed-source `npm run check` passes typecheck, lint, formatting,
  179 suites / 2,698 app tests and five workflow checks (Jest 203.978s).
  Exact-source hosted CI is recorded after the normal push.

## Native and artifact evidence

Pending a frozen build, actual installed-package inspection and native
Settings round trip. This report does not attribute .58 acceptance to .59.

## Boundaries and next work

Notification permission is distinct from exact-alarm special access. This card
does not query or claim that special access was granted. Android documents up
to one hour for applicable inexact alarms on Android 12+, absent battery-saving
restrictions; the .58 OS trace actually had a one-hour window. Scheduling receipt
is not notification delivery. See [Android alarm documentation](https://developer.android.com/develop/background-work/services/alarms).

Physical phone permission/camera/audio, native reminder delivery/Doze/reboot,
provider-write access and second-device restore remain separate gates. Visual
rich text, notebook trash, full follow-up loop and measured 40-patient shifts
remain in IMPLEMENTATION.md. No crash-free or completed-product claim.

Review the optional app-lock toggle separately: its current asynchronous
onChange callback has no rejection handler in SettingsScreen, and the native
helpers can reject. This is a source finding, not a reproduced phone failure.
