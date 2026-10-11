# Lab ownership isolation and truthful retained forms — 0.11.57

Continuation on `codex/clinical-history-recovery`, application .57/code73,
based on .56 source `8ee111a`. No new dependency, migration, route, permission,
backup format or clinical formula. An independent read-only reviewer inventoried
the live result paths; the primary agent implemented and verified the change.

## Problem and contract

An imported result can satisfy foreign keys while naming a patient other than
its panel's patient. .56 may expose it in that patient's table/chart and blocks
the next start when strict correction-history capture refuses the mixed panel.
Three real-SQLite tests reproduce these failures before the fix.

- Keep the inconsistent panel, all its siblings and separately deleted children
  intact. Do not reparent, delete, guess ownership or manufacture their history.
- Reflag healthy panels in the existing synchronous transaction. Explicit owner
  defects are preflighted within that transaction; real SQL/history/storage errors
  still reject and roll back the whole pass. Aggregate audit contains counts only.
- Withhold all live results of a mixed-owner panel, including seemingly normal
  siblings, from the patient snapshot, flowsheet, trend and timeline preview.
  Parent panel/patient deletion also fences direct result reads. A separately
  deleted foreign child does not quarantine otherwise healthy live results.
- Keep panel metadata in its owner's list with a short conditional warning.
  Count affected panels for both named patients without reading foreign clinical
  contents. Child-only changes remain observable. No empty/photo-only or normal
  claim substitutes for the withheld results. An SQL read failure retains retry.
- Editor reads retain their original raw snapshot rather than silently filtering
  foreign rows into a clean/empty form. Publication/deletion remain strict.
  Reload validates the new clinical basis before cancellation/reset, and refuses
  replacement if the preceding draft flush was not acknowledged.
- The panel-list ownership marker is a read projection; strip it before passing
  the stored full-row deletion basis. Otherwise every healthy delete would fail CAS.

## Software evidence

The resumed .56 baseline passes175 suites/2,607 app tests in263.113s plus five
workflow tests and typecheck/lint/format. Initial new ownership tests fail3/3
on the expected old behavior; the same three pass after the query/repair fix.
An integrated focused run passes165 tests/9 suites. Additional retained-form/
live-UI tests pass70 tests/5 suites after correcting a test text observer and a
fixture tuple type. The earlier intermediate typecheck/observer failures are
retained privately and do not verify final source.

New tests use the app's migrated SQLite, actual query/repair/history code and
retained UI handlers. They cover mixed siblings, correct-looking stored flags,
both patient identities, separately deleted children, deleted parents, metadata
projection/CAS, full rollback on real flag/history SQL failures, first and later
StartupGate runs, raw editor refusal, delayed reload and failed draft flush.
The StartupGate tests isolate other startup stages/native services; they are not
full migration/restore or hardware proof. The snapshot test uses the real useLive
hook with injected native database-change events to exercise child-only refresh.

The corrected full `npm run check` passes177 suites/2,625 app tests in211.156s,
five workflow tests and typecheck/lint/format without warnings. Migration
regeneration reports no schema changes. The added SQLite query-plan regression
verifies patient/panel indexes for issue-count candidates; this is not a measured
physical-device latency guarantee. Frozen native upgrade/restore/cold restart,
independent whole-archive comparisons, owner artifact inspection and exact-head
hosted CI remain pending at this source checkpoint.

## Separate acceptance

The new source must have its own native evidence; .56 witnesses are historical.
Physical Persian/English IME, focus/interruption/provider/low-space/power behavior,
the full timed40-patient shift and clinical review remain separate. Rich text,
remaining trash kinds and the full follow-up loop remain in IMPLEMENTATION.
No physical phone or clinical validation is claimed here.
