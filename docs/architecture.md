# Architecture decisions

Why the code looks the way it does. Each entry records the alternative that was
rejected, so a future revisit starts from the reasoning rather than from scratch.

---

## Expo SDK 57 / React Native, not Flutter or a PWA

A PWA cannot reliably hold a multi-gigabyte local photo library, run background
notification schedules, or survive being evicted by the OS — all of which this app needs.
Flutter would work equally well technically; React Native wins because the same codebase
and the same data layer extend to a desktop web dashboard later, which is on the roadmap.

Android-only was chosen by the owner, which removes the usual cross-platform tax: no
Apple Developer account, no 7-day sideload expiry, and direct SMS access stays available
if it is ever wanted.

---

## Layers, enforced by the linter

```
lib  <  theme, db, platform  <  components  <  features  <  app
```

| Layer | Holds | May not import |
|---|---|---|
| `lib/` | Persian text, Jalali dates, numbers, crypto — pure TypeScript | React, device APIs, the database, any other layer |
| `theme/` | design tokens | anything above it |
| `db/` | schema, connection, typed settings, audit, live queries, startup | UI, platform, features |
| `platform/` | stored media, notifications, error log | database, UI, features |
| `components/` | UI primitives and generic widgets | database, features |
| `features/<name>/` | one module: screens, `queries.ts`, `logic.ts`, `labels.ts`, `settings.ts` | routes |
| `app/` | expo-router routes, each re-exporting one screen | — |

Two further rules: screens never import the database client (SQL lives in `queries.ts`),
and colour literals are an error outside `theme/`.

The rules live in `apps/mobile/eslint.config.js` as `no-restricted-imports` patterns, so a
wrong-way import fails `npm run check` instead of relying on review. The payoff is concrete:
`lib/` and `db/schema/` depend on nothing app-specific, so a web dashboard — or a desktop
tool that opens backups — can reuse them unchanged.

**Rejected: extracting `packages/core` now.** It would add a build step and a second
TypeScript project for a consumer that does not exist yet. The lint rules keep the
boundary clean at no cost; moving the folder later is mechanical.

Icon imports also have a measured packaging boundary: import the family directly
(`@expo/vector-icons/Ionicons`) rather than the package barrel. The installed barrel
re-exports every family, bringing unrelated fonts and glyph maps into the Android export.
Changing the 42 Ionicons imports removed 18 fonts and 54 Metro modules on 2026-09-23:
font assets fell from 5,043,384 to 1,356,268 bytes, and Hermes bytecode from 6,697,101 to
6,366,270 bytes. These are uncompressed export measurements, not APK size or startup
timings. The same Ionicons implementation/font remains; the router's Material Symbols
font and configured Persian fonts remain untouched. ESLint blocks barrel imports.

---

## SQLite + Drizzle, local-first

`expo-sqlite` with `enableChangeListener`, wrapped by Drizzle ORM. Screens read through
`useLive` (`src/db/use-live.ts`): a write anywhere re-renders every screen observing that
table, with no cache invalidation layer to get wrong.

`useLive` replaces drizzle's `useLiveQuery`, which only watches the `FROM` table (a query
joining `patients` never refreshed when a patient was deleted), re-runs on every row event
(a restore inserting thousands of rows would re-query every mounted screen thousands of
times), and starts with `[]`, indistinguishable from "no rows". `useLive` watches FROM plus
every join (`tablesOf`, which has its own test because it reads drizzle internals),
coalesces bursts, and reports `undefined` until the first result.

**Rejected: SQLCipher via op-sqlite.** It would encrypt the database file itself. Android
already encrypts app-private storage at rest (FBE, default since Android 10), so SQLCipher
buys defence-in-depth against a rooted or forensically imaged device — a real but narrow
threat — in exchange for a less-maintained native module and a harder upgrade path. The
higher-value encryption is on backup files, which actually leave the device. Revisit if the
threat model changes.

