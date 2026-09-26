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

## 2026-09-26 (0.11.2) — Share a recording to MedOS; why MedOS does not record calls itself

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 77db0dd, and this one (0.11.2)

The owner installed Cube ACR: their own voice clear, the other side low. They offered an
accessibility service inside MedOS "if it brings good stuff". It would not here: an
accessibility recorder captures the microphone, exactly as Cube does, so the far end would
sound the same; the call's own audio is only for system apps. Not built (architecture.md).
What was missing instead: Cube keeps recordings in its private storage (none in shared
storage), so MedOS could not see them. MedOS is now a share target for audio.

**On the phone (0.11.1, then 0.11.2 installed)**
- 0.11.1: picking a single audio file → patient → «پیگیری تلفنی» note with the call's time,
  audio attached; the note-type strip opens on «پیگیری تلفنی»; glance card shows
  «کاردکس … ۱ دستور جاری» (the "۱۰" misread is gone); identity lines with «،».
- Cleaned up: test patients «Device Test» (→ trash), `/sdcard/Recordings/MedOS-test`, the
  test file in Download.
- While opening Cube's menu one tap landed on one of the owner's recordings and played a few
  seconds; stopped at once, Cube was reopened so it keeps receiving calls. No Cube setting
  was changed.
- 0.11.2's share flow was not walked on the phone: the phone locked (cannot be unlocked
  from here). A temporary patient «Share Test» may or may not have been created before the
  lock — check the list and delete it if it is there.

**Verified**
- `npm run check` green (66 suites / 759 tests + 3 workflow).
- Emulator: share from the Files app → MedOS → patient → note with title from the file
  name, 09:15 from it, recording attached; cold and warm starts.
- `dist/MedOS-0.11.2.apk`: versionCode 18, arm64-v8a, signer 1119f776…7e0c, manifest has the
  SEND filter.

**Open threads**
- Owner: in Cube, tap a recording → share → MedOS → patient. Report if Cube's share offers
  MedOS and whether the note gets the audio (Cube's provider URI takes the new
  content-resolver copy path, which the emulator's Files share does not exercise).
- Cube quality (owner's choice, in Cube → Settings → Recording): try audio source "Voice
  call"; raise "Phone calls clarity improvement"; "Maximize in-call volume"; speakerphone
  for calls that must be recorded clearly.

## 2026-09-26 (0.11.1) — The phone has no call recording; the calls screen stops promising it

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** the calls-screen correction, and this one (0.11.1)

The owner could not find call recording in the Phone app and asked for it to be found and
turned on. It does not exist on this phone: the firmware's CSC is XSG (UAE), and Phone →
Call settings (opened by `android.telecom.action.SHOW_CALL_SETTINGS`, without showing the
call log) lists no «Record calls», nor does «Other call settings». The previous entry's
"setting exists, off" came from the `record_calls_*` keys in `Settings.System`, which every
firmware carries — that claim was wrong, and the owner was told so. Nothing was changed on
the phone's settings (a region-locked feature cannot be switched on, and writing system
settings is not ours to do).

**Changed**
- Calls screen text: the dialer records only where the region allows it; otherwise a
  recorder app is needed; any recorder's folder can be chosen. New «بدون ضبط: خلاصه‌ی صوتی
  بعد از تماس» → quick capture. File names with a run-on stamp and "Call@…" now parse.
- architecture.md / IMPLEMENTATION C05 corrected.

**Verified**
- `npm run check` green (65 suites / 755 tests + 3 workflow).
- `dist/MedOS-0.11.1.apk`: versionCode 17, arm64-v8a, signer 1119f776…7e0c.

**Not verified**
- 0.11.1 on the phone: it disconnected again before the install.

**Left on the phone, to clean up next time it is connected**
- `/sdcard/Recordings/MedOS-test/` with one fake WAV (pushed for the calls-screen test).
- The live test patient «Device Test» (created, admitted, discharged today).

**Open threads**
- Owner's choice of recorder (options given in chat: a recorder app with an accessibility
  connector, CallApp — already installed, but a cloud caller-ID service — a region reflash
  that wipes the phone, or a spoken summary after each call). Then one real recorded call
  filed from «ضبط تماس‌ها» on the phone.

## 2026-09-26 (0.11.0) — 0.10.0 walked on the phone; call recordings; a "۱" that read as "۱۰"

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 53a7106, fb8a590, and this one (0.11.0)

**On the phone (SM-A528B, Android 14, One UI, dark mode, three-button bar), 0.10.0**
- Installed over 0.9.1, same signer, no crash. The phone had no live patients (the owner
  had moved theirs to the trash); a test patient was created from the launcher shortcut.
