# Validation of discharge preflight (0.11.69)

This change addresses the first finding in the
[workflow audit](https://github.com/CodeinScrubs/medos/issues/21).
It builds on [PR 22](https://github.com/CodeinScrubs/medos/pull/22)
at `2ad3231`. Android versionCode is 85.
The frozen application source is `4f96f82bace4615e89143b6b74c575f449bd0ead`
in [PR 23](https://github.com/CodeinScrubs/medos/pull/23).

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
  Running the checks by themselves passed without changing that test. The
  normal pre-push hook repeated the pass.
- [PR 23 hosted CI](https://github.com/CodeinScrubs/medos/actions/runs/45989639899)
  passed on the frozen source, including the migration check and Android bundle.
- [PR 22 CI](https://github.com/CodeinScrubs/medos/actions/runs/45953024253)
  passed for the integrated ward intake source. Its .68 Android build
  reached Ninja and failed to create a generated object path of 352
  characters. The .69 build uses a shorter isolated Windows checkout.

## Signed Android packages

Both artifacts were built from the frozen checkout. They have package
`com.shayan.medos`, version 0.11.69/code 85, minSdk 24, targetSdk 36 and
the existing release signer. Required native libraries and the single ABI
were inspected on each file.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Local owner `dist/MedOS-0.11.69.apk`, arm64-v8a | 53,580,863 | `b75418a16cc527e89bbc7decd02fb40a047ca895ba744bd247c246ae111b2446` |
| Private QA package, x86_64 | 55,189,190 | `e89ab0097cb88a00603f600da5dc211db31a3949eeb362a64b253a7e4de408d2` |

Signer SHA-256: `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
The clean arm64 build passed in 14m 14s and the x86_64 build in 8m 2s.
On the short checkout the longest of the 14 relevant keyboard-controller
object paths was 245 characters. The owner artifact remains local.

## Synthetic emulator workflow

- Installed the inspected QA bytes over 0.11.50 using Android's in-place
  upgrade. Pulled the installed package and verified its SHA-256. The
  existing patient list and open 40-patient shift loaded.
- Tapped the batch action for the one remaining admitted patient. The
  loaded count rose to 41 and the batch action disappeared. A forced cold
  start produced a distinct PID and retained all 41 in the count.
- Entered an exact synthetic discharge summary. Reopening after the cold
  start recovered the text and showed the open task in the preflight
  preview. Saving returned to the same chart, marked discharged.
- The shift retained the discharged episode with its visible marker. Its
  specific outstanding task could still be opened and showed its completion
  and cancel controls. Neither app PID had a matching fatal in the bounded
  crash-buffer inspection.
- System UI showed an ANR around boot, cleared through the observed Wait
  button. An early cold snapshot showed the loading state. The later UI
  acknowledged the count and draft. These are separate from the application
  action results.
- The read-only AVD acknowledged shutdown. Its launcher and ADB serial
  disappeared, and the two base images retained their preflight sizes
  and SHA-256 hashes.

## Acceptance still open

Failed preflight and the stale-read race have mounted SQLite tests.
The emulator run covered the successful button path and cold recovery. It
did not compare complete before/after archives on .69 or simulate a native
read error. Measure the broader ward workflow, image edit and capture,
reminder delivery and backup recovery on the owner's phone. Continue the
issue 21 findings, especially specimen-specific lab trends and visible
encounter transitions in a shift.
