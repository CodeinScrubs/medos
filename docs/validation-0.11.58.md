# Companion and follow-up recovery with retained action ownership — 0.11.58

Application .58/code74 on `codex/contact-followup-recovery`, based on delivered
PR9 source/evidence `d1e9a5c`. One read-only GPT-6.1 Sol/xhigh review helped
inventory risks; the primary agent reproduced, implemented and verified changes.
No dependency, table, migration, route, permission, clinical formula or backup
format changes. Existing untracked work is preserved separately.

## Problem and behavior

Companion and follow-up deletion already leaves tombstones, but the existing
trash did not offer their recovery. A stale native choice also could delete a
newer companion/follow-up, or mark a newly completed follow-up as missed.
Identical same-millisecond delete/restore/delete cycles could evade a row-only
trash token. Four real-SQLite/UI witnesses fail on those behaviors before fixing
them; failing logs are retained privately.

- Add the two kinds to the existing filtered, counted and bounded clinical trash.
  Restore only the original live patient/episode. Retain phone, notes, primary
  flag, due time, status, outcome, completion time and original context. Do not
  create another copy, reopen a completed follow-up or revive deleted children.
- Include the existing immutable clinical sequence in the full lossless shown-row
  recovery basis for all nine kinds. A fresh cycle invalidates an old choice even
  when text and timestamps return to identical values. Counts and global sort
  never fetch whole clinical bodies or history snapshots.
- Companion deletion checks the exact shown row and clinical sequence. Follow-up
  completion/status/postponement/deletion compare the retained clinical row and
  desired reminder revision. Native receipt fields alone can advance without
  invalidating a physician's clinical decision.
- Completion retains the row from when its outcome prompt opened, even if live
  props refresh while text is being written. Refused or failed saves keep that
  text; old callbacks cannot silently adopt a newer record. Native choices are
  single-attempt and respect originating dataset, focus and mount.
- Recovery, clinical snapshots and required audit share one synchronous SQL
  transaction. Follow-up recovery increments the desired reminder revision and
  marks its native receipt dirty before reconciliation. The original outer
  dataset admission remains held through awaited native acknowledgment.
- Reconciliation does not ask notification permission implicitly. Native or
  receipt failures do not roll back or falsely report loss of the recovered
  clinical record. One short conditional message points to the existing card's
  retry. Invalid imported reminder generations/status/channel/priority are
  retained unchanged and refused, rather than guessed or normalized.

## Software evidence

Parent .57 source and delivery passed177 suites/2,625 app tests, five workflow
tests and typecheck/lint/format. Their APK and native evidence belong to .57,
not to this new source.

The initial three witnesses fail3/3 before the fix and pass afterwards. The
additional stale missed-status witness fails before its retained-row fix. An
intermediate integrated run found an actual SQL qualification error: Drizzle's
single-table select strips ordinary outer column qualifiers, allowing the
correlated id to bind to the inner history row. The helper now emits explicit
schema-derived identifiers. Healthy contact delete and nonzero history cases
exercise this path. An overdue native mock assertion also was corrected to
distinguish calling the API from scheduling an OS request.

Corrected integrated recovery/UI tests pass198 tests in six suites (36.006s).
Expanded imported-value and publication-receipt replay tests pass53 tests in
three suites (10.335s). The final follow-up card/query run passes46 tests in two
suites (12.356s), including refreshed outcome intent, a changed deadline,
benign native acknowledgment and duplicate failed postponement choices.
One legacy harness had to refresh the shown card after a successful postponement
before issuing a new status choice; retaining its old props now correctly
represents a stale decision, not a fresh live-query rendering.

The tests use the app's migrated SQLite and actual transactions/history/draft
receipts. Whole-table comparisons include audit, clinical versions and retired
drafts. Faults cover required audit/history, SQL/native acknowledgment, denied
permission, cancel/schedule failures, unsafe generations, original/deleted or
cross-patient context, same-ms cycles, late callbacks and native receipts held
across dataset replacement. Publication replay after recovery returns the same
record id without another copy. Notification services and native hit testing
are stand-ins in these software witnesses.

