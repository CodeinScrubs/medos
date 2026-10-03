# Architecture decisions

Why the code looks the way it does. Each entry records the alternative that was
rejected, so a future revisit starts from the reasoning rather than from scratch.

---

## Keep the existing Expo SDK 57 / React Native application

Android installation is the current locked target; web remains later work. No
measured requirement currently justifies replacing the working implementation.
A rewrite would have to reproduce migrations, forever-compatible backups, media
recovery and native behavior. Flutter remains a candidate if a prototype demonstrates
a concrete advantage and a migration plan preserves existing data and evidence.
This is a cost/evidence decision, not proof of universal framework superiority.
Future web clients still need their own platform, persistence and sync adapters;
neither framework guarantees reuse of the Android data layer unchanged.

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

## Vitals correction boundaries (0.11.15)

Observation mutations read liveness, encounter ownership and the current reading
inside the same synchronous SQLite transaction as the write. An explicit live
historical encounter or null remains valid; implicit encounter selection happens
in that transaction. Soft-deleted patients/encounters cannot accept late readings.
Merge validation uses the current row so overlapping clears cannot leave an empty
measurement. Repeated deletion and empty patches do not create false audit entries.

The inline editor sends only locally changed fields and carries its original
reading as the comparison basis. Unrelated corrections can coexist. A changed
patched field, either side of a patched blood-pressure pair, measured time or
encounter rejects publication and keeps local input on screen. Blood-pressure
halves are compared together to avoid constructing a reading from two revisions.
Exact untouched note text is preserved. Latest-input refs and a synchronous submit
guard cover input/Save in one event turn and repeated Save before React renders.

**Rejected: rewriting every field or using only updatedAt as a conflict token.**
The former overwrites independent corrections; the latter unnecessarily rejects
edits to unrelated fields and does not express which observation context changed.
These guards do not implement persistent raw drafts, permanent observation version
history, a dataset epoch or ordinary-write-versus-restore exclusion. Native behavior
and physical-device durability remain separate acceptance gates.

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

Read failure is distinct from an empty result. `useLive` retains the last loaded
rows and reports the error; its stable `retry()` callback re-runs the read without
requiring a database mutation or navigation. Overlapping requests are coalesced,
late results from a disposed subscription are ignored, and synchronous thenable
failures become read errors too. Rows intentionally survive dependency changes;
identity-sensitive children such as the shift progress card must be keyed by id.

Today and timeline expose failed sources and retry, withhold unreliable totals
and empty/success claims, and retain available rows. `ErrorNotice` keeps technical
diagnostics behind an explicit details action; displayed details remain redacted.
The timeline is still assembled in memory and is not yet accepted for large records.

`EditGate` requires the read error and retry callback. Failed initial reads (including
a previously empty result) show retry instead of loading forever or claiming absence.
Once a row is loaded, the gate supplies a `readNotice` slot to the same form instance.
Forms place it inside their existing `Screen`, preserving keyboard/scroll ownership
and local input through refresh failure/retry. This explicit slot avoids a second
screen wrapper or hidden context in generic UI primitives. Notes and consult answers
keep their own draft/conflict handling while exposing equivalent read/retry feedback.
This is read recovery, not autosave for forms that still require explicit Save.

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

## Follow-up reminder intent commits before Android side effects

SQLite and Android's alarm scheduler cannot share a transaction. Cancelling the old
alarm and scheduling the new one before writing the follow-up left the wrong alarm
active when the database write failed. The regression test reproduces that ordering.
Clinical create/update/complete/delete now commits first, then reconciles the alarm.
Native failures do not turn a successful clinical save into a reported save failure.

Migration `0013` adds `reminderRevision` (SQL default 0) and
`reminderAppliedRevision` (SQL default -1). Clinical mutations increment the desired
revision in their synchronous transaction. A worker marks repair pending before
touching Android and acknowledges only after native success and a fresh read of the
same intent. It compares both the revision and request content: restoring an older
database can replace content without increasing its revision. Jobs for one follow-up
are serialized; a bounded retry loop observes newer edits rather than acknowledging
an earlier alarm against them. Pending markers survive restart and old-backup import.

The native identifier is deterministic (`medos.follow-up.<id>`), so retry after a
successful schedule but failed database acknowledgement replaces one request. Legacy
random ids are cancelled first. This behavior was checked in the installed Expo
Android implementation (`ExpoSchedulingDelegate`, `SharedPreferencesNotificationsStore`
and `NotificationsService.createNotificationTrigger`); native delivery still needs
device acceptance. A strict cancel API exposes failures; legacy best-effort callers
are not evidence of confirmed cancellation.

Startup and foreground upkeep repair interrupted work and re-arm future reminders
without permission prompts. Explicit creation/retry can request permission. Cards
show a short retry action when repair is pending or a future reminder is unavailable.
The completion dialog retains its input on failed clinical save. Restore attempts
follow-up, task and occasion repair, and reports failed repair as housekeeping rather
than pretending the already-imported clinical data was untouched.

