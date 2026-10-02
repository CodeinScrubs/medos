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

Application source is `07348b548e2c41c51aa5e18d605e04eaee326873`.
[Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36984708901)
succeeded; its head SHA was checked. The pre-push full check passed but emitted
a worker teardown warning. A subsequent full in-band `--detectOpenHandles` run
passed all 1204 tests without an open-handle report. This does not identify the
warning's cause.

## Native and artifact gates

Both APKs use the frozen application source above. No application source changed
during either build. Documentation and ignored private QA files are separate.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.15.apk`, arm64-v8a | 52,798,955 | `b2dbe5eea0cdceafa08f772240a4af84d1ed8a3e7378113f31950539bf163e15` |
| Isolated emulator package, x86_64 | 54,407,282 | `8c30ade8a0353071cfae14b68b5ec3510ed198202365477894b27c8227878763` |

- Owner build succeeded in 12 minutes 9 seconds; emulator build in 5 minutes
  15 seconds. Actual version/code, single intended ABI and essential native
  libraries passed. Signature verification passed with the existing certificate
  SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- The x86_64 APK upgraded 0.11.14 using `adb install --user 0 -r`. No uninstall
  or application-data reset. The pulled installed base APK hashes exactly to the
  checked emulator artifact. Existing generated build-output junctions were restored
  after Expo regenerated Android; cache directory names are not source identity.

## Bounded native and archive evidence

One owned isolated Android 16 / API 36.1 x86_64 emulator, airplane mode,
Tehran time zone and three-button navigation. All records are synthetic. Actions
use fresh native XML bounds. Software callback tests and native acceptance remain
distinct. No physical phone was connected.

- Created a systolic-only `140/` reading with pulse 81, temperature 37.2 and
  SpO2 97 at an explicitly selected previous-day 08:15. Successful publication
  closed the editor. Force-stop/cold reopen retained it. Editing pulse to 90
  preserved partial BP, temperature, SpO2 and measurement time.
- Invalid BP text stayed in the form with its field error. Correcting BP and
  entering `13:99` refused publication with explicit feedback. Cancel left
  neither invalid draft as a clinical observation. A second pulse reading showed
  the pulse series; long press and confirmed deletion hid that reading.
- Screenshot review found the final chart date clipped at the SVG boundary;
  all date labels currently use a middle anchor. Dense trailing labels also need
  spacing acceptance. Chart layout is therefore not fully accepted yet.
- Empty photos use the short caption and the recorder appears before existing
  voice rows. Playback entered the playing state and stopped. Recording followed
  by Back reached Today; reopening confirmed one added voice before force-stop.
  Subsequent cold reopening retained eight voice attachments.
- A separate early force-stop immediately after recording Back, before observing
  acknowledgement, did not add metadata. The archive includes one new empty,
  unreferenced M4A file. The interruption stage was not pinned; this is not a
  passing recovery case. Persistent stopped-operation recovery and the active
  recording-versus-maintenance gap remain open.
- Bounded font-scale 1.6/dark checks found the recorder in the scrollable media
  page and enabled edit Save/Cancel controls above the navigation bar. Cancel
  succeeded. This is not complete accessibility or all-keyboard acceptance.

The actual SAF full backup reported destination-content verification. Independently
decoded archive: 4,067,359 bytes, SHA-256
`2ca3d6be6bc03d0647f79c74590250ceb0155f98d6e632986dbf124e926501d1`.
All four chunks authenticate; framing/EOF and entry checks pass, SQLite integrity
is `ok` and foreign-key checks are empty.

- SQL checks confirm one live corrected reading and one soft-deleted reading,
  correct patient, no invalid-input reading, null diastolic, unchanged temperature/
  SpO2, null encounter and measurement time `2026-10-01T04:45:00Z` (08:15 Tehran).
  Correction/deletion audit entries exist.
- All 36 unchanged application tables match the preceding published 0.11.14
  archive exactly; all seven original attachment rows and original media bytes
  remain unchanged. There is one new acknowledged attachment. All eight referenced
  audio files pass independent full FFmpeg decoding and duration/metadata checks.
- There are nine archived media entries because the early interrupted attempt left
  the empty unreferenced file described above. It is not playable and is not a
  patient attachment. Do not treat archive authentication as voice recovery.

## Still open

- Unsubmitted vitals form text is still volatile; no crash-recoverable raw draft
  or navigation/background autosave was added in this slice.
- Permanent observation-field history, other manual forms, ordinary writes and
  stale editors versus restore, persistent stopped-voice operations and original
  capture before crop remain separate work.
- Physical-phone, power/low-space/process-death-before-commit and complete clinical
  workflow/performance/clinical-tool acceptance are not established.
