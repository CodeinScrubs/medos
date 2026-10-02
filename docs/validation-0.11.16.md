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
cleanup. Hosted CI and native/artifact gates are pending.

## Native and artifact gates

Pending for this source. Build intended arm64/x86_64 artifacts, inspect version,
essential libraries/signature/ABI, upgrade the owned emulator without resetting
data, compare its installed hash and review both chart date edges. Exercise
recording Stop/Back/tab change, playback, post-ack cold reopen and backup after
release. Do not claim a native concurrent-maintenance case unless both phases
are actually observed. A connected physical phone is not device acceptance.

## Still open

Persistent stopped-voice operation recovery and the empty unreferenced file found
in 0.11.15 are unresolved. This lease is process-local, not a crash journal.
Ordinary clinical writes, old editors and photo jobs versus restore, raw manual
form recovery, original-before-crop and complete clinical workflows remain open.
