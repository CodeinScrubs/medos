# MedOS UX execution plans

Prepared on 2026-09-30 against app commit `7c8a1bd7e3c40ee9711ea812d344dee9a93c2263`.
Implemented in 0.11.4 / code 20 after the owner authorized continuation. The original
audit changed no app source; this execution added regression tests and software fixes.
The owner requested faster, clearer ward work with fewer detours and less clutter.
The default selection is the five bounded changes below, following the owner's
request to continue the UX review. Execute directly without subagents.

`AGENTS.md` is the engineering contract. `docs/IMPLEMENTATION.md` remains the wider
execution ledger: these plans do not replace its outstanding data-safety work,
rich-text/media work, requested professional modules, clinical tools or AI gates.

## Evidence and priority

All cited source behaviors were checked at the commit above. The baseline passed
`npm run check`: 67 suites / 786 app tests and 3 workflow tests. Tests do not measure
usability, physical touch areas, typing, camera behavior or phone performance.

| Plan | Verified problem / proposed result | Effort | Change risk | Confidence | Status |
|---|---|---|---|---|---|
| [001](001-direct-destinations.md) | Exact admitted/starred lists and consult answer; synchronized URL filters with retained return search and explicit fresh-search reset. | M | Medium: route/state transitions | High: actual SQLite/useLive tests | SOFTWARE VERIFIED |
| [002](002-save-language.md) | Distinct draft/chart-publication, recovered draft and inbox/audio-import labels. Save handlers unchanged. | S | Low: wording only | High: source and existing persistence tests | SOFTWARE VERIFIED |
| [003](003-readable-touch-controls.md) | Minimum 48dp chips/segments/checkboxes; small text contrast tests; wrapping record destinations/buttons with font scaling. | M | Medium: shared layout | High: sizes/color calculation; native bounds still unverified | SOFTWARE VERIFIED |
| [004](004-today-work-and-overflow.md) | Shift first, complete counts before previews, direct full patient/follow-up lists and protected outcome prompts. | M | Medium: layout/counts/navigation | High: real SQLite/useLive tests; native acceptance separate | SOFTWARE VERIFIED |
| [005](005-round-action-footer.md) | Footer outside scroll; hides during keyboard editing, retains savers, blocks failed flush/write and duplicate actions. | M | Medium: keyboard/insets/save boundaries | High: real autosave/SQLite component tests; native separate | SOFTWARE VERIFIED |

Priority within this UX batch: 001, 002, 003, 004, 005. These are P2 changes,
not claims of a data-loss emergency. Plan 004 depends on 001's patient-list route
contract; 005 follows 003's control sizing. Other plans can be reviewed independently.
Do not have concurrent executors edit the same Today, patient-list or shift files.

Execution notes: all 75 suites / 830 app tests + 3 workflow tests passed, including
new route, real-useLive read/retry, 40-row counts and actual SaveGroup failure tests.
Quick patient creation also fixes an omitted-status admission bug without changing
the schema. Scope expanded narrowly to Button wrapping/accessibility hint and
FollowUpCard touch sizing/prompt-lifetime reporting; completion/reminder semantics
are unchanged. No dependency added. See the newest HANDOFF for native build evidence
and open gates; do not replay these implemented plans blindly.

Status values: TODO, IN PROGRESS, SOFTWARE VERIFIED, NATIVE VERIFIED, BLOCKED
(reason), REJECTED (reason). Use SOFTWARE VERIFIED when automated checks pass but
native acceptance is outstanding. Record the exact tested commit/build and scenario
in the latest handoff; do not invent device evidence or store patient data here.

## How to execute one plan

1. Read `AGENTS.md`, the newest `docs/HANDOFF.md`, `docs/architecture.md`, then the
   whole selected plan. Run `npm run brief` and `npm run check` before edits.
2. Check drift against the recorded app commit. Expected changes from earlier
   plans need reconciliation, not blind replay. Preserve other people's work.
3. Implement one bounded change, using existing components and dependencies.
   Match the stated behavior and acceptance criteria, not merely the excerpts.
4. Run focused meaningful tests and `npm run check`. Keep automated, emulator and
   physical-phone results distinct. Follow `AGENTS.md` for native builds.
5. Update this index and the latest handoff. Commit with a reason and the actual
   `Agent: <model> via <tool>` trailer; follow the owner's existing push permission.

There is no new database schema, framework, UI library, service, top-level tab,
analytics system or settings panel in this batch. Preserve soft deletion, frozen
backup compatibility, normalized search, explicit clinical inputs and private notes.

## Further direction, after this batch

These are design candidates, not additional approved execution steps:

- **Patient context and cards:** compact, consistently placed identity in clinical
  editors, including an identifier that distinguishes equal names; admission time
  and elapsed stay on inpatient cards. Use the actual selected encounter, existing
  admission-time logic and explicit unknown states. Patient-specific UI belongs in
  `features/patients/`, not generic `components/`. Do not duplicate the existing
  `PatientSnapshot` or label `patient.updatedAt` as the last clinical event.
- **Read-first shift list:** show a short handoff preview for each patient, opening
  one editor when requested. This can reduce vertical clutter across forty patients,
  but folding/virtualizing an editor must not unregister an unsaved field before a
  successful flush. Review autosave ownership before choosing the implementation.
- **Search and large work lists:** measure the existing workflow first. Due tasks,
  open consults, drafts and the timeline still need large-list acceptance. A future
  universal search should reuse normalized feature queries, preserve patient context
  and state its coverage; it does not require embeddings or a new search server.

## Considered and deferred or rejected

- Hiding the eight patient-record destinations under More: deferred. The current
  4-by-2 grid was deliberately introduced to make all destinations discoverable.
  Fewer visible controls can add navigation depth. Keep it until use evidence shows
  a better arrangement, adapting it for larger fonts in plan 003.
- Removing the knowledge or colleague tab as "bloat": rejected. Both are requested
  owner workflows; screen placement may change with evidence, feature scope does not.
- A customizable dashboard, extra top-level Work tab or generic workflow engine:
  rejected for this batch. Existing routes and sections can serve the current need.
- A blanket "maximum four choices" or "five urgent records" rule: rejected. Small
  previews are valid only with honest full counts and a direct full-list path.
- "Many live queries prove the app is slow": rejected as an unmeasured claim.
  Measure cold start, list/record open and scrolling before changing data architecture.
- Keeping quick capture open after every photo/voice: deferred. Current code exits
  after the saved media item. A multi-media capture is useful, but adds a different
  workflow; preserve today's fast capture until that interaction is designed.
- Flutter rewrite, generic graph model or new UI framework: outside this UX batch.
  No evidence from this review establishes that they solve the identified problems.

## Native acceptance shared by the plans

Use synthetic data on a development app/emulator, then the target phone when
available. Include forty patients, two with equal display names, unknown allergies,
missing admission time, a discharged starred patient, more than eight admitted
patients and more than five follow-ups. Never commit real records, exported
databases or screenshots containing them.

Walk opening Today, selecting a filtered tile, returning from a record, finding an
overflow item, writing a draft, reopening it and advancing a round. Repeat with
light/dark themes, RTL, increased font size, keyboard open/closed and gesture /
three-button navigation. Use actual UI bounds for taps; do not guess coordinates.
Record required taps and observed failures. Latency measurements must name device,
build and scenario; no speed claim follows from a passing Jest suite.
