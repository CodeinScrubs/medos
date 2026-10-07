# 0.11.28 — patient overview read truth and coherent order scope

## Scope and baseline

The owner repeated the all-PR/project review request. Clean main was
`a3136e764bda4cf0fc793e0fd72e0a19c3a1e32d`, version 0.11.27 / code 43.
Fresh `git fetch` and GitHub inventory found the same five open, unmerged heads
listed in [project-audit-2026-10-07.md](project-audit-2026-10-07.md).
Exact-main CI `37583735329` was completed/success. Their previous block/revise
dispositions remain; no remote merge, approval, closure, comment or message was
performed. The previous 24 failed PR checks are not recounted as new findings.

The unchanged source passed `npm run check`: 118 suites / 1515 app tests,
three workflow tests, typecheck, lint and formatting. Work was performed solo.

## Finalized defect witnesses

Before production changes, the corrected probes typechecked and the existing
read-error suite produced **16 failed / 27 passed** checks. All new failures were
assertions about observable behavior, not runtime/test-harness exceptions:

- Cached-empty follow-up/contact/diagnosis/consult refresh failure still claimed
  absence; unloaded reads claimed zero. These four paths need retry and retain
  available clinical input/rows rather than looking successfully empty.
- Loaded follow-ups and contacts lacked their independent failure feedback.
- Admission loading/failure offered new admission as though absence was known;
  loaded admission refresh failure had no warning/retry.
- Admission elapsed time used the wall clock directly rather than the shared
  live clock. Advancing the screen clock did not update its duration.
- Important-note failure had no local warning; partially typed impression could
  not be explicitly recovered through the existing error notice's absent retry.
- Snapshot encounter failure was omitted entirely; order failure had no retry.

Sixteen checks are **not sixteen independent bugs**; several pin the same
read-state defect. The stand-in now propagates failures to real joined queries,
so timeline retry expects both the panel and joined-value reads to recover.
An initial fixture used invalid follow-up channel `phone` instead of `call`,
and a nullable timestamp assertion needed narrowing. Both were corrected before
the cited typecheck/red run; neither is a production defect. The clock assertion
uses exact text rather than a substring that could match a different duration.

## Resulting change

- Existing overview/diagnosis/consult sections expose retry only on failure,
  keep loaded rows and editor input, and suppress unreliable totals/empty claims.
- Admission display uses `useNow`; no admission timestamp or medication-day
  semantics change.
- Snapshot orders use `patientCurrentOrdersQuery`: one SQLite statement reuses
  current encounter selection, includes standing/current episode orders, omits
  previous/foreign/deleted episodes and watches the real encounter table.
  The explicit historical-episode query is unchanged.
- Cached snapshot data remain visible with warning, without a current order total
  or unflagged-lab success claim while that source failed. Retry targets only
  failed reads. No additional patient navigation/removal guard is introduced.
- Version 0.11.28 / code 44; no schema, migration, dependency, backup format,
  permission, clinical formula, telemetry or new normal-path dialog.
- Correct architecture's blanket portability claim: native id/crypto bindings
  require an adapter in a future runtime; a folder boundary is not proof of
  unchanged web reuse.

## Software and release gates