- Worked: Samsung launcher icon and the four shortcuts; «آلرژی: ثبت نشده»; admission;
  diagnosis; search by diagnosis, ward and bed (and bed gone after discharge); SpO2 150
  refused inline; lab "5,8" refused by name, then K 5.8 H / Cr 1.9 H; order form banner;
  first note defaults to «شرح حال», header save; «در یک نگاه»; task tick → «برگرداندن»
  restores it; discharge consequences card; Recents card blank (One UI).
- Found: "• ۱ دستور" (discharge) and "کاردکس • ۱ دستور جاری" (glance) read as «۱۰» — the
  bullet is the Persian zero's twin in Vazirmatn. Also a Latin first label ("TestWard")
  turned a meta line left-to-right. Fixed in 53a7106 (`joinLabels`: Persian comma + RLM);
  a throwaway emulator screen showed that no bidi mark alone fixes the "۱۰".
- Not done on the phone: runtime theme switch (a system setting — left to the owner),
  notification tap, backup/restore.

**Call recordings (C05)** — see architecture.md. The dialer records (the owner's firmware
has «ضبط خودکار تماس‌ها», currently off: `record_calls_automatically_on_off=0`); MedOS lists
`Recordings/Call` through a one-time SAF grant and files a recording as a dated
«پیگیری تلفنی» note with the audio copied in; Today counts unfiled calls of the last two
days. Also: ChipSelect scrolls the selected chip into view once (RTL needed a deferred
scroll); "MedOS …" sentences start with an RLM.

**Verified**
- `npm run check` green (65 suites / 755 tests + 3 workflow).
- Emulator (x86_64 build of this source), with two fake WAV "recordings" pushed to
  `Recordings/Call`: the picker opened at that folder; list with parsed name/time/size;
  playback (audio session PLAYING); filing → note editor with title «تماس — …», time
  14:30 from the name, voice attached; «در پرونده» badge; Today card "۲ تماسِ ضبط‌شده…";
  the note-type strip opens on «پیگیری تلفنی».
- `dist/MedOS-0.11.0.apk`: versionCode 16, arm64-v8a, signer 1119f776…7e0c.

**Not verified**
- 0.11.0 on the phone: the phone disconnected before it could be installed.
- A real Samsung call recording: the file-name format is parsed from Samsung's documented
  pattern ("Call recording <who>_<yyMMdd>_<HHmmss>.m4a") and unit-tested, not seen on this
  phone yet. Files without a time in the name fall back to the file time.

**Open threads**
- Phone: install 0.11.0; delete the test patient «Device Test» created today (it is live,
  discharged); check the fixed "۱" lines; owner turns on the dialer's call recording, makes
  one recorded call, and files it from «ضبط تماس‌ها».

## 2026-09-26 (0.10.0) — Patient at a glance, search by diagnosis and bed, an icon of its own

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 319b7f8, ef20373, 14e1695, ad438d1, 647db1b, and this one (0.10.0)

