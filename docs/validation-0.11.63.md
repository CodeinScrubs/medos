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
file/share tests pin installed contracts with stand-ins. Normal push/source CI
and APK/native evidence are pending at this source checkpoint.

## Native and product boundaries

Accept .62 recovery/copy/star and .63 sharing/clear on the exact frozen APK;
do not substitute .61's native evidence. Physical phone, timed 40-patient shift,
rich text, other notebook trash/doctor actions, broader follow-up/outpatient
flows and local selected coding-agent evidence remain open. This 100-event log
does not implement weeks of complete clinical use history. No technical report
or patient data is automatically uploaded. `dist/MedOS-0.11.61.apk` remains the
inspected owner artifact until a newer frozen artifact is built and inspected.
This is not a finished-product or crash-free claim.
