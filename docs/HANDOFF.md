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

## 2026-09-21 (M2, third part) — A place to put a thing before you know where it goes

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commit

**Changed**

- **The capture inbox** (`capture_inbox`, migration 0009). Every other screen asks a
  question first — which patient, which episode, note or task — and in a corridor those
  questions cost more than the thing being remembered, so it does not get written at all.
  A capture asks nothing: text, a recording, a photo, and a patient only if it happens to
  be obvious. Filing is a separate act, done sitting down.
- **Two columns hold the whole lifecycle**: `filedAt` null means it is still waiting,
  `deletedAt` means it was thrown away. Deliberately no `status` column — a second way of
  saying the same thing is a second thing to keep in step.
- **Filing never destroys the capture.** As a task it becomes a task and the capture keeps
  its recording (a task has nowhere to play audio); as a note the attachments *move* to the
  note, because one file should have one home and the note's own media list is where
  someone will look for it. Filing as a note refuses without a patient rather than
  guessing.
- **`CaptureWriter`**: the capture screen's row, created at the last useful moment and
  shared by the keyboard, the recorder and the camera. One promise, so three callers in the
  same tick get one row; and an empty row is dropped again on the way out.
- **Quick capture** is a FAB on Today, the inbox is a section on Today (oldest first — an
  inbox sorted newest-first buries what has waited longest) and a full screen at `/inbox`
  with the filed ones underneath.
- **The trash now restores captures too.** The discard alert promises the trash, and that
  promise had to be true before it was written. Patients and captures only; the rest of M5
  is still open.
- `capture` joined `ATTACHMENT_ENTITIES`; captures joined the search index registry.

**Verified**

- `npm run check` green: 28 suites / 430 tests (414 before). 15 of the new ones cover the
  inbox: that filing is the only thing that files, that a recording moves with its note,
  that a deleted patient loses their name but not the capture, and that the writer creates
  exactly one row under concurrent callers.

**Not verified**

- Nothing on the phone. The recorder and camera paths in particular have only been reasoned
  about — the tests attach media rows directly rather than through the device.

**Still open from the owner's plan**

- M2: round mode as a dedicated one-patient-at-a-time flow.
- M3 (vitals and diagnoses UI), M5 (trash for the remaining entities), M6, M7.

**Gotchas**

- `react-hooks/refs` rejects a `useMemo` that calls a `useCallback` which reads a ref — it
  flags the construction, not the call. Holding that state in a class instance created with
  `useState(() => ...)` is what the rest of the codebase does and what the rule accepts.

## 2026-09-21 (M2, second half) — Consults that can be outstanding, and a timeline

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commit

**Changed**

- **Consultations** (`consultations`). A consult note records what the specialist wrote; it
  cannot record that an answer is still owed, because that is an absence — and an absence
  is what nobody notices at 2 a.m. The request is now its own row with its own state:
  written down, actually asked, answered, or called off. Every transition is a button
  someone presses; nothing infers that a consult was requested because a note exists. The
  reply and the instruction that follows from it are separate fields, because "EF 35%" and
  "start an ACE inhibitor tomorrow" are different sentences.
- **Open consults on Today**, across all patients, so what is owed is visible without
  opening anybody's record.
- **A timeline tab** on the patient record: notes, lab panels, imaging with a date,
  consults and admissions/discharges, newest first. Deliberately a projection over the
  existing tables rather than an events table — every row already has an owner that
  validates it, and a copy would be a second place to keep in step. Orders are left out (a
  kardex line is a standing instruction, not a moment) and so are tasks (a task is about
  the future).
- Consults and tasks joined the search index registry.

**Verified**

- `npm run check` green: 27 suites / 414 tests (408 before).

**Not verified**

- Nothing on the phone.

**Still open from the owner's plan**

- M2: round mode as a dedicated one-patient-at-a-time flow (the shift screen covers much of
  it), and the capture inbox.
- M3 (vitals and diagnoses UI), M5 (trash for every entity), M6, M7.

## 2026-09-21 (M2, first half) — Shifts and tasks

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commits

**Changed**

- **Shifts.** `shifts` and `shift_patients`: one open shift at a time (starting another
  closes it, the way an admission supersedes the last), patients carried in round order,
  each with a per-shift line, a handoff note and a seen/not-seen mark. A shift owns nothing
  — deleting one drops the list and never touches a patient or their record, which is what
  the test suite spends most of its assertions on.
