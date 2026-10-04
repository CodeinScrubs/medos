# 0.11.23 — Explicit patient workspace renewal and manual clinical intents

Status: software, signed artifacts and bounded native renewal/preservation gates
passed. Physical-phone and broader feature acceptance remain separate gates.

## Scope and regression evidence

The accepted 0.11.22 native session reproduced a patient root retained under the
backup page rejecting its header Edit after restore. Its old AutosaveScope correctly
refused the old generation, but the user had no direct way to begin fresh work.
The direct URL-tab effect also bypassed that scope. A restore omitting the patient
unmounted raw child forms immediately.

On pinned application source `90a6f47`, 16 new handler witnesses failed:
three actual vital-form cases, seven diagnosis cases with the actual PromptModal
and real migrated SQLite, and six patient navigation/scope cases. No clinical SQL
results were substituted. The initial diagnosis harness lacked the keyboard
controller stand-in, and the header harness attempted a nested renderer before
commit; those harness errors were corrected before the recorded 16 failures.
Additional review cases cover prompt locking, kind capture, unmount, unseeded root
recovery and per-dialog rearming. These later cases were not all run on old source.

Changes:

- Retain the last non-stale patient snapshot. A stale-only notice and one renewal
  action also appear in loading/error/not-found branches. Never infer clean local
  input from SaveGroup.unsaved; raw vitals/diagnoses are not registered there.
- Renewal requires explicit review/copy or Start fresh. A per-dialog token,
  captured replacement generation, mounted/focus checks and originating route/
  navigator keys guard confirmation. Targeted REPLACE creates a fresh route through
  the old always-on removal guard; no in-route guard remount or token rebasing.
- URL-tab changes call scope.canLeave, including its post-flush generation check.
  Scope.perform holds admitted write ownership through the awaited action.
- Vital save/delete and diagnosis add/correction/status/delete carry their original
  generation, including confirmations held across replacement and remount.
- Diagnosis Add captures latest text/kind and suppresses duplicate submission.
  Correction closes its actual prompt only after acknowledgment. Pending input,
  dismissal and repeat submit are locked; SQL/stale failure keeps corrected text.
- Version 0.11.23 / code 39. No new dependency, route, permission, migration,
  clinical formula or archive/key scheme.

## Verification limits

The root test mocks navigation and manually mounts the replacement; it proves
retention, callback ownership and fresh intent creation on remount, not native
REPLACE/guard replay or header safety. Actual vital/diagnosis handler tests use
SQLite imported through the real replacement capability, not an in-memory row
substitute. SQL failure injection is software evidence, not native disk failure.

One first full run passed 1374 tests and timed out a new diagnosis test at Jest's
5-second cold-worker limit. The actual-Modal/SQLite file now has a bounded 15-second
budget; no global timeout or worker increase. Import-order warnings were fixed only
in edited files. Final gates and exact signed/native evidence belong below once run.

Other manual patient actions and raw-draft load/comparison/discard callbacks still
need immutable tokens. Retained input is not crash recovery. Durable stopped voices
for capture/note drafts, physical-phone acceptance, power/low-space interruption,
large-dataset performance and validated clinical tools remain separate work.

## Final software gates

- `npm run check`: typecheck, lint without warnings, formatting, 109 suites /
  1378 application tests plus 3 workflow tests passed.
- Four targeted handler suites: 41 tests passed. Sixteen original witnesses were
  red on `90a6f47`; later review cases are separately described above.
- `git diff --check` passed. Package-lock edits change only its three application
  version fields. Generated native code and signing material are not committed.
- Two independent source reviews completed. The first found per-dialog ownership
  and unseeded-recovery gaps; both were corrected and reviewed again. Neither
  reviewer ran tests, builds or native tools; this is source review, not acceptance.
- Typecheck also caught the navigation state being optional; recovery now refuses
  an unavailable navigator rather than dereferencing it. This is distinct from the
  earlier cold-worker timeout and its bounded test-file budget.

## Exact-source native acceptance — 2026-10-04

