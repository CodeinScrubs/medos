# Reviewing MedOS in ten minutes

For a developer looking at this repository for the first time, or checking work produced by
an AI session. It assumes nothing about the project.

## What it is

One physician's personal clinical record, on their own Android phone. Expo SDK 57 /
React Native, expo-router, SQLite through Drizzle, everything offline, encrypted backup
files the owner controls. Persian right-to-left interface, Gregorian dates stored and
Jalali dates displayed. One app, no backend, no telemetry or multi-user account system.

## First: does it hold together?

```bash
npm install
npm run check     # typecheck, architecture lint, formatting, app and workflow tests
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

`lib/` separates text/date/number rules from React and the database. Some modules
(ids and cryptographic bindings) still need platform adapters; do not assume that
the whole directory runs unchanged in a web client. `features/<name>/`
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
  filters on it. Recovery UI coverage differs by entity; read the current
  execution ledger rather than assuming that soft deletion alone makes every
  record easy to recover.
- **Writing into a replaced dataset.** A mounted editing intent retains its original
  generation, including late child editors and delayed dialog callbacks. The
  native restore engine alone has replacement authority. Examine `dataset-intent`,
  `AutosaveScope`, `lib/dataset-write.ts` and `db/write-admission.ts` together.
- **Success before acknowledgment.** Autosave must retain failed text and navigation
  must await a true flush. Message preparation is `ready`; only the owner's
  confirmation is `sent`. An Android reminder being scheduled is not evidence
  that it was delivered on the owner's phone.

## Current review focus

Start with the newest entry in `docs/HANDOFF.md`, then its version-specific
validation report and `docs/IMPLEMENTATION.md`. Read the exact commit named there;
earlier test counts, PR checks and APKs are evidence for their own source only.

For the 0.11.29 change, review these bounded areas:

| Area | Read together | Principal checks |
|---|---|---|
| Active shift deck | `features/shifts/queries.ts`, `workspace.tsx`, `deck.ts`, `shift-card.tsx`, `shift-patient-row.tsx` | One watched snapshot; tasks belong to the pinned encounter/shift; filtering keeps pending editors mounted; reorder is an atomic compared permutation |
| Occasion recovery | `occasion-form-draft.ts`, `occasion-form-queries.ts`, `use-occasion-form.ts`, `occasion-form-screen.tsx` | Exact raw input; synchronous publication/retirement; revision/base conflicts; one exit guard; original generation through retries/dialogs |
| Message handover | `greeting-composer.tsx`, `messages-queries.ts`, `occasions-section.tsx` | Every channel accessible; failed opening creates no log; SQL retry does not reopen; sent time is idempotent; full history remains accessible |
| Calendar | `lib/jalali.ts`, `lib/date-input.ts`, their tests | Strict syntax, month/leap boundaries, unsupported stored-date recovery and independent ICU comparison in the documented practical range |

The 0.11.30 follow-up addresses actual native findings: read
`use-occasion-form.ts` with its deferred-reminder/focus test. A late global Back
must not pop a newer route. Shift/round use explicit safe edges only on routes
with a native header; bottom navigation protection remains. Inline options must
not remount the clinical editing scope. Native/software source checkpoints and
artifact hashes stay separate in the two validation reports.

For 0.11.31, read capture `writer.ts`, `queries.ts`, `capture-screen.tsx`,
both inbox containers and `capture-card.tsx` alongside attachment
`recording-queries.ts`. Reservation must precede native IO; capture kind/media/job
acknowledgment is atomic; pending voices protect cleanup/filing. Cards, choices,
recorders and delayed dialogs keep the parent's original dataset intent. Verify
the actual-handler tests `capture-screen.test.tsx`, `inbox-intents.test.tsx` and
`capture-card.test.tsx`, plus both real-SQLite query suites. This reuses the
existing journal; draft-note voice and pre-journal interruption remain open.
See `docs/validation-0.11.31.md` for the separate source and native evidence.

The following integration test accelerates a 24-hour shift in real SQLite. It is
not a 24-hour Android soak test or a physical-device performance measurement.

```bash
npm run test --workspace=@medos/mobile -- --runInBand --runTestsByPath src/features/shifts/heavy-shift.test.ts src/features/shifts/shift-deck.test.tsx src/features/doctors/occasion-form-screen.test.tsx src/features/doctors/greeting-composer.test.tsx src/features/backup/restore.test.ts
```

A senior review should also check open P0 items in the ledger, package advisories,
signed APK/upgrade evidence and the separate physical-phone acceptance gates.
Green tests or an emulator smoke run do not establish complete paper replacement,
power-loss safety or clinical validity of a calculator.

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
