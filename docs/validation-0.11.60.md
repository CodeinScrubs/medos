# Validation: handled settings and optional-lock actions (0.11.60)

Application candidate: 0.11.60 / Android code 76 on
codex/permission-state-recovery (draft PR 11), following frozen .59 b8820f9.
No dependency, schema, route, permission, clinical rule or archive/key change.

## Implementation

SettingsScreen handles native authentication and setting failures. Unexpected
helper rejection reaches its existing error handling; audit remains best effort.
A lock action is admitted once through its original dataset intent across native
awaits. Cancellation stays quiet; failures retain retry. A delayed failure logs
through the existing redacted logger when its screen is unmounted/unfocused.
Grace/image preferences use the same original intent. A stale dataset gets short
reopen guidance rather than a new token.

Typed settings expose their existing read error/retry. LockGate retains mounted
content and offers retry after initial/refresh read failure. Native failure keeps
the cover and allows retry; native awaits cannot open prompts or publish UI after
unmount. No new lock, vault, account or security ceremony was added.

Native testing of first source 22ee485 found an additional real defect: after
removing the synthetic device credential, explicit disable stayed on silently.
The final repair checks actual enrollment. With NONE, the owner can explicitly
turn the setting off without an impossible authentication. Enrolled phones still
require authentication. An enrollment read failure is not treated as NONE.
The setting write is awaited and the existing best-effort audit is attempted.
Unexpected helper rejection propagates; no required audit rollback is introduced.

## Software evidence

- .59 baseline: 179 suites/2,699 tests and five workflow checks; its own native
  and hosted-CI evidence remain in validation-0.11.59.
- Original LockGate fails four regression witnesses before its initial repair.
  The original initial/refresh lock-read branch fails two further witnesses.
- First frozen .60 source 22ee485 passes 182 suites/2,728 app tests, five workflow
  checks and typecheck/lint/format, zero lint warnings. Jest takes 236.423s.
  Its normal push reruns the check (Jest 236.194s) and succeeds.