Trade-off: an old alarm can still fire between a committed edit and successful repair,
especially while the app is stopped. OS permission, channel settings, battery policy,
force-stop and exact delivery time are separate from successful scheduling. Tests
cover SQL/native failures, overlapping edits, older schemas and component handlers;
they do not prove Android delivery. Tasks and occasions now use the same ordering
contract, with their separate lifecycles described below.
No generic job framework or new dependency is introduced for these two counters.

---

## Task deadlines: persist raw drafts before applying a schedule

Migration `0014` adds optional task reminders and per-task raw schedule drafts. The
collapsed editor preserves incomplete Jalali date/clock text, the deadline toggle and
alarm choice. Closing saves the draft; Apply validates it and atomically updates the
actual deadline/reminder intent while clearing that draft. Turning off the deadline
also turns off its reminder. An overdue deadline is valid without a new alarm.

Tradeoff: applying a schedule requires one explicit action, even though its raw draft
autosaves. This avoids silently retaining an old parsed date or moving an alarm while
the user is halfway through typing. CAS draft revisions reject competing writes;
an applied-schedule signature rejects stale schedule changes without treating a
concurrent title autosave as a conflict. Conflict resolution shows the stored value
before explicitly keeping local input or loading the saved version. Reopening the
editor reads the current row rather than relying on a potentially stale screen prop.

Tasks use stable native ids `medos.task.<id>`, database-first changes and serialized
desired/applied revision repair. Completion, cancellation, deletion and patient
deletion cancel the reminder; reopening/restoration re-arms eligible future work.
Permission refusal does not discard the task. Startup, foreground and backup restore
repair task reminders alongside follow-ups. Invalid/unapplied raw dates never change
the OS alarm. Native delivery and interrupted restore still require device evidence.

Patient tab changes, including URL changes, flush mounted autosave fields before
unmounting the old tab. A failed flush retains the editor. Updating state during
render solely because a route parameter changed bypasses this safeguard.

---

## Occasion reminders survive native failures

Migration `0015` adds the same desired/applied revision counters to `occasions`,
with SQL defaults for old backups. Creation and editing validate the date and live
doctor inside a synchronous transaction; only then is Android called. Deletion
preserves the old native id until cancellation succeeds. Doctor deletion stamps
the doctor and their occasions atomically; a rename also marks their alarms for
refresh in the same transaction. Deletions are audited without private text.

The worker uses `medos.occasion.<id>`, retires legacy random ids, serializes requests
per occasion and checks current content before acknowledgement. Repair includes
disabled/deleted occasions and deleted doctors with pending cancellation. It runs
at startup, foreground and restore without asking for permission. Restore reports
incomplete native work separately from imported data. Explicit save/retry may ask
for permission; a failed alarm does not mean the occasion failed to save. The form
states that distinction and the occasion row offers retry only when needed.

Tradeoff: the committed intent and native alarm cannot change atomically. An old
alarm can still ring before successful repair; no software test proves delivery,
permission/channel settings, reboot behavior or a full interrupted restore on a
phone. Occasions still need a separate raw-draft/autosave implementation. These
changes add neither a background service nor a general job framework/dependency.

The notification body uses the occurrence actually being scheduled, including the
following year when this year's lead time has passed. Editing a recurring Esfand 30
uses a valid leap-year reference date, preserving month/day instead of normalizing
them to Farvardin 1. This does not change the existing non-leap occurrence policy.

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

Local safety-snapshot retention creates a UUID-named `VACUUM INTO` result and checks
that its file exists and is nonempty before pruning earlier copies. A failed write
keeps all earlier snapshots; cleanup failure keeps extra files. This needs temporary
space for one extra snapshot. Same-millisecond calls cannot collide, and the current
copy survives clock rollback. This check is not a power-loss or restore acceptance test.

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

A patient's index also carries what lives in other tables but is how they are remembered on
a ward: every live diagnosis, and the open episode's ward, service and bed (as `تخت 12`, so a
bare `12` does not match every national id). `features/patients/search-index.ts` rebuilds it
whenever a diagnosis or an episode is written, inside the same transaction where there is one.

**Rejected: SQLite FTS5.** Better ranking, but it needs its own virtual table, triggers,
and a second migration path, and it does not solve the normalisation problem on its own.
The current scan approach still needs measured large-record acceptance; it is
not a guarantee of instant search on a lifelong dataset.

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

## Encounter mutations and status repair

Episode creation/edit/discharge/deletion read their live patient and episode in
the same synchronous transaction as the write, record-count guard and merged
search update (0.11.12). An awaited pre-read allowed a new admission to arrive
before a correction wrote the old active state. A closed/superseded episode
cannot discharge the current patient; a deleted parent cannot accept changes.
Clinical SQL failure rolls back episode, orders, patient status and search together.

Status repair also reads and writes atomically. Startup repair uses the same
ordered active-episode query as individual repair, rather than applying imported
duplicates repeatedly in join order. It retains those episodes. Ambiguous multiple
active episodes refuse discharge until corrected; no silent history merge occurs.
Repair's per-patient ordered reads favor consistent behavior; long-term dataset
startup cost still needs measurement. Manual encounter/discharge forms guard
repeated submits before React rerenders; 0.11.13 adds raw-draft recovery below.

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