The owner asked for the app to be as ready for use as it can be, and for design ideas.
Old APKs were deleted from `dist/` (owner's go-ahead); 0.9.1 (on the phone) and 0.10.0
remain. The owner does not want history rewritten for the name in f3e3431.

**Changed**
- W04: «در یک نگاه» on the record's first tab — last vitals, newest lab result per analyte
  that is flagged or unreadable (`labsToReview`), running orders, last note's A/P, each with
  its age and a tap to its tab. Allergies show «ثبت نشده» (grey) when blank, distinct from
  NKDA, on the header, round card and order form. Header is one block shorter.
- Search finds patients by diagnosis and by the open episode's ward/service/bed
  (`features/patients/search-index.ts`, `SEARCH_INDEX_VERSION` 3).
- Bug: every discharge was audited as `encounter.deleted` and deletions were not audited
  (misplaced call since 08f0818). Now `encounter.discharged` / `encounter.deleted`.
- `Fab` adds the bottom inset unless `tabRoot`: on Vault/Places/Extensions it sat half
  under the three-button bar. Today's list ends clear of its button.
- Timeline lab entries show the results; shift and round mark a discharged patient.
- Launcher icon, themed icon and splash were Expo's template: now MedOS's own
  (`scripts/draw-icons.ps1`). Home-screen shortcuts (long-press): capture, new patient,
  patients, shift (`plugins/with-app-shortcuts.js`). Deep-linked screens get the tabs
  underneath (`unstable_settings`) — capture opened from outside could not be left.
- `plugins/with-system-bars.js`: navigation bar follows a light/dark switch while running
  (the other reviewer's "white bar in dark mode" — reproduced on the emulator by switching
  the theme with the app open); Recents gets no screenshot on Android 13+.

**Verified**
- `npm run check` green (63 suites / 743 tests + 3 workflow).
- Emulator, x86_64 build of this source (fabricated data): the glance card (vitals, K "5,8 ?",
  Cr/FBS H, last note), the shorter header, «آلرژی: ثبت نشده» on a new patient, search
  "nstemi" finds the patient after the startup re-index, timeline lab line, «ترخیص شد» in
  the shift, Vault's "+" above the bar, new splash and launcher icon, the four shortcuts
  (capture cold → save → lands on Today; shift warm), dark↔light switch with the app open
  (bar follows both ways), Recents tile blank when entered from the home screen.
- `dist/MedOS-0.10.0.apk`: versionCode 15, arm64-v8a, signer 1119f776…7e0c (same as 0.9.1
  on the phone), 52.6 MB; the bundle contains the new strings and the manifest the shortcuts.
  `dist/` now holds 0.9.1 and 0.10.0 only.

**Not verified**
- Anything on the phone (not connected): Samsung's launcher shortcuts and icon mask, One
  UI's Recents, the theme switch under a sunset schedule.
- Recents while MedOS itself is in front shows the live screen (that is not a screenshot;
  only `FLAG_SECURE` would hide it, and it would also block screenshots).
- Shortcuts in a debug build open the release package by design.

**Open threads**
- Install 0.10.0 on the phone; walk the glance card, a shortcut, the theme switch, Recents,
  plus the 0.9.2 list (lab comma, task undo, order-form banner, test discharge).
- Design ideas offered to the owner, not built: see the chat of this session and below.
  Sticky name/allergy bar while scrolling a record; swipe to complete/snooze tasks and
  follow-ups; owner-written note snippets; shift/round sorted by bed; editable patient
  tags (the column exists, no UI); undo instead of confirm for deletes.

**Gotchas**
- `expo prebuild` clears `android/`; a Gradle daemon still holding a dex file makes it fail
  half-way (EBUSY). Stop the Java daemons first; the next build is a full native one
  (~13–15 min for x86_64).
- A component test that reads through `useLive` needs `expo-sqlite`'s change listener
  mocked (`{ remove }`) and real-timer waits: sql.js answers after a macrotask.

## 2026-09-26 (review) — A physician's walk-through, checked claim by claim (0.9.2)

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 09d4cb7, a5a9d3c, 33a2f58, 82ef99c, 04363cc, and this one (0.9.2)

The owner had another AI use 0.9.1 on the emulator as a physician would (fabricated
patients, three-button navigation) and asked for its 20 claims to be checked. Each was
checked against the code, and the fixed ones again on the emulator.

**Confirmed and fixed**
- P0 lab "5,8" stored silently → refused by name at entry; old ones shown red "?".
- P0 troponin/CK-MB/NT-proBNP/Mg/uric acid have no reference range → "∅" + legend in
  the flowsheet, "no ref range" at entry. No ranges were invented (assay-specific).
- P0 same-name patients indistinguishable → age • sex • file number in pickers,
  duplicate warning, delete confirmation (`patientIdentity`).
- P1 SpO2 150 accepted → physical-possibility limits per vital (not normal ranges).
- P1 no allergy on the order form → the allergy banner is shown there (no checking).
- P1 Today missed patients' due tasks → «کارهای موعددار بیماران».
- P1 buttons under the three-button bar → `Screen` ends at the navigation bar
  (`tabRoot` for Today/More). Also seen on the owner's phone.
- P1 one tap closes a task irreversibly → undo bar for 8 s (`components/undo-toast.tsx`).
- P1 discharge silent / misleading hint → consequences listed beforehand; hint corrected.
- P1 first note defaults to progress → «شرح حال» when the patient has none; «ادامه از نوت
  قبلی» copies the last A/P into empty fields.
- P2 Back or outside tap discards typed text in one-line dialogs → asks first.
- P2 priority order reversed between task and follow-up → both high → low.
- P2 due time takes 7 steps → quick chips (+1 h, +6 h, tomorrow 08:00, +3 d).
- P2 shift assumes night, manual → wording neutral; «افزودن همه‌ی بستری‌ها».
- P2 diagnosis typo needs delete; «رد شود/رد شد» confusing → «اصلاح متن»; kind is «R/O».
  The low-confidence "R/O saved as همراه" matches a regression of mine (kind chips shown
  only while typing, i.e. with the keyboard up); the chips are always visible again.
- P2 no backup prompt → a card on Today when there is no backup or it is stale.

**Checked and not changed**
- Abnormal vitals uncoloured, no allergy/drug check: deliberate (records, does not advise;
  invariant 10 needs a sourced, reviewed rule per tool).
- Search: the one-line summary *is* searched; diagnoses and ward/bed are not (open).
- Kardex has suggestions from earlier orders (2+ letters) — claim was wrong.
- "Remove Ideas", merge task/follow-up, change the tabs: owner decisions, not changed.
- Clinical summary page (W04), discharge checklist, timeline lab values, note-type
  strip, FLAG_SECURE for Recents, discharged patients left in a shift: open.
- Dark-mode white navigation bar: not seen on the owner's phone.

**Verified**
- `npm run check` green (62 suites / 733 tests + 3 workflow).
- Emulator, x86_64 build of this source over the other AI's fabricated data: flowsheet
  "?" and "∅"; lab save refused with the analyte named; allergy banner on the order form;
  due task on Today; tick → undo restores it; one-line dialog asks before discarding;
  picker shows age • sex; content stops at the navigation bar; backup card on Today.

**Not verified**
- 0.9.2 on the phone (not connected). Discharge consequences card, «اصلاح متن», note
  continuation, «افزودن همه‌ی بستری‌ها» and the vitals limits were checked by tests and
  typecheck, not by eye.
- `adb shell input keyevent 4` did not reach MedOS on the emulator in three-button mode
  (the on-screen Back did; system apps got the key). On the phone the key worked on 0.9.1.

**Open threads**
- Install 0.9.2 on the phone and walk: lab entry with a comma, a task tick + undo, the
  order-form banner, discharge of a test admission, Back on the task screen.
- W04 patient summary; search by diagnosis and ward; discharge checklist.

## 2026-09-26 (phone) — 0.9.1 on the owner's phone: backups fixed, upgrade from 0.6.0 checked

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 654292f, c055f70, and this one (0.9.1)

The owner connected the phone (SM-A528B, Android 14, dark mode, three-button bar). It
had 0.6.0 with the owner's own data (3 patients, a follow-up, backups up to 1 Mehr).

**Changed**
- Backups: every manual backup on 0.9.0 said the destination check failed, though the
  file was complete. The copy is now proved with a native MD5 of both files (byte read
  as fallback); the error log names the failed step. Status card no longer says "time for
  a fresh backup" right after one (minute-ticking clock vs. a just-written timestamp).
- Dark-mode switches readable; due-date editor plainer (discard button only for a
  leftover draft); Settings button that opens Android's «Alarms & reminders» list; task
  delete text says where to restore from. Version 0.9.1 (versionCode 13).

**Verified on the phone**
- Before upgrading: the 0.6.0 app's auto-backup ran at 01:44; that file was pulled to
  `private/backup-before-0.9/` (gitignored, encrypted) because retention later removed it
  from the phone.
- Upgrade 0.6.0 → 0.9.0 → 0.9.1 over the installed app, same signer (1119f776…7e0c):
  migrations ran, data intact, no crash, no new entries in the error log from startup.
  Cold start: activity 0.78–0.86 s; Today content visible within 3.7 s (upper bound,
  includes uiautomator time).
- With a test patient "Device Test" (deleted afterwards; it is in the trash): note new
  (header save), edit + bottom save, **no crash**; voice recorded 31 s and played back;
  system back and header back with unsaved text keep the draft, which comes back;
  quick capture with a camera photo → assigned to the patient → filed as a note, photo
  moved to «عکس و صدا»; task with a due time and notification → notification posted
  (2.5 min late, see below); vitals saved; patient delete → trash.
- Backups on 0.9.1: automatic + two manual full backups, all «محتوای فایل مقصد بررسی شد».

**Not verified**
- Tapping a notification (Samsung's shade could not be read by uiautomator, and a
  screenshot would have shown the owner's other notifications).
- App lock (needs the owner's fingerprint), restore from a backup, a shift/round on the
  phone (done on the emulator only), doctors/knowledge/vault flows on the phone.

**Found, for the owner (reported in chat)**
- Two patients were «بستری» in 0.6.0 without an admission record; on
  startup the app reconciles status with episodes and made them «سرپایی» (audited as
  `patient.statusReconciled`). If they are really admitted, record the admission.
- MedOS lacks Android's exact-alarm permission, so reminders may come minutes late. Only
  the owner can turn it on: Settings → «باز کردن «Alarms & reminders»» → MedOS.
- App lock is off.
- Retention keeps three full backups, so the phone no longer holds the pre-upgrade ones;
  the laptop copy above is the pre-upgrade backup.

**Open threads**
- Retention still counts a copy whose check failed. With the digest check this should be
  rare; if the error log shows `copy check failed at …`, look at the named step first.
- The 0.6.0 → reconciliation of «بستری» without an episode is silent apart from the
  audit log; consider a one-time notice if this can recur.
- Then `docs/IMPLEMENTATION.md` in priority order.

**Gotchas**
- On the Samsung keyboard `input keyevent 111` does not close the keyboard, and swipes
  over it type swipe-words: close it with BACK only when `dumpsys input_method` says it is
  shown. Select-all + delete in a field: `input keycombination 113 29` then `keyevent 67`.
- Buttons near the bottom edge sit under the three-button bar mid-scroll; a tap there
  presses the system Back.

## 2026-09-26 — Emulator walk-through: a crash on every note save, and a cleaner app (0.9.0)

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** 72d51c7, e340def, a78e3a8, 1c3a48d, b370e34, 8fe106c, 7f16e55, 08f0818, 42784da, and this one (0.9.0 + docs)

The owner asked for the app in its best shape for handing to a senior developer: clean
code, good UI, fast simple flows, no crashes. No phone was connected, so this session ran
the app on the x86_64 emulator (how: AGENTS.md §7) and walked the main flows by hand.

**Changed**
- **Crash fixed (critical).** Saving any note — new or edited — stored it and then
  stopped the app ("ScreenStackFragment added into a non-stack container",
  react-native-screens #4429, no upstream fix released). A native header changed while
  its screen was being closed. Two sources, both removed: the leave guard toggled with
  autosave state (`useSaveBeforeLeave(flush)` is now always on), and `<Stack.Screen
  options>` re-applied options every render (replaced by `components/screen-options.tsx`
  in 29 screens; lint forbids the old form). Probed with temporary logs in node_modules
  and rn-screens (all restored) until the crashing header was identified as the note's.
- Dead code: 15 unreferenced exports removed (incl. `sealSecret/openSecret` left from the
  old encrypted vault).
- Overview tab: soft add buttons; consult form folded behind «+ کانسالت»; diagnosis kind
  chips only while typing (first problem defaults to «اصلی»); consult «لغو» confirms;
  section titles no longer lose their last word (Android measured them a hair short).
- Record tabs: 4 x 2 grid instead of a strip whose last three tabs were off-screen.
- Today's capture button floats (it scrolled away on a busy day).
- Patient search on the default view reaches discharged/archived patients; the empty
  list no longer claims no patient exists.
- Deleted notes are in the trash and restore; note delete/restore and encounter delete
  are audited.
- An encounter entered by mistake can be deleted from its edit screen — only when nothing
  is filed under it (`encounterRecordCount`, `EncounterNotEmptyError`).
- Note editor: «ذخیره» in the header too.
- 27 button-started writes that dropped their promise now alert on failure; 51 button-less
  messages use `notify()` (Persian «باشه» instead of Android's "OK"); lint enforces it.
- More screen regrouped (کار / مرجع / داده‌ها و امنیت); round card shows the patient summary
  as text rather than as a placeholder; `.medosbak` bidi fix on the backup screen.
- Docs: AGENTS.md conventions (ScreenOptions, notify, always-on leave guard, catch every
  button write) and gotchas (emulator build, run Prettier from the root); README feature
  list and test count; IMPLEMENTATION.md D08 and priority-3 notes; HANDOFF entries before
  2026-09-25 moved unchanged to `docs/handoff-archive.md`.
- Version 0.9.0 (versionCode 12); `dist/MedOS-0.9.0.apk` built.

**Verified**
- `npm run check` green: 61 suites / 721 tests + 3 workflow tests. CI green on every
  pushed commit through 42784da.
- On the emulator (x86_64 build of the same source): patient create/edit, note new, edit,
  header save, system and header back with unsaved text (draft recovered), quick capture
  and its inbox card, shift start, add patient, round, consult create/cancel-confirm,
  diagnosis add, admission and the refused delete of an episode with a note, kardex
  order, CBC entry with H/L flags, trash delete/restore of a note, patient search across
  statuses, More, backup and settings screens. No crash in the crash log after the fix.
- `dist/MedOS-0.9.0.apk`: aapt2 reports 0.9.0/12; apksigner signer SHA-256
  1119f776…7e0c (same as 0.8.0); arm64-v8a only; the bundle contains ScreenOptions.

**Not verified**
- Nothing on the owner's phone. Camera, voice recording, notifications/reminders,
  backup to a chosen folder, biometric lock, three-button navigation and the upgrade over
  the installed build were not exercised (the emulator has no real data of the owner's).
- The title-truncation cause is inferred (sub-pixel measurement); the fix is verified on
  section headers only. Other content-width labels could in principle show the same.

**Open threads**
- Install `dist/MedOS-0.9.0.apk` over the phone's build (`adb install --user 0 -r`) and
  repeat: note save (the crash), back with unsaved text, capture → note/task, backup
  (read whether the copy check says `bytes` or `size`), reminders.
- `dist/` still holds 0.2.1–0.7.1 APKs; `MedOS-0.7.1.apk` is a59d9ee code mislabeled.
  Ask the owner before deleting any.
- Then `docs/IMPLEMENTATION.md` in priority order (D08 remainder, W02 editable shift
  context, W04 patient summary, W05).

**Gotchas**
- Tests could not see the crash: they mock navigation. Walk changed screens on the
  emulator before calling UI work done.
- `usePreventRemove` state is a native header prop (`disableBackButtonMenu`); toggling it
  near a navigation is enough to crash.
- Prettier run inside `apps/mobile` rewrites migration snapshots; run it from the root.

## 2026-09-25 — Owner confirmed the clinical-tools scope

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** this entry's commit

**Changed**

- The owner confirmed in chat that they asked for the invariant 10 change (sourced,
  physician-reviewed clinical tools; AI and call workflows later). `CLAUDE.md`,
  `.cursor/rules/medos.mdc` and `.github/copilot-instructions.md` still carried the old
  "no clinical advice" rule and now point at invariant 10 instead. AGENTS.md unchanged.

**Verified**

- `npm run check` green (docs only).

**Not verified**

- Nothing on the phone. The previous entry's device checklist for 0.8.0 still stands.

**Open threads**

- Device session on `dist/MedOS-0.8.0.apk`, in the order of the previous entry: upgrade
  over the installed build, back/gesture on patient record and round, note save, capture
  → note/task, vitals, a backup (read whether the copy check says `bytes` or `size`).
- Measure the reminder upkeep that runs on every return to the foreground.
- Then `docs/IMPLEMENTATION.md` in priority order. C-items (clinical tools) are in scope,
  but each tool needs its own source, version, boundary tests and physician review before
  it is enabled — a formula from a chat is not a validated tool.

## 2026-09-25 — Review of the Codex commits since 41eba6c; 0.8.0

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** `c4bbb3d`, `0b1bc92`, and this entry's commit

**Changed**

- Reviewed all 17 commits `f8913ce..a59d9ee` (GPT-6 via Codex, plus integrated
  "Antigravity" fixes): data layer, migrations 0010–0015, backup, reminders, autosave
  scope, date validation, edit gates. Invariants hold: no hard deletes, synchronous
  transactions, additive migrations with SQL defaults, backup format/crypto/import
  untouched, no personal data or keys in the diff.
- Four defects in Claude's own earlier M1/M2 work were found and fixed there, and are
  confirmed here: note-version equality used lossy search text (moving text between SOAP
  fields counted as "no change"); one shared reply buffer could carry consult A's answer
  into consult B; the round card's "last note" was pinned-first; the admission badge
  read "روز ۳ روز".
- Fixed: a capture whose patient was deleted looked patient-less in the inbox but filing
  failed with an English "Patient not found", and could never be filed without a patient.
  The card now says the patient was deleted; "Task" asks before dropping the link, "Note"
  asks which patient. The "filed" badge read backwards ("شد نوت" → "نوت شد").
- 0.8.0 / versionCode 11. Codex's APK of this code was 0.7.1/10 and overwrote the older
  `dist/MedOS-0.7.1.apk`; that file is now a copy of `a59d9ee` under the wrong label.
  `build-apk.js` now re-runs prebuild when app.json and build.gradle disagree, and refuses
  to build if they still do.

**Verified**

- `npm run check` before and after: 58/710 → 59 suites / 714 tests + 3 workflow tests.
  The new capture-card tests fail without the fix (3 of 4) and pass with it.
- `expo export --platform android` bundles (2469 modules, 6.5 MB Hermes bytecode).
- CI green on GitHub for every Codex commit checked (`gh run list`).
- `npm run apk` re-ran prebuild on its own (versions differed) and built
  `dist/MedOS-0.8.0.apk`: 52,777,473 bytes, SHA-256 `de10c03e…4df99dda`; aapt2 reports
  `com.shayan.medos` 0.8.0 / versionCode 11; signer SHA-256 `1119f776…7e0c`, the same
  release key as every earlier build, so it installs over the phone's copy.

**Not verified**

- Nothing on the phone (not connected). Everything since 0.6.0 is still device-untested.
- The reminder-upkeep cost below is an estimate from the code, not a measurement.

**Open threads**

- **Owner decision pending:** AGENTS.md invariant 10 now allows sourced clinical tools
  (C01–C05), attributed to the owner on 2026-09-23; `CLAUDE.md` still says "MedOS
  records, it does not advise". Do not build C-items, and do not edit either file,
  until the owner confirms which one is right.
- Device session on 0.8.0, in this order: upgrade over the installed build (migrations
  0004–0015), back/gesture on patient record and round (`usePreventRemove` is always on
  there), note save, capture → note/task, vitals, a backup — and read which evidence the
  backup screen reports: only `bytes` lets old backups be pruned; `size` means the folder
  grows without limit.
- Reminder upkeep reschedules every future follow-up, open task reminder and enabled
  occasion on every return to the foreground (two DB writes and one native call each,
  plus live-query refreshes). Measure on the phone; if it shows, list the OS's scheduled
  ids once and reconcile only rows that differ.

**Gotchas**

- Other agents push to `main` between Claude sessions. Compare `git log` with the last
  commit you made before building on anything.

## 2026-09-25 — Recover edit-screen reads without replacing loaded forms

**Agent:** GPT-6 via Codex
**Commits:** this entry's commit; base `d4acef2`

**Changed**

- Reproduced endless initial loading, false absence after a failed cached-empty
  read, and missing loaded-form warnings before changing `EditGate` (three red
  tests). It now requires error/retry inputs and supplies an explicit notice slot
  inside the existing form Screen, preserving the form instance and local input.
- Wired all 17 existing consumers. Labs handle panel/value failures separately;
  notes keep their draft gate; consult answers retain their loaded draft/conflict
  behavior while reporting refresh errors. Occasion/task/history screens use the
  same gate; historical rows remain visible on failed refresh. No dependency,
  schema change or additional screen wrapper. Updated AGENTS/architecture/D08.
- Corrected an obsolete credential-editor comment claiming biometric-protected
  ciphertext; the current notebook stores text and distinguishes legacy ciphertext.
  No credential behavior or security workflow changed.

**Verified**

- Root `npm run check`: 58 suites / 710 app tests + 3 workflow tests passed;
  typecheck and formatting passed. One test import-order warning was corrected
  afterward; focused lint and formatting passed on the final gate/test files.
- Added four gate behavior tests plus 18 primary-read error/retry cases across
  the actual screens (labs have two queries), and retained lab/encounter input
  through failure and retry. Existing note/task/occasion/consult tests still pass.
  These use migrated SQLite with substituted live-query/native UI contracts.
- `git diff --check` passed. Release APK built successfully; all 412 mobile
  build inputs were unchanged during the build. APK: 54,624,333 bytes, SHA-256
  `6300f3641f51f7ccef6009003d9b2b29cbe47fd4325e0693728e884ccd2e5802`.
  Android build tools verified its v2 signature, `com.shayan.medos`, version
  0.7.1/code 10, arm64-v8a and target SDK 36. Hosted CI remains to be checked
  against this entry's resulting commit after push.

**Not verified**

- No physical UI, keyboard/back/gesture, process-death, alarm-delivery or native
  restore acceptance. Read recovery is not autosave: several explicit-save forms
  still need durable drafts, exit recovery and stale-write handling.

**Open threads**

- Next D08: full shift-screen empty/progress claims and retry (Today card was
  fixed separately); failed status actions and auxiliary lookup/picker queries.
  Async suggestions in order/imaging forms still need failure handling.
- D05/D10: durable manual-form/raw-date drafts, media interruption and native
  exit/restore drills. W02/W03: editable optional shift context, accessible
  persistent ordering and native deadline/keyboard/alarm checks.
- Preserve W04–W10 patient summary, clinical/result loop, trash, rich text/media,
  people/knowledge, calendar and large-record timeline work; C01–C05 sourced
  physician-reviewed tools and later AI/call workflows remain in scope.

**Gotchas**

- Keep the same form component mounted on refresh failure. Render `readNotice`
  inside its Screen; do not replace the form with a separate error screen once
  loaded. Some specialized draft gates provide equivalent explicit feedback.
- Retry clears read errors only after a successful read; it must not copy fresh
  database values into in-progress form fields or reset draft conflict state.

## 2026-09-25 — Distinguish failed reads from an empty workload

**Agent:** GPT-6 via Codex
**Commits:** this entry's commit; base `ae7fc6f`

**Changed**

- `useLive` now exposes explicit retry, catches synchronous query failures,
  coalesces overlapping retries and ignores disposed results. Cached rows survive
  a refresh failure. Today, timeline and their shift/capture/task/consult/draft/
  occasion sections expose failed sources and retry instead of false zero counts,
  empty-work claims or endless initial loading. Timeline marks partial totals.
- Shift progress mounts per shift id; retry and round actions are outside the
  header navigation pressable. Unreliable progress cannot show a completion badge.
- Today inbox reads a three-row preview plus the actual matching total rather
  than counting a capped 50-row result. Failed patient assignment retains its
  picker; stale picker data and overlapping submissions are rejected.
- Read errors are short; redacted technical details open only on request.
  Updated architecture/D08/W05 ledger. No dependency, schema or unrelated module.

**Verified**

- Root `npm run check`: 57 suites / 686 app tests + 3 workflow tests passed,
  including typecheck, lint and formatting. Nineteen added tests cover hook
  lifecycle/retry, retained rows, unknown versus zero counts, partial timeline,
  shift failures, inbox overflow, assignment failure/retry and diagnostic redaction.
  Screen tests use real migrated SQLite queries but substitute the live-query
  hook and native widgets; separate hook tests exercise async subscription behavior.
- `git diff --check` passed; `npm run db:generate` reported no schema changes.
- APK build passed with all 411 recorded mobile input hashes unchanged; v2
  signature verified. `dist/MedOS-0.7.1.apk`: 54,622,897 bytes, SHA-256
  `343025bd4d51bfdecff46874d592f3f4325694759f4c27dd9458d71c7c4ba8b2`.
  Package `com.shayan.medos`, versionCode 10, arm64-v8a, target SDK 36.

**Not verified**

- `adb devices` has no connected phone. Native UI/layout, read-error recovery on
  device, back/gesture/process death, alarm delivery/reboot and interrupted or
  second-device restore are not established by these component tests.

**Open threads**

- Continue D05/D08/D10: remaining form drafts/edit gates and failed status actions,
  media interruption and native exit/restore drills. Do not call all recovery done.
  `EditGate` still has no read-error input; several forms can wait forever on an
  initial failed read. The full shift screen also needs reliable empty/progress
  claims and retries; the card fixed here does not fix that separate screen.
- W02/W03: editable optional shift context and persistent accessible ordering;
  native deadline/keyboard/alarm checks. W05: timeline filters and measured
  large-record retrieval/rendering still remain; this change only handles reads.
- Preserve W04–W10 patient summary, record/result loop, trash, rich text/media,
  people/knowledge and calendar scope, plus C01–C05 sourced physician-reviewed
  clinical tools and later AI/call workflows. Full product completion is unproven.

**Gotchas**

- `useLive` deliberately retains data across dependency changes. Key children
  by record id when previous-identity rows must never be shown under the new id.
- Counts and preview queries are independent live reads, not an atomic snapshot.
  An error invalidates a total; cached data is a reference, not proof of completeness.

## 2026-09-25 — Make occasion reminders recoverable without losing saved data

**Agent:** GPT-6 via Codex
**Commits:** this entry's commit; base `af477e8`

**Changed**

- Reproduced three failures before the fix: native work before a failed insert,
  replacement/cancellation before a failed update, and no saved occasion after a
  native scheduling exception. Migration 0015 adds SQL-default desired/applied
  revisions; occasion writes now commit before native work.
- Stable native ids, strict cancellation and per-occasion serialization allow
  retry after native/acknowledgement failure. Repair includes disabled/deleted rows
  and deleted doctors, retires legacy ids, checks restored content and runs at
  startup, foreground and restore without permission prompts. Doctor deletion and
  rename update reminder intent atomically; deletions are audited without names/text.
- Failed/unavailable alarms get a compact retry action. Save feedback distinguishes
  saved data from a failed alarm. The editor retains text on refresh/save failure,
  shows initial read errors and guards duplicate submits. Recurring Esfand 30 stays
  intact when editing in a non-leap year; reminder text uses the scheduled year.
- Updated architecture and D12 acceptance ledger. Removed obsolete best-effort
  occasion helpers. No dependency, background service or unrelated feature added.

**Verified**

- Root `npm run check`: 54 suites / 667 app tests + 3 workflow tests passed;
  typecheck, lint and formatting passed. SQL/native failure and overlapping
  postpone/disable/delete/doctor-delete cases, old-backup defaults, legacy ids,
  permission refusal, retry UI and retained editor text have regression coverage.
- `npm run db:generate`: no further changes; `git diff --check` passed.
- APK built successfully with all 408 recorded mobile input hashes unchanged;
  v2 signature verified. `dist/MedOS-0.7.1.apk`: 54,617,933 bytes, SHA-256
  `8326a411d697d6642d65802453d2de72797d18f72f96eed9d915b15c3f6b7f8f`.
  Package `com.shayan.medos`, versionCode 10, arm64-v8a, target SDK 36.

**Not verified**

- No connected phone (`adb devices` empty). Actual notification delivery/taps,
  permission/channel settings, reboot/force-stop, process death, interrupted native
  restore and second-device restore remain open. Native modules/UI are substituted
  in automated tests; successful scheduling does not prove delivery.

**Open threads**

- Continue D05/D08/D10: raw form drafts (including occasions), recovery/native exit,
  media interruption and restore drills. Occasion saves remain explicit; do not
  describe this reminder repair as full autosave acceptance.
  The Today `UpcomingOccasions` list still needs its own visible read-error handling.
- W02/W03: optional editable shift context, persistent accessible ordering and
  native deadline/keyboard/alarm checks. W05: timeline read errors and measured
  large-record retrieval/rendering.
- Preserve W04–W10 patient summary, record/result loop, trash, rich text/media,
  people/knowledge and calendar scope, plus C01–C05 sourced physician-reviewed tools
  and later AI/call workflows. Full product completion is not established.

**Gotchas**

- SQLite and Android cannot commit together. An old alarm may ring before repair;
  pending revision/id must survive until successful cancellation/acknowledgement.
- The form's post-save reminder read can fail after the save committed. Its error
  must not invite creating a duplicate by saying the original save failed.

Older entries (2026-09-20 to 2026-09-24): [`handoff-archive.md`](handoff-archive.md).
