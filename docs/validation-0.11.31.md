# 0.11.31 — durable stopped quick capture and original inbox intent

## Scope and witnessed failures

Solo continuation of the owner's release/heavy-shift review. Baseline `059696a`
records the native acceptance of application `eb1979a` (0.11.30/code46).
No PR was remotely merged, approved or commented on.

Before editing the production paths, actual-handler/migrated-SQLite witnesses
failed on the baseline:

- Seven query/writer checks: capture creation accepted a retired patient;
  empty cleanup retired a stopped recording's parent; filing preceded its
  acknowledgment; old writer creation/update/cleanup crossed identical-ID restore;
  capture-kind failure did not roll back journal/media; a filed capture accepted
  a new recording. The other 54 checks in those suites passed.
- Three screen checks: first native IO saw zero journal rows, a retained recorder
  callback wrote after replacement, and copying held no dataset writer admission.
- Three card checks: retained task/note actions and delayed trash confirmation
  changed restored rows. Four existing card checks passed.
- Five picker checks failed across Today/full inbox: old assign/note callbacks
  changed restored rows, and the full inbox closed its picker on write failure.
  The existing Today retry/duplicate behavior passed.

These are defect witnesses, not invented test counts or native failure injection.

## Implementation

Stopped quick-capture voice now uses the existing `recording_jobs` journal. The
one CaptureWriter creates/owns one parent and retains its original generation.
Text/selected patient flush before journal reservation; reservation commits before
the first native fingerprint/copy. Source/hash/verified-copy recovery, stable UUID,
atomic metadata acknowledgment and explicit discard reuse the existing engine.
Capture kind, attachment/checksum and job's saved state now commit together.
A failed publication leaves a ready journal that can recover without its cache.

The screen retains one always-on AutosaveScope with its existing recorder and
text saver. It does not recursively flush the group inside a recorder callback.
New typing during copying must flush before acknowledgment/close. Original dataset
admission covers native waits; original navigation focus owns any delayed close.
Photo choices and Done have the same immutable intent/mutex boundaries. Stale
text/patient identity remains readable; explicit stale close discards only local
input after confirmation. SelectField can now disable its existing press/clear
controls accessibly; no normal-path dialog was added.

Creation resolves the active shift and validates its patient in one synchronous
transaction. Empty cleanup reads text/media/pending recording state and retires
the row atomically. Copying/ready/discarding jobs protect their parent. Filing
refuses pending recordings; after recovery the existing note/task flow works.
No new recording may start on an already filed capture.

Follow-up ownership witnesses on application `008d098` exposed three more
failures: reassignment during copying/ready/discarding changed the capture's
patient and stranded recovery's original-owner comparison. The corrected
real-SQLite fixtures fail before the guard. Reassignment now refuses atomically
while that journal is pending, including a combined patient/text patch; newer
text alone can still save. After successful recording save or explicit discard,
normal assignment remains available. The original capture UI already waits for
its single SaveGroup before patient selection; the query guard also covers inbox
choices and direct callers. No new normal-path dialog is added.

Today/full inbox capture cards, patient choices and recovery actions retain the
parent's generation from before reads. Old deletion/filing/assignment callbacks
cannot acquire fresh authority after restore. Picker failures retain selection;
duplicate choices wait for the first acknowledgment. Delayed filing cannot
navigate over a newer route. A failure-only action opens the current inbox after
explicitly closing any previous choice, rather than silently remounting input.

0.11.31/code47 changes only scoped application/lock version fields. No migration,
dependency, permission, route, native service, archive/key scheme or clinical
formula is added. Draft-note voices remain a separate pending target contract.

## Verification

Initial extended targeted gate passed six suites / 122 checks; card/picker/read
recovery passed three suites / 58 checks. Existing media-editor navigation/file
stand-ins initially omitted the newly used contracts: the first full checks had
one failure with 1,623 other checks passing. The stand-ins now supply focused
navigation and verified journal-copy semantics without dropping their metadata,
same-file retry or failed-close assertions; both media/screen suites pass.
Initial source `008d098` full check passed: typecheck, architecture lint, formatting,
126 suites / 1,635 app tests and three workflow tests. This includes the additional
capture-kind rollback and deferred inbox-navigation checks.

The first ownership follow-up full gate passed 1,636 checks and failed two older
corruption fixtures: their attempted normal reassignment is now correctly blocked.
Those fixtures now mutate SQLite directly to keep testing the journal's independent
owner defense. Their rejection/no-copy/no-publication/idempotent-retry assertions
remain intact; the new query tests cover the normal admission guard separately.