Application source was frozen at `645a2f37332498f89c0e86cd3cc1c541faefb025`.
Hosted CI `37156228486` passed, including migration regeneration and Android
export. No application source was edited during the signed builds.

The signed x86_64 package was inspected before upgrading the isolated retained
Android 36.1 AVD on `emulator-5556` with `adb install --user 0 -r`. Version
0.11.23 / code 39, min SDK 24 / target 36, required native libraries and the
existing release certificate were checked. The pulled installed base APK hash
matched the inspected artifact. The device's connectivity command reported
airplane mode enabled; the shell's attempted airplane broadcast was refused,
so that broadcast is not evidence of offline state.

Actual native sequence, using only synthetic records and observed hierarchy bounds:

1. Enter an unsaved pulse of 81 on the patient root, then push the backup route.
2. Select the accepted 0.11.22 SAF archive, verifying its device SHA-256 before
   selection. Restore with the synthetic QA passphrase; the native result reports
   one patient and 18 files.
3. Return to the retained root. Its actual field still contains 81. Save refuses
   the stale intent and shows the dataset-changed explanation; dismissal retains
   81. The root offers Start fresh.
4. Cancel renewal with Review writings: 81 remains. Reopen and confirm Start
   fresh: targeted native replacement removes the old form and stale notice.
5. The fresh root's header Edit opens the real patient editor; Back returns safely.
6. Produce a full SAF backup before any fresh clinical mutation. An independent
   Node AES-GCM/scrypt decoder authenticates all seven chunks. Compare all 39
   application tables and all 18 media entries against the accepted source:
   every compared row, timestamp, version and file hash matches exactly. SQLite
   integrity is `ok` and foreign-key checks are empty. Audit/backup bookkeeping,
   device settings and migration bookkeeping are explicitly excluded; no reminder
   repair allowance was needed. The 14 voice attachment rows are preserved, not
   a claim that every historical QA recording is playable.
7. After that preservation export, create a fresh pulse of 82 successfully.
   Force-stop/reopen the app and observe the saved 82. This deliberate later
   mutation is outside the unchanged-data comparison in step 6.

The final application crash buffer was empty. Cold emulator boot initially showed
Digital Wellbeing and System UI ANRs; these were dismissed before acceptance,
and are not reported as MedOS crashes. Two busy restore hierarchy reads could
not reach idle; a later hierarchy confirmed completion. A fast-dump helper also
failed one pull; no result was inferred from that failure.

Private logs, synthetic archives, XML, screenshots and comparison scripts remain
under `private/validation-0.11.23/`; they are not public application assets.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Signed x86_64 QA APK | 54,456,198 | `c26b37ed1dbee0de4faac4b633d3023828d9c79cf240a3ebb8bccc53e5f3475c` |
| Signed arm64 owner APK, `dist/MedOS-0.11.23.apk` | 52,847,871 | `10a1069166d0d9766c26f42fc5ca6141eaf60b34b97530a6d0738d448ad66a6c` |
| Source 0.11.22 SAF archive | 6,518,993 | `ad08313b9e0672f8190f98e4c8fe69688b3310aca26d1726d5836160e0b425a2` |
| 0.11.23 preservation export | 6,518,993 | `06dc816ba7836d4ed9f748c45e76c6e87f54c27bc62ff8375cef33216c617d81` |

`npm run apk` completed the arm64 build in 5 min 22 s after the emulator was
stopped. Its actual package/version/ABI and essential libraries passed inspection;
APK signature v2 verified with the same release certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
Only the version/code stamp changed in generated native configuration; there was
no full clean prebuild. Build/toolchain warnings about CMake path length, Gradle
deprecations and the signature tool's Java native access were recorded, not treated
as application failures or silently hidden. The owner package was not installed
on a physical phone.

This is bounded modern-emulator acceptance of renewal and vital intent fencing.
It does not establish physical-phone/API 26 UI behavior, native diagnosis-prompt
failure recovery, every patient mutation, power-loss durability or full-product
completion. Remaining work listed above is still open.
