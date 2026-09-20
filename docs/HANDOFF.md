# Handoff log

What each session did, in its own words. **Newest entry first.** Every session adds one
before it finishes — it is the only thing the next session is guaranteed to read.

Keep entries short and honest. "Verified" means you ran it and saw it pass; everything else
belongs under "Not verified". Past entries are history: correct them only if they were
wrong, never rewrite them to look better.

> ### Template — copy this
>
> ```markdown
> ## YYYY-MM-DD — <what the session was about>
>
> **Agent:** <model> via <tool>
> **Commits:** <hashes or "none">
>
> **Changed**
> - …
>
> **Verified**
> - `npm run check` green (N tests) / anything else you actually ran
>
> **Not verified**
> - …
>
> **Open threads** (what the next session should pick up)
> - …
>
> **Gotchas** (something that cost you time, so it costs nobody else)
> - …
> ```

---

## 2026-09-20 (night) — The knowledge module (phase 4)

**Agent:** claude-opus-5 via Claude Code
**Commits:** see `git log` for this date

**Changed** — four notebooks under one tab, since none of them is opened daily.

- **Topics** (`features/knowledge/queries.ts`, `topics-list`, `topic-screen`, `topic-form-screen`):
  a summary per subject with the professor who taught it, the context, the date, the
  verbatim "what the professor said", the pearls and the source. The teacher's name and the
  specialty's names are copied into `searchText`, so searching a professor's surname finds
  their teaching even though the name lives in another table. Voice notes attach to a topic
  (`topic` was already an allowed attachment entity). "نیاز به مرور" is a flag plus a
  `lastReviewedAt` stamp, not a scheduler.
- **Specialty profiles**: one research page per field — daily work, residency length,
  lifestyle, market, pros and cons, a 1–5 personal fit and who said so.
- **Prescription templates**: the user's own routine prescriptions, items as a JSON array
  edited as a list of cards. `prescriptionLine` writes a readable line, an explicit `sig`
  wins over the parts, and blank rows are dropped on save. "کپی متن و ثبت استفاده" copies
  and counts the use, and the list orders by that count, so the three templates written
  every clinic rise on their own. Nothing suggests a drug, checks a dose or warns about an
  interaction, and the screen says so.
- **Idea inbox**: kind/status/priority/area, ordered by what is moving rather than
  alphabetically, with one tap on the status badge to advance it.
- All four register with `reindexSearchIfNeeded`. `SEARCH_INDEX_VERSION` is unchanged
  deliberately: the rules for the existing tables did not change, and these tables are
  empty on every phone.

**Verified**

- `npm run check` green: typecheck, lint, formatting, 317 tests — 13 new ones covering the
  teacher-name search index, index rebuild on a partial edit, the review flag, tag
  suggestions, prescription line/text rendering, blank-row cleaning, usage counting,
  duplication, idea ordering and the specialty index.
- Release APK builds and is signed: `dist/MedOS-0.4.0.apk`, versionCode 6.

**Not verified**

- **Not run on a phone.** The device has been unplugged since the 0.2.2 test. Unproven on
  device: every knowledge screen, the prescription item editor on a small screen, voice
  notes on a topic, and the clipboard copy.

**Open threads**

1. Device test of everything built since 0.2.2 — the doctors directory and this module.
2. **Trash is patients-only.** Notes, labs, imaging, attachments, doctors and now topics,
   prescriptions and ideas are soft-deleted with no way back in the UI.
3. Roadmap: only the credential vault (phase 5) is left unbuilt.
4. Vitals and diagnoses tables exist with no screens (phase 2 leftovers).
5. The greeting log has no history screen; only the last message shows on the occasion row.

**Gotchas**

- `Input` has `numericFold`, not `numeric`; `QuickDateField` takes a non-null `Date` and a
  `direction`, unlike `JalaliDateField` which takes an ISO string or null.
- A route file under `src/app/**` must also be listed in `_layout.tsx`'s `Stack` to get a
  Persian title and the modal presentation; without it the screen still works but shows the
  file name.

---

## 2026-09-20 (evening) — The doctors directory (phase 3)

**Agent:** claude-opus-5 via Claude Code
**Commits:** see `git log` for this date

**Changed** — the module the roadmap had next. Tables existed; everything above them is new.

- **Directory** (`features/doctors/doctors-screen.tsx`): Persian search, relationship chips,
  a real specialty filter from the seeded tree, starred first, the average of each person's
  newest rating on the card, one-tap call and star.
