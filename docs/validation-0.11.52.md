# Original Kardex creation context — 0.11.52/code68

This is a bounded clinical ownership/display correction following the .51
workspace recovery pilot. It does not complete D05 or release acceptance.

## Reproduction and scope

Two actual mounted-screen regressions fail on the prior code: a new form opened
with an active encounter or outpatient null inserts into a later admission at
Save. The pre-fix run has2 failing and47 passing cases. After correction, a
four-suite context/ownership/editor-read run passes125 cases in19.454 seconds.

A separate migrated-SQLite replacement reproduction fails: a still-mounted
old order form displays the replacement patient's allergy next to its old input.
That run has1 failing and49 passing cases. The correction retains only the
last successful original-dataset allergy display text. Same-dataset corrections
remain live, and typed fields do not reset. The full final verification below
covers both paths.

New order forms capture their active association in one watched SQLite read,
retain it before typing and pass it with their original generation into final
publication. Captured null never falls back to a later admission. Insertion
validates live patient/original episode ownership in its synchronous transaction.
Deleted, missing, foreign and different-patient contexts refuse insertion.
The established stable fallback for duplicate active episodes remains unchanged;
no records are merged/deleted and closed history is not chosen for a new form.

There is no schema, dependency, route, permission, clinical rule or archive/KDF
change. Version edits touch only the four app metadata locations and the three
allowed lockfile version fields. Existing order edits, current-card status/delete
rules and native form parents remain. The form uses the existing useNow clock.
This is not autosave or permanent correction history for orders.

## Verification status

Full source checks pass164 suites/2,344 app tests and five workflow tests
in162.109 Jest seconds; typecheck/lint/both formatting checks pass. That run
contains three React act warnings from the new replacement test harness. Its
replacement notification is moved inside act and both allergy cases pass
without warnings in4.688 seconds. Regeneration reports no schema changes.
Exact-head hosted CI and .52 native acceptance remain pending at this source
checkpoint. Earlier evidence is not a .52
native witness: the inspected owner .51 APK and .51 UI/archive results are from
`a541ce5`, documented separately in validation-0.11.51.

The first full attempt passes typecheck but rejects reading a display ref during
render. The implementation is changed to conditional primitive display state,
without suppressing that rule. The next attempt passes typecheck/lint and stops
at app.json formatting after the version edit. Root-scoped Prettier corrects
that file before the final run. Neither early attempt is reported as green.

## Remaining gates

Kardex still needs durable raw fields/date/clock and original patient/encounter
through process death, separate final publication and explicit conflict review.
The other five manual forms are specialty profile, prescription, place, extension
and credential. The workspace pilot's null-parent model must not erase clinical
context. Rich text, appropriate history/trash, fuller shift/follow-up/clinical
tools, complete40-patient native timings, pressure/low-space/provider/power and
physical camera/audio/Doze/second-device acceptance remain in IMPLEMENTATION.