- **Tasks.** `tasks`: a title, a state, and every link optional — including the patient.
  Follow-ups are a patient's appointments with the future and cannot exist without one;
  half a working day is "ring radiology about the CT", which had nowhere to live. An
  undated task counts as due now, because it is not waiting for anything.
- **Screens.** `/shift` is the round: add a patient, tap to mark them seen, write the
  handoff line, jump to a note. Today leads with the shift and its progress, then the tasks
  with nobody's name on them. The patient overview has its own task list.
- Tasks joined the search index registry.

**Verified**

- `npm run check` green: 26 suites / 408 tests (394 before). Thirteen of the new ones are
  about shifts and tasks, and the sharpest is "takes nothing with it when it goes".

**Not verified**

- No screen here has run on a phone.

**Still open from the owner's plan**

- M2's other half: consultations as their own entity, the timeline projection, round mode
  as a dedicated one-patient-at-a-time flow, and the capture inbox.
- M3 (vitals and diagnoses UI), M5 (trash for everything), M6 (backup round-trip on a
  second phone), M7 (device acceptance).

## 2026-09-21 (M1 + note history) — Working from the owner's plan

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last two commits

The owner supplied a full plan (M0–M7). This covers M0, M1 and the note-history P0.
The plan's own description of the repository was stale — it said the working tree was
dirty and `npm run check` was failing on formatting, which was a snapshot taken during the
previous session. Both were already clean.

**M1 — one source of truth**

- `features/encounters/status.ts`: the episode decides whether a patient is on a ward.
  `admitted` is no longer a chip on the patient form; create and update coerce it away when
  no episode backs it; startup reconciles every patient and audits how many it corrected.
- `deleteEncounter` works only on a live episode (so a second delete cannot rewrite the
  status of a patient who has moved on) and re-derives the status from what remains.
- `deleteDoctor` is one transaction for the database, with the alarm cancelling after the
  commit.
- `doctor_profiles` has a partial unique index: one live profile per doctor.
- Ordinary edits across notes, orders, imaging, places, doctors, knowledge, occasions and
  lab panels require the row to be alive; restore keeps its own path.
- `media.keepOriginals` now defaults to `always`, per the plan.

**Note history**

- `note_versions`: a whole copy of the note's fields per save, never pruned, with a
  `contentHash` so an unchanged save is not a version. Deleting a note does not touch them.
- Written by `createNote` and `updateNote` from the row *after* the write, so a version says
  what the note says rather than what the call meant to change. Autosave does not make
  versions — drafts are a different thing.
- `restoreNoteVersion` puts an older text back and writes a new version on top saying where
  it came from. Nothing is lost by restoring, so "undo the restore" is another restore.
- Notes written before the table get a `baseline` version stamped with their own creation
  time, once, on the `SEARCH_INDEX_VERSION` pattern.
- Reachable from the note editor's header; `/patient/[id]/note-history`.

**Verified**

- `npm run check` green: 25 suites / 393 tests (378 at the start of this session).

**Not verified**

- None of it on the phone. Note history in particular has never been opened on a device.

**Not done from the plan, and why**

- **M2 (shifts, general tasks, consultations, timeline, round mode, capture inbox)** is the
  largest part of the plan and is untouched. It is four new tables and six screens; doing it
  in the same pass as M1 would have meant shipping it untested next to a data-integrity
  change that needed to be reviewable on its own.
- **M3 (vitals and diagnoses UI)**, **M5 (trash for every entity)** and **M6 (vault
  passphrase change — now moot, and the backup round-trip on a second phone)** are likewise
  untouched.
- **M7 device acceptance** is blocked on the phone being connected.

## 2026-09-21 (later) — A fifteen-bug report, checked one by one

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's later commits

An external "deep investigation" reported fifteen defects. Eleven are real, two are wrong
about this code, and two are true statements about a risk that is not reachable or not a
bug. Checked against source, not taken on trust.

**Fixed**

- **Fourteen single-record queries ignored `deletedAt`** (`patientQuery`, `noteQuery`,
  `doctorQuery`, `encounterQuery`, `labPanelQuery`, `orderQuery`, `imagingStudyQuery`,
  `attachmentQuery`, `placeQuery`, `extensionQuery`, `topicQuery`, `prescriptionQuery`,
  `specialtyProfileQuery`, `ideaQuery`, `occasionQuery`). `EditGate` shows "پیدا نشد" for a
  missing row, but a deleted one loaded normally and saving it wrote an edited, invisible
  record. Same class as the credentials fix in `70195fc`; the whole family is now filtered.