- **Doctor form**: title/name/rank, specialty + subspecialty pickers (a subspecialty that
  belongs to another specialty is cleared rather than kept), messengers, office and referral
  details, insurances and tags as comma-separated lists.
- **Doctor screen**: quick actions (call, SMS, WhatsApp, Telegram, copy, map), and collapsible
  sections for the rating, occasions, the social profile, contacts and referral.
- **Ratings** (`ratings-queries.ts`): a rating is always *added*, never edited in place, so a
  changed opinion keeps its history. Axes left blank stay blank — `ratingAverage` averages
  only what was scored, because "no opinion about their teaching" must not read as a 1.
- **Social profile**: one row per doctor, written or created by `saveDoctorProfile`.
- **Occasions** (`occasions-queries.ts`): recurring dates stored as Jalali month/day,
  reminders `remindDaysBefore` days ahead at 9am, and a prepared greeting the user sends
  from their own messenger — MedOS still sends nothing by itself.
- **Greeting log** (`messages-queries.ts`): handing the text to a messenger records it in
  `scheduled_messages`, and the occasion row shows "آخرین تبریک: …". Whether this person was
  already congratulated this year is not something anyone remembers a year later.
- **Reminder upkeep**: `rescheduleAllReminders` now covers occasions too (open thread #2 of
  the previous entry), and `useReminderUpkeep` re-arms them on every app start, because a
  recurring reminder that has fired leaves a stale id and would never fire again.
- Tapping an occasion notification opens that doctor; `_layout.tsx` routes both payload kinds.
- The Today screen shows occasions coming up within a fortnight.
- Roadmap: phase 3 is now complete.

**Verified**

- `npm run check` green: typecheck, lint, formatting, 304 tests — 14 new ones covering the
  rating average, the Jalali occasion maths (including "this year's reminder is already
  past, so use next year's"), reminder create/update/delete/reschedule, the greeting
  template and its log, and directory search.
- Release APK builds and is signed: `dist/MedOS-0.3.0.apk`, versionCode 5.

**Not verified**

- **Nothing in this module has been run on a phone.** The device was unplugged before the
  build finished. Unproven on device: every doctors screen, the specialty pickers, the
  greeting hand-off to SMS/WhatsApp/Telegram, and whether a birthday notification actually
  arrives.
- The schema was already there, so there is no new migration — but that also means the
  module has never been exercised against a database with real rows in these tables.

**Open threads**

1. **Device test of the doctors module**: add a colleague, rate them, set a birthday two
   days out with a same-day reminder, and check the notification arrives and opens them.
2. **Trash is patients-only.** Notes, labs, imaging, attachments and now doctors are
   soft-deleted with no way back in the UI.
3. The greeting log records what was handed over, but there is no screen listing a
   person's message history — only the last one, on the occasion row.
4. Vitals and diagnoses tables exist with no screens (phase 2 leftovers).
5. Roadmap next module: knowledge (phase 4).

**Gotchas**

- `EditGate` shows "پیدا نشد" for a missing row, which is wrong for a one-row-per-parent
  table like `doctor_profiles`: "no profile yet" is the normal state. That screen waits for
  the read itself instead.
- `Button` has `variant="danger"`, not a `tone` prop; `DataRow` has no `copyable`; the
  radius token is `radii.full`, and the colour on a filled button is `colors.primaryText`.

---

## 2026-09-20 (later) — Nine claims from a third review, fixed and tested on the phone

**Agent:** claude-opus-5 via Claude Code
**Commits:** see `git log` for this date

**Changed** — all nine claims were real; all nine are fixed.

1. **Backup key was three separate SecureStore writes.** Interrupted between them, a new
   key could end up beside an old salt and every later backup would be undecryptable
   for ever. Now one record (`medos.backup.keyset`), with a read path that migrates the
   old three items and deletes them only after the record is written.
2. **Restore reported failure after the data had already been replaced,** and a backup
   that only reached the cache counted as "last successful backup". Post-import steps
   (seeds, reindex, reminders, key) are now collected as warnings — "اطلاعات برگشت، با
   چند کار ناتمام" — and `backupLastSuccessAt` is written only when a file was saved to
   the user's folder or shared.
3. **The kardex showed every order the patient ever had.** `patientOrdersQuery` now takes
   the current encounter and returns its orders plus standing ones (`encounterId is null`);
   discharge completes that admission's running and held orders inside the transaction.
   This was the one with real clinical consequences.
4. **Trend charts mixed units**, and lab flags dropped the comparator. `sameUnitSeries`
   keeps the unit of the newest result that has one and counts what it left off;
   `parseLabValue` keeps `<`/`>` so ">100" against a limit of 100 is high and ">0.01"
   inside the range gets no flag instead of a reassuring "normal".
5. **Pasted spreadsheet rows shifted columns** when a cell was empty, and a quoted
   `"250,000"` split in two. Column positions are now kept; rows without a name and a
   value are skipped.
6. **`redactErrorText` only cleaned the first line** of a failed-query message, so a note
   containing newlines leaked into the error log. Everything from `params:` on goes.
7. **Note + voice was not atomic:** a failed voice save made "save" write a second copy of
   the note. The new id is remembered, the retry updates, stored voices leave the queue.
8. **`useLive` errors were invisible** — a failed read looked like "no drugs". New
   `ErrorNotice` shows a Persian card, logs once, and is wired into the seven list screens.
9. **A release build with no keystore silently fell back to the debug key.** Gradle now
   throws instead; an APK signed with another key cannot update the installed app without
   uninstalling it, which deletes the database.

Also fixed, found on the phone rather than in the code: **the bottom tab bar was drawn
underneath Android's navigation bar** (`tabBarStyle` had a hardcoded `height`/`paddingBottom`,
which overrides the inset React Navigation would have added). Tapping "پزشکان" went Home.
`Screen`'s scrolling content had the same problem for stack screens — the Cancel button of
a long form sat behind the nav bar. Both now add `useSafeAreaInsets().bottom`.

