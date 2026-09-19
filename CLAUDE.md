# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first — all of it.** It is the contract for every session,
human or AI: the project's locked decisions, the invariants, where code goes, how to test,
and the check-in / check-out protocol. This file exists only because Claude Code loads it
automatically; it is a pointer, not a second set of rules.

Then read [`docs/HANDOFF.md`](docs/HANDOFF.md) — the previous session's own account of what
it did, what it verified, and what it left open.

```bash
npm run brief     # state of the repository in one screen
npm run check     # typecheck + lint + formatting + tests: green before and after your work
```

## The short version you must not get wrong

1. Never hard-delete clinical data — soft delete with `deletedAt`.
2. Clinical numbers stay in Latin digits; parse them with `parseDecimal` / `parseLabNumber`.
3. Search goes through `searchText` + `matchesSearch`, rebuilt from the merged row.
4. Dates are stored Gregorian, displayed Jalali.
5. `db.transaction()` callbacks are synchronous — no `async`, use `.run()`.
6. Schema changes are additive, with SQL-level defaults, plus a generated migration.
7. The backup format and passphrase schemes are frozen; add a scheme, never change one.
8. No patient data in logs, errors or anything that leaves the app.
9. MedOS records, it does not advise.
10. The repository is public: no keys, no patient data, no personal details of the owner.

Reply to the owner in **Persian**. Say plainly what you verified and what you did not — you
cannot test on a phone from here.