**Rejected: a hosted backend (Supabase/Firebase).** Patient data on a third-party server
is the wrong default for a personal clinical record, and every major provider blocks
Iranian IPs, which would make the app depend on a VPN to open a patient chart on a ward.

---

## UUID primary keys, soft deletes everywhere

Autoincrement integers make offline multi-device merges require renumbering. UUIDs cost
a few bytes per row and remove the problem permanently, which matters because a laptop
client is on the roadmap.

Nothing is hard-deleted. `deletedAt` is stamped and queries filter on it. In a clinical
record, an accidental delete during a shift is far more expensive than a wasted row.
Side effects follow the stamp: deleting a patient cancels their reminders, restoring them
reschedules, and both are written to the audit log.

---

## Schema evolution: additive only

The app is installed with real data, and restore must accept backups made by older builds.
So migrations only add: new tables, new columns. A new column is nullable or has an
SQL-level default — drizzle's `$default()` runs in JavaScript, which neither satisfies
SQLite's `ALTER TABLE … ADD COLUMN … NOT NULL` nor fills the column when an old backup is
imported. Restore copies the columns both schemas share; everything else takes its default.

When an update brings migrations to a database that already holds data, startup first takes
a plain snapshot (`VACUUM INTO`, newest three kept). drizzle applies pending migrations in
one transaction, so a failing migration rolls back by itself; the snapshot covers the worse
case, a migration that succeeds but reshapes data wrongly. A backup made by a *newer* schema
is refused rather than imported with its new columns silently dropped.

CI regenerates migrations and fails if that produces anything: a schema edit without its
migration never reaches the phone.

---

## Startup pipeline

`StartupGate` (`src/features/startup/`) renders nothing but a spinner until, in order:

1. the connection is open with `foreign_keys`, WAL, `synchronous = FULL` and
   `busy_timeout` set (`db/client.ts`, at module load, before any query can run);
2. `startDatabase()` — snapshot if needed, migrations, seeds;
3. a restore that was killed halfway is undone (`recoverInterruptedRestore`);
4. search indexes are rebuilt if their version changed;
5. stored lab flags are recomputed if the rule that sets them changed.

A failure is shown (with the error text redacted), logged, and never swallowed: carrying on
against a half-migrated schema would fail later in more confusing ways, or write bad data.
Then `LockGate` covers the app until the lock setting is known — a locked app must not flash
patient data for the milliseconds before it knows it is locked.

---

## The `searchText` column

Persian has several ways to type the same word: Arabic `ي` vs Persian `ی`, `ك` vs `ک`,
optional ZWNJ half-spaces, three digit sets, and — in text copied from a PDF — Arabic
presentation forms. A naive `LIKE` on the name column makes the patient list silently fail
to find people.

Every searchable table carries a denormalised `searchText` built on write, which folds all
of that into one canonical form (`normalizePersian`: NFKC, letter folding, Latin digits,
marks stripped). Phone numbers go in normalised, so `+98 912…`, `0912-…` and `۰۹۱۲…` match.
Queries normalise the input the same way and match each word independently and literally
(`%` and `_` are escaped), so `رضایی علی` finds `علی رضایی`.

The index must be rebuilt from the *merged* row on update, not from the patch — otherwise
editing a phone number wipes the name out of the index. When the folding rules or the
indexed fields change, `SEARCH_INDEX_VERSION` is bumped and every row is re-indexed once at
the next launch (also after restoring a backup made under a different version).

**Rejected: SQLite FTS5.** Better ranking, but it needs its own virtual table, triggers,
and a second migration path, and it does not solve the normalisation problem on its own.
For a personal dataset of hundreds to a few thousand rows, a scan is instant.

---

## Numbers as people type them