LockGate now blocks the hardware Back button and sets `pointerEvents: none` on the covered
content (open thread #5 of the previous entry).

**Verified**

- `npm run check` green: typecheck, lint, formatting, 290 tests (13 new).
- **On the owner's phone** (Galaxy A52s, Android 14, release APK 0.2.2, versionCode 4):
  install over adb, cold start, patient created, admitted to ICU with the hospital-day
  count and Jalali dates right; Ceftriaxone added to the kardex; discharge → the order
  became "قطع‌شده" and the running list emptied; re-admission → **the new kardex is empty**,
  which is claim 3 proven end to end. Troponin ">100" against "< 0.04" flags H; changing
  it to ">0.01" leaves no flag at all (claim 4b proven).
- Backup passphrase set (scrypt takes ~25 s on this phone); a full backup wrote
  `MedOS-1405-06-29_072155-full.medosbak` to the folder the user picked. The file has the
  expected header (`MEDOSBAK`, format 1, scheme 2, log2N 15, r 8, p 1) and contains no
  plaintext at all — not "SQLite", not a patient name.
- Restore end to end, twice: a patient created after the backup disappeared, the backed-up
  patient came back with their lab panel, and a second round trip returned "۱ بیمار، ۱ فایل"
  with the voice note still attached to its note. No warnings, and the app's own error log
  stayed empty through all of it.
- Tab bar after the fix: `uiautomator` reports the tabs at y 2134–2256, clear of the
  navigation bar at 2274+; before it they were at 2257–2379, inside it.
- The phone was left clean: app data cleared, test backups deleted. An empty `MedOS/`
  folder remains on the phone's storage.

**Not verified**

- App lock (biometric) — it needs a real fingerprint, which adb cannot supply.
- Photos, imaging, the crop/zoom viewer, follow-up reminder notifications, trash.
- The voice note was recorded and restored, but nobody listened to the restored audio.
- `pm clear` was used at the end, so the keyset **migration** path (claim 1) has only been
  proven by unit test, not on a phone that carried an old key.

**Open threads**

1. **Trash is patients-only.** Notes, lab panels, imaging and attachments are soft-deleted
   with no way back in the UI.
2. Occasions/birthday reminders (phase 3) must register in
   `features/reminders/reschedule.ts` when they are built.
3. Vitals and diagnoses tables exist with no screens (phase 2 leftovers).
4. Roadmap next module: doctors directory (phase 3).
5. Nothing enforces the safe-area rule mechanically; it is an AGENTS.md convention. A
   render test would need `@testing-library/react-native`, which is not installed.

**Gotchas**

- The JS bundle is built in the first minute of `npm run apk`. Edits made after that are
  silently absent from the APK — check `android/app/build/generated/assets/react/release/
  index.android.bundle`'s timestamp against your edits before believing a device test.
- `adb shell input text` cannot type Persian, and `<`/`>` need the inner quoting
  `adb shell "input text '>100'"`; without it `%3e` arrives literally.
- `uiautomator dump /sdcard/ui.xml` from Git Bash needs `MSYS_NO_PATHCONV=1`, or the path
  becomes `/Files/Git/sdcard/ui.xml`.
- This phone has a secondary user (Secure Folder). `pm list packages` fails without
  `--user 0`, and so does `adb install` in some flows — pass `--user 0`.

---

## 2026-09-20 — Claims review from a second AI, fixes, and this multi-agent workflow

**Agent:** claude-opus-5 via Claude Code
**Commits:** see `git log` for this date

**Changed**

- Reviewed eight claims from another AI against the code. Four were real and are fixed:
  - **Splash screen lock-out:** `hideAsync()` ran only inside `AppStack`, so a startup
    failure left the app on the splash image with the error screen hidden underneath. The
    splash is now taken down by `StartupGate` on both success and failure.
  - **Restore could leave dangling references:** foreign keys are off while tables are
    refilled, so `importTables` now runs `PRAGMA foreign_key_check` **inside** the
    transaction and rolls back with a clear message. Test added.
  - **Audio mode leak:** leaving the screen mid-recording left the audio mode switched to
    recording (expo-audio does release the recorder itself, so the microphone was not
    held). `VoiceRecorder` now resets it on unmount.
  - **Stale comment:** `db/schema/vault.ts` pointed at `src/lib/vault.ts`, which does not
    exist; the vault is not built.
- Reminder rescheduling after a restore moved into one place
  (`features/reminders/reschedule.ts`) so the occasions module cannot forget to join it.
- Multi-agent workflow: `AGENTS.md` (the contract), this log, `npm run brief`,
  `npm run setup` (git hooks + commit template), ESLint rules for the two invariants a
  reviewer cannot see (async transaction callbacks, hard deletes), a PR template, and
  `docs/review-guide.md` for the senior developer.
- Android build notes moved out of `CLAUDE.md` into `docs/android-build.md`; `CLAUDE.md`
  is now a pointer to `AGENTS.md`.

**Verified**

- `npm run check` green: typecheck, lint, formatting, 277 tests.
- CI green on GitHub for the previous commit (the same checks on a clean Linux machine).
- Release APK builds and is signed with the owner's key (`dist/MedOS-0.2.1.apk`,
  versionCode 3, SHA-256 `1119f776…7e0c`). 0.2.1 is the first build that contains the
  fixes above; 0.2.0 was built before them.

