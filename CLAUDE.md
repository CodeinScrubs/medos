# MedOS — instructions for AI agents working on this repo

MedOS is a **personal clinical operating system** for one physician: their own patients,
their own colleagues, their own notes. It is not a product, not multi-tenant, and not
intended for other users. Do not add sign-up flows, tenancy, billing, or "share with a
colleague" features unless asked.

The owner is a medical student and physician in Iran. They read and write Persian and are
not a professional developer. **Reply to them in Persian.** Explain trade-offs in plain
language and make every command copy-pasteable.

## The four locked decisions

These were settled at the start of the project. Do not quietly work around them; if one
looks wrong, say so explicitly and let the owner decide.

1. **Android only.** APK sideload, no Play Store. No iOS-shaped compromises.
2. **Persian RTL interface, English clinical fields.** Menus, labels and dates in Persian;
   drug names, diagnoses, lab analytes typed in English, as Iranian physicians actually work.
   Jalali dates everywhere in the UI.
3. **Offline-first.** The whole database lives on the phone and works with no network
   inside a hospital. Backups are encrypted files the owner controls. **No patient data on
   third-party servers** — this is both a privacy decision and a practical one, since
   Supabase, Vercel and Cloudflare all block Iranian IPs.
4. **Patients module first.** Other modules land after it.

## Before you finish any change

```bash
npm run check      # typecheck, lint, formatting, tests — CI runs the same
```

A change is not done until this passes. CI (`.github/workflows/ci.yml`) additionally fails
when the schema changed without a generated migration, and when the app cannot be bundled.

## Layout and layers

```
apps/mobile/
  src/app/              expo-router routes. Each file only re-exports a feature's screen.
  src/features/<name>/  One module: screens, queries.ts (all SQL), logic.ts (pure rules),
                        labels.ts (Persian labels), settings.ts (its typed settings).
  src/components/       Domain-agnostic UI. ui/ holds the primitives; build screens from them.
  src/platform/         Device services: stored media files, notifications, the error log.
  src/db/               Schema, connection, typed settings, audit log, live queries, startup.
  src/theme/            Design tokens. Every colour comes from here.
  src/lib/              Pure TypeScript: Persian text, Jalali dates, numbers, crypto.
  src/test/             Test harness: SQLite in WebAssembly, stand-ins for native modules.
  plugins/              Expo config plugins — everything that must survive `prebuild --clean`.
  scripts/              Build helpers (APK, Android toolchain discovery).
docs/                   Architecture decisions, roadmap, security model.
```

Each layer imports only from the layers below it, and **ESLint enforces it**
(`apps/mobile/eslint.config.js`):

```
lib  <  theme, db, platform  <  components  <  features  <  app
```

- `lib/` has no React, no device APIs and no database — it is what a future web dashboard
  shares. Only `expo-crypto` is allowed, for OS randomness and native AES.
- `db/` has no UI. `components/` know nothing about patients and never touch `db/`.
- Screens (`*.tsx` in features) never import `@/db/client`; SQL lives in `queries.ts`.
- Colour literals are an error outside `src/theme/`.

`packages/` is reserved for code shared with a future web dashboard. It is empty; do not
invent it early — `lib/` and `db/schema/` are already written to move there unchanged.

## Rules that matter here

**Never hard-delete clinical data.** Every table has `deletedAt`. Deleting means stamping
it; queries filter on `isNull(x.deletedAt)`. A mistaken delete on a busy shift has to be
recoverable. Deleting a patient also silences their reminders; restoring brings them back.

**Clinical numbers stay in Latin digits.** Doses, lab values and vitals render with
`<Text numeric>`. Persian digits are for dates, counts and UI chrome only. Mixing `۱۲٫۵`
and `12.5` on one screen is a misread waiting to happen, and a misread dose is the one bug
class this app must not introduce. See `CLINICAL_DIGITS_STAY_LATIN` in `src/lib/persian.ts`.

**Numbers are parsed with `parseDecimal` (or `parseLabNumber`), never `Number()` on raw
input.** It accepts Persian digits and `٫`, reads `250,000` as thousands, and refuses an
ambiguous comma (`12,5`) instead of guessing. A misread lab value is worse than none.