Backup, restore and interrupted-restore recovery acquire the same in-process exclusion
before their first await (0.11.10). A rejected attempt releases it even if a native
source handle cannot close. In 0.11.12, complete call-file import/retry/cancel jobs
reserve a shared job lease before yielding; maintenance refuses while any job is
active, and new jobs refuse maintenance. Independent imports remain concurrent.
The lease covers reservation, native copy/hash, clinical commit and cancellation
cleanup. Automatic backup skips busy acquisition without inventing a failed run.
This is a small in-process boundary, not a general lock on ordinary clinical
writes, photo workflows, old editors or another process. In 0.11.14 the lease
also covers each stopped-voice copy and metadata/draft acknowledgement. It does
not cover active recording, all editor writes or a retry after dataset replacement.
Each archive entry captures a validated exact byte length once. Streaming rejects
growth/shrinkage, premature EOF and unknown size while allowing bounded short reads.
These guards prevent an authenticated but internally misframed archive; they do
not prove physical power-loss durability. No format or passphrase scheme changes.
Manual backup now refuses unresolved media just as automatic backup does.

Recovery markers are operational state, not preferences: malformed JSON or unsafe
folder names refuse recovery/backup/restore and retain displaced copies. Falling back
to `null` would incorrectly delete the only old media. Original schema-0000 core
tables/columns are checked before SQL replacement; later optional tables may still
be absent in older backups, and a genuinely empty valid MedOS database remains valid.
Final progress/handle errors after a committed restore are warnings about changed
data, never a false claim that replacement did not happen. File/SQLite race and failure
tests cover this ordering; native process interruption and SAF behavior require their
own evidence. No archive scheme, schema, permission or dependency changed.

---

## Forms: load, then initialise

Date/time fields report validity separately from their last parsed value. Invalid or
incomplete text must never authorize saving that older value. Every consumer passes
`useDateValidation().setValid` and checks `check()` before its explicit write. This uses
a ref so a text event followed immediately by Save cannot observe stale React state.
Day and clock validity stay independent; presets repair the day only, and an explicitly
unknown admission hour removes only clock validation. Most manual forms still
hold raw unfinished input locally. Patient, task and follow-up draft consumers
opt into controlled raw recovery separately; validity alone is not crash recovery
or an independent backup.

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
write for ever), and a stopped recording is copied into media storage before its
draft metadata is acknowledged. The
note itself is still written once, when the user saves — a chart entry is a decision, not a
side effect of typing — and the draft is dropped at that point.

The save path now flushes the draft and publishes it in one synchronous transaction:
note, exact-content version, voice attachment metadata and retiring the draft. Any failure
rolls them all back, keeping the draft retryable. Media bytes must already be stored before
this transaction. A late autosave cannot detach a linked draft or overwrite a retired one;
retired/mismatched/deleted targets now reject rather than report a successful no-op.

This is why the editor's own live query is read only at mount: it is watching a row the same
screen is writing, and feeding those writes back into the fields would fight the keyboard.
Drafts nobody finished are surfaced on Today rather than left to be found by accident.

### Stopped voice acknowledgement (0.11.14)

`VoiceRecorder` awaits its caller's promise and retains the same stopped recording
object on failure. A compact retry replaces the record button; a second recording
cannot overwrite pending work. Permission/start/stop are serialized before React's
disabled state updates. Playback-mode and haptic housekeeping do not decide whether
audio metadata was saved. Post-save navigation runs only after acknowledgement;
when the screen's exit flush owns navigation, it cannot cause a second automatic Back.

Every recorder consumer sits in its screen's one `AutosaveScope`. Registering the
recorder beside text fields makes patient-tab changes, publication and Back await
both. Do not add a second `usePreventRemove` hook to the same route: navigation's
visited-route replay can let one handler bypass the other. The recorder's callback
flushes only its own draft writer, avoiding a recursive wait on its own pending job.

`stageRecording` copies without consuming the source, compares a known positive
source/destination byte length, and shares one in-process staging promise for retries.
Attachment publication rechecks the live polymorphic target and canonical patient in
its synchronous transaction. Same-file voice replay requires the same live binding,
duration, length, MIME type and supplied timestamp. Deleted attachments are not revived.
Capture kind and voice metadata commit together; changing an unfiled capture's patient
also updates its media owner atomically. Note-draft voice JSON now optionally retains
the ISO recording time; old drafts keep their former timestamp fallback. There is no
SQL schema/migration or backup-format change.

Tradeoffs: keeping the cache source temporarily uses extra bytes. Byte-length equality
is not a hash comparison or a durability guarantee. The staging map and pending recorder
are process-local, not a journal: process death before acknowledgement, missing cached
copies, restore-generation conflicts, full-disk recovery and native interruption still
need a persistent operation protocol and acceptance evidence. This bounded fix must
not be advertised as complete voice/crash/restore recovery.

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

