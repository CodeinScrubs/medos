# Reviewing MedOS in ten minutes

For a developer looking at this repository for the first time, or checking work produced by
an AI session. It assumes nothing about the project.

## What it is

One physician's personal clinical record, on their own Android phone. Expo SDK 57 /
React Native, expo-router, SQLite through Drizzle, everything offline, encrypted backup
files the owner controls. Persian right-to-left interface, Gregorian dates stored and
Jalali dates displayed. Roughly 15k lines of TypeScript, one app, no backend.

## First: does it hold together?

```bash
npm install
npm run check     # typecheck, lint (incl. architecture rules), formatting, ~280 tests
npm run brief     # version, recent commits with the agent that made them, open threads
```

Same checks run in CI on every push (`.github/workflows/ci.yml`), plus two that only make
sense on a clean machine: the schema and its migrations must agree, and the app must
bundle for Android.

## Then: the five files that explain the design

| File | What it tells you |
|---|---|
| `AGENTS.md` | The contract: locked product decisions, the eleven invariants, where code goes, the session protocol |
| `docs/architecture.md` | Why each technical choice was made, and what was rejected |
| `apps/mobile/eslint.config.js` | The architecture, as rules a machine checks |
| `apps/mobile/src/db/schema/` | The whole data model, one file per area, commented |
| `apps/mobile/src/features/backup/format.ts` | The backup file format, specified well enough to write a decoder from |

## How the code is arranged

```
lib  <  theme, db, platform  <  components  <  features  <  app
```

`lib/` is pure TypeScript (Persian text, Jalali dates, number parsing, crypto) with no
React and no database — the part a future web dashboard would share. `features/<name>/`
holds one module each: screens, `queries.ts` (all the SQL), `logic.ts` (pure rules, easy to
test), `labels.ts`, `settings.ts`. `app/` is routes only; each file re-exports one screen.

The arrows are enforced: a wrong-direction import fails the lint, as does a colour literal
outside the theme, SQL in a screen, an `async` callback inside `db.transaction()` (this
driver commits immediately, so it would silently not be a transaction), and a hard delete
of clinical data.

## What to be suspicious of

This is a medical record kept by one person, so the failures that matter are quiet ones:

- **A number read wrongly.** `parseDecimal` / `parseLabNumber` (`lib/persian.ts`,
  `features/labs/flags.ts`) decide what `7,500` and `۱۲٫۵` mean. Tests in
  `lib/persian.test.ts` and `features/labs/labs.test.ts`.
- **A search that silently misses.** Everything searchable carries a normalised
  `searchText` column; `SEARCH_INDEX_VERSION` forces a rebuild when the rules change.
- **A backup that cannot be opened later.** Passphrase normalisation schemes are frozen by
  golden keys in `lib/crypto.test.ts`; the file format is version-tagged; restore verifies
  the whole file, keeps a snapshot, and rolls back on a foreign-key violation.
- **Data disappearing.** Nothing is hard-deleted; `deletedAt` is stamped and every query
  filters on it. (Today only patients can be restored from the UI — see the open threads in
  `docs/HANDOFF.md`.)

## How work arrives here

Sessions are usually AI agents, sometimes different models on different days. The protocol
is in `AGENTS.md`: read the rules and the handoff, run `npm run check` before and after,
commit with an `Agent:` trailer, and append an entry to `docs/HANDOFF.md` saying what was
verified and what was not. `git log` and that file together answer "who changed this, and
did anyone actually test it?".

A pre-push hook runs `npm run check` locally; CI runs it again on GitHub.

## Building the app

`npm run apk` produces a signed release APK. The signing key lives in `private/`, which is
gitignored and must never be committed — an APK signed with a different key cannot update
the phone's existing install without deleting its data. Details in `docs/android-build.md`.