**Search goes through `searchText`.** Every searchable table has a `searchText` column
built on write by the feature's `*SearchText()` function in `logic.ts`, and queries match
it with `matchesSearch()` from `src/db/search.ts` (literal, every term, any order). Rebuild
it from the merged row on update, never from the patch. **When you change what goes into
an index or how `normalizePersian` folds text, bump `SEARCH_INDEX_VERSION` in
`src/features/search/reindex.ts`** — every row is re-indexed once on the next launch.

**Dates are stored Gregorian, displayed Jalali.** ISO `YYYY-MM-DD` strings or unix ms.
Never store a Jalali string. The single exception is a recurring birthday in `occasions`,
which stores Jalali month/day because a Gregorian round-trip drifts across leap years.
Anything that depends on "now" takes `now` as a parameter (testable); screens get it from
`useNow()` rather than calling `Date.now()` while rendering.

**MedOS records; it does not advise.** It stores what the physician wrote. Do not add
dose calculators, interaction checkers, differential suggestions or any feature that
produces clinical recommendations, unless the owner asks for it and understands it is
their own reference material, not a decision-support system.

**Ratings and personal profiles are private working notes** about real, named colleagues.
They are never shared or exported by default.

**Schema changes are additive only — the app is installed with real data.** New tables
and new columns only. Never rename or drop a column, never edit or regenerate an existing
migration. A new column is nullable, or **NOT NULL with an SQL-level `.default(...)`** —
drizzle's `$default()` runs in JavaScript only, so it neither satisfies SQLite's
`ALTER TABLE ADD COLUMN` nor fills the column when an older backup is restored (restore
copies the columns old and new schemas share). After a schema change, run
`npm run db:generate` and commit the migration; CI fails if you forget.

**Backups must stay readable forever.** The file format is specified in
`src/features/backup/format.ts`. Passphrase normalisation schemes in `src/lib/crypto.ts`
are frozen — `crypto.test.ts` pins them with known keys; if you need different rules, add a
new scheme number. Never change what an existing scheme produces.

**Nothing identifying goes into logs or error text.** Errors pass through
`redactErrorText` before they are logged, shown or copied, because a failed query carries
its parameter values — a patient's name or national id.

## Conventions

- IDs are UUIDs via `newId()`. Timestamps via `stamps()` / `touch()` / `softDelete()`.
- **Reads use `useLive` from `src/db/use-live.ts`, never drizzle's `useLiveQuery`.** The
  drizzle hook only watches the `FROM` table (joined tables go stale), re-queries on every
  row event (a restore inserting thousands of rows freezes the app), and starts with `[]`
  instead of "loading". `useLive` watches FROM + joins, debounces bursts, and returns
  `data: undefined` until the first result.
- **Edit screens use `EditGate`** (`src/components/edit-gate.tsx`): the screen loads the
  record, the form component initialises its `useState` from it once. Never copy a loaded
  record into form state with an effect.
- **Preferences are typed settings.** Declare with `defineSetting(key, zodSchema, default)`
  in the feature's `settings.ts`; read with `useSetting()` / `readSetting()`, write with
  `writeSetting()`. Invalid stored values fall back to the default. Keys starting with
  `backup.` describe the phone and survive a restore; everything else travels with the data.
- **Destructive or sensitive actions are audited** with `audit(...)` from `src/db/audit.ts`.
- **Failures shown to the user go through `alertError(title, error)`**, which logs and
  redacts.
- Route files in `src/app/` export only the screen.
- Every `IconButton` needs a `label` — it is the only thing a screen reader gets (the type
  requires it).
- Persian user-facing strings live inline in the component. There is no i18n layer and
  none is needed for a single-language personal app.
- **`db.transaction()` is synchronous with this driver.** drizzle's expo-sqlite session
  runs `begin`, calls your callback, then `commit` immediately. An `async` callback
  returns a promise at once, so the commit lands *before* any awaited statement runs and
  nothing is actually protected. Inside a transaction, write `tx.insert(...).values(...).run()`
  (or `.all()` / `.get()`), never `await`.
- Look-alike Persian/Arabic letters and invisible characters are written as `\u` escapes in
  code (`src/lib/persian.ts`, `src/lib/crypto.ts`). Keep them escaped: `ي` and `ی` cannot be
  told apart by eye. Some editors and tools silently turn escapes into characters — check
  the diff.

## Tests