A refresh failure must not unmount an editor that already has a record: task,
round and note screens retain their fields and show the read error inline. Initial
note/draft failures block the editor and show an error instead of waiting forever
or opening a blank form over an unread draft. These are distinct cases. Component
tests inject read failures alongside real SQLite write failures and verify retained
text can subsequently be saved; native navigation remains a separate gate.

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

The same concern covers what Android shows outside the app. Since 0.10.0 the Recents screen
gets no screenshot of MedOS on Android 13 and later (`plugins/with-system-bars.js`); its
thumbnail used to be whatever record was last open. Screenshots stay allowed, which is why
this is not `FLAG_SECURE`: that would have blocked them as well.

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

## Call recordings come from the dialer, not from MedOS

The owner wanted calls recorded and kept with the patient. Since Android 10 only the system
dialer may capture call audio (`VOICE_CALL` needs a system permission); an ordinary app that
holds the microphone during a call gets silence or is refused, and the workarounds
(accessibility services, speakerphone capture) are one-sided, fragile across OEM updates and
exactly the kind of permission a clinical app should not ask for. Samsung's dialer records
both sides itself, into `Recordings/Call` — but only where the region allows it: the owner's
phone runs a Gulf (XSG) firmware whose call settings have no «ضبط تماس» at all (checked on the
phone; the `record_calls_*` keys in `Settings.System` exist on every firmware and prove
nothing). There a call-recorder app has to do the recording, and MedOS files its files.

So MedOS files what a recorder wrote (`features/calls/`). The owner grants that one folder
once through Android's picker (persistable SAF grant, nothing else becomes readable); the
list reads it on focus, parses who and when from the dialer's file name, and one tap copies
a recording into MedOS's media storage and writes a «پیگیری تلفنی» note with the audio attached.
The note, initial version, attachment, filed hint and durable retry link commit in one
synchronous transaction after the copy. The transaction rechecks that the patient is alive;
a failed transaction retains its verified copy for retry. It does not infer an encounter
from today's admission.
The copy means backups carry
it and deleting it from the dialer's folder loses nothing. Today counts the last two days'
recording candidates using bounded filename hints, not an exact count of unfiled content.
Any single audio file can be filed the same way, and MedOS is in
Android's share menu for audio (`plugins/with-share-target.js`): the recorder the owner uses,
Cube ACR, keeps its recordings in private storage, so «اشتراک‌گذاری» → MedOS → patient is how
they arrive. The share becomes a `medos://calls?shared=<hex URI>` link before React starts; a
file from another app's provider is copied through the content resolver.

Time provenance matters: a filename timestamp is a parsed source, not a verified clinical
time. A file-modification fallback is labelled as such. A shared recording without a
recognizable timestamp has unknown call time; its note uses import time with that distinction
in the body and attachment caption. The physician can review and correct the note.

The picker retains its source and selected patient on failure, blocks overlapping submits,
and offers retry for patient-read errors. A newer share arriving during a copy is not consumed
by completion of the previous import. Navigation failures after commit report that the file
was saved. The filename-based filed marker is a bounded display hint, not a unique import
identity: intentional reimport is available and equal names can collide. The badge now
says that this *name* was imported, never that the current bytes are filed. Folder rows and
playback use URI identity to avoid equal-name UI collisions.

### Durable audio-import operations (0.11.8)

Migration 0017 adds `call_imports`; no existing migration, backup format, route or
dependency changes. One explicit share/pick gets one UUID. It is not a content-deduplication
key: a deliberate fresh pick/share gets a new UUID and can create another note. Android's
share transform adds this UUID only while converting SEND to VIEW, keeps the converted
intent on `onNewIntent`, and retains that UUID through activity recreation. Invalid/legacy
links get a screen-local id; their process-recreation identity is not guaranteed.

Single-file selection reuses the already-installed DocumentPicker to obtain the
provider's display name. Expo File.name is just the URI basename: a Downloads
document can otherwise become `msf:17` in the note title and lose its audio
extension/date metadata. `copyToCacheDirectory: false` leaves copying behind the
durable reservation. The picker remembers its own location rather than accepting
our initial-folder hint. Its `lastModified` may silently fall back to the current
clock, so that value is not evidence of call time; only name/actual file metadata
are used. Source grants may expire; no new permission or native dependency was
added, and existing imported titles are not retrospectively guessed or rewritten.

The journal reserves patient, versioned source metadata and an owned
`media/imports/<UUID>.<extension>` path **before** native copy. `copying` can restart into
that unpublished destination; `ready` stores nonempty byte count and streamed SHA-256.
New copies are hashed once in 64 KiB chunks; ready retries re-read and compare the stored
bytes before publication, without requiring the old provider grant. A corrupt/absent copy
stays pending with an error; it is not silently replaced. Unknown call time uses the first
persisted import timestamp, not the later retry time.

An in-memory map serializes simultaneous retries of the same id. Persisted state/revision,
source/path and link comparisons reject stale or redirected work. `filed` links the one
note/attachment; retry returns that note, and a soft-deleted note is not recreated.
Copying never overwrites a path referenced by an attachment, including deleted attachments.

