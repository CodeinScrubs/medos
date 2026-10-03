# Validation scope: 0.11.21

Version 0.11.21 / Android code 37 introduces pre-commit database-write admission
and immutable editing-intent generations. No migration, archive/key scheme,
dependency, permission or new route changed. Read architecture's matching decision
for the intentional post-commit admission boundary and remaining manual forms.

## Reproduction and software evidence

A new test on the previous source entered `recordVital` from actual archive
unpacking progress. The write was acknowledged and later erased by replacement:
the expected rejection failed (one failure, 28 skipped cases). On the new source
the ordinary write rejects before clinical metadata changes, while the explicitly
trusted snapshot/settings/import path succeeds.

Real migrated SQL tests cover lazy and already-prepared Drizzle mutations,
returning queries, synchronous transactions, raw batches, public `$client`,
read availability, revocable trusted authority across awaits, active-writer
refusal and reservation release. The installed Expo Drizzle driver is also
exercised with contract-preserving native prepare/execute stand-ins, including
PRAGMA preparation and statements prepared before admission closes.

Mounted actual note/order editors keep old local input when a real attached
database import replaces same-ID records or removes the note. Old save handlers,
timers/unmount flush and confirmed draft discard cannot mutate restored rows;
a new empty editor cannot insert its first draft after replacement. Live-query
timing is a synchronous stand-in, not native rendering evidence.

Mounted navigation and voice controls cover confirmed local-only stale exit,
generation change during a clean flush, delayed voice-delete/recovery dialog
confirmation, and stale recorder handoff/discard rejection. Native recording
and navigation dispatch are stand-ins. Autosave retains stale pending input
without automatic retry and holds admission through rejected async writes.

The first full typecheck exposed a test-helper return type that dropped a
protected Drizzle member; the helper now preserves the database's original type
and the production database declares its public connection surface explicitly.
Scoped lint rejected render-time ref reads in retained EditGate input; the
initial seed now uses a conditional, one-time state adjustment. No lint rule
was suppressed for those problems.

Full `npm run check` passed typecheck, lint without warnings, formatting,
107 suites / 1335 app tests and all three workflow tests. Exact-source CI,
artifacts and native acceptance remain pending until actual outcomes are recorded
here. Partial targeted runs are not release acceptance. Two read-only reviewers
informed implementation; their final review
attempts could not run because their account usage limit was reached. The primary
agent owns source review and all checks/builds/native operations.

## Remaining boundaries

- Other manual forms, raw-draft comparison/load/discard handlers and ordinary
  async continuations do not yet all carry the original generation.
- New intents may write after SQL commit while restore housekeeping continues.
  The file-maintenance lease remains held; whole housekeeping is not atomic.
- Stale input retention is in process. It is not independent backup, durable
  recovery export, process-death or power-loss evidence.
- Draft-note and quick-capture voice still need durable pre-ack journals;
  active/pre-journal recording and originals before crop remain separate work.
- No physical-phone claim, complete clinical review, low-space/provider failure
  guarantee or proof that every product requirement is finished.
