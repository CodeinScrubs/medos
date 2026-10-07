# 0.11.27 — acknowledged consultation and faithful compact results

## Scope and baseline

Baseline is clean `466a1a886bba55b05defed59a1b741c7f7e21b5d` (0.11.26),
matching origin/main. Its exact-source CI `37573104289` was directly verified
completed/success. Standalone 0.11.26 native acceptance had not run before the
owner prioritized PR review; the 0.11.27 application retains that source slice.

The primary agent worked solo. No remote PR was merged, approved, closed or
commented on. Full five-PR findings, exact heads, evidence and product acceptance
criteria are in [project-audit-2026-10-07.md](project-audit-2026-10-07.md), with
synthetic repeatable review witnesses under `docs/reviews/2026-10-07`.
Private logs/native QA artifacts remain ignored under `private/validation-0.11.27`.

Production changes are deliberately small:

- Consult-answer routes ignore later taps/field changes only after acknowledged
  clinical publication. SQL failure still permits retry. Navigation failure is
  reported as a saved reply with failed return, not a failed clinical save. Keep
  the original generation lease and always-on exit guard, with acknowledged
  `acting.current = false` before navigation.
- Patient summary labs retain their recorded unit; missing units stay explicit.
  The row header identifies the latest sample, while results from older relative
  time groups show their own age. Values, flags, reference ranges and stored
  timestamps are unchanged. Existing held-order labels/overflow remain intact.
- Failed SMS/WhatsApp/Telegram opening asks the user to copy the message; it no
  longer asserts a clipboard copy that the helper never performed.

No new dependency, route, migration, permission, archive/key scheme, clinical
formula, telemetry or normal-path confirmation is added. Version is 0.11.27 /
Android code 43. Only the specified three lock version fields change.

## Reproduction and software checks

Eight new app tests cover acknowledged duplicate/late-input suppression,
separate navigation failure, real SQL publication failure/retry, recorded/missing
units, mixed-age laboratory values, and two external messenger failure messages.
They use real bundled migrations/SQLite for clinical state; navigation/linking
are stand-ins. An initial older-result assertion expected “2 days ago” instead
of the established relative-calendar wording. It was corrected to the existing
helper's “the day before yesterday”; assertions were not weakened to omit age.

The finalized pre-fix tests were then rerun in an isolated checkout on unchanged
0.11.26 production source: seven failed / thirteen passed / twenty total, with
no timeout or harness exception. After fixes all twenty passed in three suites,
including existing retry/restore/exit cases. No native outcome is inferred.

The published PR witness installer was also exercised on the unchanged local
integration. Initial missing/duplicate test imports were installer defects, not
PR evidence. Five fixture inputs also used `inpatient` instead of the actual
`admission` encounter kind. Both defects were corrected before the final mobile
TypeScript check passed and the selected run reproduced the same
24 failed / one passed / 22 skipped checks. A second installation refused
duplicates before writing. These fixtures stay outside ordinary app CI.

## Release gates

The final full `npm run check` passed: typecheck, lint with zero warnings,
formatting, 118 suites / 1515 app tests and three workflow tests. The complete
run is retained in `check-final-source.log`. The witness installer also passed
Node syntax checking and its isolated installation/refusal exercise. No
application source changes follow this gate before bundling.
The final checkout repeated the same full green result after native acceptance;
that run is retained in `check-final-checkout.log`.

A fresh GitHub `--state all` inventory confirmed exactly five open PRs, each at
the reviewed head above, with none merged. Remote main still matched `466a1a8`
before checkout. Application commit/CI, signed packages and native acceptance
are recorded below as they execute.

### Exact source and CI

Application source is `f6c9277f61d971771c55023b6bd36a8a7fa45885`. Its normal push
hook repeated the full check successfully. Exact-source GitHub run `37577506830`
was directly read as completed/success. Only audit, fixture and acceptance
documentation changes follow that application freeze; there is no later app edit
inside an already-started native build.

### Signed emulator package and upgrade

The x86_64 release built in 4m46s and passed essential native-library inspection,
signature verification and metadata inspection: `com.shayan.medos`, 0.11.27/code
43, min SDK 24, target SDK 36, x86_64 only. Artifact is ignored/private and never
copied to `dist/`:

