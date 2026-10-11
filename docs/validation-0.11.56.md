# Clinical corrections and recoverable deletion — 0.11.56

This continuation is on `codex/clinical-history-recovery`, based on delivered
PR8 `faa7160`. Application version .56/code72. Evidence below distinguishes
software checks, older-source diagnostics, new native acceptance and phone work.
No existing PR was merged or rebased. Unrelated untracked audit files are retained.

## Implemented contract

- Additive `clinical_versions` and seven encounter-owner indexes. One synchronous
  wrapper retains patient/contact/encounter/diagnosis/vital/lab/imaging/order/
  consult/follow-up corrections with the feature mutation and required audit.
  Lab history includes the actual live result rows; note history remains separate.
- Preserve null/empty/false/zero, text whitespace and dates. No automatic pruning.
  First changes to old records retain a real baseline, without inventing earlier
  edits. Each record's sequence increases across same-ms/backward-clock edits;
  the global list still sorts recorded wall time and cannot infer true event order.
  Raw typing,
  reminder receipts, index rebuilds and unchanged clinical saves do not create
  permanent clinical changes. Async/thenable callbacks are rejected.
- Refuse wrong-patient lab children, reparenting, lossy imported INTEGER/boolean/
  timestamp values and required history/audit failures without partial writes.
  Legitimate REAL lab doubles retain their raw clinical text and stored value.
- The existing timeline adds a Corrections filter: 20-row metadata keyset pages,
  one expanded before/after document and bounded lab result pages. Unknown/future/
  misowned bodies stay stored and available as explicitly unverified raw text.
- The existing trash adds seven clinical kinds: labs, imaging, vitals, orders,
  consultations, diagnoses and encounters. Original full SQLite basis and shown
  patient identity are checked inside restore. Parent ownership, separately
  deleted children, focus, original dataset and once-only confirmation are guarded.
  An encounter always returns as historical/inactive, without changing the current
  patient status or reopening medication orders. Lab deletion is audited atomically.
- Full-row restore basis computation follows the limited metadata page, using
  primary-key scalar lookups. Count reads contain no full clinical JSON payload.
  Global metadata sorting/counting can still scan tables; this is not a measured
  physical-device performance guarantee.
- SQL backup replacement imports archived history rather than replaying feature
  edits. Older archives with no history table clear newer-dataset history. Backup
  format, passphrase schemes, dependencies, routes and permissions are unchanged.

## Software evidence

Baseline `.55`: `npm run check` passes 171 suites/2,474 app tests and five workflow
tests. First integrated .56 check passes 175 suites/2,597 app tests in 283.605s,
plus workflow/typecheck/format; lint reports three import-order warnings. Those
warnings are corrected afterward, so that run does not verify the final source.

The first imported-value/date guard passes typecheck and 117 focused tests in
three suites (18.196s), but the subsequent full run catches ten failures in two
existing glucose suites (173 other suites pass). The guard incorrectly treats
INTEGER affinity as a requirement that every stored value is integral, blocking
previously supported fractional glucose. It is corrected to distinguish SQLite's
actual storage type: safe stored integers and REAL doubles remain distinct;
noncanonical boolean/timestamp values still refuse. Two explicit history/unit
regressions complement the existing glucose form/query tests. The corrected full source check passes 175 suites/2,607 app tests in 202.822s,
plus five workflow tests, typecheck/lint/format without warnings. The focused
glucose/history/form run passes 75 tests in four suites (16.324s).

The new regression coverage uses migrated real SQLite and actual retained UI
callbacks: rollback on audit/history failure, strict patient/encounter/value
ownership, exact restore basis, pages/filter changes, delayed confirmation,
read failure/retry, original dataset admission, before/after field clears, bounded
lab rendering, real SQL replacement and older history-free archive handling.

## Older-source input diagnostics

The frozen `.55` x86 APK `948883a` was used, not the new .56 application. Ten
synthetic ASCII trials include seven exact inputs and three long single-command
prefix failures. In the failing cases, native InputDispatcher logs stale-event
drops and failed injections while `adb` still returns 0. Accessibility events do
not show the missing suffix first arriving and then being lost. A144-character
batch retains 48 accepted characters; cold recovery retains that same observed
prefix. A paced 72-character input remains exact. This bounds the injection and
observed persistence paths; it does not prove every keystroke is durable.

