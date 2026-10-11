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

Same checks run in CI on pushes to main and on every pull request
(`.github/workflows/ci.yml`), plus two that only make sense on a clean machine:
the schema and its migrations must agree, and the app must bundle for Android.

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

PR6 contains the .51 recovery pilot (`a541ce5`), .52 Kardex context correction
(`41a592b`) and .53 discharge scope (`e357dbf`). Read their validation reports
for each source's automated, hosted, native and inspected-APK boundaries.
The current owner arm64 .53 artifact is built and inspected from `e357dbf`,
whose actual native preview/publication and complete-state comparisons pass.
No physical phone run is implied. Later documentation commits do not change
the application bytes used for those witnesses; never substitute an older APK.

The separate `codex/kardex-form-recovery` continuation starts at PR6's delivered
`e68e6a4`, whose CI38029238968 also passes. Review this incremental diff against
that parent: .54 extends the shared lifecycle with an explicit clinical parent
key and feature-owned Order validation/publication. Its full-source, bounded
native and inspected .54 owner-APK witnesses pass on frozen d69163d.
Read validation-0.11.54 for complete-state comparison details;
Exact d403933 passes CI38034525674. Draft PR7 remains separate from its
prerequisite PR6 and physical-phone acceptance.

| Area | Read together | Principal checks |
|---|---|---|
| Raw workspace recovery | lib/form-document.ts; features/workspace-forms/queries.ts, form-gate.tsx, use-form.ts; knowledge/form-draft*.ts | Strict version/context; exact partial input; complete published basis and revision CAS; publication/retirement/audit atomically; adoption never publishes |
| Raw Kardex recovery | kardex/form-draft*.ts, form-recovery.test.tsx, order-form-screen.tsx; workspace-forms; validation-0.11.54 | Immutable patient/episode key; invalid raw dates/whitespace; no clinical order until Save; complete-basis conflict; audit rollback; original focus/dataset and one removal guard; patient-scoped recovery pages |
| Historical teaching links | knowledge/queries.ts, topic-form-screen.tsx, form-drafts.test.ts, form-recovery.test.tsx | Retain an unchanged archived teacher/specialty and search names; refuse a newly selected unavailable reference; inspect selected IDs during refresh |
| Kardex creation/display | kardex/queries.ts, order-form-screen.tsx, creation-context.test.ts, mutations.test.ts; notes/dataset-editors.test.tsx | Original active episode including null; every other stored reference, including an empty key, needs live ownership; retain original allergy display across restore without freezing ordinary corrections |
| Discharge orders | kardex/queries.ts, creation-context.test.ts; encounters/queries.ts; records.test.ts; validation-0.11.53 | An explicit empty episode is distinct from null; only the original patient's episode orders end, preserving inconsistent imported foreign rows |
| Clinical note recovery | notes/draft-queries.ts, commit-queries.ts, note-editor-screen.tsx, dataset-editors.test.tsx | Preserve original patient/encounter including null, visible date/clock and meaningful voice; scoped draft ID; compare before publication; one original removal guard |
| Voice/media lifetime | capture/writer.ts and queries.ts; attachments/recording-queries.ts; notes/draft-recording.test.ts | Reserve before IO; metadata acknowledgment; copied-file retry; original ownership across filing/restore; no staging-only recovery claim |
| Native close/navigation | components/screen-options.tsx, use-save-before-leave.ts; notes/media-editors.test.tsx; validation-0.11.33/.34/.48 | Retain scroll host/native stacking parents and header presence; late acknowledgments close only the originating focused route |
| Deck/calendar/messages | shifts/queries.ts and workspace.tsx; doctors/occasion-form-queries.ts and greeting-composer.tsx; lib/jalali.ts and date-input.ts | Matching preview/count/destination scope, explicit priority, stable order; leap dates and raw partial input; prepared is not sent |

The incremental `codex/remaining-form-recovery` starts at delivered PR7 `3d458ab`.
Review its .55 diff against that parent: five notebook forms reuse the existing
engine, with feature-owned codecs and transactional publishers. Read
validation-0.11.55 for actual software/native/artifact boundaries. Principal
files are `knowledge/notebook-form-drafts.test.ts`, both knowledge form screens,
`places/form-draft*.ts`, `places/form-recovery.test.tsx`, `vault/form-draft*.ts`
and `vault/form-recovery.test.tsx`. Check exact secret whitespace, expiry text,
partial prescription lines, complete record basis, audit rollback and original
references/focus/dataset, including children first mounted after replacement.
Explicit credential replacement/clear must also clear the legacy cipher/nonce;
an unrelated edit must retain them. A raw draft never counts as publication.

Other P0 and product gates remain in IMPLEMENTATION. Versioned reports preserve
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