**Not verified**

- Nothing has been run on a real phone in this session or the previous one. Specifically
  unproven on device: native AES backup/restore end to end, the splash fix, biometric
  unlock, and the audio-mode reset.
- The ESLint invariant rules were tested against deliberately bad sample code, not against
  a real violation in the codebase.

**Open threads**

1. **Device test.** Install `dist/MedOS-0.2.1.apk`, make a full backup, restore it into
   MedOS Dev, and confirm a patient, a photo and a voice note survive.
2. **Trash is patients-only.** Notes, lab panels, imaging and attachments are soft-deleted
   with no way back in the UI. The promise "nothing is ever lost" is only half true today.
3. Occasions/birthday reminders (phase 3) must register in
   `features/reminders/reschedule.ts` when they are built.
4. Vitals and diagnoses tables exist with no screens (phase 2 leftovers).
5. The hardware Back button still navigates the screens underneath the lock cover. The
   cover keeps blocking touches and the content stays hidden, so nothing leaks, but after
   unlocking the user can find themselves on a different screen. A `BackHandler` while
   covered fixes it; left out of 0.2.1 so the built APK matches this commit.
6. Roadmap next module: doctors directory (phase 3).

**Gotchas**

- Some agent tooling silently decodes `\u` escapes when writing files, which turns the
  frozen letter tables in `lib/persian.ts` and `lib/crypto.ts` into invisible characters.
  After editing either file, grep the diff for `u06`.
- Jest's `toEqual` walks typed arrays element by element: comparing megabyte buffers that
  way took 16 seconds per test. Compare bytes with a loop (`equalBytes`).
- `expo prebuild` cleared `android/` even without `--clean`, which means the next release
  build is a full native build (~12 minutes), not the cached ~2.5.
