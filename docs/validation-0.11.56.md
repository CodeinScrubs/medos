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
  edits. Same-ms/backward-clock ordering uses per-record sequence. Raw typing,
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

## Native, artifact and delivery gates

New .56 native upgrade, clinical restore/history UI, independent authenticated
archive comparisons, final owner arm64 artifact inspection and exact-head hosted
CI are pending at this source checkpoint. Do not reuse .55 acceptance for .56.

## Still separate work

Contact/follow-up and other notebook trash, rich text with compatible codec,
complete follow-up workflow, a full timed 40-patient native shift, unresolved
input/focus diagnosis, backup interruption/provider/low-space paths and physical
phone/clinical review remain open in IMPLEMENTATION. No phone was used here.
This milestone does not establish a final publishable or crash-free app.
