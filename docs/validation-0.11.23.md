# 0.11.23 — Explicit patient workspace renewal and manual clinical intents

Status: software gates passed. Signed/native acceptance is a separate gate.

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

Exact-source hosted CI and inspected signed artifacts/native behavior remain
pending until the release acceptance entry is appended.
