# Validation of discharge preflight (0.11.69)

This change addresses the first finding in the
[workflow audit](https://github.com/CodeinScrubs/medos/issues/21).
It builds on [PR 22](https://github.com/CodeinScrubs/medos/pull/22)
at `2ad3231`. Android versionCode is 85.

## Behavior

A single live SQLite read collects ending Kardex orders for the original
admission, plus outstanding tasks, consultations and pending follow-ups
for that admission or the patient as a whole. The discharge control
waits for a successful read. A read failure retains the raw summary and
shows retry. A previously rendered Save action cannot use an invalidated
screen snapshot.

Publication compares the exact set of affected record IDs inside the same
transaction as discharge and draft retirement. A changed set leaves the
admission open and refreshes the preview for another explicit tap. Only this
admission's active or held orders become completed. Open tasks,
consultations and follow-ups keep their saved status.

The existing screen shows brief counts. Reviewing individual results and
explicit handoff or follow-up outcomes remain the next workflow slice.

## Evidence

- Two mounted-screen witnesses on the previous source closed the admission:
  after a failed outstanding-task read and after an open task appeared in
  the live-query coalescing window. The corrected screen retains the draft
  and keeps the admission open in both cases. A fresh tap after recovery
  succeeds.
- The query test covers a prior encounter, current Kardex, patient-level
  task, consultation and follow-up. The targeted run passed all 130 tests
  across five suites, including draft recovery, ownership and discharge.
- Full `npm run check` passed with 197 suites, 2,959 app tests and five
  workflow tests. Typecheck, lint and formatting passed. A first run
  overlapped the Android build and hit the Kardex editor test deadline.
  Running the checks by themselves passed without changing that test.
- [PR 22 CI](https://github.com/CodeinScrubs/medos/actions/runs/45953024253)
  passed for the integrated ward intake source. Its .68 Android build
  reached Ninja and failed to create a generated object path of 352
  characters. The .69 build uses a shorter isolated Windows checkout.

## Acceptance still open

Run the released bytes on Android and verify failed preflight, retry and a
successful discharge with synthetic outstanding work. Measure the broader
ward workflow and backup recovery on the owner's phone. The other source
findings in issue 21 still need their own fixes and witnesses, especially
specimen-specific lab trends and visible encounter transitions in a shift.