- **A failed voice attachment could duplicate a note.** The note is written first and its
  voices attached after. On failure the editor stays open (right), but the draft still said
  "a new note for this patient" — leaving and coming back offered it again, and saving
  wrote the note twice. `retargetNoteDraft` points the draft at the note the moment it
  exists.
- **The note delete dialog promised a trash that does not hold notes.** `/trash` lists
  deleted patients only. The text now says plainly that it can only come back from a backup.
- **A deleted episode left the patient admitted.** `deleteEncounter` soft-deleted the row
  and nothing else: `isActive` stayed true and the patient kept a bed on the ward list. It
  now clears `isActive` and puts the patient back to outpatient when the deleted episode was
  the active one, in one transaction, with tests.
- **Deleting a doctor left their alarms armed.** The cancellation lived in the delete
  button. It is now in `deleteDoctor`, which also soft-deletes that doctor's occasions.
- **Unfinished notes listed drafts of deleted patients and did not say whose they were.**
  The query joins patients and filters them; the card leads with the patient's name.
- **A non-scrolling screen had no bottom inset**, so its last row sat under Android's
  navigation bar. The scrolling branch had this; the other one did not.
- **The backup screen said "other screens are usable" during a restore**, while the import
  replaces the database in one transaction. It now says the right thing per phase.
- **`therapyDay` counted down for a future start** (`D0`, `D-1`). Not reachable — the date
  field refuses future dates there — but a day number is a fact about a course that has
  begun, so it returns null instead.
- **Future migrations can no longer break old backups.** `migration-safety.test.ts` fails on
  any `ADD COLUMN ... NOT NULL` without a `DEFAULT`: a restore copies only shared columns,
  so such a column has nothing to fill it and the whole restore rolls back. This is the real
  form of the report's claim about `.$default()`.

**Rejected, with reasons**

- **"Deleted lab panels still appear in trends."** False. Both `patientLabValuesQuery` and
  `analyteSeriesQuery` inner-join `lab_panels` and filter `panelAlive`. Deleting a panel
  hides its values everywhere they are read.
- **"Clearing a Jalali date field silently keeps the old value."** False: clearing calls
  `onChange(null)`. What is true is that a non-empty unparseable string is ignored without
  an error, deliberately, because that is what half-typed input looks like.
- **"Convert 50+ `.$default()` columns to `.default()`."** The mechanism is right and the
  remedy is wrong: every one of those columns is in `0000_init`, so every backup has it.
  Rewriting them would mean rebuilding tables in a migration — the risky operation the rules
  forbid — to fix nothing. The guard above covers the case that actually bites.
- **"`diagnoses` and `vitals` are dead schema."** They are declared and unused on purpose;
  `db/schema/index.ts` says so.
- **Android back gesture bypassing the leave dialog.** True, and harmless: the draft is
  already written, so leaving keeps the text. Discarded drafts do leave their `.m4a` files
  on disk; deleting a recording the user may have discarded by accident is the worse choice,
  so they stay and the row stays soft-deleted beside them.

**Verified**

- `npm run check` green: 24 suites / 378 tests (369 before).

**Not verified**

- Nothing on the phone. The A52s has been disconnected since 0.7.0 was built; 0.7.1 (with
  the voice playback fix) and all of the above are waiting for it.

## 2026-09-21 — A voice note that would not play, and review 018

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's commits

**The owner's report:** record a voice note, press play, nothing happens.

**Changed — playback**

Not reproduced on a phone (the A52s was disconnected), so this is a fix for the causes the
code actually contains, plus an end to the silence around them:

- **The audio session is set for playback again.** Recording switches the session to
  record; nothing switched it back. The very next thing anyone does after recording is
  press play on the same screen. `platform/audio.ts` now holds one playback mode
  (`playsInSilentMode`, not routed through the earpiece, ducking others), applied at
  startup, when a recording stops, and before every play.
- **The press reads `player.playing` rather than the status snapshot.** The status arrives
  by event; a missed one left the button toggling against a stale idea of the player, which
  looks exactly like a dead button.
