# Discharge order scope — 0.11.53/code69

This follows the inspected .52 source/artifacts in validation-0.11.52.
It corrects two SQL scopes, not a new feature or completed release.

## Reproduction and contract

A migrated-SQLite probe against the previous code creates a live imported
empty-string episode, one episode order and one standing null order. Asking
for the explicit empty episode returns only the standing order; the probe fails
in7.825 seconds. The discharge screen uses this query for its ending-order
preview. Records remain present: this is a read omission, not deletion.

Only null means an outpatient read. Every explicitly requested string, including
an empty imported key, selects that episode plus standing orders. Other episodes
and soft-deleted orders remain excluded. No identifiers are repaired or merged.

Three new regression cases cover an empty and ordinary historical episode after
a later admission, standing orders, soft-deleted rows, unchanged stored rows and
the separate null request. The existing mutation/context/read-failure/mounted
editor coverage remains. Five targeted suites pass178 tests in29.655 seconds,
without act warnings. Full checks, hosted CI and this version's native/artifact
acceptance are pending at this checkpoint; older .52 evidence stays scoped to
its original source.

A second migrated-SQLite probe inserts an inconsistent cross-patient order that
still satisfies SQLite foreign keys. Discharging the referenced episode changes
that other patient's active/held order to completed; both pre-fix cases fail
in8.141 seconds. The ending-order update now requires both the episode and its
patient. Two regression cases retain every foreign order/patient field while
proving the legitimate patient's own order still ends. No malformed link is
repaired or moved. This is protection for an inconsistent import, not evidence
that ordinary app entry creates that inconsistency.

The first candidate with the read correction alone passes 164 suites/2,357 app
tests and five workflows in156.441 Jest seconds. After the additional mutation
guard, a separate final full check passes 164 suites/2,359 app tests and five
workflows in157.338 Jest seconds. Typecheck/lint/both formatting checks pass,
without act warnings. Hosted/native/artifact acceptance remains pending.

The frozen application source is `e357dbf`; its native/artifact results follow.
The normal push repeats the full check successfully: 164 suites/2,359 app tests
and five workflow tests, with 152.393 Jest seconds and clean typecheck/lint/formatting.
[Hosted CI 38028660734](https://github.com/CodeinScrubs/medos/actions/runs/38028660734)
passes on exact branch checkpoint `5fe3c14a24e4355c01992606c04a2d676684d7b1`,
including migration regeneration and the Android bundle. The application tree
is unchanged between `e357dbf` and this documentation checkpoint. The current
[PR6 checks](https://github.com/CodeinScrubs/medos/pull/6/checks) remain the authority
for any later branch checkpoint; an earlier passing run is not a new-head check.

No schema, dependency, route, permission, UI, clinical formula or archive/KDF change.
Version edits affect only the four app metadata locations and the three allowed
lockfile version fields.

## Native and complete-state witnesses

The inspected x86_64 .53/code69 package is installed in place, and pulled
installed bytes match its hash. Independent authenticated exports compare all
50 application tables (excluding settings, backup/audit bookkeeping and migration
metadata) and every media hash. Upgrade preserves all 4,117 previous application
rows and all 34 media files. The named fixture then exactly matches all 4,129
intended rows, including an explicit empty episode, two owned live orders, a
deleted order, a standing order and two inconsistent cross-patient links.

On the actual Android discharge page, the original patient identity and
two-ending-orders preview are visible. Separate Save succeeds with PID4550
retained. The full exported state has exactly the intended 4,130 application
rows: only the two owned orders end, their end times match the discharged episode,
the legitimate patient's status changes and one retired discharge receipt is
added. Every foreign patient/order field, standing/deleted order, unrelated row
and media hash stays exact. All database integrity and foreign-key checks pass.
This checks complete intended states, not selected rows or counts alone.

Authenticated archive SHA-256 values:

| Stage | SHA-256 |
|---|---|
| Upgrade | `d80ca5cf94f63e0ea5e4852d90e6e319129eb76363308c0bed071b5c47a0ba73` |
| Imported fixture before publication | `5d38460163ba66bbe0ec3c2c5aef78bab03c79861435dd68a7b957bd28c135da` |
| After actual discharge | `84e1fded2c1561196bb9de08c206cc354f4aea2fb831f81684876d0bad3d1f1e` |

No app fatal or app ANR is observed in the checked process crash/event buffers.
Initial observation is blocked by an actual System UI ANR dialog; choosing its
observed Wait button allows the app to appear. One private driver first uses
the plural list route instead of the actual singular patient route, then stops
before Save because it tries to overwrite PowerShell's constant PID variable.
Both harness errors are corrected before the successful native/publication and
complete-state comparisons. These failed observations are not application passes.

The named restore's completion is observed and acknowledged; about61.924 seconds
include its polling and do not establish restore/KDF phases or phone performance.
The owned read-only emulator does not exit after an acknowledged emu kill.
Only its exact SDK/AVD/port/read-only child and launcher are verified and stopped;
no shared ADB server or unrelated process is stopped. Original userdata and
encryption QCOW2 hashes remain byte-identical afterward.

## Inspected packages

Both packages come from frozen `e357dbf`, identify com.shayan.medos,
version0.11.53/code69, minSDK24/target36, and contain their essential JNI libraries.
The established signer SHA-256 remains
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Package | Bytes | SHA-256 |
|---|---:|---|
| Private x86_64 QA package | 55,016,134 | `dcf791efa6ea0ee230a0773fab3a9d93df3f8b447f672ff385b4236c57728297` |
| `dist/MedOS-0.11.53.apk`, arm64-v8a only | 53,407,807 | `76aabc45a2f362261b0c58604a7e8782cf2034d7d11a682d5c0578ba899c6108` |

The QA build succeeds in11m19s and the owner build in8m27s after cleaning only
the generated app build for each ABI switch. Source stays unchanged during
both builds. Existing Windows path/Gradle future-version warnings are not
asserted repaired. The owner artifact is inspected, not run on a physical phone.
The .52 original-context/replacement-form witnesses retain their own41a592b
source attribution; they are not silently relabeled as .53 native tests.

## Remaining gates

Six manual forms still need raw recovery; Kardex additionally retains original
clinical context/basis before separate publication. The rest of D05 and the
other P0/product/performance/physical-phone gates remain in IMPLEMENTATION.