The existing calls screen shows recovery cards only for unfinished work. Resume needs no
second patient selection. Confirmed cancellation soft-deletes the operation as `discarding`,
waits for its in-flight copy to settle, then rechecks ownership/references before deleting
only its unpublished destination. Physical deletion followed by `discarded` is a separate
step: failure/process interruption leaves cleanup visible and retryable. Already-filed
clinical records and source files are not removed. Cancelled/filed journals are retained;
there is no general orphan sweep or automatic history pruning.

A native missing-source test returned to the patient picker without a visible
failure message, although retrying from the recovery card showed its dialog.
Alert invocation alone is not visible-error evidence across a modal transition.
The picker has an optional generic notice slot; Calls shows one short failed-write
message there, scoped to the exact pending source. Starting a retry clears it;
success, closing that source or a different incoming share cannot inherit it.
No diagnostic text or private source metadata is added to the notice.

This is a resumable filesystem/SQLite protocol, **not** a filesystem transaction, fsync
guarantee, full restore-concurrency guard or independent backup. An interrupted copy still
needs a valid source grant; a grant from another phone is not portable. Providers may not
expose a size, so unknown-size verification proves the stored bytes can be read and later
compared, not that they match an independently hashed source. Unselected shares, physical
power-loss/low-space/native fault, real recorder permissions and encrypted restore remain
separate acceptance gates. Native errors never repeat private source URI/name/path.

Recording inside MedOS was looked at again when the owner offered an accessibility service:
it would capture the same microphone Cube does, so the other side would sound no better — the
far end of a call is not available to any app that is not part of the system.