- **A player whose source never loaded gets it again** (`replace`) instead of doing nothing.
- **Failures are visible.** A missing file says "فایل صدا پیدا نشد" and a thrown play says
  "پخش نشد" in the row, and the error reaches the diagnostics log. Whatever is wrong next
  time, the screen will say something.
- **A short recording is less likely to be thrown away**: the length is taken as the larger
  of the polled state and the recorder's own clock, because the poll can be a quarter of a
  second behind and 0 ms means "discard as an accidental tap".

**Changed — review 018**

- **C1 (P2, real):** `credentialQuery` filtered by id only, so a deleted password could
  still be read and edited through a stale screen or an old link. It now filters
  `deletedAt`, with a test.
- **C2 (P2, real):** the form could not clear a stored password — an empty box means "leave
  it alone", by design, and there was no other way. There is now an explicit
  "رمز ذخیره‌شده پاک شود" switch, shown only when editing and only when the box is empty.
- **Version metadata (real):** `app.json` said 0.7.0 while both `package.json` files said
  0.5.0, which is what `npm run brief` reads. Aligned, and `app-version.test.ts` now fails
  if they drift again.
- **C3** (should deleting a password purge it rather than soft-delete) is an owner decision
  and is left as one. **C4** (internal `vault` naming) is deliberately not renamed. **C5**
  (pre-0.7 ciphertext rows) was already handled and documented.

**Verified**

- `npm run check` green: 23 suites / 369 tests.

**Not verified**

- The playback fix. It needs the phone: record, press play, and watch whether the timer
  moves. A moving timer with no sound is a routing problem; a still timer is a loading
  problem, and the row will now name which.
- Everything else in 0.7.0 is still device-untested: the notebook screens, the permissions
  card, and migration 0004 on an existing install.

## 2026-09-20 (0.7.0) — The vault becomes a notebook, permissions get a home

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commits

**The owner's decision, in his words:** he does not want the password screen to be a vault
and does not need it to be secure. He wants a tidy, reliable place for working passwords
instead of a note in Samsung Notes.

**Changed**

- **The vault is gone; the list stays.** No passphrase, no unlock, no scrypt, no key in the
  Keystore, no biometric gate before a password appears. `credentials.secretText` holds the
  password as typed; the screen hides it behind a show/hide toggle, which is for shoulders
  in a corridor, not for security, and the docs now say exactly that. `features/vault/keys.ts`
  is deleted along with `rekeyVault`, `finishPendingRekey`, `stageNextKeyset` and the whole
  two-generation protocol — which also dissolves review 017's F3 rather than fixing it.
  What is kept: the password never enters `searchText`, and it is stored untrimmed.
  Rows sealed by the old build are shown as "با نسخه‌ی قبلی رمزگذاری شده", not as empty.
- **A permissions card in Settings.** Notifications, camera, microphone and the backup
  folder, each with its real status and the one action that fixes it — request if Android
  still allows it, otherwise the system settings page. Android asks at the point of use,
  which is right, but a refusal months ago is invisible afterwards and looks like a broken
  app. Also a line about "Alarms & reminders", which is the setting that makes reminders
  arrive on time and cannot be requested from inside the app.
- **Review 017's findings.** F4: `Autosave.flush()` now returns whether everything reached
  storage, and "نگه دار" stays on the screen when it did not — it used to navigate away on
  a failed write, discarding the only copy. F5: `saved` is no longer reported when a newer
  revision arrived during the write; that state is `pending`. F1: a failed media recovery is
  recorded in `restore.mediaUnresolved`, shown as a red card on Today with a retry, and
  blocks automatic backup until it is zero. F2: the rollback now covers everything between
  placing the media and committing the database (a throwing progress callback used to slip
  past it), `DETACH`/`PRAGMA` failures after a commit are logged instead of reported as a
  failed import, and `restore.*` settings are never imported from a backup — a backup taken
  while an old restore was unresolved would otherwise reintroduce its marker.

**Verified**

- `npm run check` green: 22 suites / 367 tests. (Down from 371: the vault's key tests went
  with the keys, and four smaller cases replaced them.)
- Review 017's blocker — `npm run check` failing on `app.json` formatting — was a snapshot
  of an uncommitted working tree mid-session. It passes on every commit.

**Not verified**

- Nothing in this entry has run on the phone yet; a 0.7.0 build was made for that.
- The permissions card reads real statuses but has only been typechecked, not tapped.

**Open threads**

