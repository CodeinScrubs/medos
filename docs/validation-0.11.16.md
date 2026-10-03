# Validation scope: 0.11.16

Application version 0.11.16 / Android code 32. This slice extends recording
lifecycle exclusion against backup/restore and corrects date labels on the existing
vitals/lab charts. No schema, archive/passphrase format, dependency or permission
change. Previous native evidence remains pinned to its own source/artifact.

## Reproduction and software checks

- Clean 0.11.15 baseline: full check passed 96 suites / 1204 app tests + 3 workflows.
- Corrected recorder witnesses: 10 failed / 11 passed before implementation.
  Maintenance could enter during permission, active recording, stop or pending
  acknowledgement; the old implementation also allowed delayed preparation after
  unmount. Earlier fixture cleanup failure is not product evidence.
- Fixed recorder/file-job/recording/backup tests: 4 suites / 67 tests passed.
  Coverage includes reservation before permission, maintenance-first refusal,
  permission/preparation failure release, failed stop/acknowledgement retry,
  explicit discard/short recording and delayed unmount cleanup.
- Chart witnesses: 7 failed before implementation. Centred endpoint dates exceeded
  the SVG width; dense final pairs overlapped and some series created six labels.
- Fixed chart component/pure sampling checks: 2 suites / 9 tests passed. Rendered
  stand-ins retain every point and require inward endpoints and label spacing;
  integer-index sampling is checked across sparse/dense phone/tablet widths.

The component tests invoke the real handlers with native/SVG stand-ins. They are
not native permission/audio-release/font measurements or crash-recovery evidence.
Full current-source `npm run check` passed 98 suites / 1229 app tests + 3 workflows,
including typecheck, lint and formatting. Final recorder cases also cover retained
start/retry handlers after actual unmount and failed in-flight acknowledgement
cleanup. Application source is `320407637f9e8060d9ce890e7ddb1984b7d33fb0`;
[its main-branch CI](https://github.com/CodeinScrubs/medos/actions/runs/37072631672)
completed successfully for that exact SHA.

## Native and artifact gates

Both artifacts were built after the source freeze, with no intervening source
edits. Required native-library checks and `apksigner verify` pass; package
`com.shayan.medos`, version 0.11.16 / code 32. Both have the existing signing
certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Owner APK, `dist/MedOS-0.11.16.apk`, arm64-v8a only | 52,801,627 | `372eeda4a3edeb8619f1f10b4ccc79d657299594a3397c8e65d4a028096faa5f` |
| Private emulator APK, x86_64 only | 54,409,954 | `17aaa90e3050966523d3796f7a6c2b87f1770294a149127e8c6bc96712d8d525` |

The owned isolated emulator was upgraded with `install --user 0 -r`, without
uninstalling or erasing its data. Pulling the installed base APK produced the
exact emulator-artifact hash above. Airplane mode remained enabled. No physical
phone was operated or accepted in this slice.

- Existing eight voices and previous live vital row remained visible. One new
  pulse-only measurement (95) produced two live measurements; cold reopening
  retained both old and new values and their respective timestamps.
- Native SVG screenshots at system font scales 1.0 and 1.6 show both complete
  Jalali endpoint dates inside the two-point pulse plot. Values/points remain
  unchanged. Dense native series and other device widths were not exercised.
- Manual Stop and changing patient tab during observed recording each
  acknowledged exactly one additional voice. After observing ten voices,
  force-stop/cold reopening retained ten. Native playback/Stop state was
  observed for a new voice; audibility through a physical microphone/speaker
  was not tested. This is post-ack persistence, not pre-ack crash recovery.
- A separate synthetic recording was observed before/after Home and foreground,
  then deliberately discarded, without adding attachment metadata. Original
  automatic-backup settings were restored.

The automatic-backup overlap probe is **inconclusive**. It delivered a new
archive, but archived SQL and fresh UI timestamps show it started at
13:57:22.664 and finished at 13:57:25.988 (device local time), before active
recording was observed at 13:57:28.281. A destination listing taken before
navigation cannot establish overlap with the later recording. This does not
close the native concurrent-maintenance gate or demonstrate a lock failure.

## Independent native archive verification

The subsequent manual full SAF backup reported byte-verified destination
delivery. The pulled archive is 4,384,647 bytes, SHA-256
`24e44e17ecf2f53209a62dace0feb485c5055034c25132d53ad68f0f71715c28`.
An independent Node scrypt/AES-GCM decoder authenticated all five chunks,
verified framing/EOF and entry lengths/hashes, then opened the actual archived
SQLite database: integrity `ok`, no foreign-key violations.

Against the accepted 0.11.15 archive, 36 other application tables, both old vital
rows (including the soft-deleted one), all eight old attachment rows and all nine
old media entries match exactly. There is exactly one new pulse-only vital row,
two new patient voice attachments and their two nonempty files. All ten referenced
voices fully decode with FFmpeg; measured duration is within one second of
metadata where metadata exists. The original imported WAV remains byte-identical.
The prior empty unreferenced M4A is retained; it is not claimed as playable audio.

Private helpers initially selected a loading UI frame before the voice query
settled and used `pulse` instead of the SQL column `heart_rate` in one assertion.
Fresh settled UI and the actual archived schema resolved those fixture errors;
they are not evidence of lost data. Emulator System UI ANRs occurred before app
interaction, including before this APK was installed, and were not counted as
application failures or acceptance. Reboots retained the emulator data.

## Still open

Persistent stopped-voice operation recovery and the empty unreferenced file found
in 0.11.15 are unresolved. This lease is process-local, not a crash journal.
Ordinary clinical writes, old editors and photo jobs versus restore, raw manual
form recovery, original-before-crop and complete clinical workflows remain open.

Installed `expo-audio` 57.0.5 has an additional stop-error contract to address:
Android `AudioRecorder.stopRecording()` catches `RuntimeException`, resets the
recorder, returns a Bundle without `url` and emits `RecordingStatus.hasError`
on the main queue. The JS Promise need not reject, and the cached URI can remain.
VoiceRecorder currently does not consume that terminal event. Thus rejected-stop
stand-ins do not cover every native failure; copying invalid nonempty bytes is
a conditional risk, not a device-reproduced error. Require native completion
confirmation before acknowledgement, and test failed/late/missing status paths
before claiming coverage. Power/low-space, native error injection, Back/gesture
exit and complete restore exclusion remain separate acceptance gates.