**Rejected:** recording inside MedOS (not possible with a real call), reading the dialer's
folder through broad storage permissions (`READ_MEDIA_AUDIO` reads every recording on the
phone), and filing automatically by matching the phone number to a patient (a relative's or
colleague's number, a shared line — the physician picks the patient).

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

---

## Direct ward navigation and bounded previews (0.11.4)

The patient-list URL is the filter contract: `status=current|all|<patient status>`
and `starred=0|1`. Current remains the default; searching that default finds old
records too. Today uses explicit admitted/all-starred routes and `resetSearch=1`
for a fresh list; returning from a patient preserves the existing search. Only the
read region resets on a scope change, because useLive intentionally retains rows
on refresh. Counts are unknown on failed reads, with a retry rather than false zero.

Today shows shift entry before previews. Due/upcoming follow-ups count the whole
matching query before showing five rows; `/followups` is the full virtualized
destination, not another top-level tab. The upcoming predicate is shared and uses
the local end of day. An active outcome prompt delays a mode/day scope change;
the old list keeps its accurate label and the original outcome until submit/cancel.
FollowUpCard is keyed by id inside the recycler because its prompt has local state.
This sacrifices some reuse to prevent another record inheriting the prompt.

Round actions sit outside its one keyboard-aware scroller. Screen alone owns the
bottom safe edge. The footer hides during keyboard input to leave room for editing,
without unmounting the card or save scope. Both actions still await SaveGroup and
require reliable membership reads; skip never marks reviewed. Larger touch targets
and wrapping text cost vertical space, but do not hide any record destination or
cap font scaling. No new dependency, schema, generic dashboard or navigation layer
was required. Software and native acceptance are separate in HANDOFF and plans.

---

## Shift read snapshots and final handoff writes (0.11.5)

Shift and round use one `activeShiftWorkspaceQuery` instead of separately reading
the active shift and its members. Its left joins preserve the difference between
no active shift and an active shift with no visible patients. All four source
tables are watched. The active-shift selector has a deterministic id tie-break.

`useShiftWorkspace` retains the displayed snapshot while a change to shift,
membership identity/order or reviewed state could unmount an autosave field or
move the round cursor. The mounted fields must flush successfully before the new
snapshot is adopted. Read failures retain the old view with retry; stale totals,
completion claims and membership/status actions are withheld. A newer snapshot
cancels adoption of an older one, not the pending writes. Inputs remain keyed by
shift/member/patient; this gate never copies incoming text into local form state.

`saveShiftPatientText` verifies the shift/member/patient identity captured on mount
and preserves exact whitespace. A final write to an already removed membership
updates only its text, retaining `deletedAt` and the original links. The handoff
remains readable in shift history; a re-added patient gets a separate membership.
Recovery is audited with the membership id, never text. The strict general update
API continues to refuse removed memberships. Closed shifts reject late additions,
reviewed actions and a repeated close that would overwrite their end time.

Tradeoff: structural refresh can briefly wait for local storage, with a small
retry notice on failure. One join repeats shift columns per member; the intended
ward list is small, and it prevents an inconsistent pair of reads. No generic
sync framework, schema or dependency was added. This does not supply full shift
text revision history, resolve two independent editors' competing text writes,
or prove crash/power-loss durability; those remain separate acceptance work.

---

## Raw patient-form drafts and explicit publication (0.11.7)

Migration 0016 adds `patient_form_drafts`, with one open `new` scope and one per
patient. Opening an untouched form creates nothing. The version-1 JSON document
stores every raw field, including incomplete Jalali birth-date text and invalid
age, plus the original editable values for an existing patient. The codec rejects
unknown/malformed documents with a generic error; it never falls back to a blank
editor or logs the document. Raw Jalali text is input, not a stored clinical date.
Published birth dates remain Gregorian ISO.

The caller's explicit `now` is used for both two-digit year expansion and future
validation, including the final conversion and three-way comparison. A simulated
clock must not expand a short year against the real system clock. Four-digit
dates and the existing separator grammar are unchanged.

The gate reads the draft before mounting a keyed editor. Later read failures show
retry inside that same editor. `usePatientFormDraft` uses the existing Autosave
queue (800 ms quiet period, 3 s ceiling), background flush and always-on removal
guard. A failed write retains input and blocks leaving. Inputs and repeat submit
are locked through publication and duplicate confirmation. The optional controlled
raw-text contract on JalaliDateField preserves invalid text without altering its
existing uncontrolled consumers.

`form-draft-queries.ts` owns synchronous SQLite transactions. Draft revisions are
compare-and-swap tokens, not full history. Save does not touch a clinical record.
Publication validates the persisted raw fields, checks target liveness and creates
or updates the patient together with soft retirement and its retry link. A retry
of the same token returns the same patient; retirement failure rolls back the
clinical write. The shared transaction helpers in patients/queries.ts preserve
encounter-derived status, phone normalization and the merged search index.

For edits, a three-way comparison publishes only locally changed fields. Other
background fields, stars and tags survive. A conflicting edit to the same field
requires an explicit comparison. Keep mine rebases only local changes, checking
both the displayed draft revision and current editable chart values in the same
transaction. Another intervening change conflicts again. Loading the stored
version and discarding a draft require confirmation and wait for in-flight saves.
Discard is soft and audited by id, without clinical text. A final autosave can
retain text for a soft-deleted patient but cannot publish or revive that patient.

Tradeoff: a separate draft row/codec costs one additive table and an explicit
publish action. It avoids incomplete patients in lists and silently converting
invalid text into facts. Existing backup table discovery includes these drafts;
restoring an older backup clears drafts from the replaced dataset. No new route,
dependency, general sync framework or clinical calculator was added. The stored
revision does not give permanent history of every patient field. Uncommitted
keystrokes, disk/power failure and native recovery remain bounded by the separate
release evidence; other manual forms still need their own recovery work.

---

## Raw admission, edit and discharge drafts (0.11.13)

Migration 0019 adds `encounter_form_drafts`, one open scope per patient for a
new episode and per episode for edit/discharge. The strict version-1 document
retains exact raw fields, including incomplete date/clock input, original form
values and the relevant clinical snapshot. Opening an untouched form creates
nothing. Confirmed dates remain Gregorian timestamps; an explicitly unknown
admission hour still uses 12:01 noon with the existing visible uncertainty.

The existing forms share a feature-local gate, Autosave hook and small status
notice. Identity, target, active encounters and raw draft are read together.
Later read failure retains the loaded editor; background/route removal flushes
the same serialized writer. Rapid field changes merge from its latest value,
not a stale render. No clinical record or discharge changes merely from typing.

Explicit publication validates the persisted raw fields with the caller's `now`,
checks patient/episode ownership and the displayed clinical basis, and applies
the clinical effect plus token retirement in one synchronous transaction.
Existing encounter transaction helpers are shared with the public mutations.
Failure rolls back patient status, encounter, orders, search and draft retirement.
Identical replay returns the same destination without another discharge audit;
different input is refused. Deleted destinations cannot be recreated by replay.

New admission checks its entire active context before superseding it. Edit and
discharge check the target snapshot; discharge also requires the uniquely active
target. A competing draft or intervening clinical change requires comparison.
Keep mine checks the displayed draft revision and current clinical snapshot
again. Loading stored input and discarding require confirmation. Discard is
soft and audited by id. Loaded final raw text can survive a soft-deleted parent
without authorizing publication or reviving any clinical state. Navigation
failure after commit is reported separately from a failed clinical write.

Tradeoff: a separate table/codec and explicit publication cost code and storage
but preserve incomplete inputs without partially admitting or discharging a
patient. Clinical snapshot conflicts are deliberately conservative; the user
sees changed fields/context before accepting their full form. This is not
permanent revision history of every clinical field. Table discovery includes
the new drafts in backups; older table-absent archives clear drafts from the
replaced dataset. No general form framework, route, dependency or permission.
Native interruption, ordinary writes/old editors versus restore and the other
manual forms remain separate acceptance gates.

---

## Raw follow-up drafts (0.11.11)

Migration 0018 adds `follow_up_form_drafts`: one open draft per patient, a
versioned raw document, revision, captured encounter and a published-follow-up
link. The document includes reason, method, priority and exact date/clock input,
including incomplete text. Opening an untouched form creates nothing. Confirmed
follow-up dates remain Gregorian timestamps. The initial defaults are captured
once and are not recomputed when reopening the draft.

The existing follow-up screen reads identity, draft and initial encounter in one
joined snapshot before mounting its editor. It uses the existing Autosave queue,
background flush and always-on leave guard. A later read failure retains the
editor with retry; a failed write retains input and blocks removal. The optional
controlled raw-input contract on QuickDateField preserves its existing uncontrolled
consumers. Preset selection changes the day without repairing an invalid clock.
The Date supplied in controlled mode is for presentation; publication validates
the persisted raw text with the caller's explicit `now`.

Synchronous query transactions check draft revision and patient/context ownership.
Explicit valid publication inserts a clinical follow-up and soft-retires its draft
with a retry link in the same transaction. The same token cannot create duplicate
work. Reminder reconciliation runs after commit and retains the existing repair
intent; native failure does not undo the clinical record. A later admission never
rebinds a recovered draft. Closed original encounters remain historical context;
deleted/foreign encounters and deleted patients refuse publication. Final raw text
can still be retained for a soft-deleted patient without reviving it.

A competing draft requires explicit comparison. Keeping local input checks the
displayed id/revision again and cannot change captured encounter or revive a closed
token. Loading another draft and soft discard require confirmation. Audit records
the discarded draft id, never its text. Comparison controls appear only on failure;
normal use has one status line and the existing publication action. Close retains
the draft, so its label is now Close rather than Cancel.

Tradeoff: one additive table and feature-specific codec/queries cost more code
than volatile component state. They keep incomplete inputs out of the clinical
list and make validation, ownership and atomic publication obvious to a reviewer.
There is no general form framework, new route, dependency or permission. These
revision tokens are concurrency protection, not permanent history of every field.
Other manual forms, restore versus ordinary writes/imports and native/power-loss
acceptance remain separate gates.

The live migration-count reader now refuses failed, missing or zero local metadata
instead of publishing schema zero or claiming a valid backup is newer. Historic
manifest parsing, including schema zero, and all archive/passphrase schemes remain
unchanged. Failures occur before destination publication or clinical replacement.

---

## Recording lifecycle versus file maintenance (0.11.16)

`reserveFileJob` extends the existing in-process file-work exclusion to lifecycles
that do not fit one callback. Its release is idempotent; `withFileJob` uses the
same acquisition rather than a second counter. Independent jobs remain allowed.
VoiceRecorder reserves before permission, keeps ownership through native start,
active recording, stop, staging and awaited metadata acknowledgement. Failed stop,
missing URI or failed acknowledgement retains ownership while the editor can retry.
Denied permission, failed preparation, intentional discard, a sub-500 ms stop or
successful acknowledgement releases it. Backup/restore/recovery refuse that
reservation before yielding; automatic backup skips it without a false failed run.

Unmount checks prevent a delayed permission/preparation result from starting a
recorder after its native object was released. Cleanup waits for an outstanding
operation before releasing ownership, and does not navigate a removed screen.
Normal screen/tab exit still uses the route's one AutosaveScope, not another guard.
This relies on expo-audio's installed native-object lifecycle contract; stand-in
tests do not prove every native cancellation path.

Tradeoff: a long recording or unresolved handoff postpones maintenance, even a
metadata-only backup. Starting ownership only inside `onRecorded` was rejected:
restore could replace the dataset during preparation/recording/stop. No journal,
schema, dependency, permission or general write lock was added. Process-death
recovery, ordinary clinical writes/old editors versus restore and original photo
capture remain separate gates; this reservation does not complete those contracts.

## Chart dates fit the plot (0.11.16)

Date labels use inward anchors at the first/last points and a conservative glyph
width budget for their actual format. A small pure sampler selects at most five
rounded point indices and reduces that count until adjacent labels have room.
Narrow plots retain only the latest date; single-point labels remain centred.
Every clinical point and the existing index-based spacing, units, bounds, numeric
axis and reference band remain unchanged. The old stride plus unconditional final
label could create six dates or a closely spaced final pair and clip the endpoint.

Tradeoff: fewer date captions on a narrow phone instead of collisions. All readings
and exact timestamps remain in the list. Width is a conservative estimate, not
native font measurement; real SVG rendering still needs screenshot acceptance.

## Native recording completion (0.11.17)

Installed expo-audio 57.0.5 can resolve Android `stop()` after catching a native
RuntimeException, leaving a cached URI while reporting `RecordingStatus.hasError`
on the main queue. A rejected-Promise stand-in was insufficient. VoiceRecorder
now listens to that public terminal event and uses a small pure
`RecordingCompletion` latch before handing a file to its caller. The expected URI
comes from the newly prepared native file; a previous-file completion is ignored.
A native error remains an error until explicit discard/new capture, even if a
later status contains a cached URL. Native error text is not stored as clinical
content.

The listener retained by the SDK uses stable refs. Stop duration/captured time
remain intact while confirmation is pending, and file-job ownership spans the
wait and the caller's awaited acknowledgement. Missing confirmation reports
failure after five seconds; a late successful event allows retry without another
stop or file copy. A reported native failure instead shows one confirmed-discard
action on the existing recorder. Discard clears the unacknowledged capture only,
never an existing clinical attachment. The route still has one AutosaveScope.
Forced unmount waits for outstanding work/confirmation timeout before releasing
ownership and never navigates a removed screen.

Tradeoff: a short asynchronous confirmation wait rather than treating the cached
URI as success; a lost terminal event requires retry. This uses the SDK's event
contract instead of relying on an undocumented JS return Bundle or patching its
native implementation. No dependency, schema, permission, new screen or generalized
event bus. It does not provide durable pre-ack recovery, retain all cache files
across crashes or validate physical microphone behavior. SDK upgrades must retain
the terminal-event contract; those native failure and recovery gates stay separate.

## Durable stopped voices on existing records (0.11.18)

Patient media and `VoiceNotesSection` now use `recording_jobs`, additive migration
0020. The recorder supplies a UUID after native completion; legacy in-process
callers receive one stable object-bound fallback. Identity, source URI, duration,
captured time, normalized patient and exact destination cannot change on retry.
The destination is `media/imports/voice-<uuid>.m4a`, separate from call-import paths.
The job is committed before the first native read/copy. A streamed source SHA-256
and positive byte count commit before copying; only matching destination bytes
become ready. Attachment, checksum and saved-operation link commit atomically.

Ready retries use the verified destination without needing the recorder cache.
An interrupted copy can also be recovered without its cache if it matches the
already persisted source fingerprint. Otherwise it may replace only its own
unreferenced partial copy, and only from a source that still matches. A changed
ready file is refused rather than silently replaced. Every async boundary checks
the complete captured intent; all work retains file-maintenance exclusion. Retry
and cancellation of one UUID are serialized. Saved replay checks the bytes and
original live attachment; a deleted or changed record is never recreated.

Recovery appears only for unfinished jobs on the original record and the existing
inbox, with one compact entry from Today. A recorder still holding a failed handoff
keeps ownership of its Retry/confirmed Discard; the inline list excludes that job
until remount. Its awaited discard callback prevents a cancelled journal from
stranding the route guard. No competing guard, new route or automatic reattachment.
If native completion never arrives, confirmation times out before storage begins;
explicit discard may clear that unconfirmed capture without a parent callback.
A failed metadata handoff still requires the parent's awaited cleanup contract.
Confirmed cancellation retires the job, waits for in-flight copy, and checks again
before removing its private unpublished destination. Live/deleted attachment and
note-draft references protect bytes. Failed cleanup stays visible for retry; the
original cache source is not deleted. Discard audits contain ids, never content.

Tradeoff: one small SQLite journal and streamed verification instead of a WeakMap
alone or a general job framework. No new dependency, permission or archive/key
scheme. Full backups include journal/media; a pre-journal restore clears jobs from
the replaced dataset. Native source confirmation remains owned by 0.11.17's latch.
`formatDuration` is pure so recovery text does not import the recorder/native audio.

This covers voices attached to existing records. New/edit note drafts and quick
captures still use process-local `stageRecording`; adapt those targets with their
own publication/conflict contracts next. It does not preserve active recording,
recover before the journal or source fingerprint commits, prevent cache eviction
before verified copy, or prove phone/power/low-space behavior. Ordinary writes and
old editors versus restore, original-before-crop and older orphan cleanup remain
separate work. Do not describe this as complete voice or dataset crash recovery.

## Authenticated AES output capacity and immutable null owners (0.11.19)

An unchanged, independently authenticated 0.11.17 archive failed native restore
on API 26. The installed expo-crypto Android implementation allocates
`Cipher.getOutputSize`, ignores the byte count returned by `doFinal`, and returns
the entire backing array. A direct native probe on AndroidOpenSSL measured
1,048,592 allocated bytes, 1,048,576 written/plaintext bytes, and an exact matching
prefix. The extra 16 zero bytes break framing between decrypted archive chunks.

`chunkCipher.open` still awaits native GCM authentication first. Plaintext length
is sealed length minus the fixed 16-byte tag. Exact output passes unchanged; only
the observed additional 16 all-zero bytes may be excluded at that known boundary.
Short, other-sized or nonzero extra output fails closed. Actual trailing zero
plaintext and the authenticated empty final chunk remain intact. No nonce, AAD,
writer, header, KDF or passphrase normalization rule changes.

Tradeoff: a narrow reader compatibility boundary is smaller and more reviewable
than replacing the provider, patching node_modules or adding a native fork. It
accepts only the observed authenticated capacity shape, not arbitrary padding.
Tests reproduce that shape after real WebCrypto authentication and still reject
wrong key/header/nonce/index/last flag, altered ciphertext/tag and damaged archives.
Native restore acceptance remains separate from the software witness.

Recording journals also compare `attachmentPatientInTransaction`'s canonical
result to the captured patient id, including null, after native reads/copy and
inside publication. The general attachment helper treats null as unspecified;
ignoring its returned owner let a future generic capture acquire a new patient
during copy while its journal retained null. The current enabled patient/note/topic
paths did not expose this race. Real migrated-SQLite cases pin source-read,
copy and ready-publication refusal without changing the helper's existing callers.
This guard does not enable persistent quick-capture or draft-note voices.
