# Validation: bounded technical diagnostics (0.11.63)

Candidate 0.11.63/code 79 on `codex/diagnostic-boundaries`, based on
PR 13's `159c996`. No dependency, schema, migration, route, permission,
clinical rule, encrypted archive or key change. The .62 place/extension repair
is retained; an explicit empty place ID now filters that owner rather than
silently returning every place.

## What changed and why

Default technical diagnostics are a projection of reviewed error kinds/codes,
fixed context, bounded Android bundle coordinates and trusted app version/code.
They do not copy arbitrary messages, stack text, function names, URLs, paths,
IDs, unknown names/codes, context, cause text or custom conversions. Cause
traversal is bounded and handles cycles and throwing getters. Hermes bytecode
offsets and source columns remain distinct. Parameter redaction remains
compatible; it is not the default content-safety boundary.

Exact reviewed operational notices retain existing instructions about drafts,
ownership, dates/numbers, backups and recovery. Unknown errors use a fixed
fallback and safe technical details. Feedback, read notices, startup failure,
route boundaries and legacy backup failure display follow this contract. New
failed backup runs persist safe text. The underlying cause remains available
for error propagation/classification; rollback and archive behavior are unchanged.

The strict version-2 JSONL log projects legacy entries instead of returning
arbitrary parsed objects. Reads are capped at 1 MiB, 32 KiB per line, 400
candidate lines and 100 retained events. Omitted content and read/close failures
are distinguishable from an empty log. A persistent marker is acknowledged
before rewriting and retired after write-size acknowledgment. A marker still
signals an incomplete write after restart, including an empty or missing log.
Failed marker creation leaves old bytes intact. Clear requires acknowledged
deletion of the log and marker. This does not promise atomic replacement,
preservation of every diagnostic event, fsync or power-loss durability.

Sharing creates an immutable sanitized cache snapshot. Only direct files with
this producer's exact UUID name can be retired: a hard cap of 20 files/10 MiB,
24-hour grace and protection of URIs offered through a pending native await.
Allocation refuses when no eligible victim exists. Failed preparation cleans
only an acknowledged new, never-offered file, never a pre-existing collision.
Chooser completion does not prove recipient reading, so there is no immediate
finally deletion. Android may still evict cache; it is not permanent storage.

Share, clear, copy and retry catch failures and retain mount/focus/lifetime and
one action latch. Departed callbacks cannot open sharing or accept an old clear
confirmation. Effect replay permits new actions. The previous JS error handler
gets a fresh safe Error with the same fatal flag. Other React Native/native
exception paths may bypass it; this is not blanket native-log sanitization.
Installed Expo Sharing can retain a pending promise after activity-launch failure;
its known in-progress code gives a fixed close/reopen notice. Mock retry success
does not establish native recovery from that library state.

## Software evidence

- .62 baseline: 188 suites/2,879 app tests, five workflow checks, typecheck/lint/
  format and zero lint warnings. Normal push and exact-source hosted CI pass.
- Original-source private probes reproduce synthetic canaries in message prefixes,
  stack/context, unvalidated legacy values, duplicate/departed share, late clear
  and three unhandled-rejection paths. No actual patient disclosure or phone
  crash is inferred. Native file/share APIs in these tests are stand-ins.
- The primary independently runs the initial nine private suites/75 tests, then
  catches two test return-type errors and a false Clipboard acknowledgment. Its
  witness is red before requiring true. Android Clipboard's installed contract
  acknowledges true; a fulfilled Promise alone is insufficient.
- Installed file move can remove its destination before rename/NIO/copy fallback.
  Three failed-rewrite/restart witnesses are red before the persistent marker.
  Cache witnesses are six red/one green after fixing their private Jest bootstrap;
  bootstrap failure itself is not application evidence.
- Integrated 14 targeted suites/146 tests pass. The proposal would replace two
  existing real-SQL startup ownership/rollback tests. The primary preserves that
  file byte-for-byte and places the diagnostic test in a separate file. Prior
  retry/rollback assertions in notice/backup tests remain, with stronger canaries.
- Five logger/cache/startup/lifetime suites/47 tests pass with StrictMode witnesses.
  The explicit empty-owner SQL witness is red before undefined checking and green
  afterward. The first full attempt stops on formatting/import warnings. The
  next runs 197 suites: one old settings-context assertion fails, 2,937 tests pass.
  That assertion now requires the deliberate fixed `settings.preference` context;
  its no-alert/no-notification ownership assertions are retained.
- Before building, the primary reads installed Android
  `FileSystemDirectory.asString`: directory URIs end in `/`. The initial cache
  stand-in omitted that contract, hiding a one-character slice error in URI pinning.
  Strengthened private witnesses fail three/pass five before using `File.name`
  and exact reconstructed-owner comparison; all eight pass afterward. A private
  regex bootstrap failure is separate from those behavioral failures. The app
  cache stand-in now preserves trailing slashes and normalized path joining.
  The final seven targeted suites/65 tests pass, including original startup and
  settings ownership tests. Sibling/nested URIs remain rejected.
- Final full `npm run check` passes: 197 suites/2,939 app tests, five workflow
  checks, typecheck/lint/format and zero lint warnings; Jest takes303.21 seconds.
  The checked application/document bytes remain unchanged during the worker.
