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

## Native and archive evidence from66dda88

The frozen .52 x86 APK is installed over the retained .50 dataset, with pulled
installed bytes matching SHA-256
`ff504537287d841e85654eced0c093ed37cce776ce126d3f39bc35f0b9799862`.
Independent authentication/decryption and SQLite comparison preserve all4,117
previous rows across49 prior application tables, the new empty workspace draft
table, and every hash of34 media files. Integrity and foreign keys pass.

On the actual Android UI, two unfinished new order forms retain their exact
input through a later admission before separate publication. Independent full
exports prove one order remains outpatient null and the other remains attached
to its original, now-inactive episode; both later admissions are distinct.
Every unrelated baseline row/media hash remains exact. The action archive SHA
is `03009e4a3f6b3933398b6226102e825ff326a9952e889423db3843737086cc69`.

An actual replacement restore while an order form remains mounted keeps its
words and original allergy display; the replacement allergy is absent from
that old form. Its stale notice is visible and native input/publication controls
are disabled. Independent export matches every expected4,120 application rows
across50 tables and all34 media hashes, with the replacement allergy actually
in the database and no implicit publication of the old words. That archive SHA
is `031ea1acb4ab3ee64ce5852f48bf074ffbd8536897849a2b0d1a23cc22e30edd`.

The retained action PID has no observed app fatal/ANR in the checked buffers;
this is bounded evidence. Initial installation observes a System UI ANR dialog
before the app appears. A QA field tap opens Android QuickShare instead of
reaching its input; resumption checks actual focus and scrolls the field into
view. Two other observers initially use an exact allergy text that is nested
inside a combined native label, or exclude disabled controls as invisible;
correct selectors confirm the actual state. These failed observations are not
application test passes. The original AVD userdata/encryption QCOW2 hashes
remain exact after the owned read-only emulator shuts down. An initial hash
comparison accidentally uses the small raw images instead of the recorded
QCOW2 paths; checking the actual recorded paths resolves that harness failure.

The same66dda88 source builds an inspected owner-signed arm64 .52/code68 APK,
53,407,771 bytes, SHA
`75c85a094187f9156e847d3900aab27d8e618d030dac99ef1f7866430b2eca04`.
It has the established signing certificate, package, minSDK24/target36 and all
required native libraries. This precedes the additional guard below; it is not
evidence for that guard's final APK or a physical-phone test.

## Empty imported episode keys

A separate two-case probe against migrated real SQLite reproduces another
ownership bypass on66dda88: a stored empty-string episode key skips a truthy
reference check, permitting creation beneath a foreign or deleted episode.
Only null now means no episode; every other stored reference is checked with
the same live ownership query. No identifiers or records are repaired/deleted.

Ten regression cases cover missing/deleted/foreign empty references, a valid
owned empty reference, and edit/status/delete refusal without order/audit changes.
The creation/mutation/mounted-editor run passes96 tests in15.920 seconds,
without the earlier act warnings. Full final-source checks pass164 suites/2,354
app tests and five workflows in166.189 Jest seconds, with clean typecheck,
lint, formatting and no act warnings. Hosted, native and APK verification of
this last guard remains pending at this checkpoint. Previous
66dda88 UI/archive evidence remains explicitly attached to its own source.

## Remaining gates

Kardex still needs durable raw fields/date/clock and original patient/encounter
through process death, separate final publication and explicit conflict review.
The other five manual forms are specialty profile, prescription, place, extension
and credential. The workspace pilot's null-parent model must not erase clinical
context. Rich text, appropriate history/trash, fuller shift/follow-up/clinical
tools, complete40-patient native timings, pressure/low-space/provider/power and
physical camera/audio/Doze/second-device acceptance remain in IMPLEMENTATION.
