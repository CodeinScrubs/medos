# AGENTS.md — the contract for anyone, human or AI, working on MedOS

This file is the single source of truth for how work happens in this repository.
`CLAUDE.md`, `.cursor/rules/medos.mdc` and `.github/copilot-instructions.md` are thin
pointers to it; keep them thin, and change the rules here.

**Nothing important lives in a chat window.** Every rule, decision and piece of state that
the next session needs is a file in this repository. Assume the next session is a different
model, from a different company, with no memory of this one.

---

## 1. Start here (check-in, every session, no exceptions)

```bash
npm install          # first time only
npm run brief        # who did what last, what is open, what to run
npm run check        # typecheck + lint + formatting + tests — must be green before you touch anything
```

If `npm run check` is red before you start, **fix that first or report it** — do not build
on a broken base, and do not assume you broke it.

Then read, in this order:

1. this file, all of it;
2. `docs/HANDOFF.md` — the newest entry is the previous session's own words;
3. `docs/architecture.md` — why things are the way they are, and what was rejected;
4. the code you are about to change, and its test.

## 2. Finish here (check-out, every session)

1. `npm run check` — green.
2. Commit. Message: what changed and **why**, plus the trailer naming who did the work:

   ```
   Agent: <model name> via <tool>      e.g. Agent: claude-opus-5 via Claude Code
   ```

   `git commit` picks up `.gitmessage` as a template when the repo was set up with
   `npm run setup`.
3. Add an entry at the top of `docs/HANDOFF.md` using the template in that file. It is
   short, and it is the only thing the next agent is guaranteed to read.
4. Say plainly, in the chat and in the handoff: **what you verified, and what you did not.**
   "I did not run this on a phone" is a useful sentence. A confident claim that turns out to
   be untested is worse than no claim.

---

## 3. What this project is

MedOS is a **personal clinical operating system** for one physician: their own patients,
their own colleagues, their own notes. It is not a product, not multi-tenant, not for other
users. Do not add sign-up, tenancy, billing, analytics, telemetry, or sharing features.

The owner is a medical student and physician in Iran. They read and write Persian and are
not a professional developer. **Reply to them in Persian**, explain trade-offs in plain
language, and make every command copy-pasteable. Their senior-developer friend may review
the code: keep the code and its documentation in English, and keep both obvious.

### The four locked decisions

Settled at the start of the project. Do not quietly work around them; if one looks wrong,
say so explicitly and let the owner decide.

1. **Android only.** APK sideload, no Play Store. No iOS-shaped compromises.
2. **Persian RTL interface, English clinical fields.** Menus, labels, dates in Persian;
   drug names, diagnoses, lab analytes in English. Jalali dates everywhere in the UI.
3. **Offline-first.** The whole database lives on the phone and works with no network
   inside a hospital. Backups are encrypted files the owner controls. **No patient data on
   third-party servers** — a privacy decision, and a practical one, since the major
   providers block Iranian IPs.
4. **Patients module first.** Other modules land after it.

---

## 4. The invariants (breaking one is a bug, not a style choice)

| # | Rule | Why | Checked by |
|---|------|-----|-----------|
| 1 | **Never hard-delete clinical data.** Stamp `deletedAt`; queries filter `isNull(x.deletedAt)`. | A mistaken delete on a busy shift must be recoverable. | ESLint bans `db.delete(...)`; review |
| 2 | **Clinical numbers stay Latin digits** (`<Text numeric>`). Persian digits are for dates, counts, chrome. | `۱۲٫۵` next to `12.5` on one screen invites a misread dose. | review; `CLINICAL_DIGITS_STAY_LATIN` |
| 3 | **Parse numbers with `parseDecimal` / `parseLabNumber`**, never `Number(rawInput)`. | `7,500` must not become 7.5; `12,5` is ambiguous and must not be guessed. | `persian.test.ts`, `labs.test.ts` |
| 4 | **Search goes through `searchText`** built by the feature's `*SearchText()`, queried with `matchesSearch()`. Rebuild from the merged row, never the patch. Change the rules → bump `SEARCH_INDEX_VERSION`. | Otherwise `علي` misses `علی`, or editing a phone drops the name from the index. | `persian.test.ts`, `queries.test.ts` |
| 5 | **Dates stored Gregorian (ISO or unix ms), displayed Jalali.** Only `occasions` stores Jalali month/day. | Sorting, ranges and export break otherwise; birthdays drift across leap years. | `jalali.test.ts` |
| 6 | **`db.transaction()` is synchronous.** Inside it use `.run()` / `.all()` / `.get()`; an `async` callback commits before your statements run. | Silent data loss. | ESLint bans async transaction callbacks |
| 7 | **Schema changes are additive.** New tables/columns only; NOT NULL needs an **SQL-level** `.default()`, not drizzle's `$default()`. Never edit an existing migration. | The app holds real data, and restore copies the columns old and new schemas share. | CI regenerates migrations and fails on a diff |
| 8 | **Backup compatibility is forever.** The `.medosbak` format and the passphrase schemes in `lib/crypto.ts` are frozen; add a new scheme number instead of changing one. | A changed rule makes every existing backup unopenable. | `crypto.test.ts` golden keys |
| 9 | **No patient data in logs, errors or anything that leaves the app.** Everything goes through `redactErrorText`. | A failed query carries its parameters — names, national ids. | `redactErrorText` test; review |
| 10 | **Clinical tools need explicit validation.** The owner expanded scope on 2026-09-23 to sourced, deterministic scores/algorithms with physician review. Each enabled tool needs source/version, population/exclusions, units, visible inputs, reference/boundary tests and clinical review. Never infer missing inputs or automatically issue diagnoses/orders/treatment. AI output stays a draft. | A chat-generated formula or green software tests do not validate a clinical tool. | per-tool evidence; review |
| 11 | **Ratings and personal profiles about colleagues are private working notes.** Never shared or exported by default. | They are about real, named people. | review |

