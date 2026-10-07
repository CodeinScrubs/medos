# 0.11.26 — original form intent and awaited acknowledgment

## Scope and evidence boundary

Continuation baseline: clean `b0a8ce636b00c0ce06d9b61392c4797c3a655fff`,
matching origin/main. Previous acceptance CI `37221081552` independently read as
completed/success on that exact SHA. The primary agent performed this continuation
solo. Synthetic fixtures, commands, native artifacts and logs stay under ignored
`private/validation-0.11.26`; no patient data or signing material is published.

This release fences patient, admission/edit/discharge, follow-up, consult-answer
and companion form actions across dataset replacement. It introduces no dependency,
migration, permission, clinical formula, archive/key scheme or normal-path dialog.
Version is 0.11.26 / Android code 42; only the three specified lock version fields
change. See architecture and IMPLEMENTATION for remaining contracts.

## Reproduction and checks

The first untouched baseline run timed out in one follow-up completion test at
Jest's existing five-second limit. Its isolated rerun passed (approximately 1.3
seconds for that case), and the full unchanged-source repeat passed: typecheck,
lint, format, 114 suites / 1462 app tests and three workflow tests. The timeout
was not raised or assertions weakened.

Six finalized mounted-handler suites then produced 41 valid failures on unchanged
production source. SQLite is real sql.js with the app's bundled migrations. The
test-only snapshot helper uses VACUUM and the engine's trusted table import,
preserving ids and draft revisions, then advances dataset generation. Comparisons
include every table, history, draft and audit row; no clinical write result is
mocked. Query acknowledgment stand-ins execute the real query before holding its
return, and unexpected replacement probes always release their reservation.

Witnesses cover:

- Clean new/edit patient and untouched edit publication; delayed duplicate,
  discard, load and keep-local callbacks; final publication admission.
- New admission, episode edit and discharge publication/discard; delayed
  comparison/reset, mistaken episode deletion and inline doctor/place creation.
- Follow-up publication without changing reminder state, delayed draft actions
  and admission through real reminder/query acknowledgment.
- Consult-answer clean publication, delayed reload/revision adoption, late
  inherited Autosave and guarded leaving through final query acknowledgment.
- Companion stale and late inherited intent, immediate typing/repeated Save,
  final acknowledgment, retired-parent refusal and successful SQL-failure retry.
- Gates waiting on their first read cannot acquire fresh authority after restore;
  an intentionally new route can load the replacement data normally.

An initial episode witness selected an incorrect button label. It was corrected
and all six suites rerun before application edits: 41 failed / 39 passed / 80 total,
with no harness TypeError or timeout. After fixes those six suites passed all 80.

A separate actual-picker handler test initially had native stand-in issues; those
attempts are not defect evidence. After correcting default exports it reproduced
two create calls from repeated same-turn input. Its failure feedback test already
passed with the new catch. The submission ref then addressed duplicate creation,
input/close locking and final selection. Another post-fix gate witness checks
retained actual patient input when the archive omits the original patient.

## Release gates

The final full `npm run check` passed: typecheck, lint with zero warnings,
formatting, 117 suites / 1507 app tests and three workflow tests. The exact
run is retained in ignored `check-final-source.log`. No application source
changed after that run. The owner then requested review of all five open PRs;
this source slice is being preserved separately from that review.

Application commit `466a1a886bba55b05defed59a1b741c7f7e21b5d` was pushed with
the ordinary pre-push check green. Exact-source CI `37573104289` was directly
verified completed/success. No standalone 0.11.26 native package/acceptance was
executed before the owner redirected priority to PR review. Later native gates
for the source continuation are recorded in validation-0.11.27; source tests
are not device evidence.

## Remaining limits

This is process-local ownership. It does not make contact/lab manual raw fields
crash-recoverable or supply durable capture/note-draft stopped-voice publication.
It does not cover every remaining form/module, native delivery/share completion,
power loss/low space, large-record performance, physical-phone timing, validated
clinical tools or the full feature roadmap. Software, CI, build, emulator and
physical-device evidence remain distinct.