- Old encrypted credential rows cannot be read by this build at all. There were none on the
  owner's phone (the vault was created empty during the device test), but if a backup from
  0.5.0–0.6.0 is ever restored, those passwords are lost to the app and must be retyped.
- The reviewer is right that autosave is not note history. Versioning is still unbuilt and
  still waiting on a retention decision.

## 2026-09-20 (device) — Everything since 0.2.2, on the A52s at last

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commits (0.6.0)

The phone was connected for the first time since 0.2.2, so this covers doctors,
knowledge, the vault, both review fix batches, drafts, photo originals and admission
duration — all of it previously host-tested only. Two real defects turned up, both
introduced this week, both invisible to 369 passing tests.

**Verified on a Galaxy A52s (SM-A528B, Android 14), release build, installed over the
0.2.2 install that was already there**

- **Migrations 0001–0003 applied on upgrade** (note_drafts, attachments.original_path,
  encounters.admitted_at_has_time). App started to Today with no error screen.
- **Autosave survives a process kill.** Typed a subjective into a new note, never pressed
  Save, `am force-stop`, relaunched: Today listed it under "نوت‌های ناتمام" and the editor
  reopened it with the recovery banner and the text intact. Saving it moved it into the
  record and cleared the draft.
- **Admission duration**: admitted "پریروز" with the new "ساعت بستری را نمی‌دانم" switch
  on; the card reads "حدود ۲ روز / از بستری", and the time field disappears while the
  switch is on.
- **Trend chart**: CRP 30 → ">100" draws a filled circle and a triangle at the bound,
  with the single legend line "مثلث: عدد دقیق نیست" and no unit line (all rows had the
  preset unit). A non-numeric value in the same series was skipped by the line and still
  listed in the table.
- **Vault**: created on device — scrypt takes ~15 s on this phone, the button shows busy
  throughout — and the credential list opened.
- **Backup**: passphrase set (scrypt again), SAF folder chosen and granted, and — after
  the fix below — a full backup written, verified and reported as
  "آخرین بکاپ: ۱ دقیقه پیش".

**Fixed because of this run**

- `>100` rendered as `100<`. Forced RTL + a run with no strong character = the bidi
  algorithm resolves against the paragraph and mirrors the bracket. On a lab table that
  reads as the opposite result. `ltrIsolate` in `lib/persian.ts`, applied to both lab
  value tables.
- **`verifyCopy` rejected every good backup**, and had done since `da630e7` — which is to
  say the fix written for the first review's R5 broke folder backups outright, and only
  the phone could show it. The copy lands (the files are on disk); what fails is finding
  it afterwards. `new File(folder, name)` composes a path inside a storage-access-framework
  tree, which resolves to nothing: SAF children have provider-issued document URIs. The
  lookup now goes through `folder.list()`, the same way `rotateBackups` already did.
  While chasing it the check also became three-valued — `bytes` / `size` / `failed`, where
  `size` means "there, right length, and the provider would not hand out a file handle" —
  and only `failed` stops a backup. The audit records which of the three ran, so a weaker
  check is never filed as the stronger one. Two commits in this session name `open()` as
  the cause; that was the first hypothesis and it was wrong.

  The lesson is the one this codebase keeps writing down in the other direction: a check
  that refuses good data is not a stricter check, and an unverified verification is worse
  than none, because it fails closed on exactly the operation that protects the record.

- **Restore, on the phone, for the first time.** A full backup was restored over the live
  data: "بازگردانی کامل شد — ۱ بیمار، ۰ فایل", the pre-restore snapshot was kept, the
  in-flight marker was cleared by the import itself, and the vault stayed open afterwards
  — `loadVaultKey` proved the stored key against the restored keyset rather than locking
  spuriously. Rotation keeps exactly `KEEP_FULL` files in the folder.
- The app's error log holds only the two backup failures from before the fix, and nothing
  from the restore.

**Not verified**

- Restore of a backup from a *different* dataset or phone — the case R3 is really about.
  This one restored the phone's own backup, so the keyset matched by construction.
- Photo originals: no camera capture was driven, so `storePhoto({keepOriginal})` has not
  run on the phone.
- Doctors and knowledge screens were not walked through this time.
- Nothing measured: no timing for `synchronous = FULL`, no battery or storage figures.

**Gotchas**

- `adb shell input text` splits on spaces — pass `%s`, or the rest of the sentence lands
  nowhere. One value in the test data reads "45 to by" because of this.