---

## 5. Where code goes

```
lib  <  theme, db, platform  <  components  <  features  <  app
```

| Layer | Holds | Must not import |
|---|---|---|
| `src/lib/` | Persian text, Jalali dates, numbers, crypto — pure TypeScript | React, device APIs, database, other layers |
| `src/theme/` | design tokens; **every colour lives here** | anything above |
| `src/db/` | schema, connection, typed settings, audit, live queries, startup | UI, platform, features |
| `src/platform/` | device services: media files, notifications, error log | database, UI, features |
| `src/components/` | UI primitives and generic widgets; knows nothing about patients | database, features |
| `src/features/<name>/` | one module: screens, `queries.ts` (all SQL), `logic.ts` (pure), `labels.ts`, `settings.ts` | routes |
| `src/app/` | expo-router routes; each file re-exports one screen | — |

ESLint enforces every arrow above, plus: screens never import `@/db/client`, and colour
literals outside `src/theme/` are an error. A wrong-direction import fails `npm run check`.

### Conventions that are not optional

- IDs `newId()`, timestamps `stamps()` / `touch()` / `softDelete()`.
- Reads use `useLive` (`src/db/use-live.ts`), never drizzle's `useLiveQuery`.
- Edit screens use `EditGate` (`src/components/edit-gate.tsx`) — load the record, then
  initialise form state from it; never copy a loaded record into state with an effect.
  Pass the query's `error` and `retry` as `error`/`onRetry`. Render the callback's
  `readNotice` inside the form's `Screen` (or handle the same error/retry explicitly).
  A refresh failure must not unmount the loaded form and discard current input.
- Preferences are typed settings (`defineSetting` + zod) in the feature's `settings.ts`.
  Keys starting with `backup.` describe the phone and survive a restore.
- Destructive or sensitive actions call `audit(...)`; user-facing failures call
  `alertError(title, error)`. A write started from a button (`void save(...)`) ends in
  `.catch((e) => alertError(...))` — a dropped promise looks like success to the user.
  A message with no choice is `notify(title, message)` (Persian button); ESLint rejects
  `Alert.alert` without buttons.
- Header options inside a screen are `<ScreenOptions options={...} />`, never
  `<Stack.Screen options>` (ESLint enforces it). A native header that changes while its
  screen is being closed stops the app on Android; `ScreenOptions` only writes the header
  when the title changes.
- Editors guard leaving with `useSaveBeforeLeave(flush)`, which is on for the screen's
  whole life. Do not make the guard conditional: switching it off as a save finishes
  changes the header in the same moment `router.back()` removes the screen (the same
  crash).
- Anything time-dependent takes `now` as a parameter; screens get it from `useNow()`.
- Date fields report validity separately from their parsed value. Wire `onValidityChange`
  to `useDateValidation().setValid`, and call `check()` before saving; never save an old
  parsed date while the visible date/time text is invalid.
- Every `IconButton` needs a `label` (the type requires it) — it is all a screen reader gets.
- Import icon families directly (`@expo/vector-icons/Ionicons`), not the package barrel;
  the barrel bundles unused icon fonts. ESLint enforces this.
- **The app draws edge to edge.** Anything anchored to the bottom of the window — a tab
  bar, a fixed footer, the last row of a scroll view — must add `useSafeAreaInsets().bottom`
  (or let `SafeAreaView` consume that edge), or Android's navigation bar sits on top of it
  and swallows the taps. `Screen` ends at the navigation bar by itself; a tab's root screen
  passes `tabRoot`, because the tab bar already sits above it. A hardcoded
  `height`/`paddingBottom` on a navigator's `tabBarStyle` overrides what React Navigation
  would have added: that is how the 0.2.1 tab bar ended up under the three-button bar.
