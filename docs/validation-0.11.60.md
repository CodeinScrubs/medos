# Validation: handled settings and optional-lock actions (0.11.60)

Application candidate: 0.11.60 / Android code 76 on
codex/permission-state-recovery (draft PR 11), following frozen .59 b8820f9.
No dependency, schema, route, permission, clinical rule or archive/key change.

## Implementation

SettingsScreen handles native authentication, setting and audit rejection. A
lock action is admitted once through its original dataset intent across native
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
  Its normal push and exact hosted CI remain pending; first-source results do
  not substitute for them.

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

## Final-source artifact/native gates

Pending a newly frozen repaired-source QA build, actual no-credential disable
and enrolled cancel/retry/cold observations, owner arm64 APK and exact hashes.
No .60 owner APK has yet been built. .58 remains the latest owner artifact.

## Boundaries and next work

This is reliability work on an existing optional setting, not a security audit.
Native rejection injection is software coverage, not a reproduced phone crash.
Physical authentication, camera/audio, alarm delivery/reboot/Doze, provider and
power interruption remain separate. Rich text, notebook trash, complete follow-up
loop and measured forty-patient shift acceptance remain in IMPLEMENTATION.
A places-list phone action also still needs handled intent rejection. No claim
that only a phone test remains or that the product is complete.
