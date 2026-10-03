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
- Final `npm run check` passed typecheck, lint, formatting and 101 suites / 1290
  app tests + 3 workflows. Exact-source hosted CI and normal pre-push repetition
  are pending until the implementation commit is pushed.

## Native/artifact acceptance

Pending: freeze source, inspect signed arm64/x86_64 packages and actual installed
hash; upgrade the owned modern emulator without erasing its accepted dataset;
record Stop/Back, cold reopen and independently authenticate/decode a full SAF
archive and compare all prior rows/media. Native pre-ack failure/recovery/cancel
requires separate explicit evidence; a software stand-in or post-ack force-stop
does not establish it. An additional testable emulator may be used for controlled
SQL fault injection; do not confuse that with a natural hardware/power failure.

## Still open

Durable draft-note/quick-capture voice targets, active/pre-journal/source-cache
interruption, full ordinary-write/editor/photo exclusion from restore, old empty
orphan cleanup, raw manual forms, original-before-crop, physical phone and broader
clinical workflows. Do not declare the whole platform or voice recovery complete.