- Tapping a button whose uiautomator bounds are ~10 px tall means the keyboard is over it;
  the tap lands on the IME or the gesture bar and can background the app. Check
  `dumpsys input_method | grep mInputShown` and close the keyboard first.
- A uiautomator dump only lists nodes that have text, so an empty text field is invisible
  in it. Move between fields with keyevent 61 (TAB) rather than guessing coordinates.
- `npm run apk` does not re-run prebuild when `android/` exists, so a version bump in
  `app.json` does not reach the APK. Run `npx expo prebuild --platform android` first.

## 2026-09-20 (latest) — Typing that survives the phone, and photos that keep their pixels

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last two commits

A second external review (016) went through the owner's long product conversation with
another assistant. Its findings about *that* proposal are not this repository's business,
but two about this code were right and are fixed here. The chart from the last entry was
also cluttered, which the owner said plainly.

**Changed**

- **A note no longer waits for Save to be safe.** `note_drafts` holds what is being typed;
  `lib/autosave.ts` schedules the write with a short debounce *and* a hard ceiling, so
  continuous typing — the case a plain debounce protects least — still reaches storage
  every few seconds. Writes are serialized, a failed one keeps its value and retries, and
  the screen never says "saved" when it is not. The editor flushes on unmount and when the
  app leaves the foreground.
- **The note itself is still written once, on Save.** A chart entry is a decision; a
  half-typed note should not appear in a patient's timeline because the phone rang. What
  the button stopped controlling is whether the words survive.
- **Voice is stored when recording stops**, not when the note is saved. The draft carries
  the stored paths; Save turns them into attachments.
- **Drafts are visible.** `UnfinishedNotes` on Today: a draft nobody finished is otherwise
  only offered when the same patient's editor is opened again.
- **`PRAGMA synchronous = FULL`**, set explicitly. In WAL mode the usual default is NORMAL,
  which survives a crash but can lose the last commits to a power cut — and the last commit
  is now the sentence someone just typed.
- **Photos keep their original bytes** for clinical photos and radiology (`media.keepOriginals`,
  settable to always/never in Settings). Every photo is re-encoded to 2400px JPEG, which is
  right for a lab sheet and wrong for a lesion followed over weeks or two ECGs compared
  side by side. The re-encode cannot be undone later, so the choice has to be made on the
  way in. The viewer zooms and shares the original when there is one.
- **One marker per point on a trend chart.** The previous entry's arrows sat on top of
  circles and needed three lines of small print; now the shape says it (round = measured,
  triangle = a bound) and one short line explains the shapes that are actually present.

**Verified**

- `npm run check` green: 22 suites / **367 tests** (354 before).
- The scheduler is tested with fake time, including the case that matters: twenty
  keystrokes 200 ms apart, where a pure debounce would never write at all.
- Draft round-trip, per-note separation, discard-keeps-the-row and voice carriage are
  tested against real SQLite (sql.js) with the app's own migrations.
- The earlier review's restore probe was rebuilt against the fixed engine: all four
  failure paths now preserve the data. Script is not committed (it is a diagnostic).

**Not verified**

- Still nothing on a phone. Everything since 0.2.2 is untested on device, and these
  changes add two things only a device settles: whether `synchronous = FULL` costs
  anything noticeable on an A52s, and whether keeping originals fills the phone faster
  than the owner expects.
- Process death during typing has not been *demonstrated*; it has been designed for. The
  test kills the write, not the app.

**Open threads**

- Version history for notes (the owner chose "remember everything"): drafts are the
  foundation, the history table is not built. Retention is still an open owner decision —
  and the reviewer is right that it must not block anything else.
- Old `scheduledMessages` rows still claim a confirmation that never happened
  (`deliveryEvidence` column); still deferred, still cheap, still should happen before the
  doctors module has real history.
- Admission duration (O11) is now implemented, in the same session: `hospitalDay` is gone,
  replaced by `admissionElapsed` / `formatAdmissionElapsed`. The patient card shows "۳ روز
  و ۴ ساعت" instead of "روز ۴", `encounters.admittedAtHasTime` records whether the hour was
  ever known, and when it was not the stored time is 12:01 PM and only whole days are
  shown ("حدود ۲ روز"). The kardex D-count is deliberately untouched: a drug course is
  counted in calendar days from day 1 and that is a different clock. Existing rows default
  to `admittedAtHasTime = true`, which is right for admissions entered as they happened and
  wrong for any that were back-dated — there are none with real data yet.

