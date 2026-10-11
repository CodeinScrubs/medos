# Companion and follow-up recovery with retained action ownership — 0.11.58

Application .58/code74 on `codex/contact-followup-recovery`, based on delivered
PR9 source/evidence `d1e9a5c`. One read-only GPT-6.1 Sol/xhigh review helped
inventory risks; the primary agent reproduced, implemented and verified changes.
No dependency, table, migration, route, permission, clinical formula or backup
format changes. Existing untracked work is preserved separately.

## Problem and behavior

Companion and follow-up deletion already leaves tombstones, but the existing
trash did not offer their recovery. A stale native choice also could delete a
newer companion/follow-up, or mark a newly completed follow-up as missed.
Identical same-millisecond delete/restore/delete cycles could evade a row-only
trash token. Four real-SQLite/UI witnesses fail on those behaviors before fixing
them; failing logs are retained privately.

- Add the two kinds to the existing filtered, counted and bounded clinical trash.
  Restore only the original live patient/episode. Retain phone, notes, primary
  flag, due time, status, outcome, completion time and original context. Do not
  create another copy, reopen a completed follow-up or revive deleted children.
- Include the existing immutable clinical sequence in the full lossless shown-row
  recovery basis for all nine kinds. A fresh cycle invalidates an old choice even
  when text and timestamps return to identical values. Counts and global sort
  never fetch whole clinical bodies or history snapshots.
- Companion deletion checks the exact shown row and clinical sequence. Follow-up
  completion/status/postponement/deletion compare the retained clinical row and
  desired reminder revision. Native receipt fields alone can advance without
  invalidating a physician's clinical decision.
- Completion retains the row from when its outcome prompt opened, even if live
  props refresh while text is being written. Refused or failed saves keep that
  text; old callbacks cannot silently adopt a newer record. Native choices are
  single-attempt and respect originating dataset, focus and mount.
- Recovery, clinical snapshots and required audit share one synchronous SQL
  transaction. Follow-up recovery increments the desired reminder revision and
  marks its native receipt dirty before reconciliation. The original outer
  dataset admission remains held through awaited native acknowledgment.
- Reconciliation does not ask notification permission implicitly. Native or
  receipt failures do not roll back or falsely report loss of the recovered
  clinical record. One short conditional message points to the existing card's
  retry. Invalid imported reminder generations/status/channel/priority are
  retained unchanged and refused, rather than guessed or normalized.

## Software evidence

Parent .57 source and delivery passed177 suites/2,625 app tests, five workflow
tests and typecheck/lint/format. Their APK and native evidence belong to .57,
not to this new source.

The initial three witnesses fail3/3 before the fix and pass afterwards. The
additional stale missed-status witness fails before its retained-row fix. An
intermediate integrated run found an actual SQL qualification error: Drizzle's
single-table select strips ordinary outer column qualifiers, allowing the
correlated id to bind to the inner history row. The helper now emits explicit
schema-derived identifiers. Healthy contact delete and nonzero history cases
exercise this path. An overdue native mock assertion also was corrected to
distinguish calling the API from scheduling an OS request.

Corrected integrated recovery/UI tests pass198 tests in six suites (36.006s).
Expanded imported-value and publication-receipt replay tests pass53 tests in
three suites (10.335s). The final follow-up card/query run passes46 tests in two
suites (12.356s), including refreshed outcome intent, a changed deadline,
benign native acknowledgment and duplicate failed postponement choices.
One legacy harness had to refresh the shown card after a successful postponement
before issuing a new status choice; retaining its old props now correctly
represents a stale decision, not a fresh live-query rendering.

The tests use the app's migrated SQLite and actual transactions/history/draft
receipts. Whole-table comparisons include audit, clinical versions and retired
drafts. Faults cover required audit/history, SQL/native acknowledgment, denied
permission, cancel/schedule failures, unsafe generations, original/deleted or
cross-patient context, same-ms cycles, late callbacks and native receipts held
across dataset replacement. Publication replay after recovery returns the same
record id without another copy. Notification services and native hit testing
are stand-ins in these software witnesses.

The final full `npm run check` passes178 suites/2,683 app tests in213.035s,
five workflow tests and typecheck/lint/format without warnings. Migration
regeneration reports no schema changes. Earlier intermediate type errors were
in synthetic fixture/action types and an unchecked test array access; corrected
source passes. The first full run found a missing navigation context in the
follow-up list test harness (five failures); its isolated navigation stand-in
now supports the new focus check, and the final full run includes those cases.
Import-order warnings were corrected only in changed files. Failing runs remain
private; they are not passed acceptance evidence.

Frozen .58 APKs, native acceptance and exact-source hosted CI are pending at
this source checkpoint. Their results must be recorded before treating them as
completed evidence.

## Follow-on acknowledged outcome and focus loss

First source `5304451` passes the normal push check with2,683 tests (203.605s)
and its private x86 APK passes package/code74/signature/essential-library
inspection. A later retained-card witness exposes an additional UI regression:
the outcome is durable, but its prompt remains open when focus is lost during
native acknowledgment. That witness fails before the correction. Acknowledged
local modal state now closes while mounted; haptics remain limited to the
focused origin. Refused or failed outcome text remains available.

The corrected card/list run passes31 tests/two suites (14.872s). The full
follow-on check passes178 suites/2,684 app tests in209.541s, five workflow tests
and typecheck/lint/format without warnings. No other application behavior,
dependency, schema or backup format changes. APK/native/CI evidence from
`5304451` does not accept this later source; rebuild and inspect its candidate.

## Remaining boundaries

This does not finish notebook trash, visual rich text, the full received/reviewed/
action/closed follow-up workflow or measured long40-patient shifts. Physical
IME/camera/audio, real alarm delivery/Doze/reboot, provider grants/low space/
power interruption, second-device recovery and physician review remain separate.
Software tests and a build do not establish a crash-free final product. The
phone is not currently the only remaining work.