- File: `MedOS-f6c9277-x86_64.apk`, 54,473,190 bytes.
- SHA-256: `05b81ac1387d8761b4144dcfe3f4a4db6c2086d5340432fff216e8f33071bdcf`.
- Certificate SHA-256: `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

The owned API 36.1 QA emulator upgraded 0.11.25/code 41 via `adb install --user
0 -r`, without uninstalling or clearing app data. The installed base APK was
pulled and its bytes/hash matched the inspected package. Airplane mode stayed
enabled with Wi-Fi/mobile data disabled throughout the following synthetic QA.
No physical phone was connected.

An actual full SAF export was independently authenticated/decoded using Node
AES-GCM and real SQLite. Comparing with the prior 0.11.25 fresh acceptance archive
preserved all 39 application tables exactly and all 18 media files byte-for-byte;
integrity was `ok`, foreign keys were clean. Audit, backup runs, device settings
and the migration ledger are explicitly excluded from clinical-table equality.
No additional media files were permitted. The upgraded archive SHA-256 is
`7551940adcb84263d636a554445082a6a189cec1565a417cdb0abeb9ad57a638`.

### Native actions and dataset replacement

The existing patient summary displayed the recorded `unit` beside the synthetic
flagged value and explicitly labeled the latest sample's Jalali date. Mixed-age
and absent-unit cases are covered by the real-SQL component tests; their native
display was not separately exercised in this bounded run.

A pending consultation was created using the inline native UI, then included in
a full baseline archive. An answer form was opened and both response/instruction
were typed and observed in fresh native XML. Restoring the baseline while that
form remained mounted retained both local inputs. Its old Publish displayed the
dataset-replaced refusal and kept the text. A subsequent independent full export
preserved all 39 baseline application tables and all 18 media files exactly,
with integrity/FKs clean; the restored consultation remained pending/unanswered.

Initial emulator startup had a system Digital Wellbeing ANR above the live app;
the observed Close app button dismissed that system dialog. An initial native
hierarchy connection timed out. During restore, three bounded UI-idle attempts
failed before a fresh dump showed the actual successful restore acknowledgment.
These were recorded as QA environment/tool limitations, not a failed restore or
an application crash.

After the retained old-input refusal was observed and independently checked, the
QA process was cold restarted. A fresh answer/instruction was entered, published
once and returned through the native exit guard. Another cold restart reopened
the consultation as answered/read-only with the exact recorded fields. Its full
archive independently showed one clinical answer row and one answered audit
event, empty retired draft fields, the expected search index and unchanged
identity/episode linkage. All 38 other application tables and all 18 media files
were exact; integrity/FKs were clean. Archive SHA-256:
`c6600d14ec976a681eae80e46a27c2482348ab67782835e162b23e9486a494c7`.

The bounded final crash buffer was empty and the application process was alive.
Observed default-font/light-theme reply layout was also inspected in a native
screenshot. Same-turn duplicate-tap suppression, SQL-failure retry and failed
navigation are software tests, not separate native fault injection. This run
does not claim recovery of unacknowledged old input across process death.
The owned emulator was stopped after QA. The separate owner-ABI package
inspection is recorded below.

### Owner package

`npm run apk` built successfully in 1m28s from the same frozen application
source. Its ABI switch back from x86_64 passed the script's native-library check;
explicit inspection also verified essential libraries, signature, package id,
version/code and arm64-only metadata. File: `dist/MedOS-0.11.27.apk`.

- Size: 52,864,863 bytes.
- SHA-256: `f79dfb52f35c6638103b2c475c66f83ced7c1b03f2d8df4f91902fc49abce8bc`.
- Certificate is the same verified release certificate as the emulator package.

This is an inspected owner-compatible artifact, not a physical-phone run. No
physical phone was connected or installed during this session. Gradle reports
existing future-Gradle-10 deprecations; the current build completed successfully.
Dependency advisory triage is separately documented in the project audit and
IMPLEMENTATION; no dependency fix is included or falsely marked complete here.

## Remaining limits

This release does not adopt the proposed AI/referral/round/autocomplete features
as a group. It does not establish 40-patient speed, whole-product completion,
arbitrary prose anonymization, clinical content validation, actual message/alarm
delivery or physical-phone acceptance. Durable stopped-voice publication for
capture/new-note drafts, other raw recovery, interruption/low-space restore and
the complete workflow gates remain open in IMPLEMENTATION and the audit.