The first post-fix targeted run passed 53 checks across the read-error/snapshot
suites and typecheck. Two additional cache/retry regressions were then added.
Full final check, source commit, exact-source CI and signed/native evidence are
recorded separately. Final `npm run check` passed on the finalized source:
typecheck, lint with zero warnings, formatting, 118 suites / 1536 app tests and
three workflow tests. The 21 added checks cover read recovery, cached failures,
episode scope and encounter-event refresh. No test timeout was increased.
Application source is `1165e525daad58ed8c08bffb3a23673c0f0ed96b`.
The normal pre-push hook repeated the complete check successfully. Exact-source
[CI 37599737521](https://github.com/CodeinScrubs/medos/actions/runs/37599737521)
completed/success, including clean installation, migration regeneration and
Android bundle. Signed/native evidence is recorded separately below; it is not
inferred from the software checks or CI.

Private test evidence is under `private/overview-*` and
`private/check-review-refresh-2026-10-07.log`. Only synthetic records are used.

## Signed owner artifact

Frozen application source `1165e52` built with `npm run apk`, which regenerated
the generated Android directory; the full arm64 build completed in 12m 53s.
Only documentation changed after source freeze. APK inspection confirmed
`com.shayan.medos`, 0.11.28 / code 44, minimum API 24, target API 36 and arm64-v8a
only. Essential native libraries and the actual APK signature were checked.
The signer certificate matches 0.11.27; uninstalling is unnecessary for upgrade.
This is artifact evidence, not physical-phone execution.

- File: `dist/MedOS-0.11.28.apk`; size: 52,866,715 bytes.
- SHA-256: `05990a29bc1de00b3a484995477fb8652841ec4a3e9db329e931377c826ec925`.
- Signer certificate SHA-256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

## Emulator artifact and bounded offline acceptance

The x86_64 build from the same frozen source completed in 5m 8s. Actual package
inspection confirmed x86_64 only, version/code 0.11.28 / 44, required native
libraries and the same verified signer certificate. Its private QA copy is
54,475,042 bytes, SHA-256
`c8232c9cd7a6f20e3eacf5d5165863eeb96498f594a5d2b55a9931fdc243f334`.
The emulator binary was not placed in `dist/`; the arm64 owner artifact's hash
and size were checked again after both builds.

Use of the owned API 36.1 AVD was isolated to serial `emulator-5556`. Only
synthetic records were used. Airplane mode was verified and Wi-Fi/mobile data
disabled. UI actions used observed, fresh hierarchy bounds. No app data were
cleared or uninstalled, and no physical phone was attached.

1. Export a fresh full backup from installed 0.11.27 before any test writes.
   Independently authenticate/decrypt the archive with Node's AES-GCM/scrypt,
   then check real SQLite integrity and foreign keys.
2. Upgrade offline with `adb install --user 0 -r`. Verify installed version/code,
   pull the installed `base.apk` and match its hash exactly to the inspected
   x86_64 artifact. Cold-open the existing patient; its recorded lab value,
   H flag, unit and specimen date are visible.
3. Export a full backup before additional fixtures. Independent comparison
   preserves **all 39 application tables and 18 media files exactly**, including
   original file hashes. Four operational tables are excluded from row equality:
   `audit_log`, `backup_runs`, `settings`, `__drizzle_migrations`. Migration count
   stays 21; integrity is `ok`, with zero foreign-key violations.
4. Through native forms create one standing order, episode A and its order,
   then episode B. After B is saved, the overview keeps the standing order,
   omits A's order and shows one current order. Add B's order: the overview
   shows standing + B, omits A and shows two current orders. The observed
   snapshot link opens the corresponding kardex in **one tap**.
5. Force-stop and cold-reopen. The same two-order scope and count remain.
   Independently decode a final full archive: two new episodes and three orders
   have exactly the intended relationships. A is closed, B active; A's order
   remains active in SQLite, proving omission was episode ownership rather than
   stopping/deleting it. Across 39 tables, 127 original rows remain exactly
   unchanged; the original patient's only changes are expected status, search
   index and update timestamp. All 18 original media hashes remain identical;
   SQLite integrity/foreign keys pass again.

The upgrade archives' SHA-256 hashes are
`64e87c900e4c81d61aed199e447313a3dfcbd089295a0aa1ecef753fefa77754`
(before) and
`575da4be3db424181d7b523cd1ea86882f94e6972b8a33fd7693e04faf256b2e`
(after, before fixtures). The final scope archive is
`868e25b97f35cf1f56bed7270a8c2f15640b09e0aae1c9ce70dd61955f8a8fad`.
Private evidence: `private/validation-0.11.28/`, including fresh XML/screenshots,
`preservation-result.json`, `native-scope-result.json`, independent decoded
archives and build/log records. No decoded records or test media are committed.

The initial pre-upgrade hierarchy was blank under concurrent compilation; the
emulator was stopped until both builds finished. On the controlled cold boot,
Android's **System UI**, not MedOS, showed an ANR dialog on 0.11.27; selecting its
observed Wait action allowed the patient view and fresh baseline export. Empty
immediate cold-start hierarchies are not accepted screens or timing evidence.
The final crash buffer was empty and the bounded final log scan found no fatal
exception/signal or MedOS ANR. This is not an exhaustive crash-free guarantee.
The owned emulator was stopped afterward without clearing its data.

## Not established

No physical-phone run, 40-patient timing, whole-shift paper replacement,
message/alarm delivery, native SQL failure injection, process-death/low-space
matrix, clinical validation or competitor advantage is proved by these tests.
The native scenario establishes current-episode projection and cold persistence;
the software encounter-event test separately pins joined-table observation.
Stopped voices for new drafts/captures, broader manual raw-field recovery,
reordering/trash/moves, rich text, direct workbook import, transcription/semantic
retrieval and dependency-advisory triage remain in IMPLEMENTATION. No dependency
advisory was repaired in this slice.
