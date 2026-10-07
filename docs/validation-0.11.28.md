# 0.11.28 — patient overview read truth and coherent order scope

## Scope and baseline

The owner repeated the all-PR/project review request. Clean main was
`a3136e764bda4cf0fc793e0fd72e0a19c3a1e32d`, version 0.11.27 / code 43.
Fresh `git fetch` and GitHub inventory found the same five open, unmerged heads
listed in [project-audit-2026-10-07.md](project-audit-2026-10-07.md).
Exact-main CI `37583735329` was completed/success. Their previous block/revise
dispositions remain; no remote merge, approval, closure, comment or message was
performed. The previous 24 failed PR checks are not recounted as new findings.

The unchanged source passed `npm run check`: 118 suites / 1515 app tests,
three workflow tests, typecheck, lint and formatting. Work was performed solo.

## Finalized defect witnesses

Before production changes, the corrected probes typechecked and the existing
read-error suite produced **16 failed / 27 passed** checks. All new failures were
assertions about observable behavior, not runtime/test-harness exceptions:

- Cached-empty follow-up/contact/diagnosis/consult refresh failure still claimed
  absence; unloaded reads claimed zero. These four paths need retry and retain
  available clinical input/rows rather than looking successfully empty.
- Loaded follow-ups and contacts lacked their independent failure feedback.
- Admission loading/failure offered new admission as though absence was known;
  loaded admission refresh failure had no warning/retry.
- Admission elapsed time used the wall clock directly rather than the shared
  live clock. Advancing the screen clock did not update its duration.
- Important-note failure had no local warning; partially typed impression could
  not be explicitly recovered through the existing error notice's absent retry.
- Snapshot encounter failure was omitted entirely; order failure had no retry.

Sixteen checks are **not sixteen independent bugs**; several pin the same
read-state defect. The stand-in now propagates failures to real joined queries,
so timeline retry expects both the panel and joined-value reads to recover.
An initial fixture used invalid follow-up channel `phone` instead of `call`,
and a nullable timestamp assertion needed narrowing. Both were corrected before
the cited typecheck/red run; neither is a production defect. The clock assertion
uses exact text rather than a substring that could match a different duration.

## Resulting change

- Existing overview/diagnosis/consult sections expose retry only on failure,
  keep loaded rows and editor input, and suppress unreliable totals/empty claims.
- Admission display uses `useNow`; no admission timestamp or medication-day
  semantics change.
- Snapshot orders use `patientCurrentOrdersQuery`: one SQLite statement reuses
  current encounter selection, includes standing/current episode orders, omits
  previous/foreign/deleted episodes and watches the real encounter table.
  The explicit historical-episode query is unchanged.
- Cached snapshot data remain visible with warning, without a current order total
  or unflagged-lab success claim while that source failed. Retry targets only
  failed reads. No additional patient navigation/removal guard is introduced.
- Version 0.11.28 / code 44; no schema, migration, dependency, backup format,
  permission, clinical formula, telemetry or new normal-path dialog.
- Correct architecture's blanket portability claim: native id/crypto bindings
  require an adapter in a future runtime; a folder boundary is not proof of
  unchanged web reuse.

## Software and release gates

The first post-fix targeted run passed 53 checks across the read-error/snapshot
suites and typecheck. Two additional cache/retry regressions were then added.
Full final check, source commit, exact-source CI and signed/native evidence are
recorded separately. Final `npm run check` passed on the finalized source:
typecheck, lint with zero warnings, formatting, 118 suites / 1536 app tests and
three workflow tests. The 21 added checks cover read recovery, cached failures,
episode scope and encounter-event refresh. No test timeout was increased.
Exact-source CI and signed/native evidence are still pending below; do not infer
them from the software checks.

Private test evidence is under `private/overview-*` and
`private/check-review-refresh-2026-10-07.log`. Only synthetic records are used.

## Not established

No physical-phone run, 40-patient timing, whole-shift paper replacement,
message/alarm delivery, native SQL failure injection, process-death/low-space
matrix, clinical validation or competitor advantage is proved by these tests.
Stopped voices for new drafts/captures, broader manual raw-field recovery,
reordering/trash/moves, rich text, direct workbook import, transcription/semantic
retrieval and dependency-advisory triage remain in IMPLEMENTATION. No dependency
advisory was repaired in this slice.
