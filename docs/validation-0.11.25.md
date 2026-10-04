# 0.11.25 — Keep note, follow-up, viewer and lab-entry intent

Status: bounded implementation and targeted software gates passed. Final source,
signed artifacts and native acceptance are recorded separately when executed.

## Reproduction and scope

Baseline `db3cb09` passed 111 suites / 1421 app tests plus three workflows.
Production remained unchanged while each ownership gap was reproduced against
actual migrated SQLite and real restore/import, with the same ids and revisions.
Thirty valid witnesses failed before fixes: eight NoteCard, ten FollowUpCard,
seven media viewer and five lab entry cases. Fresh ordinary cases passed.

The first viewer acknowledgment witness sought Input after the old prompt had
already closed, causing a harness lookup error. It was changed to inspect optional
rendered controls and release acknowledgment before asserting; the corrected
failure was rerun before production changed. The synchronous useLive lab stand-in
needed an explicit same-screen refresh to reproduce a missing restored panel.
That valid failure was also rerun on unchanged production. Neither initial harness
behavior counts as a distinct app bug.

Changes use inherited immutable dataset tokens and whole-operation writer leases:

- Note pin/unpin and final nested delete include history/audit acknowledgment.
- Follow-up completion, postponement, status/delete, reminder retry and native
  dialing retain original ownership. The existing actual completion prompt stays
  busy until native acknowledgment and retains outcome text on failure.
- Viewer caption/delete/share reject stale intent. Caption failure keeps actual
  typed text; successful acknowledgment closes it. Synchronous guards suppress
  duplicate Submit and cancellation while pending. Native share is awaited and
  its failure caught; returning from the sheet is not proof of delivery.
- Lab EditGate retains its seed and raw input when replacement removes the panel.
  Creation, update and clipboard use the same original token. Save/Paste mutexes
  prevent double Save and premature publication while clipboard reading is pending.
  Functional clipboard merge preserves unrelated edits made during the read.
  Save locks existing fields until acknowledgment; failure unlocks them for retry.

Version 0.11.25 / Android code 41. No new dependency, migration, permission,
navigation guard, dialog, clinical formula/reference range or archive/key scheme.

## Software evidence

Four mounted suites / 43 tests passed. They exercise real Scope/EditGate, actual
caption/completion PromptModal, real queries and SQL import. Native services,
navigation, removal hooks and live observers are stand-ins, not device evidence.
Additional post-fix tests cover SQL failure/retry, native share/clipboard failure,
pending clipboard/current edits/early Save and fresh ordinary publication. No
pre-fix failure is claimed for those added cases.

Two read-only source reviews found no concrete blocker; root owns integration and
all executed checks. Private synthetic logs are under private/validation-0.11.25/.

Final `npm run check` passed: typecheck, zero-warning lint, formatting, 114 suites /
1462 app tests and three workflow tests; whitespace diff passed. Its first attempt
stopped at a test-only readonly-tuple Jest typing error, corrected to named case
objects without relaxing production types. The NoteCard scope observer now records
its evidence in an effect instead of mutating a global during render. Version/
package-lock edits are limited to application fields; generated native version/code
stamps were guarded against any other app configuration change before source froze.

## Limits and next work

Retained mounted input, caption/outcome and writer admission are process-local.
This does not establish raw lab draft crash recovery, native reminder delivery,
physical phone/API 26, every form's intent, camera/voice interruption, low space,
power loss, large datasets or validated clinical-tool acceptance. Remaining
unscoped patient/admission/follow-up/consult-answer forms and durable stopped voices
for capture/note drafts remain prioritized in IMPLEMENTATION. Do not claim whole-
product completion or zero bugs from these bounded gates.
