# Copilot instructions

Read [`AGENTS.md`](../AGENTS.md) in the repository root before suggesting or editing
anything, and [`docs/HANDOFF.md`](../docs/HANDOFF.md) for what the previous session did.
They are the contract; this file is a pointer.

Run `npm run check` before you start and before you finish.

Non-negotiables: never hard-delete clinical data (soft delete with `deletedAt`); clinical
numbers stay in Latin digits and are parsed with `parseDecimal` / `parseLabNumber`; search
goes through `searchText` + `matchesSearch`; dates stored Gregorian, displayed Jalali;
`db.transaction()` callbacks are synchronous; schema changes are additive with SQL-level
defaults plus a generated migration; the backup format and passphrase schemes are frozen;
no patient data in logs; clinical tools only within the validation and physician-review
gates of invariant 10 in AGENTS.md; the repository is public, so no keys,
patient data or personal details of the owner.