**Gotchas**

- `react-hooks/refs` bans reading a ref during render, which is the obvious way to take
  "only the first value" from a live query. `useState(() => …)` does the same job legally.
- A live query the same screen writes to must be read once, at mount. Feeding its own
  writes back into the form fields fights the keyboard.
- `jest --rootDir apps/mobile` from the repository root breaks `@/` resolution. Run jest
  from `apps/mobile`.

## 2026-09-20 (later) — A second external review, and what it was right about

**Agent:** claude-opus-5 via Claude Code
**Commits:** this date's last commit

A reviewer (GPT-6 via Codex) went through `da630e7` and reported six defects. All six
were real. Five are fixed here; the sixth is fixed as far as it can be without an owner
decision. None of them were found by the test suite, which is the lesson.

**Changed**

- **Restore no longer destroys what it displaces.** The files being replaced were moved
  into the scratch folder, which `finally` deletes — so a move that threw after the
  original had been set aside took the original with it, and a failed rollback did the
  same. They now go to `restore-displaced/<run>` under the document folder, the swap is
  rolled back on any failure, and files that could not be put back are reported and kept
  rather than logged and deleted. `features/backup/media-swap.ts`, with the file system
  as a parameter so the failure paths are testable at all.
- **A killed restore is recoverable.** `restore.inFlight` is written before the first
  file moves. It is an ordinary setting, so the import that commits the new database
  deletes it in the same SQLite transaction: present means the swap was not committed,
  absent means it was, nothing in between. `recoverInterruptedRestore` runs at startup
  and before any new restore.
- **The copy in the backup folder is read back.** `verifyCopy` opens the destination and
  compares it with the source through `streamsMatch`, chunk by chunk. It used to compare
  `.size` and call that verified; a same-size corrupt file passed, and rotation then
  deleted good backups to make room for it. An unknown source size now fails closed.
- **The vault will not use a key from the dataset it replaced.** `loadVaultKey` proved
  the stored key only by its length, so after a restore the key derived here from the old
  passphrase was handed out for the imported vault: the next password would be sealed
  with a key that vault can never derive, discovered only after unlocking it properly.
  The key is now checked against the keyset's own check value.
- **Changing the vault passphrase is interruptible.** The new key and salt are staged
  (`stageNextKeyset`) before a single row is re-sealed, rows are opened by their own
  `keyVersion`, and the new keyset is committed only once every row has reached it.
  Before, the new key existed in a local variable until the end: an interruption left
  already-rewritten rows sealed with a key that no longer existed anywhere. The old
  comment claiming this was "recoverable" was wrong. `finishPendingRekey` resumes, and is
  called by the vault gate.
- **Stored passwords keep their spaces.** `.trim()` on a third-party password is the app
  deciding what the other system accepts.
- **Bounded and unit-less lab results are visible as such on a chart.** `>100` is drawn
  at 100 with an arrow instead of as an exact point, results with no recorded unit are
  drawn hollow, and the reference range comes from the newest row *on the chart* rather
  than the newest row overall, which may be the one in another unit that was left off it.
- **Old lab rows are re-flagged.** `LAB_FLAG_VERSION` + `reflagLabValuesIfNeeded`, on the
  `SEARCH_INDEX_VERSION` pattern: the flag rule changed in `da630e7` but stored flags did
  not, and an old `>=100 H` reads as a fact, not as an old build's opinion.

**Verified**

- `npm run check` green: typecheck, lint, format, 19 suites / 354 tests (338 before).
- The new tests fail against the old code: the interrupted rekey, the stranded key, the
  displaced-file rollback and the same-size corrupt copy were each reproduced first.

**Not verified**

- Nothing on a phone. The A52s has not been connected since 0.2.2, so everything from
  0.3.0 (doctors, knowledge, vault) plus these fixes is untested on device. The restore
  paths in particular now depend on `expo-file-system` behaviour — `moveSync` over an
  existing file, `readBytes` at EOF — that only the phone can settle.
- `recoverInterruptedRestore` has never run for real. Its decision logic is glue over
  tested parts, but the walk of `restore-displaced` and the kill-the-app-mid-restore case
  are device work.

**Open threads**