- Exact-source hosted CI 38152088801 succeeds for 22ee485:
  [Typecheck, lint, test, bundle](https://github.com/CodeinScrubs/medos/actions/runs/38152088801/job/114507449051).
- Native no-credential disable is also reproduced by one failing focused helper
  test before the final repair (3.596s; 15 unrelated tests skipped).
- After that repair, 35 focused tests in three suites pass (5.187s), including
  missing enrollment, enrolled cancellation, enrollment-read failure and failed
  setting acknowledgment. An audit rejection stand-in pins defensive propagation
  only: the actual audit helper is best effort. Native modules are stand-ins.
- The repaired source passes the full check: 182 suites/2,734 app tests, five
  workflow checks, typecheck/lint/format and zero lint warnings (Jest 233.077s).
  Its normal source push repeats the same checks and succeeds (Jest 221.912s).
  Exact e34e79e hosted [CI also succeeds](https://github.com/CodeinScrubs/medos/actions/runs/38156900313/job/114521630990).
  First-source results do not substitute for these final-source gates.

## First-source native evidence: 22ee485

The signed private x86_64 APK has 55,121,502 bytes and SHA-256
f29a8aff74d4a68631a403f291c089e13c6678dd7722c81abcf821d237ecf2a6.
Actual package/version/code are com.shayan.medos/0.11.60/76, min 24/target 36.
Certificate SHA-256 remains
1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c.
The essential native libraries and exact installed bytes pass inspection.
The final repaired source needs a new APK; this is not its acceptance.

Observed on the owned read-only Android emulator:

- Actual camera runtime dialog, permission grant and same-PID Settings update.
  No physical camera capture is accepted.
- No-device-lock enable refusal leaves a retryable off control. Actual native
  enable cancellation/retry and disable cancellation preserve the shown state.
- After the actual 30-second grace selection, 32 seconds away produces native
  authentication. Cancellation retains an opaque cover. The normal compressed
  accessibility hierarchy hides settings; an underlying control tap is blocked.
  Explicit retry returns the original Settings with the same process.
- Intentional force-stop/cold start produces a new process and native prompt.
  Cancel/retry opens the existing 41-patient synthetic list. This is not a full
  forty-patient shift simulation.
- Taking longer than 32 seconds to authenticate disable still turns the control
  off without a second observed prompt.
- Removing the ephemeral VM credential reproduces the silent disable defect.
  That failed case prevents full first-source acceptance.

The initial prebuild fails with an idle Gradle-held generated dex file. Normal
Gradle stop releases it; regenerated native QA builds in 13m 49s (834 tasks), with
nonfatal native warnings. A first bounded boot wait expires; later boot-complete
and launcher checks pass. System UI ANR initially obscures the installed app;
its observed Wait action reveals MedOS without changing the app process. The
crash buffers contain no app fatal in this bounded run. The owned emulator is
closed normally; process/serial absence and both persistent base hashes pass.

The first 32-second return used the prior 60-second grace and was exploratory.
A later observer assertion mistook radio checked for selected. Uncompressed
UI diagnostics also include hidden nodes. Correct selected/compressed reads and
actual blocked-touch behavior supply the accepted evidence; no speculative
code change was made for those observer differences.

## Final-source artifact and native evidence

Frozen application source: e34e79edaadbf499e28277b36bba9f0ec6c7612e.
Tracked source remains unchanged during both builds; the original unrelated
untracked documents retain their exact hashes.

| Artifact | Bytes | SHA-256 |
|---|---|---|
| Private x86_64 QA APK | 55,121,658 | 0c2a7f2250457a48a22bb75c51483bc4488de6932ecd65235191eec19f4def22 |
| Owner arm64 APK: dist/MedOS-0.11.60.apk | 53,513,331 | e35aa27b8405c3e45aa361150f0e2c1a00632dd659c3fd4bfdfce3985bdcbc09 |

Both actual packages report com.shayan.medos, 0.11.60/code 76, min 24/target 36,
the expected single ABI and the unchanged certificate above. Essential JNI
inspection passes. The installed QA base.apk matches the inspected bytes;
the owner dist file matches its separately retained frozen copy. x86 QA is not
copied into dist. The owner APK has not been installed on a physical phone.

QA builds in 3m 2s (834 tasks: 24 executed, 810 up to date). After normal Gradle
stop, the generated app build is cleaned for the ABI switch; the owner release
builds in 10m 55s (910 tasks: 195 executed, 715 up to date). Native deprecation,
CMake path and color-environment warnings remain nonfatal; this is not a claim
that native builds have no warnings.

On the owned read-only emulator, the final installed bytes demonstrate:

- No-enrollment enable refusal preserves a ready off control. Actual native
  enable cancellation and retry work.
- After removing the ephemeral VM credential, explicit disable now acknowledges
  a ready off control without an impossible prompt: the reproduced defect is fixed.
- With enrollment present, disable requires native authentication; cancellation
  preserves the ready on state, and successful authentication turns it off.
- Intentional force-stop creates a new process. Cold-start cancellation retains
  the opaque cover and explicit retry opens the original 41 synthetic patients.
  The inspected cover screenshot and normal compressed hierarchy contain no
  patient-list content. This is not a full timed 40-patient shift.

The first bounded boot wait expires. Actual boot completion is subsequently
verified before UI automation. System UI ANR blocks the initial installed-UI
probe; its observed Wait action reveals MedOS with the original PID 3143.
A retry snapshot is taken before its native PIN field appears; bounded fresh
snapshots observe it and the retry completes. These observer/environment
failures remain in private evidence; no app fix is invented for them.

The cold process is PID 5542; the crash buffer contains no MedOS fatal in this
bounded run. Ephemeral credentials are removed, the owned emulator closes
normally and both persistent base hashes remain unchanged. Final Gradle stop
also succeeds. Actual camera/grace observations above belong to the first source;
they are not relabeled as final-source observations or physical-device evidence.

## Boundaries and next work

This is reliability work on an existing optional setting, not a security audit.
Native rejection injection is software coverage, not a reproduced phone crash.
Physical authentication, camera/audio, alarm delivery/reboot/Doze, provider and
power interruption remain separate. Rich text, notebook trash, complete follow-up
loop and measured forty-patient shift acceptance remain in IMPLEMENTATION.
A places-list phone action also still needs handled intent rejection. No claim
that only a phone test remains or that the product is complete.
