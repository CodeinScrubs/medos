# Validation scope: 0.11.18

Version 0.11.18 / Android code 34 adds stopped-voice operations for existing
records (patient media and VoiceNotesSection). Migration 0020 adds recording_jobs;
all earlier migrations remain unchanged. No dependency, permission, archive or
passphrase-scheme change. Draft-note and quick-capture staging remains separate.

## Reproduction and software evidence

The clean 0.11.17 source/evidence gates passed 99 suites / 1249 app tests + 3
workflows. Two real-handler witnesses failed with 12 prior cases passing: a
reconstructed object replayed one operation into another file/attachment, and
the same operation id could be used for another patient. These demonstrate the
absence of durable identity; they are not a native process-death test.

A separate real-recorder-handler witness reproduced a missing native completion
event: Stop resolved, confirmation timed out and no discard action could release
the route. It failed before the fix. Confirmed discard now clears only the
unconfirmed capture without invoking any storage callback. A failed metadata
handoff still requires its parent's awaited cleanup contract before discard.

Checks cover reservation before native work, source/destination SHA-256 and
length, immutable identity/destination/time, real SQLite publication and digest
write failures, atomic attachment/job acknowledgement, ready retry without cache,
interrupted complete/partial copy, changed bytes, deleted parents/attachments,
simultaneous retry/cancel, reference-protected cleanup and cleanup retry. Actual
recorder handlers await failed-handoff discard while retaining the single route
guard and file-job reservation. Recovery controls require confirmation, retain
failed actions, serialize presses, report read failures and remain absent for
empty/loading jobs. Current and pre-journal SQLite restore cases are covered.

Intermediate stand-ins initially returned impossible invalid fingerprints,
reset their delete implementation, used an unsupported note-type fixture and
loaded native audio through a duration formatter. Fixes retained the platform
contracts and moved the unchanged formatter to pure lib; these are not native
device failures.

- Final related regression run: 6 suites / 136 tests passed, including the new
  missing-confirmation case and the migrated-SQLite operation/restore tests.
- `npm run db:generate` reported no schema changes after migration 0020; earlier
  migration files remain unchanged.
- Final `npm run check` and the successful normal pre-push repetition passed
  typecheck, lint, formatting and 101 suites / 1290 app tests + 3 workflows.
  Implementation `2adbc75be71c0a4beb678a96c86c8f85e1963f16` was pushed; exact-source
  hosted CI `37125837796` succeeded.

## Native/artifact acceptance

Frozen source `2adbc75` produced inspected, signed 0.11.18/code 34 packages:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Owner arm64 `dist/MedOS-0.11.18.apk` | 52,828,683 | `c4054be301a85974bf062be064e8b98d0ccb1553ba4741bbafa93266c3b5cffe` |
| Private x86_64 emulator copy | 54,437,010 | `29a487b44aaf6f8c4aa4e8289c9e5f588f6973c979f114a5c55addf288ff0a6a` |

Both passed required native-library/ABI, version/package and signature checks;
certificate SHA-256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
Modern emulator upgrade used `install -r`, retained the dataset and matched the
pulled installed APK hash. Airplane mode stayed on. Manual Stop and active system
Back each added one voice (12 -> 14); cold reopening after acknowledgement retained
14. New-voice playback/Stop controls were observed, not physical audio quality.

A full SAF archive completed destination-content verification. Independent
decryption authenticated all seven chunks: 6,474,457 bytes, SHA-256
`718698963c45aa0e9f2d0471cb8621d9538f7b6ffe22fd793d2495e075d429a2`.
SQLite integrity was ok, foreign-key failures zero, migrations 21. All 37 other
application tables, 12 old attachments and 13 old media files matched exactly.
Two new voices matched two saved recording jobs and their exact size/SHA/target/
time. All 14 referenced voices fully decoded with FFmpeg; measured durations
matched metadata within one second. The original WAV bytes remained unchanged.
One pre-existing zero-byte unreferenced M4A remained; no new orphan or duplicate.

On a separate rootable API 26 emulator, a controlled SQLite trigger rejected a
stopped voice's attachment insert. Native state was ready, positive file size and
matching SHA, with zero attachments. The process was stopped before acknowledgement;
only the verified cache source was removed. Cold-open Inbox Retry produced exactly
one saved attachment/job with the same destination/SHA and absent cache. A second
rejected voice was stopped before acknowledgement, then explicitly cancelled after
cold reopening. Its job was soft-retired/discarded, only its unpublished destination
removed, cache source retained and the first acknowledged attachment/bytes unchanged.
Native SQLite integrity and foreign keys passed; the recovered AAC fully decoded.
This is controlled SQL failure and
process-stop evidence, not a natural power failure or physical microphone test.

The API 26 dataset was initially empty. An accepted 0.11.17 SAF archive failed before
database/media replacement despite the exact source and picked-copy hash matching.
A direct native JCA probe reproduced installed expo-crypto's returned capacity tail:
AndroidOpenSSL estimated 1,048,592 bytes but wrote 1,048,576 bytes, with the correct
plaintext prefix and 16 extra zero bytes. That is a release defect addressed by
0.11.19, not successful 0.11.18 restore acceptance. The controlled voice tests then
used an explicitly seeded synthetic patient, not a supposedly restored dataset.

Private evidence is under `private/validation-0.11.18/`. Host-memory contention
caused an initial build/pre-push OOM; sequential retries passed. API 26 private QA
helpers needed the actual UIAutomator output path, no modern test-base jar, one UI
automation job at a time and restored app SQLite SELinux labels after root probing.
These helper/host failures are not product crash claims. Slow helper retries caused
long synthetic recordings; do not interpret their duration as app latency.

## Still open

Durable draft-note/quick-capture voice targets, active/pre-journal/source-cache
interruption, full ordinary-write/editor/photo exclusion from restore, old empty
orphan cleanup, raw manual forms, original-before-crop, physical phone and broader
clinical workflows. Do not declare the whole platform or voice recovery complete.
