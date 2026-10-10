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

No schema, dependency, route, permission, UI, clinical formula or archive/KDF change.
Version edits affect only the four app metadata locations and the three allowed
lockfile version fields.

## Remaining gates

Six manual forms still need raw recovery; Kardex additionally retains original
clinical context/basis before separate publication. The rest of D05 and the
other P0/product/performance/physical-phone gates remain in IMPLEMENTATION.
