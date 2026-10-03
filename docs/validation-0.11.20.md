# Validation scope: 0.11.20

Version 0.11.20 / Android code 36 excludes whole photo jobs from file maintenance.
It also contains lab-picker rejection, guards duplicate lab chooser callbacks,
and checks live targets before expensive work. No schema, dependency, permission,
archive, key scheme or new route changes.

## Reproduction and software evidence

The initial two targeted suites had 10 failures and four passes on the previous
source. Review identified a witness-cleanup weakness; pending operations now
settle in `finally` even when an assertion fails. A new real-SQL wrapper pauses
metadata acknowledgement after its insert. The finalized 15 cases were rerun
against the unmodified `a78215c` photo/lab handlers: 11 failures, four passes.
The current handlers passed all 15 cases. The source baseline was restored in
`finally`; no build/native QA overlapped that probe.

Cases cover reservation before camera permission/picker, denied permission,
cancel, direct multi-photo storage, captured target/source values, rejection
before native work during maintenance, retired targets, picker/copy/SQL failure
release, and retained exclusion after SQL commit while acknowledgement is pending.
The actual lab button callback covers its picker/panel/attachment sequence,
visible picker failure, busy refusal, cancellation and duplicate callback.
The live-query stand-in is synchronous: this is callback/query evidence, not
native picker or refresh/render timing evidence. Native calls are stand-ins;
metadata and patient/panel queries run against the real migrated database.

The first full check caught a test fixture's overly broad MIME string type; its
typed return now preserves the native `image/jpeg` contract. The final full gate,
including a subsequently corrected test formatting issue, passed typecheck, lint,
formatting, 103 suites / 1317 app tests and all three workflow tests. A test-only
import-order warning was corrected before the final normal push gate.
The normal source push repeated the full gate without lint warnings. Exact
application commit `af117a61cd2fafd36d038f22e6d1672c590ff0b5` passed hosted CI
[37135424428](https://github.com/CodeinScrubs/medos/actions/runs/37135424428):
install, full check, unchanged regenerated migrations and Android bundle export.
Read-only reviewers found no source blocker; they ran no tests/build/native tools.

## Signed artifacts

Both packages were built from `af117a6` after source changes stopped. The arm64
build completed in 9m54s; the separate x86_64 app-clean build completed in 6m44s.
Native library/ABI inspection and signature verification passed. Both packages
have version/code 0.11.20/36, min SDK 24, target SDK 36 and release certificate
SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/MedOS-0.11.20.apk`, arm64 only | 52,830,655 | `eaaa684e6f586fc26d2d5f09492fcadea959d0acce31249c65b0d40760c1d94a` |
| Private emulator APK, x86_64 only | 54,438,982 | `33ea702cc4ef0ce094ae9c7bc98beb2fb0f46b2181ec7434370bbdb2523e76ef` |

The isolated modern emulator was upgraded with `-r`, without clearing app data.
Its installed base APK was pulled and matched the inspected x86_64 package hash.
The emulator remained in airplane mode; no physical phone was used.

## Bounded native photo and preservation evidence

The real lab-sheet button opened the native source chooser and photo picker.
Cancelling the picker returned to the unchanged empty-lab state, and a subsequent
full SAF backup succeeded with destination-content verification. Independent
Node AES-GCM decryption authenticated all seven chunks of the 6,474,457-byte
archive. Real SQLite comparisons against the accepted 0.11.19 archive preserved
all **39 application tables exactly**, all 14 old attachments, both recording
jobs and all 15 media paths/sizes/hashes. Audit, backup-run, device-setting and
migration bookkeeping tables were explicitly excluded. No empty panel was added.

An existing public app icon was then seeded as a synthetic gallery fixture, with
no patient content. The real clinical-photo chooser selected that file through
the native picker and its Add button. Full SAF backup succeeded after publication.
Its 6,514,897-byte archive independently authenticated all seven chunks and had
valid SQLite integrity with no foreign-key violations. All 38 other application
tables and every old attachment row were exactly retained; the only added row
was one live clinical photo bound to the intended patient. All old media matched;
the only three added files were that photo's display JPEG, thumbnail and original.

The original PNG was exactly the source's 16,704 bytes and SHA-256
`cb47b52acae10696a0c71126fa0155f0998733997285b3230853a6822fc94fe1`.
The display JPEG was 1024x1024, the thumbnail JPEG 360x360, and all three images
fully decoded independently with FFmpeg. All 14 prior referenced voices also
fully decoded with unchanged bytes, including the original imported WAV.
The patient/media route reopened after force-stop; its application crash buffer
was empty. This does not prove natural power-loss or physical-camera behavior.

A controlled deeplink probe brought the app forward from another open native
picker and permitted a backup; it did not demonstrate a still-active overlapping
picker reservation. Do not count it as native busy-refusal evidence. Deferred
permission/picker/storage/metadata exclusion is established by the software
witnesses, not by that probe.

Private archives, SQL/media comparisons, audio/image decode results and native
hierarchies remain under `private/validation-0.11.20/`. The modern emulator's
cold boot showed a System UI nonresponse dialog; waiting let the app flow proceed.
That was recorded separately from MedOS crashes. Direct `apksigner` initially
failed for missing Java; using the repository's `android-env.js` verified both
packages. Generated prebuild cleared build junctions; the known QA cache links
were recreated before building. No app data, source or signing material was removed.

## Remaining work

0.11.19 actual API 26 old/current SAF restore and exact modern preservation are
recorded in [validation-0.11.19.md](validation-0.11.19.md). The current bounded
native photo acceptance does not replace those restore or interruption gates.

Still open: physical phone, camera/permission denial, broader picker lifecycle
and native held-picker overlap refusal,
durable photo interruption/recovery, empty panel after photo-storage failure,
original-before-crop, ordinary clinical writes during restore, and stale loaded
editors after dataset replacement. A temporary file busy check is not a dataset
generation fence. Draft/quick-capture voice targets and broader clinical/manual
form/performance gates remain in `IMPLEMENTATION.md`.