Final ownership-follow-up `npm run check` passes typecheck, architecture lint,
formatting, 126 suites / 1,638 app tests and three workflow tests. The serialized
`--runInBand --detectOpenHandles` investigation also passes all 1,638 app tests
(204 seconds) without a worker-exit warning or an open-handle report. The normal
final-source pre-push gate passes too; no hook was bypassed.

Exact-source CI, signed artifacts and native upgrade/recording/recovery acceptance
are pending at this source checkpoint. Record them
separately after they actually run; do not use the 0.11.30 APK as current evidence.

Initial source `008d098` CI 37677225740 passed. Its first owner APK also passed
version/ABI/signer/native-library inspection, but is superseded by the ownership
follow-up and must not be used as final-source acceptance. The pre-push parallel
test run passed all assertions with a Jest worker-exit warning under concurrent
native compilation; investigate handles on the final source rather than hide it.

### Final-source artifacts and native acceptance, 2026-10-08

Application source is `d61b11d81bdb0e428dc1b4fea4522143988a293b`, version
0.11.31/code47. Exact-source CI
[37679736687](https://github.com/CodeinScrubs/medos/actions/runs/37679736687)
passes checks, migration/schema comparison and Android bundling. The five open
PR heads were refreshed and are unchanged; their review dispositions remain in
project-audit-2026-10-07.md. No remote merge/approval/comment was made.

Both signed packages were built from that frozen application source and checked
with aapt, apksigner and the repository's native-library checker:

| Artifact | Bytes | SHA-256 | ABI |
| --- | ---: | --- | --- |
| Owner `dist/MedOS-0.11.31.apk` | 52,932,259 | `8861f873f27d3d5031923585e8f54b1ccf25734b1926f198291af680c9f50368` | arm64-v8a only |
| Private `MedOS-d61b11d-x86_64.apk` | 54,540,586 | `84c00cca319cac9d2b9ee125c90795c1f08a06c3c09fbb435e5d7a40270a827c` | x86_64 only |

Both report package `com.shayan.medos`, minSDK24/target36, 0.11.31/code47 and
certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
All essential native libraries pass inspection. The installed emulator base APK
matches the private x86_64 hash; the owner APK hash remains unchanged after QA.
The first `008d098` artifact is explicitly superseded. Documentation-only
acceptance commits do not change these application bytes.

Acceptance uses the owned, offline API36.1 x86_64 emulator (no physical phone).
The in-place 0.11.30 to 0.11.31 installation did not uninstall or reset app data.
An independent Node scrypt/AES-GCM/archive/SQLite decoder compared all 40 app
tables: 4,024 rows and all 18 pre-existing media hashes are identical. SQLite
integrity and foreign keys pass; there are still 22 migrations.

- **Back during actual recording:** capture text and a 76,772 ms voice reach
  the inbox, and remain after force-stop/cold reopen. The full archive contains
  exactly one new capture, one saved revision-3 journal, one attachment and one
  939,725-byte file. All previous rows/media remain identical. Its SHA-256 is
  `d0efa354527b917475b38c3be153fd115182af97b1bc598be6e2834a4a5d099e`.
- **Actual manual stop:** a fresh compressed hierarchy exposes `پایان ضبط`;
  tapping its observed bounds completes acknowledgment and closes to the inbox.
  A second force-stop/cold reopen preserves that text and 107,196 ms voice.
  The archive again adds only one capture/job/attachment/file, retaining every
  previous row and file. The new 1,308,569-byte file hashes to
  `eb09a8203e4747006afca7a6d0f86cc5ebdead35573c0cc07cd2251755d3e283`.
  Independent ffprobe parses both actual files as mono 44,100 Hz AAC, with
  container durations 76.881270 and 107.183311 seconds respectively. Container
  duration and recorder duration need not be identical.
- **Retained inbox after restore:** before returning from backup, the old inbox
  generation is still retained. The restored rows are readable but mutation and
  recording retry controls are disabled. Its explicit current-inbox action
  really replaces the route on this native navigator: the stale notice clears,
  the old search clears and retry becomes enabled. This is native evidence,
  separately from the router stand-in used by software tests.
- **Pending ownership/publication:** a private, independently validated fixture
  adds exactly one ready capture journal and its verified file. Its synthetic
  source cache is absent. Note conversion visibly refuses; changing to a different
  patient refuses and retains the picker. An independent export proves every
  application row and media hash still matches the seeded fixture.
- **Ready recovery without cache:** the pending journal remains after force-stop
  and a cold inbox reopen. Retry acknowledges the existing verified file as saved
  revision 3 and creates exactly one attachment, without changing other rows or
  bytes. Converting the recovered capture to a note then adds exactly one note
  and one initial version, moves that same attachment to the original patient,
  and preserves the original job/hash/size/duration/capture time. Text and the
  voice control/duration remain on a cold-reopened note.

The final independent export has 4,035 rows across 40 application tables and 21
media files. All original 4,024 rows and 18 files remain unchanged; the only
additions/changes are the two real recordings and the documented fixture/recovery/
filing. Comparing the filed checkpoint against its cold-reopened final checkpoint
again shows exact row and media equality. Integrity/foreign keys pass throughout.

Public evidence hashes (private synthetic archives are not committed):

| Checkpoint | SHA-256 |
| --- | --- |
| Before upgrade | `88b81322621b5d4d59fdf1a862f8e9af5ec8037a8fa93068d75943e36891c2bc` |
| After upgrade, before native changes | `be9b4dfcd2ac49e9031fb3bf99f51a614a28c17ef9578867ae2a80b24a6a8611` |
| Back-stop capture | `76aba6b35f5566eb908f20d3564d1b5b859f9d0926f3e23888b8012b1dd65ad7` |
| Manual-stop capture | `2ec04bc26988dee9e4447cf740a5391b333fd740889fe24af739f24ece1efdca` |
| Seeded ready fixture | `4420aca493edb4f0f9a3116bf189af17c957cafda338d10c00c211edde851925` |
| Rejected pending actions | `f7aae98eda475481dcc264217e412815ee1fa967ae36bc93dd1cf0cbd400ddf7` |
| Recovered, before filing | `685ee209d64317d49d1b9dd9410b2ccfc0651a3dacf681a74483b3b76d350b34` |
| Filed | `d6dfe229feed314b506964745bdbfe7c4b1642d3c74775da7d16c68504f07493` |
| Final cold-reopened checkpoint | `b30829728c66f1fc03b58e992b380958b1a8172ccd41aec81bb3cb42efc58530` |

Evidence helpers/logs/decoded databases/media remain gitignored under
`private/validation-0.11.29/`: upgrade31-preservation, native31-capture/manual/
pending-refusal/recovered/filed/final-acceptance and filed-cold-preservation JSON,
artifact inspections, CI JSON, recorder hierarchies and native logs. Fresh UI
bounds, never screenshot guesses, drove taps. Actual recording/restore/player
animation sometimes prevented the default UIAutomator idle dump. A late fresh
restore dump did show success after bounded early dumps failed; that is an
automation timing limitation, not a failed restore. Reusing the older private
API26 fast-dump runner on API36 failed before hierarchy capture because of its
missing `android.test.RepetitiveTest`; its misleading `OK` marker is not accepted
as evidence. Playback was requested, but live progress/pause and audible output
are **not** accepted here. ffprobe is format evidence, not proof of audible output.

The final native crash buffer is empty, log review finds no MedOS fatal/ANR, and
all recorded MedOS exits are explicit user force-stops or package updates. This
is bounded acceptance, not a guarantee against all crashes. The ready state was
seeded, not produced by actual power loss or native SQL fault injection. No
physical microphone/speaker, OEM background, low-space, power-loss, 24-hour native
soak or smooth-performance acceptance is claimed. The prior zero-byte synthetic
QA fixture was preserved rather than deleted; these checks do not certify every
historical media file as playable.

## Limits and next work

The durable boundary starts after the capture row and pending fields can commit
and the journal is reserved. Active/unconfirmed recording, failed initial SQL,
pre-journal interruption or cache eviction before a verified copy are not covered.
Software fingerprints stand in for native files; they do not prove a phone stop,
power-loss recovery or storage-provider behavior.

Next P0: draft-note stopped voice must preserve draft revision/publication/conflict
semantics, then manual lab/contact raw recovery and remaining async forms.
Physical A52s performance/owner shift, OEM reminders, power/low-space behavior,
remaining dependencies/clinical validation and wider product acceptance stay open.
The native 0.11.30 round completed 40 correct identities without an observed MedOS
crash, but emulator jank was 89.61%; that is not a smooth-performance sign-off.
