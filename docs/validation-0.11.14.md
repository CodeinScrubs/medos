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
tables and no schema change. Application source is
`1a7d6d9a7cb8e208f08900be59722819d9cc71f1`.
[Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36935106084)
succeeded; its head SHA was checked. A fresh full local check also passed after
native verification. An earlier pre-push run reported a worker teardown warning;
the full in-band `--detectOpenHandles` run passed without an open-handle report.
That diagnostic did not establish the warning's cause.

## Signed artifacts

Both builds use the frozen application source above. Documentation and ignored
private probes do not change the application bundle.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.14.apk`, arm64-v8a | 52,796,163 | `ccfe493c3560192c0c03f20450226ab04e4712cf5e332138f3d210622b24d404` |
| Isolated emulator package, x86_64 | 54,404,490 | `950773aca3fd995833ff3ec6d5c09dc7bbcfc71a0ac6d302cf3bf955e7376c5c` |

- Owner build succeeded in 17 minutes 12 seconds; emulator build in 4 minutes
  49 seconds. Actual version/code, single intended ABI and essential native
  libraries passed. Signature verification passed with the preceding certificate
  SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- The x86_64 package upgraded 0.11.13 with `adb install --user 0 -r`, preserving
  app data. The pulled installed base APK hashes exactly to that emulator artifact.
  Generated build-output junctions were retained; no application data reset.

## Bounded native recording protocol

One owned isolated Android 16 / API 36.1 x86_64 emulator, airplane mode, Tehran
time zone, three-button navigation and baseline font/light theme. All input is
synthetic. UI actions use fresh native XML bounds; no guessed screenshot taps.

- Upgrade retained the original imported WAV. First microphone denial showed
  an error and kept the count unchanged; retry requested permission again.
- Patient recording: hardware Back while recording stopped and persisted one
  voice before leaving. A later manual stop saved another; actual playback
  entered its playing/elapsed state. Switching the patient tab while recording
  stopped and persisted the third. Force-stop/cold reopen retained all three.
- New note: recording followed by Back and force-stop recovered the exact
  title and one unpublished draft voice. Existing-note recording/manual stop
  similarly recovered its one draft voice without publishing a note edit.
- Quick capture with text and voice returned once to its patient parent after
  acknowledgement. Its text, capture kind and attachment survived cold reopening.
  The resulting archive contains six live voice attachments and one draft voice,
  with no duplicate referenced path.
- Independent FFmpeg full decoding and FFprobe inspection passed for all seven
  audio files. Six new AAC files have positive duration; recorded metadata differs
  from decoded duration by at most 61 ms. The old imported WAV has unknown duration
  metadata, which remains null rather than being inferred as zero.

These are native recorder/codec/state checks with emulator audio. They do not
measure physical microphone quality, intelligibility or call-recording behavior.

## Actual backup and restored publication

Full archives were created through the existing Android SAF folder, then pulled
for independent Node scrypt/AES-GCM decoding, framing/EOF, entry-length/hash,
SQLite integrity and foreign-key checks. All four chunks authenticate; integrity
returns `ok` and foreign-key checks are empty.

| Archive | Bytes | SHA-256 |
|---|---:|---|
| Current 0.11.14 | 4,041,098 | `3e371aef1492bc64881afbd59f565e7e44bc978616cd61140a33990c59167291` |
| Fresh backup after current restoration | 4,041,098 | `54ff5627eae6887c49efd928d44e7f1dd5ae42f8304dd784465c5a0f80c2f31b` |
| After explicit restored-draft publication | 4,049,290 | `d844c86bc398cb62378a31b882933fa301e8a7fffa588ee758f6558401a6b597` |

- A preceding 0.11.13 archive restored the older dataset. The emulator/ADB
  disappeared before its success dialog was observed. Restarting the same AVD
  without erasing data and taking a fresh backup confirmed all 38 non-audit/
  backup/settings application tables exactly matched that older archive.
  The original WAV matched too. Six newer, unreferenced files remained on disk;
  this restore does not prune media absent from the older archive.
- The disconnect's exact stage is unknown. This is evidence of the final older
  dataset, not a controlled interruption at the critical media-swap/SQL commit.
- Restoring the current archive showed the actual success dialog. Force-stop/
  cold opening recovered the exact unpublished title and draft voice; the patient
  media count returned to six. The fresh archive preserves all 38 application
  tables exactly and every one of the seven media entries (paths, sizes, hashes).
- Explicitly publishing the restored new-note draft produced one note, one
  version and one voice attachment. Independent SQLite checks confirm the draft
  retired and linked to that note, with its original captured time, duration,
  size and patient ownership preserved. Cold reopening showed the published note.
- The original 2,240,044-byte WAV remains SHA-256
  `9a25d920bbbb9dc8b37759cb2310f937fb04f1b5567ed6602b8ec8e57aca5cb6`.
  Private artifacts, XML/screenshots, archives, decoder/comparison/codec reports
  remain under ignored `private/validation-0.11.14/`.

Two QA issues were kept separate from product failures: cold System UI briefly
showed its own not-responding dialog and recovered after Wait; an initial fast
hierarchy runner reported success without writing XML. The helper requires an
actual fresh nonempty XML file, so that attempt did not count as a passing check.
The photo-empty illustration also consumes substantial space above existing
voices; compacting that verified layout is a remaining usability task.

## Open acceptance gates

No new physical-phone evidence. Software uses native stand-ins; the native cases
above use one small synthetic emulator dataset. The production copy gate checks
byte length, not a content hash. Independent archive/codec checks do not prove
microphone quality, power-loss durability or a complete UI/hardware workflow.
Staging and pending recorder state are process-local. Process
death before acknowledgement, durable orphan recovery, missing staged copies,
old-editor/restore-generation conflicts, ordinary writes/photo jobs versus restore,
full disk, microphone/phone interruptions and native failure injection remain open.

The earlier 0.11.13 recovery/backup evidence remains separate and pinned in
[validation-0.11.13.md](validation-0.11.13.md). Do not infer those results for this build.
