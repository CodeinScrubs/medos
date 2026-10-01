# 0.11.14 validation

This is a bounded stopped-voice handoff fix, not completion of the media or
restore-concurrency requirements. Version 0.11.14 / Android code 30.

## Behavior and software evidence

- Previously reproduced: moving a recorder's cache source before SQL publication
  consumed the retry source; deleted/wrong/missing clinical attachment targets were
  accepted. Permanent migrated-SQLite and file-contract tests now cover these cases.
- A stopped recording is copied once per retained object, source/destination lengths
  are compared, and the source is kept. SQL failure retries the same staged file;
  simultaneous/replayed acknowledgement creates one attachment. Copy failure/invalid
  size does not count as success. Publication checks current target/patient ownership.
- Recorder handlers await metadata/draft acknowledgement, keep failed work visible,
  serialize permission/start/stop and register with one screen save group. Handler
  tests cover delayed/failed acknowledgement, Back/tab-style flush, audio housekeeping
  failure, native stop/URI failure, concurrent text failure and post-ack navigation.
- Real editor callbacks cover failed note-draft persistence, failed capture-kind
  mutation, one-file retry, atomic note publication and refusal of retired targets.
  Capture kind/voice publication and patient/media reassignment are synchronous.
- Additional witnesses: a retired/mismatched draft formerly resolved without writing;
  capture reassignment formerly left media under the old patient; later draft updates
  replaced recorded time. Regressions cover refusal, rollback and timestamp preservation.
- Optional ISO time in existing draft-voice JSON preserves new recording time; old
  drafts retain their former fallback. No SQL migration, dependency, permission, route,
  menu, backup-format or passphrase-scheme change.
- The existing encounter-editor conflict test now pins fake system time to its
  mocked screen time. Its default real-time admission eventually became a future
  date for that screen, preventing the intended conflict assertion. This was a
  reproducible test-clock defect, not a changed encounter validation rule.

`npm run check` passed: 95 suites / 1178 app tests and 3 workflow tests,
with typecheck, lint and formatting green. Migration regeneration reported 41
tables and no schema change. Hosted CI, signed artifacts and native evidence are
pending; the preceding APK is not evidence for this source.

## Open acceptance gates

No new physical-phone evidence. Software uses native stand-ins; byte-length comparison
does not prove byte hashes, codec playback quality, power-loss durability or a complete
UI/hardware workflow. Staging and pending recorder state are process-local. Process
death before acknowledgement, durable orphan recovery, missing staged copies,
old-editor/restore-generation conflicts, ordinary writes/photo jobs versus restore,
full disk, microphone/phone interruptions and native failure injection remain open.

The earlier 0.11.13 recovery/backup evidence remains separate and pinned in
[validation-0.11.13.md](validation-0.11.13.md). Do not infer those results for this build.