`npm run test` (Jest). What runs where:

- `lib/` and each feature's `logic.ts`: plain unit tests.
- Queries: real SQL against SQLite compiled to WebAssembly (sql.js), migrated with the app's
  own bundled migrations. In a test file:

  ```ts
  jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
  jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
  beforeEach(async () => { useTestDatabase(await createTestDatabase()); });
  ```

- `expo-crypto` is mapped to `src/test/mocks/expo-crypto.ts` (Node's Web Crypto), keeping
  the native module's contract. The backup cipher is cross-checked against an independent
  AES-GCM implementation, so the mock cannot hide a wrong construction.

Add tests with any change to parsing, search, dates, backup, or a query with a rule in it.

## Commands

```bash
npm install                        # from the repo root, installs all workspaces
npm run check                      # typecheck + lint + format check + tests
npm run format                     # apply Prettier
npm run db:generate                # regenerate migrations after a schema change
npm run apk                        # signed release APK -> dist/MedOS-<version>.apk
npm run android                    # debug "MedOS Dev" on a USB-connected phone + Metro
npm run start                      # Metro only (for Android Studio's Run button)
cd apps/mobile && npm run bundle            # bundle the JS for Android (fast validation)
cd apps/mobile && npm run android:prebuild  # regenerate android/ (then a full native build)
```

`scripts/android-env.js` fills in JAVA_HOME / ANDROID_HOME from Android Studio's
standard locations when they are unset — the owner's machine has neither set, and the
Gradle launcher refuses to start without them. Use it (or the npm scripts) for anything
that runs Gradle.

## Android build — things that already cost hours

- **Gradle must run on JDK 21, not 24+.** Android Studio ships JDK 25; on it, AGP's
  prefab step prints a JVM "restricted method" warning and AGP treats that as a failure in
  `configureCMake…` of react-native-screens / worklets. `plugins/with-android-build-tuning.js`
  pins the Gradle daemon to 21 via `gradle/gradle-daemon-jvm.properties`; Gradle finds the
  JDK 21 it provisioned under `~/.gradle/jdks`. Do not remove this.
- **arm64-v8a only** (same plugin). Add `x86_64` only for an emulator build.
- **Debug builds are a separate app**, `com.shayan.medos.dev` / "MedOS Dev"
  (`plugins/with-dev-variant.js`). Same package name would make Android refuse to install a
  debug-key build over the release-key app, and Android Studio then offers to uninstall —
  wiping the real data. Launch it with `expo run:android --app-id com.shayan.medos.dev`.
- **Release signing** comes from `<repo>/private/keystore.properties` via
  `plugins/with-release-signing.js`. That keystore is the app's identity: an APK signed with
  anything else cannot update the installed app without uninstalling it, which deletes the
  on-phone database. The plugin throws rather than silently fall back. `private/` is
  gitignored and must never be committed.
- **Network:** downloads from `dl.google.com` and Maven Central sometimes time out from
  the owner's connection. Gradle failures that say "Connection timed out" are that, not the
  build; `scripts/build-apk.js` already passes long timeouts and retries, and a rerun picks
  up where the last one stopped.
- `android/` is generated and gitignored. Anything that must survive `prebuild --clean`
  goes in a config plugin under `apps/mobile/plugins/`.

## State of play

Built and working (release APK builds and is signed):

- Patients: list with Persian search, create/edit, duplicate check, soft delete + trash.
- Record: admission card with hospital day, contacts, follow-ups with phone reminders,
  events timeline, notes (SOAP, 11 types, pin, draft, voice), kardex with D-count and
  hold/DC, labs (panel presets, paste from Excel, photo-then-transcribe, flowsheet, trend
  chart), imaging with "where is it stored", photo gallery with crop and zoom viewer,
  voice notes anywhere.
- Encrypted backup/restore (`src/features/backup/`): automatic to a user-chosen folder,
  native AES-GCM, staged restore, passphrase self-test.
- App lock (OS biometric / screen lock), extensions directory, places with maps.
- On-phone error log with PHI redaction, audit log, typed settings, 270+ tests, CI.

Not built yet: doctors directory UI (ratings, social profile, occasions), knowledge module
(topics, specialty profiles, Rx templates, ideas), credential vault. Their tables exist.
See `docs/roadmap.md`.