The final full `npm run check` passes178 suites/2,683 app tests in213.035s,
five workflow tests and typecheck/lint/format without warnings. Migration
regeneration reports no schema changes. Earlier intermediate type errors were
in synthetic fixture/action types and an unchecked test array access; corrected
source passes. The first full run found a missing navigation context in the
follow-up list test harness (five failures); its isolated navigation stand-in
now supports the new focus check, and the final full run includes those cases.
Import-order warnings were corrected only in changed files. Failing runs remain
private; they are not passed acceptance evidence.

Frozen .58 APKs, native acceptance and exact-source hosted CI are pending at
this source checkpoint. Their results must be recorded before treating them as
completed evidence.

## Follow-on acknowledged outcome and focus loss

First source `5304451` passes the normal push check with2,683 tests (203.605s)
and its private x86 APK passes package/code74/signature/essential-library
inspection. A later retained-card witness exposes an additional UI regression:
the outcome is durable, but its prompt remains open when focus is lost during
native acknowledgment. That witness fails before the correction. Acknowledged
local modal state now closes while mounted; haptics remain limited to the
focused origin. Refused or failed outcome text remains available.

The corrected card/list run passes31 tests/two suites (14.872s). The full
follow-on check passes178 suites/2,684 app tests in209.541s, five workflow tests
and typecheck/lint/format without warnings. No other application behavior,
dependency, schema or backup format changes. APK/native/CI evidence from
`5304451` does not accept this later source; rebuild and inspect its candidate.

## Frozen candidate and native acceptance

