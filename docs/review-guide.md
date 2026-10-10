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

PR6 contains the .51 recovery pilot (`a541ce5`) and the final .52 Kardex
ownership correction (`41a592b`). Read validation-0.11.51 and
validation-0.11.52 for each source's automated, hosted, native and inspected-APK
boundaries. The current owner arm64 .52 artifact is built and inspected from
`41a592b`; no physical phone run is implied. Later documentation commits do not
change the application bytes used for those witnesses.
The .53 follow-up corrects explicit-episode order reads and discharge's patient
filter. Its source checks pass; its separate native/artifact/hosted gates are in
validation-0.11.53. Do not substitute an earlier artifact for this changed source.

| Area | Read together | Principal checks |
|---|---|---|
| Raw workspace recovery | lib/form-document.ts; features/workspace-forms/queries.ts, form-gate.tsx, use-form.ts; knowledge/form-draft*.ts | Strict version/context; exact partial input; complete published basis and revision CAS; publication/retirement/audit atomically; adoption never publishes |
| Historical teaching links | knowledge/queries.ts, topic-form-screen.tsx, form-drafts.test.ts, form-recovery.test.tsx | Retain an unchanged archived teacher/specialty and search names; refuse a newly selected unavailable reference; inspect selected IDs during refresh |
| Kardex creation/display | kardex/queries.ts, order-form-screen.tsx, creation-context.test.ts, mutations.test.ts; notes/dataset-editors.test.tsx | Original active episode including null; every other stored reference, including an empty key, needs live ownership; retain original allergy display across restore without freezing ordinary corrections |
| Clinical note recovery | notes/draft-queries.ts, commit-queries.ts, note-editor-screen.tsx, dataset-editors.test.tsx | Preserve original patient/encounter including null, visible date/clock and meaningful voice; scoped draft ID; compare before publication; one original removal guard |
| Voice/media lifetime | capture/writer.ts and queries.ts; attachments/recording-queries.ts; notes/draft-recording.test.ts | Reserve before IO; metadata acknowledgment; copied-file retry; original ownership across filing/restore; no staging-only recovery claim |
| Native close/navigation | components/screen-options.tsx, use-save-before-leave.ts; notes/media-editors.test.tsx; validation-0.11.33/.34/.48 | Retain scroll host/native stacking parents and header presence; late acknowledgments close only the originating focused route |
| Deck/calendar/messages | shifts/queries.ts and workspace.tsx; doctors/occasion-form-queries.ts and greeting-composer.tsx; lib/jalali.ts and date-input.ts | Matching preview/count/destination scope, explicit priority, stable order; leap dates and raw partial input; prepared is not sent |

Six manual forms still need raw recovery. Orders additionally need original
patient/encounter and clinical basis; credentials retain exact secret whitespace.
Other P0 and product gates are in IMPLEMENTATION. Versioned reports preserve
older change/retest details; this guide is not a chronological release history.

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