Primary source comparison: AOSP's
[InputShellCommand](https://android.googlesource.com/platform/frameworks/base/+/master/services/core/java/com/android/server/input/InputShellCommand.java)
injects generated key events synchronously and its void wrapper does not
propagate injection failure as a command error. An
[InputDispatcher revision](https://android.googlesource.com/platform/frameworks/native/+/a66d65e147/services/inputflinger/dispatcher/InputDispatcher.cpp)
uses event age for stale-event rejection. These are references read on 2026-10-11,
not proof that this system image uses those exact revisions. The actual native
drop/trace logs establish the observed emulator failures.

Host load remains substantial in the trial windows; there is no demonstrated
idle causal control. Eight real boot system-process ANRs are retained. No MedOS
fatal/ANR is observed in the captured window; that is not a crash-free claim.
The original `.55` `QA55Portal`→`QQ` incident and older `.33` DocumentsUI focus
ANR lack equivalent event-time evidence and remain unresolved. Persian software
keyboard composition and physical typing are not accepted by ASCII injection.
Only owned read-only `emulator-5558` was driven; shutdown preserves both AVD base
hashes. Private raw witnesses are in `private/validation-0.11.56/native-diagnostics/`.

## Native and artifact evidence

Both artifacts are frozen to `8ee111a2537f89f22f88b3215154e2dbe4154bab`,
version .56/code72, the existing package/signer and essential JNI libraries.
The owner APK is arm64 only; QA is x86_64 and is not copied to dist.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| QA x86_64 | 55,108,206 | `865d6f14c77d69bcef0caafe4262a8666ecf0f40ee0ea53669e0c3ce640d998e` |
| Owner arm64 | 53,499,879 | `d69c99ff020825ddc7a4428817caec532c98163f108af4db9305cbd908415e02` |

The signing certificate SHA256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
Both inspect as min SDK24/target36. QA builds in 14m30s; owner in 7m44s.
Gradle's retained hardlink/deprecation/metaspace warnings do not indicate build
failure or establish runtime acceptance. No source/HEAD changed during either build.

The owned read-only emulator upgrades in place; its pulled installed bytes match.
Native UI restores all seven record kinds with shown patient/title confirmation.
Separately deleted lab children remain deleted; an old encounter returns inactive
without changing the active episode, running orders or patient status.
Twenty-five diagnosis tombstones page as20/5; all ids are unique and complete.
Forty acknowledged star toggles produce55 full clinical versions; native history
pages as20/20/15, with an observed exact before/after field change. This is bounded
interaction/pagination evidence, not a timed40-patient shift.

Independent authenticated archives compare every application field and media hash:

| Stage | Exact retained state | Intended differences |
|---|---|---|
| Old-format fixture restored | 4,156 rows /50 tables;34 media hashes | Two additive migrations; no invented clinical versions |
| Seven restores +40 toggles | All4,156 prior rows and34 media | Exactly8 clinical rows changed;55 exact typed versions and required restore audits |
| Actual older .55 backup | All4,117 prior rows /50 tables and34 media | New-dataset clinical history cleared |
| Actual .56 history roundtrip | All4,211 rows /51 tables and34 media | All55 version rows unchanged |

All independently decoded databases pass integrity/FK checks;32 migrations are
present. Archive SHA256 witnesses, full-row comparisons and raw captures remain
in `private/validation-0.11.56/`. The old-backup observer briefly lost accessibility
output; the operation was not repeated. A later fresh dump observed its explicit
completion, and the exported whole-state archive independently verified it.

PID2989 survives the acceptance actions. No MedOS fatal/ANR is observed in the
retained window. A real SystemUI-not-responding boot dialog was captured and its
observed Wait button used; an empty later counter does not erase that event.
The owned serial/launcher are absent after shutdown; both original AVD base hashes
are unchanged. No physical phone was used. .56 was not pushed/accepted by hosted CI.

## Confirmed blocker found after native acceptance

A valid-FK imported lab value may name a different patient from its panel.
The strict history wrapper correctly refuses copying it into another patient's
history, but .56 startup treats the resulting reflag rejection as fatal.
Restore catches housekeeping failure, leaving the next cold start blocked.
The .56 result/trend readers also lack complete ownership checks. Three real-SQLite
regressions reproduce the failures before the .57 fix. Therefore these native
witnesses do **not** make .56 ready for phone acceptance. See
[validation-0.11.57.md](validation-0.11.57.md) for the separate corrected source.

## Still separate work

Contact/follow-up and other notebook trash, rich text with compatible codec,
complete follow-up workflow, a full timed 40-patient native shift, unresolved
input/focus diagnosis, backup interruption/provider/low-space paths and physical
phone/clinical review remain open in IMPLEMENTATION. No phone was used here.
This milestone does not establish a final publishable or crash-free app.