- Old `scheduledMessages` rows written by `logGreetingSent` still claim a confirmation
  that never happened. A `deliveryEvidence` column defaulting to "assumed" would mark
  them honestly; deliberately deferred because the module is five commits old and has no
  real history yet. Do it before the doctors module has any.
- Unit-less results are still plotted with the series, now marked. Keeping them off the
  chart entirely is the reviewer's reading of the contract; most results in this app are
  typed without a unit, so that would empty most charts. Owner's call.
- The vault key is still stored without `requireAuthentication`. The reviewer is right
  that the async SecureStore API does not block JS — that part of the last session's
  reasoning was wrong. What remains true: enrolment changes invalidate the key, so it
  needs a recovery path before it goes in.

**Gotchas**

- `importTables` keeps `settings` rows matching `backup.%` and replaces the rest. That is
  what makes a non-`backup.` marker atomic with the import — and what would make a
  `backup.`-prefixed one useless. The test in `restore.test.ts` pins it.
- A `MediaPaths.displaced` that is never called on the way back should throw, not return
  a plausible path. The first version returned the live path and would have moved a file
  onto itself.

## 2026-09-20 (late) — The credential vault (phase 5), and the roadmap is built

**Agent:** claude-opus-5 via Claude Code
**Commits:** see `git log` for this date

**Changed** — the last unbuilt module. The schema already described the design; this
implements it.

- **`lib/crypto.ts`** gained `sealSecret` / `openSecret`: one-shot AES-256-GCM with a
  random 12-byte nonce and an AAD, for a short value written on its own. The chunked
  stream is untouched — the backup format stays frozen.
- **`features/vault/keys.ts`** splits the key deliberately. The **salt, KDF parameters and
  a check value** are an ordinary setting (`vault.keyset`, not `backup.`-prefixed), so they
  travel inside the encrypted backup; without that, the same passphrase on a new phone
  would derive a different key and every password would be lost. The **derived key** lives
  only in the Android Keystore, so a stolen backup file plus the backup passphrase still
  does not open the vault.
- **`features/vault/queries.ts`**: only the password is encrypted. The system name,
  username, URL and notes stay ordinary columns and are searchable — a vault nobody can
  search is a vault nobody uses — and the secret is never in `searchText`, so the search
  box cannot be used to confirm a guess. The AAD is `credential:<id>:v<keyVersion>`, so a
  ciphertext copied into another row will not open. `rekeyVault` re-seals every row and
  replaces the keyset **last**, so an interruption leaves rows the old key still opens.
- **Screens**: the vault has three states (no vault / locked / open). Revealing a password
  asks for the phone's own biometric or screen lock, shows it until the screen is left, and
  is audited without the value. Credentials belonging to a colleague carry a warning and
  the consent note the schema asks for.
- The vault entry moved out of "coming next" in the More tab, and `docs/security.md` now
  describes what is built rather than what was planned.

**Verified**

- `npm run check` green: typecheck, lint, formatting, 329 tests — 12 new ones, including
  ciphertext at rest, no secret in the index, the AAD binding (a moved ciphertext refuses
  to open), refusal while locked, and a full passphrase change.
- Release APK builds and is signed: `dist/MedOS-0.5.0.apk`, versionCode 7.

**Not verified**

- **Not run on a phone.** Unproven on device: the biometric prompt before a reveal, how
  long scrypt takes to open the vault on this hardware (backups take ~25 s), and the
  clipboard copy.
- No restore-onto-another-phone test of the vault. The salt travelling in the backup is
  covered by a unit test, not by a real round trip.

**Open threads**

1. Device test of everything since 0.2.2: the doctors directory, knowledge, the vault.
2. **Trash is patients-only.** Every other soft-deleted row has no way back in the UI.
3. Credentials are excluded from nothing today: the schema's idea that colleague entries
   stay out of ordinary exports is not implemented, because there is no export other than
   the encrypted backup, which contains everything by design.
4. Vitals and diagnoses tables exist with no screens (phase 2 leftovers).
5. The roadmap's modules are all built; what comes next is the owner's own idea inbox.

**Gotchas**

- `SealedData.ciphertext()` returns a **promise**; `chunkCipher.seal` gets away with
  returning it directly only because its return type is a promise.
- The repo's `react-hooks/set-state-in-effect` rule rejects `useEffect(() => { void
  refresh() })` when `refresh` sets state. The accepted shape is
  `useEffect(() => { void something().then(setState) }, [dep])`.

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