- Persian UI strings live inline in the component. There is no i18n layer.
- Look-alike letters and invisible characters are written as `\u` escapes in
  `lib/persian.ts` and `lib/crypto.ts`. Keep them escaped — some tools silently decode
  them, which makes the tables unreviewable. Grep the diff for `u06` after editing.

---

## 6. Tests

`npm run test`. What is expected of a change:

- New parsing, search, date, money-like or backup logic → a test, in the same style as the
  neighbouring ones.
- New query with a rule in it (a status change, a side effect, an index rebuild) → a test
  against the real database: `jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'))`
  plus `useTestDatabase(await createTestDatabase())` in `beforeEach`. Queries run on real
  SQLite (sql.js) migrated with the app's own bundled migrations.
- Native modules are replaced by stand-ins that keep their contracts
  (`src/test/mocks/`). Where a stand-in could hide a mistake, the real behaviour is pinned
  another way — backup chunks are checked against an independent AES-GCM implementation,
  key derivation against the RFC 7914 vectors.
- UI snapshot tests are deliberately not used.

Tests are not decoration here: this app is one physician's only copy of their patients'
records. The failure modes that matter are silent — a wrong number, a search that quietly
misses, a backup that cannot be opened a year from now.

---

## 7. Things that will bite you

- **Build:** Gradle must run on JDK 21 (`plugins/with-android-build-tuning.js`); debug
  builds are a separate app id so they can never trigger the uninstall-wipes-data prompt;
  release signing comes from `<repo>/private/keystore.properties`, which is gitignored and
  must never be committed. `android/` is generated — anything that must survive
  `prebuild --clean` belongs in a config plugin.
- **The repository is public.** No patient data, no keys, and no personal details of the
  owner (city, workplace, local phone prefixes) in code, tests, comments or commits.
- **`npm run apk` takes minutes.** A clean `android/` is a ~14-minute build; an incremental
  one is ~2. The JS bundle is built early, so a source edit made *after* the build started
  is not in the APK — rebuild rather than guess.
- **Testing on the phone is possible when it is plugged in.** `adb install --user 0 -r`,
  then drive the UI with `adb shell input tap` using coordinates from
  `adb shell uiautomator dump` (never guess them from a screenshot), and read the result
  from another dump. Deep links (`adb shell am start -a android.intent.action.VIEW -d
  "medos://patients"`) beat tapping through navigation. `adb shell input text` is ASCII
  only: `<` and `>` need `adb shell "input text '>100'"`, and Persian cannot be typed at
  all. Say plainly what you ran on a device and what you did not.
- **No phone? Use the emulator.** The release APK is arm64 only, and on the x86_64
  emulator it dies at start ("couldn't find DSO libreactnative.so") — that is the ABI, not
  the app. Build an emulator copy with `gradlew assembleRelease
  -PreactNativeArchitectures=x86_64` (a JS-only change rebuilds in ~2 minutes) and install
  that; never copy it to `dist/`. If the install says "not enough space", `adb shell pm
  uninstall-system-updates` frees gigabytes on the emulator image. The emulator found the
  note-save crash that tests could not.
- **Run Prettier from the repository root.** Run inside `apps/mobile`, it misses the root
  `.prettierignore` and rewrites the generated migration snapshots.
- **Do not reformat or "tidy" files you are not changing.** It buries the real diff.
- **Do not add dependencies casually.** Each one is a native build risk and a supply-chain
  risk on a machine behind a filtered network. If you add one, say why in the handoff.

---

## 8. Working from a web chat (no repository access)

Paste this at the start of the conversation, then paste the files it asks for:

> MedOS is an offline-first Android clinical record (Expo SDK 57, expo-router, SQLite via
> Drizzle, Persian RTL, Jalali dates). Before answering, ask me for `AGENTS.md` and
> `docs/HANDOFF.md` from the repo and read them. Hard rules: never hard-delete clinical
> data (soft delete with `deletedAt`), clinical numbers stay in Latin digits, `db.transaction()`
> callbacks are synchronous, schema changes are additive with SQL-level defaults, backup
> format and passphrase schemes are frozen, no patient data in logs; clinical tools require
> the validation and physician-review gates in invariant 10. Give me complete files or exact diffs, and tell me plainly what you could not
> verify.

Whatever comes back still has to pass `npm run check` in the repository before it counts.

---

## 9. Current state

See `docs/HANDOFF.md` for the live picture, `docs/roadmap.md` for what is built and what is
next, `docs/IMPLEMENTATION.md` for the current prioritized execution and acceptance gates,
and `README.md` for how the owner installs and uses it. The owner authorized implementation
and pushes on 2026-09-23, and requested no subagents for that work.
