# 0.11.15 validation

Bounded observation-mutation and inline-form fixes, plus a smaller existing media
layout. Version 0.11.15 / Android code 31. This does not complete raw-form autosave
or recording/restore interruption recovery.

## Reproductions and software evidence

- Real migrated SQLite witnesses reproduced readings/updates accepted for deleted
  patients, wrong-patient/deleted encounters and overlapping clears that left an
  empty observation. Validation and writes now share one synchronous transaction.
  Explicit live historical encounters and explicit null remain supported.
- Real inline-form callbacks reproduced rapid duplicate Save, stale same-event
  input, whole-form overwrite of an unrelated newer value and normalization of an
  untouched note. Latest-input refs, a synchronous submit guard and local-field
  patches now cover those cases.
- Original-reading comparison refuses a changed patched field, either half of a
  patched BP pair, measured time or encounter. Conflict feedback keeps entered
  text. Runtime unexpected patch keys are rejected. Repeated soft deletion and
  empty patches do not report a mutation audit.
- Read failures expose retry and retain loaded editor text without an unreliable
  count or a false successful-empty message. Invalid visible time does not publish
  an old parsed time; the final valid time is used even in the same event turn.
- The photo-empty illustration/paragraph became a short caption; the existing
  recorder is before the voice list. There is no new route, menu, permission,
  dependency, schema, clinical threshold or backup/passphrase-format change.

`npm run check` passed: 96 suites / 1204 app tests and 3 workflow tests,
with typecheck, lint and formatting passing. Migration generation reports 41
tables and no schema change. Permanent vitals tests run against migrated SQLite;
form tests invoke actual editor callbacks with stand-in widgets/native modules.
These are not native touch, storage-failure or clinical-validation evidence.

## Native and artifact gates

Pending for this source. The currently installed isolated emulator is 0.11.14;
its previous evidence must not be counted as 0.11.15 acceptance. Build both intended
ABIs, inspect essential libraries/version/signature, upgrade without app-data reset,
compare the installed APK hash, and test create/edit/partial BP/time/invalid input,
chart, soft delete and the compact media controls before recording native results.

## Still open

- Unsubmitted vitals form text is still volatile; no crash-recoverable raw draft
  or navigation/background autosave was added in this slice.
- Permanent observation-field history, other manual forms, ordinary writes and
  stale editors versus restore, persistent stopped-voice operations and original
  capture before crop remain separate work.
- Physical-phone, power/low-space/process-death-before-commit and complete clinical
  workflow/performance/clinical-tool acceptance are not established.