Final application source `7d557feac023d0903bc813a8dd61d8143566f4f1` passes the normal push check with 178
suites/2,684 app tests (225.755s), five workflow tests and typecheck/lint/format.
[Hosted CI for that exact source](https://github.com/CodeinScrubs/medos/actions/runs/38126404863) succeeds. First-source `5304451`
CI/APKs are historical evidence; this acceptance uses the later correction.

Both actual signed APKs are 0.11.58/code74, package `com.shayan.medos`, min24/
target36. `aapt`, `apksigner` and the essential-JNI checker verify their actual
contents and owner signing certificate:

| Artifact | ABI | Bytes | SHA-256 |
|---|---|---|---|
| Private QA APK | x86_64 | 55119594 | 7cbf048cfef7d1187eaf558445adb14d520b5904f759866bb909946e84993beb |
| Owner `dist/MedOS-0.11.58.apk` | arm64-v8a | 53511267 | 4ed4c50b61426469c5ef03570cd58b57beb495e3abb1b2a212e7db68ca8b2045 |

Certificate SHA-256: `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
The source remained frozen throughout both builds. Only the generated app build
was cleaned for the ABI switch; source and app data were not deleted. No physical
phone was installed or driven. Native Gradle/bundler warnings are retained and
are not described as a warning-free build.

The primary agent upgraded the owned read-only Android16 x86 AVD in place and
pulled its installed base APK: its bytes match the inspected QA artifact.
The native fixture derives from the independently decrypted accepted .57 archive,
retains every prior row/media file and adds four synthetic tombstones. Its
SHA-256 is `7035c8217ba54d2f08716ecb67d3f605ad8fca715c38f94688d60083a8675716`.
Actual full restore acknowledges 43 patients/34 files and the pre-restore safety
copy; its 63.975 seconds include UI observation, not a restore-phase benchmark.

Fresh UI trees bind patient/title/dialog/actions to observed native bounds.
One journaled recovery each restores a companion, a future pending follow-up and
a completed follow-up. The companion then is deleted and restored through its
patient overview; the pending follow-up is deleted through its existing card and
restored while notification permission is revoked. The restored clinical record
remains, with one short truthful unavailable-reminder notice and existing retry.
A return to the app after granting permission automatically repairs requests.
A second denied/mounted/granted witness taps the actual retry once, observes its
completion and retains the deadline/result. No call or message is transmitted.

Independent AES-GCM/KDF/chunk decoding and raw-SQL comparisons inventory all 55
SQLite tables and compare all 51 application tables.
Device-specific settings and new backup-run bookkeeping are excluded from whole-row
preservation; prior audit and migration rows are checked explicitly. Each archive
retains 4,225 prior application rows, all 59 prior immutable versions, all 32
migration rows and all 34
media hashes. Prior audit rows remain; new full typed clinical snapshots and
required audit exactly match the three records' actual operations. The separately
deleted companion remains untouched. Completed follow-up status/result/completion
and original patient/episode remain; it is not reopened. Pending deadline/status/
result are preserved and desired/applied reminder generation ends at 10 with the
same stable request id. Software witnesses cover original-dataset races separately.

| Native archive stage | SHA-256 | Total clinical versions |
|---|---|---|
| restored | 2b6075c74439ec7d5bf5a3d65441bd76cb17542a4ed5ad736f658921517ba20a | 65 |
| denied | 07de5e4c1ff3eb640214cbe58c1201f1ed37d7f197168e635e6b5c4e4a1ed25f | 69 |
| final | c172b5e5a445b58574e31a12e5a2583c7519e5b2e1bca4bd445255bb22c23dab | 69 |
| cold | ae071bff41bd4586814cfd1f54cb2e42dfdbfe62494e44d5b746081a42a8bb42 | 69 |

The first denied-state strict comparison reports two occasion receipt changes,
not clinical changes. Raw diff and the actual native permission state independently
show exactly two original OS notification ids becoming null after `pm revoke`
restarts the app and normal reminder upkeep runs. Their full content, clinical
fields, timestamps and generations are unchanged. Only these two known ids allow
that explicit receipt transition in the denied/intermediate oracle; no table-wide
exclusion is introduced. Final and cold archives match both original occasion
rows/receipts exactly. This initial rejected comparison is retained privately;
it is not represented as a passed run.

OS `dumpsys alarm` after the actual retry shows the follow-up's exact intended
unix deadline and an Expo RTC_WAKEUP request. Because exact-alarm special access
is not enabled in this synthetic Android16 state, its scheduling window is one
hour. Notification permission and exact-alarm access are distinct. The manifest
already declares exact-alarm access and Settings already links its Android page;
Expo's native delegate deliberately falls back to inexact scheduling when access
is absent. [Android's alarm documentation](https://developer.android.com/develop/background-work/services/alarms)
confirms that inexact alarms can be delayed up to one hour on Android12+ when
battery-saving restrictions are absent; those restrictions require separate tests. This evidence establishes request acknowledgment, **not exact/on-time
notification delivery**. Verify both denied/granted special access and delivered
alerts, Doze/reboot and the phone before accepting clinical timed reminders.
The Settings explanation's current 'few minutes' wording understates the observed
window; accurate concise wording and failure-aware permission refresh are follow-on
work, not changes contained in this frozen .58 artifact.

An intentional force-stop/cold launch creates a new app PID, reads the retained
companion/pending follow-up and produces the independently accepted cold archive.
The 14.511-second route observation includes process start/UI instrumentation and
is not a startup or long-shift benchmark. The captured crash buffer has no native
fatal entry; current app exit records show package upgrade, two intentional
permission revocations and the explicit force-stop, not a MedOS crash/ANR.
Pre-install SystemUI boot ANR is retained separately; this does not establish that
all Android/UI/native soft-error behavior is healthy. The owned emulator is shut
down, its PID/serial disappear and both persistent AVD base hashes are unchanged.

Draft [PR10](https://github.com/CodeinScrubs/medos/pull/10) is incremental against
PR9. No PR is merged. Existing unrelated untracked documents and scoped lockfile
version edits remain unchanged. The application source is not altered by the
later delivery documentation commit.

## Remaining boundaries

This does not finish notebook trash, visual rich text, the full received/reviewed/
action/closed follow-up workflow or measured long40-patient shifts. Physical
IME/camera/audio, real alarm delivery/Doze/reboot, provider grants/low space/
power interruption, second-device recovery and physician review remain separate.
Software tests and a build do not establish a crash-free final product. The
phone is not currently the only remaining work.
