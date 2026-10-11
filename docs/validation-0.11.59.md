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
- The initial focused suite passes 14 tests (5.962s): resume, inactive lifecycle,
  read failure/retry, stale result/rejection, repeated native action, focus loss,
  unmount, retained handlers, intent/fallback failure, selected folder and cleanup.
- The initial changed-source `npm run check` passes typecheck, lint, formatting,
  179 suites / 2,698 app tests and five workflow checks (Jest 203.978s).
  Normal source push passes the same 2,698 tests (202.89s). Exact initial
  `f2fecac` hosted [CI succeeds](https://github.com/CodeinScrubs/medos/actions/runs/38146514714).
- Final cleanup removes an unnecessary counter increment in effect cleanup;
  mounted lifetime and the next read already fence old results. The added real
  StrictMode test observes both setups and rejects the first delayed snapshot.
  The actual final focused suite passes 15 tests (3.472s). Full check passes
  179 suites / 2,699 tests and five workflow checks (247.218s), with zero lint
  warnings. Normal final-source push passes the same 2,699 tests (235.314s). Exact
  `b8820f9` hosted [CI succeeds](https://github.com/CodeinScrubs/medos/actions/runs/38147573121).

## Native and artifact evidence

Frozen application source: `b8820f955267a287714211921bc05368019b80bc`.
The private signed x86_64 release APK is 55,120,066 bytes; SHA256
`83299b6b5b2f5cf4674ecba70b7751711711b6b8350a2832c93a947e1116a82e`.
Actual package/version/code/ABI, existing signer and essential native libraries
pass inspection. The installed base.apk is byte-identical. No .59 owner arm64
APK was built; the next owner artifact will be validated independently.

On one owned read-only Android16 AVD, the actual Android app-info route opens.
Changing the camera grant with adb while it is visible, then returning with Back,
updates the camera row on the same Settings route and original PID. This is a
native mounted-resume witness, not a camera capture or permission-dialog test.
The stored folder displays a neutral selected badge. The inspected screenshot
shows the current RTL copy and controls above the navigation bar.

The actual Alarms & reminders link opens the system list. Selecting MedOS and
turning on its observed switch yields appops allow. Two existing synthetic
occasion requests retain their original occurrence instant and change from
window=3600000 to window=0 with exactAllowReason=permission after returning.
No reminder was sent and actual delivery was not tested.

The crash buffer contains two pre-install UiAutomation startup failures, not
MedOS exceptions; SystemUI also required Wait during AVD boot. App exit history
shows the intentional package update, without a new application crash in this
bounded session. The first bounded shutdown wait timed out; later observation
confirms the owned PID/serial gone and both persistent base hashes unchanged.
These environmental failures are retained in private evidence, not discarded.
This report does not attribute .58 acceptance to .59.

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

The optional app-lock callback rejection was reproduced in two private software
probes, not on a phone. The follow-up repair and its independent evidence are
in [validation-0.11.60.md](validation-0.11.60.md).