- Independent helper review finds no further actionable issue. Its in-memory
  probe uses current source and installed PathUtilities for URI/pin/cap/legacy
  interruption behavior; it is not a filesystem, Jest or device run.

Private proposals and probes are separate from integrated source. Query/backup
tests use migrated real sql.js and independent archive authentication; native
file/share tests pin installed contracts with stand-ins. Normal push repeats all
197 suites/2,939 app tests and five workflow checks, zero lint warnings. Frozen
`57ae67eebd3dac02d2888849a68cf8f52389a06f` succeeds in
[exact-source hosted CI](https://github.com/CodeinScrubs/medos/actions/runs/38179731830/job/114589541033).
The change is draft PR14 against PR13, not public main.

## Frozen artifacts and native evidence

Both actual packages are version0.11.63/code79, `com.shayan.medos`, minSDK24,
targetSDK36. Both pass ABI/essential-JNI and signature verification with the
existing signer SHA256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| Private x86_64 QA | 55,182,966 | `0cc965e64215cdd0bf5725c3b607a7d93fe2906b4bf72c93dba401f2a8d441aa` |
| `dist/MedOS-0.11.63.apk`, arm64 | 53,574,639 | `a1a7f3f74ac55ec31b8f5d8426ecb0b33ca16ea447bd8e97cd3682132f15e306` |

QA builds in18m41s (834 tasks,802 executed); owner builds in14m37s (910 tasks,
148 executed). Source and foreign WIP stay frozen. Prebuild regenerates native
files; no explicit app-clean flag is used. Actual native libraries are checked
despite successful Gradle output. Pulled installed QA bytes match the inspected
private APK exactly. The generated Gradle daemon is stopped normally afterward.

Acceptance runs on the exclusively owned read-only AVD/serial5558. The first
launch later disappears without app acceptance; its process is absent and both
base hashes remain unchanged, but the departure's cause is not established.
A persistent owned launcher starts a second read-only instance. Cold boot is
slow and the first app tree is blocked by a System UI ANR. Fresh observed `Wait`
exposes MedOS with the same PID3929; the initial bounded crash buffer has no
MedOS fatal. These are recorded environmental observations, not accepted app
performance measurements. The AVD remains owned for the next menu acceptance;
final shutdown/base-hash evidence is recorded after that work.

Actual native actions accepted on these installed bytes:

- Resume/publish a raw place draft after leaving; create two children on its
  original parent. Copy2345 and verify exact native paste. Star and unstar are
  observed from the changed menu. A subsequent explicit star leaves it starred.
- Delete one child separately, then its parent. Both become hidden. Restore the
  parent: the live sibling returns and the separate tombstone stays deleted.
  Explicitly restore that child to the original parent. No call/message is sent.
- Open the projected legacy error log. Cancel the native chooser and return.
  A separate local-only, no-permission QA recipient reads the granted JSON URI
  completely; it is not part of MedOS or a phone dependency. Independent strict
  JSON validation covers20 legacy events/201 bounded coordinates,18,163 bytes,
  without raw message/stack/path/function fields or invented legacy app identity.
  Receipt SHA256 is
  `f3a8975f4a92adb925bb353eef70c413541edc21869448707bd00e43bf0f176f`.
- Cancel log deletion:20 events remain. Confirm: empty log is acknowledged.
  An intentional force-stop starts PID9217; empty log and both recovered children
  survive. Bounded crash checks find no MedOS fatal for the observed action PIDs.
- Four complete app-created encrypted archives (before/deleted/restored/cold)
  each authenticate16 chunks and pass independent SQLite integrity/FK checks.
  Every one of55 tables is compared:49 are identical,41 original live patients,
  34 original media byte hashes and257 original audit rows remain. The three new
  records retain original context; one copy increments usage once, publication/
  deletion/restoration audits are exact, and all three retired drafts remain.
  Technical deltas are three new backup runs plus acknowledgment of the running
  before-snapshot run, backup receipts and a cold-start timestamp touch of the
  unchanged zero unresolved-media receipt. No clinical exclusion is hidden.

Probe limitations/failures are kept distinct: an extra automated Back exited an
already keyboard-closed form, whose raw draft then resumed; starred icons changed
the aggregate row descriptor, requiring an observed text-child selector; flattened
trash wrappers required an unambiguous nearest control from fresh native bounds;
one immediate post-navigation tree preceded row hydration. The independent JSON
oracle initially assumed only one legacy code, then explicitly validates the
three reviewed codes present. The audit oracle includes existing publication
events before the required delete/restore pair. None of those first attempts is
reported as passed.

## Native and product boundaries

The bounded .62 recovery/copy/star and .63 sharing/clear acceptance above belongs
to frozen57ae67e. Native testing also exposes an existing extension action menu
that cannot dismiss on Back; fix/accept it separately, with retained edit ownership.
Physical phone, timed 40-patient shift,
rich text, other notebook trash/doctor actions, broader follow-up/outpatient
flows and local selected coding-agent evidence remain open. This 100-event log
does not implement weeks of complete clinical use history. No technical report
or patient data is automatically uploaded. `dist/MedOS-0.11.63.apk` is an
inspected owner artifact, with these explicit acceptance boundaries.
This is not a finished-product or crash-free claim.
