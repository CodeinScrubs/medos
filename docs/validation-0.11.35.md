# 0.11.35 — recoverable raw manual lab entry

## Problem and implementation

The previous manual lab form kept input only in component state. Navigating away
or restarting lost an unsubmitted panel, including text hidden inside the date,
clock and reference-range widgets. Late Save acknowledgment could also close a
newer route. Editing replaced values without carrying their existing notes and
rounded an unchanged collection timestamp to a minute.

Migration 0022 adds `lab_form_drafts`, with one open form per patient/new-panel
or patient/existing-panel. Its strict version-1 document retains exact raw text,
ordered rows and units/ranges/notes, preset/name state, incomplete date/clock and
the open range editor's input/session. Invalid input remains a draft, never a
clinical result. Untouched forms write nothing; malformed drafts are retained
and reported, not silently replaced with a blank form.

One SQL snapshot loads patient, target, values, draft and initial active encounter.
The existing AutosaveScope carries its original dataset generation; latest input
is persisted before publication. Draft CAS, clinical comparison, clinical write
and retirement execute synchronously and atomically. Replay cannot publish twice.
Deleted/foreign parents refuse publication. A closed captured encounter remains
historical context; reopening does not attach the lab to a newer admission.

Explicit conflict comparison shows both the current published values and the
stored raw draft. Keep mine rechecks that displayed basis before rebasing a whole
panel; it does not silently merge. Discard retires only the draft. Existing panel
source, encounter, per-value notes and unchanged sub-minute timestamp survive
ordinary edits. Replace-all edit history still soft-retains old value rows.

PromptModal has an optional paired controlled-input contract for the raw range
buffer; existing uncontrolled/secret consumers retain their contracts. Stale
range-session callbacks cannot alter a newer session. Pending clipboard work
blocks publication/exit/dialogs while preserving newer typing. Final submission
freezes input, keeps Screen/header/native Column ancestry stable, and closes only
its originating focused route. No dependency, route, permission, clinical formula
or backup-format/key change; version0.11.35/code51 identifies the artifacts.

## Executed software evidence

- A recovery witness failed before the change: reopened pending text became the
  original note. Additional timestamp/current-clinical-comparison witnesses failed
  before their corrections. Private evidence: validation-lab-drafts/.
- Real migrated SQLite tests cover exact raw recovery without clinical writes,
  CAS/replay, captured encounter, per-value metadata/history, deleted/foreign
  parents, same-id dataset replacement and explicit conflict comparison/rebase.
- SQL fault triggers independently fail value insertion and draft retirement on
  create/edit; every clinical/draft row rolls back. Full restore carries raw
  drafts; older table-absent restore clears them; invalid draft FKs roll back the
  entire import. Query observation covers all five joined tables.
- Real date/range widgets and Screen/Column/Scope tests cover invalid raw text
  acknowledgment before remount, background flush, write failure/exit refusal,
  explicit retry, latest-event Save, deferred/unfocused acknowledgment, stable
  native parent/header, completed-callback refusal and pending clipboard work.
- Four targeted suites/87 tests passed. Full `npm run check` passed: typecheck,
  lint, formatting, 128 suites/1,699 app tests and three workflow checks. Import
  ordering warnings from this change were subsequently corrected; the ordinary
  pre-push check must validate the final committed source too.

Two existing GPT-6.1 Sol/xhigh read-only reviewers inspected SQL and UI contracts;
the primary agent owns all edits/integration/checks. A later additional review
request did not run because of usage limits; it is not counted as evidence.

## Artifact and native acceptance

At this source checkpoint, exact-source hosted CI, APK identity/signature/library
inspection, in-place upgrade and real Android cold recovery/publication are still
pending. Component remount tests do not prove process-death recovery. Preserve the
.34 baseline rows/files and independently compare exported SQLite/media before
claiming native acceptance. Physical A52s, power/low-space, active recording,
pressure/24-hour performance and complete product acceptance remain open.

## Native checkpoint and header access correction

Source `1daa513091a9eaaea4c16153815eaad21c14233d` passed normal pre-push checks
without lint warnings. [CI37713171025](https://github.com/CodeinScrubs/medos/actions/runs/37713171025)
reports Success on GitHub's public run page. Local API connection/TLS errors are
preserved; the web page independently confirms this exact run/source.

Its signed/inspected x86_64 QA APK is54,581,738bytes, code51/name0.11.35,
target36/min24, SHA-256
`dc50e4a2edbddd229498db57091e34a3dacc35cbb4b3cadd03855f5164f30d9c`.
The actual installed APK matches; unchanged owner signer and required native
libraries passed inspection. Offline in-place upgrade preserves every original
4,049row/40table and25media hashes, adds only an empty draft table and reaches
23migrations; independently decrypted export has clean integrity/FKs.

Actual new manual raw entry survives force-stop and cold reopen, including the
open `135-` range buffer. Independent export confirms the exact incomplete
date/clock, ambiguous value, name/laboratory/notes, row/session identity and
captured encounter; no clinical row or unrelated data/file changed. This is
process-death recovery, distinct from the earlier component remount witnesses.

The attempted footer Save with IME open did not invoke Save: UIAutomator exposed
an occluded app button while Gboard received the tap and appended a character.
The process survived and no publication was claimed. Screenshot/window inset
evidence explains the setup failure and a real access issue: only a footer is
poor access for long forms. The known synthetic extra character must be corrected
before continuing. Earlier selector/cold-start setup failures are also preserved:
the date's label lies beside the calendar icon rather than over its input, and
an initial cold hierarchy was splash, not proof that recovery failed.

The corrected source retains one compact header publication/Close slot, following
the note editor's existing pattern. It calls the same validation, latest-input,
dataset/CAS and focused-navigation path as the footer, without another guard,
route or draft writer. Title and slot presence remain constant while pending and
completed. Two new/edit witnesses fail before correction; final checks and the
rebuilt exact-source keyboard-open native acceptance must follow separately.

No owner arm64 artifact or physical installation has yet been produced for this
checkpoint. The first QA APK above is a probe, not the final owner candidate.