Lab values arrive as `۱۲٫۵`, `12.5`, `7,500`, `<0.01`. `parseDecimal` accepts Persian and
Arabic-Indic digits, `.` or `٫` as the decimal point, and commas only as thousands
separators. `12,5` — a European decimal or a typo — is rejected rather than guessed: the
value is still stored and shown exactly as typed, it just is not plotted or flagged. A lab
value read as a thousandth of itself is the kind of error this app must not make.

---

## Gregorian storage, Jalali display

Dates are stored as ISO `YYYY-MM-DD` or unix milliseconds and converted at the edge.
Storing Jalali strings would break sorting, range queries and any future export. Formatting
accepts only the storage formats; anything else renders as "—" instead of being handed to
`new Date()`, which would read `1403/05/12` as the Gregorian year 1403.

The deliberate exception is `occasions`, which stores a Jalali month and day directly for
recurring birthdays. Converting a stored Gregorian date back to Jalali each year drifts by
a day across leap years, which would send a birthday message on the wrong day — the exact
failure the feature exists to prevent.

---

## Typed settings, and what a restore keeps

Preferences live in the `settings` table as JSON, declared per feature with
`defineSetting(key, zodSchema, default)`. Every read is validated: a missing, corrupt or
wrongly typed value yields the default instead of reaching a screen. Every write is
validated too, so a bad value fails where it was written. Settings travel with backups —
except keys starting with `backup.` (folder grant, schedule, last success), which describe
the phone doing the backing up and survive a restore.

Secrets are never settings: the backup key lives in the Android Keystore via SecureStore.

---

## Backups

The format is specified in `src/features/backup/format.ts`, completely enough that someone
with the passphrase and that comment could write a decoder. In short: a 48-byte header,
then AES-256-GCM over 1 MiB chunks in the STREAM construction (a nonce of random prefix,
chunk counter and last-chunk flag; the header as associated data), so chunks cannot be
altered, reordered, dropped or truncated without detection. Inside is a simple archive: a
JSON manifest, the database snapshot, and media files.

- **Key derivation:** scrypt (N=2^15, r=8, p=1). The passphrase is normalised first, and
  the normalisation scheme is recorded in the header. Scheme 2 folds what different
  keyboards produce for the same key (Arabic/Persian yeh and kaf, three digit sets,
  invisible marks), so a passphrase typed on another phone's keyboard still opens the
  backup. Schemes are frozen by test vectors; new rules get a new scheme number.
