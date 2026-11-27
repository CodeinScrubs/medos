# Validation: places and extensions recovery/actions (0.11.62)

Candidate0.11.62/code78 on codex/place-recovery, following PR12's documented
825ef23 and frozen application3ee0ce5. No dependency, schema, migration, route,
permission, clinical rule, archive or key change.

## Product behavior

Places and extensions can be recovered in the existing trash, with filters,
20+1 keyset pages and a matching count. Restoring a place reveals its live
children; it does not restore separately deleted extensions. An extension
requires its original live parent. No destination is guessed, including an
imported empty ID or a missing/deleted parent. Existing patients, notes, capture
and clinical trash, including .61's note lifecycle protection, remain.

Delete/restore retains a lossless SQLite-row/lifecycle basis derived from existing
columns and audit events. Required audit commits with the mutation. Failed
audit, stale/alive/repeated row, same-clock edit/revert, identical lifecycle cycle
or changed parent refuses the action. Shown choice, original dataset, readable
result, mount/focus and a single-flight latch are distinct checks. Metadata is
sorted/countable without fetching all private note bodies; full basis hydration
is restricted to a bounded page by primary key. Existing audit indexes are used,
but metadata scan/temp sorting and live-list costs are not a device timing claim.

Device copy/call/map actions retain the same owner across native awaits. The
verified original row supplies the destination; an old card cannot launch a newly
edited switchboard. Optional usage is written only after a native acknowledgment
and another exact-row check. Haptic/counter failure does not turn acknowledged
copy into failure. Static diagnostics omit the cause, phone, URI and private
notes. Late focus/unmount/dataset loss suppresses UI/optional follow-up work;
dataset replacement waits for admitted native work rather than borrowing a new
token. Linking completion proves launcher/chooser request, never a real call.
The shared doctor map caller also checks its original doctor/place association.

Extension star/unstar uses a typed exact shown basis and explicit clock in one
synchronous live-parent transaction. Its native menu routes through the parent
screen's original intent and action latch. Ordinary place/extension input keys
are checked at runtime; metadata/tombstone/usage fields cannot bypass the
dedicated operations. Supported fields, explicit null, undefined patch behavior,
rename propagation/search and deliberate validated parent reassignment remain.

## Observed software evidence

- .61 documented baseline and normal push:183 suites/2,759 app tests, five
  workflow checks, typecheck/lint/format and zero lint warnings. Exact-source CI
  succeeds for application3ee0ce5 and documentation825ef23.
- The first private recovery proposal fails17 real-SQL cases/5 pass, and its UI
  mock fails at a React Native DevMenu getter. It also would overwrite .61's note
  lifecycle changes. The rebased proposal preserves the lifecycle, fixes exact
  page-id correlation and uses the existing lazy mock pattern. Its lifecycle
  SQL already had qualified outer IDs; that was not the hydration defect.
- Initial private device-action witnesses are red for early/failed-launch count,
  absent dataset admission and post-departure optional feedback. A separate
  same-clock switchboard correction witness exposes the hidden new destination.
- Three additional SQL-backed synchronous-haptic-throw witnesses fail before
  try/catch around native invocation. Fourteen star/menu witnesses fail before
  exact original-row/time/lifetime protection. Assertions/default deadlines
  are not loosened; one intermediate timeout remains a failed run.
- Final frozen private proposal:5 suites/98 tests pass. Primary's independent
  rerun after source freeze passes the same98 in35.070s; its earlier overlapping
  run fails and is not final-source evidence. Native modules are stand-ins.
- Primary adds24 real-SQL runtime-key witnesses: prior writers accepted or ignored
  forbidden keys rather than refusing them; some allowed tombstone/counter/identity
  changes. All now reject with complete-state equality. A success witness retains
  every supported field and verifies null/undefined/rename/parent/search behavior.
- Integrated targeted evidence:8 suites/170 tests pass in38.030s. Integrated
  typecheck first catches a mockResolvedValue argument; it is corrected to explicit
  undefined. First full check stops at one React refs lint error and two empty-row
  dependency warnings. The map action is rendered directly as an event-bound
  button and empty arrays are stable; no rule is disabled. Targeted lint then
  passes with max-warnings0, and4 relevant suites/88 tests pass in26.352s.

Full final check passes188 suites/2,879 app tests (Jest284.435s), five workflow
checks, typecheck/lint/format and zero lint warnings. Checked source bytes are
verified unchanged throughout the run. Normal push, hosted CI and native/APK
evidence remain pending until observed and recorded. Private logs are under validation-0.11.61 and
validation-0.11.62; proposal/report hashes under next-notebook-review/actions.
The source changes are reviewed by the primary, not accepted on helper claims.

## Remaining boundary

No real number was called, no message was sent, and no external native application
was actually launched by the software witnesses. Full native copy/restore/cold/
pressure acceptance and physical phone remain separate. Other notebook trash,
doctor's other communication actions, rich text, full workflows and measured
40-patient shifts remain open. Default diagnostic safety/local agent evidence is
a separate next slice. dist/MedOS-0.11.61.apk remains the inspected owner artifact;
this candidate is not a finished-product or crash-free claim.