- **Cipher:** AES-GCM runs natively (Android's javax.crypto, via expo-crypto). A pure
  JavaScript AES is too slow on the phone's engine for a library of photos. The bytes are
  standard AES-GCM, and the test suite checks them against an independent implementation.
- **Header values are range-checked before use** — scrypt cost and chunk size are read
  before anything can be authenticated, so a damaged file must not be able to demand
  gigabytes of memory.
- **Restore order:** decrypt everything into a scratch folder and verify the end of the
  stream → keep a snapshot of the current database → move media into place → replace the
  database in one transaction. A wrong passphrase, a damaged file or a foreign file fails
  before anything on the phone changes. Scratch folders, which hold plaintext, are deleted
  on every exit path.
- The audit log is merged on restore rather than replaced, and the OS's reminders are
  cancelled and rebuilt from the restored rows.
- **Destination evidence and retention:** after copying, locate the provider's returned
  document and compare its bytes with the source through EOF. Only that result permits
  pruning old backups. A known equal size with no readable destination handle is retained
  as `size` evidence, visibly weaker; unknown size needs a successful read-back. Missing
  metadata/files, read errors and mismatches fail without pruning. This deliberately uses
  more storage on providers that cannot be read back. Delivery time and evidence are
  stored atomically; legacy deliveries have unknown strength. New file names include the
  run UUID and copies refuse overwrite; retention protects the just-verified name even
  after a clock rollback. Archive bytes, passphrase schemes and old-file restore support
  are unchanged. Provider/device behavior and actual restore remain separate acceptance
  checks; equality to the source does not validate every record inside an archive.

---

## Forms: load, then initialise

Date/time fields report validity separately from their last parsed value. Invalid or
incomplete text must never authorize saving that older value. Every consumer passes
`useDateValidation().setValid` and checks `check()` before its explicit write. This uses
a ref so a text event followed immediately by Save cannot observe stale React state.
Day and clock validity stay independent; presets repair the day only, and an explicitly
unknown admission hour removes only clock validation. The raw unfinished date text is
still screen-local: this guard is not crash recovery for invalid date drafts.

Task previews stay short, with separate searchable/paged lists and a detail route shared
by patient/global tasks and capture destinations. Counts use the same WHERE conditions as
their lists. Priorities have explicit ranks: lexical order is not clinical urgency. Text
edits use the existing autosave group; partial task writes read/merge/index/write within
one synchronous transaction so overlapping field saves cannot drop search terms.

Past shifts use read-only queries and never become active when viewed. Their history
includes removed memberships, because those can still hold a handoff, with a removal
label and without joining deleted patient identities. It does not present the encounter's
current ward/bed as where the patient was at that historical time: that needs actual
location snapshots/events. No new schema, storage framework or dependency was needed.

Autosave completion is a boolean result, not merely a resolved promise. Note/capture
route removal uses the public Expo Router `usePreventRemove` hook to flush and resume the
original action only on success. Shift and round fields register with a screen-level
`SaveGroup`: every field must finish and still be clean before changing the current
patient, removing membership or ending the shift. This adds one shared exit check rather
than a separate navigation listener on each field. Failed saves leave the editor open
with a retry action; an in-flight write counts as unsaved. Explicit draft discard waits
for outstanding writes and only exits after the discard succeeds. Native back/gesture,
process termination and overlapping editors remain separate verification/recovery work;
no UI guard can preserve data the OS kills before it reaches storage.

Edit screens are split in two: `EditGate` loads the record (spinner while loading, a clear
message if it was deleted), then the form component initialises its state from it once.
Copying a loaded record into form state with an effect shows an empty form for a moment,
can overwrite what the user started typing, and — if the record had been deleted — would
save the empty form as a new record.

---

## Drafts: the text is safe before the record exists

The note editor writes what is being typed to `note_drafts` continuously (`lib/autosave.ts`
schedules it: a short debounce, plus a hard ceiling so continuous typing cannot postpone the
write for ever), and a voice recording is moved into media storage the moment it stops. The
note itself is still written once, when the user saves — a chart entry is a decision, not a
side effect of typing — and the draft is dropped at that point.

The save path now flushes the draft and publishes it in one synchronous transaction:
note, exact-content version, voice attachment metadata and retiring the draft. Any failure
rolls them all back, keeping the draft retryable. Media bytes must already be stored before
this transaction. A late autosave cannot detach a linked draft or overwrite a retired one.

This is why the editor's own live query is read only at mount: it is watching a row the same
screen is writing, and feeding those writes back into the fields would fight the keyboard.
Drafts nobody finished are surfaced on Today rather than left to be found by accident.

Consult answers have a narrower lifecycle: one recoverable response/instruction draft
on their existing consultation row, separate from the published response and status.
Three additive, SQL-defaulted columns avoid a generic draft framework or a duplicate
consult entity. The editor owns both fields and uses one autosave scheduler; background
and route exit flush it. Publishing checks the persisted draft revision, writes the
answer/search/status and retires the draft in one synchronous transaction. Retrying the
same publish cannot alter the original response timestamp. Cancelled drafts remain
readable from the consult card. Drafts do not enter clinical search as confirmed answers.

The draft revision is an optimistic concurrency token, not a history table: stale editors
cannot overwrite newer saved text. On conflict the local text stays visible; comparison
shows the stored version and replacement requires an explicit choice of that revision.
Background conflict retries stop until another edit or explicit retry. The dedicated
answer route avoids losing an inline editor when changing a patient tab; its seed stays
mounted through later query changes. Other edit flows do not yet share this conflict
protection. Full consult correction/history and native
process-death/back testing remain separate work. The autosave delay is still an exposure
window for text not yet committed to SQLite.

Unsubmitted consult questions use `consult_request_drafts` (migration 0012), one
active draft per patient. Service and question are persisted as one exact-text
document with a revision check. A partial question is not a pending consult and
does not appear in outstanding work. Explicit publication creates a pending consult
and retires the draft in one synchronous transaction, with an idempotent retry link.
It does not mark the request sent. The encounter at first persisted capture,
including null, is preserved through a later admission; a soft-deleted/closed
encounter remains provenance and is not presented as a current encounter. Direct
consult creation now also rejects missing/deleted patients and wrong-patient
encounter links. The inline form joins the patient autosave group and flushes before
opening an answer editor. Failed writes keep the form mounted; conflict replacement
requires the exact displayed revision. Later read errors are visible without
resetting either the task or request editor. Native recovery remains unverified.

Quick-add tasks use a separate `task_drafts` table rather than a new `tasks.status`:
unconfirmed text must not appear in open work, Today counts or task history. A partial
unique index allows one open draft per patient, plus one global draft. The patient's
draft can be resumed from either the record or a round; its original shift association
is preserved, including an explicit null. The editor owns one id/revision and rejects
stale writes. Publication creates the task and soft-deletes/links the source draft in
one transaction, retaining the original title and making retries idempotent. A new draft
can then be started in that same scope. Empty form mounts write nothing.

The inline task editor registers with its screen's SaveGroup; patient tab changes and
record edit/delete actions flush that group, as existing round transitions already do.
A standalone tasks preview creates a scope only when none exists. Recovery is inline,
not another dashboard section. Later patient-query errors display above the last loaded
record instead of unmounting the editor. These guards still require native navigation
and process-death acceptance; uncommitted keystrokes are not an independent backup.

The capture screen uses the same machinery for a different reason. Its row **is** the
draft: `CaptureWriter` creates one `capture_inbox` row the first time anything on that
screen produces something worth keeping — the keyboard, the recorder or the camera,
whichever comes first — and hands the same id to the other two. Leaving the screen flushes
what is waiting and then drops the row again if it turned out to be empty, so opening quick
capture by accident costs nothing and recording into it costs nothing either.

`components/autosave-field.tsx` applies the same rule to a single field on a row that
already exists — the shift summary, the handoff note. Writing those on every keystroke is
the obvious implementation and the wrong one: the row is being watched by a live query, so
each write pushes its own value back at the input, and a write that lands slower than the
next keypress makes the field snap back and the cursor jump. The field owns its text while
it is being edited and writes on a timer. Because it reads both its starting value and its
target once, it has to sit inside something keyed per row.

### Atomic writes and exact note versions (2026-09-23)

Feature write helpers accept `DbTransaction` when multiple entities must commit together.
The public async wrappers open a synchronous transaction; helpers never await, open their
own transaction, or perform file/network work. This makes capture filing atomic across
the destination, its version, attachment ownership and the capture's filed state. Repeating
the same filing returns the existing destination; a different kind/patient is refused.
Failed capture creation clears its cached promise so a retry can use the newest input.

Note version equality compares each exact stored field, including doctor and SOAP section.
Search-normalized text is unsuitable: moving "pain" from Subjective to Plan previously
looked identical. Stored legacy hashes remain readable but are not used to decide equality.
New version timestamps are monotonically ordered per note even within one clock tick;
the clinical observation time (`noteDate`) is unchanged. Existing history is never pruned.
Previously missed versions cannot be reconstructed from the current note.

Rejected: a new persistence framework or event-sourcing subsystem. Small composable
transaction helpers close these failure windows without a schema change or dependency.
Failure-injection and concurrent-call tests run on SQLite with shipped migrations; native
process-death and filesystem durability require separate device evidence.

---

## Forced RTL at build time

`expo-localization`'s config plugin sets `forcesRTL: true`, which bakes RTL into the
native build. `flexDirection: 'row'` then reads right-to-left everywhere with no per-screen
work.

The alternative — `I18nManager.forceRTL()` at runtime — requires an app reload to take
effect and leaves a window where the first render is mirrored wrongly. The cost of the
build-time approach is that running the app without a fresh native build produces a
silently LTR layout, so `src/app/_layout.tsx` warns in development when `I18nManager.isRTL`
is false.

---

## Clinical numbers stay Latin

Persian digits are used for dates, counts and UI chrome. Doses, lab values and vitals
render in Latin digits via `<Text numeric>`.

A screen mixing `۱۲٫۵` and `12.5` invites a misread, and a misread dose is the one class
of bug this app must not introduce. This is enforced by convention rather than by types;
`CLINICAL_DIGITS_STAY_LATIN` in `src/lib/persian.ts` documents it at the source.

---

## Errors: logged on the phone, never with patient data

`installGlobalErrorLogging` records uncaught errors, the route error boundary records
render crashes, and `alertError` records handled failures — all into a small log file in
app-private storage that the owner can read and share from Settings. Everything passes
through `redactErrorText` first: drizzle puts a failed query's parameter values into its
error message, and those can be a patient's name or national id. Nothing is ever sent
anywhere automatically.

---

## Testing

The parts that would fail silently are the parts with tests: Persian normalisation and
search, number and date parsing, backup encryption and restore, and every query with a
rule in it.

- Queries run for real, against SQLite compiled to WebAssembly (sql.js), created through
  the app's own bundled migrations and drizzle's own migrator. The restore tests attach one
  such database to another exactly as the phone does.
- Native modules are replaced by stand-ins that keep their contracts: `expo-crypto` by
  Node's Web Crypto (including its 1024-byte randomness limit), notifications by a recorder
  of what the OS would hold.
- Where a stand-in could hide a mistake, an independent check closes the gap: backup
  chunks are verified against a second AES-GCM implementation, key derivation against the
  RFC 7914 scrypt vectors, and both passphrase schemes against pinned keys.

**Rejected: UI snapshot tests.** They break on every styling change and catch little that
a type checker and the real app on a phone do not.

---

## npm workspaces monorepo with one app

`apps/mobile` is the only workspace today. The structure exists so that adding
`apps/web` and `packages/core` later is a move, not a rewrite. `metro.config.js` already
carries the workspace resolution config.

One gotcha found the hard way: `resolver.disableHierarchicalLookup` must stay **off**.
It is standard advice for pnpm setups, but under npm workspaces it breaks any package
reaching for a transitive dependency nested inside another package — `react-native-reanimated`
requiring `semver` is the case that surfaced it.

---

## Scope boundary: records and validated physician-reviewed tools

The original records-only boundary excluded clinical calculators. On 2026-09-23 the owner
expanded the requested scope to clinical scores, precautions, screening and algorithms.
This is recorded in `AGENTS.md` invariant 10 and `IMPLEMENTATION.md`; it does not make an
AI-proposed formula validated or authorize automatic clinical action.

Implement deterministic offline tools only with primary source/version, intended population,
exclusions, explicit units, visible inputs, missing/stale-data handling, reference examples,
boundary tests and clinical review. Store confirmed calculations with immutable inputs,
output and tool version. Physician confirmation is required before adding output to a
record or plan. Do not auto-order treatment or convert an AI suggestion into a diagnosis.
Broad library coverage is a goal, delivered tool by tool; no clinical engine was added by
the scope update itself.

Tradeoff: this permits the owner's intended workflow, but adds source maintenance and
per-tool validation work. Personal notes/templates remain distinct from validated tools.
Seeded specialties and adult lab ranges remain editable defaults, not clinical authority;
no inferred critical flags or adult-to-child extrapolation.
