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

## 2026-09-30 — Preserve shift inputs through external workspace changes (0.11.5)

**Agent:** GPT-6 via Codex
**Commits:** this implementation commit; version/code 0.11.5/21.

**Changed**
- Shift/round read their active workspace in one joined snapshot. Structural
  refresh waits for all mounted fields; failed reads/writes retain input and
  withhold totals/status actions. Replaced identities include shift/member/patient.
- Final autosave to a removed membership preserves exact text in its original
  history without revival or retargeting, and records an id-only recovery audit.
- Closed shifts reject late additions/review actions and repeated closure that
  would overwrite end time. No dependency, schema, calculator or subagent added.

**Verified**
- Baseline: 76 suites / 832 tests + 3 workflows. Two new component cases failed
  against the old screens, which replaced the pending text with an empty field.
- `npm run check`: 76 suites / 845 tests + 3 workflows, typecheck/lint/format green.
  Real SQLite/useLive/SaveGroup tests cover changed/closed shifts, removed members,
  external round completion, slow writes with newer text and consecutive shifts,
  failed refresh/retry, archived identity/whitespace/audit and stale actions.

**Not verified**
- Native 0.11.5 APK build and emulator/physical-phone behavior not yet checked at
  this source commit. No process-death, low-space, restore or power-loss acceptance.
- Competing independent shift text editors still lack revision-conflict handling;
  this change does not provide full shift text version history or full product completion.

**Open threads** (what the next session should pick up)
- Build and run this exact source on Android; then D08 manual-form raw drafts,
  C05 persistent audio import identity/orphan recovery, D05/D10 interruption and
  restore/device acceptance. Wider W/C scope remains in IMPLEMENTATION.
- Finish the remaining forty-patient/RTL/font/keyboard/native matrix on the target
  phone when available; keep original media, rich text, clinical and AI gates visible.

**Gotchas**
- `saveShiftPatientText` is deliberately text-only and bound to mounted identity;
  `updateShiftPatient` still rejects removed memberships. Never revive a row to save.
- Do not change useLive's retained-list behavior globally. The shift-specific gate
  waits for storage while preserving the old editors; read errors cancel adoption.


## 2026-09-30 — Signed 0.11.4 builds and bounded native UX evidence

**Agent:** GPT-6 via Codex
**Commits:** app `ee9c49f` and `3c2c215`; this evidence commit changes documentation only.

**Changed**
- Recorded exact code sources, APK ABIs/hashes, signing compatibility, observed
  scenarios and limits in [0.11.4 validation](ux-validation-0.11.4.md). Updated the
  execution ledger/plan index to 832 tests and the roadmap's current inbox label.
- No further app edits after `3c2c215`; no schema/dependency additions or subagents.

**Verified**
- `npm run check`: 76 suites / 832 app tests + 3 workflow tests, typecheck/lint/format
  green. Signed `dist/MedOS-0.11.4.apk` is arm64 only, version/code 0.11.4/20;
  signature verification passed and the certificate matches 0.11.3.
- Installed the separately built x86_64 release from `3c2c215` on a dedicated
  API 36.1 emulator, offline. Verified record-star bounds/persistence, repeated
  admitted/starred destinations and retained/fresh search, sixth follow-up access
  with honest totals, retained outcome text across a requested route change,
  direct consult/Back, and note draft recovery plus explicit publication.
- Dark/font-scale-1.6/three-button samples: all eight record destinations visible;
  round footer stays above navigation after scroll, hides for Gboard without
  discarding the lower handoff field, restores after dismissal, and preserves the
  field after exit/reopen. Skip on the last unseen member does not falsely mark
  them seen; Seen completes the two-member round. Import route labels agree.

**Not verified**
- No physical-phone run, full forty-patient/equal-name/overflow matrix, speed
  benchmark, TalkBack, camera/actual recording/import/alarms, interrupted restore
  or power-loss acceptance. Two synthetic patients are not forty-patient evidence.
  Native SQL write failure was not injected. Emulator execution used x86_64, not
  the owner's arm64 APK. Plans 001-005 therefore remain SOFTWARE VERIFIED.

**Open threads** (what the next session should pick up)
- D08 shift identity transitions and raw drafts for manual patient/other forms;
  C05 persistent audio import identity/orphan recovery; D05/D10 interruption and
  restore/device acceptance. See IMPLEMENTATION for the wider W/C backlog.
- Complete the remaining native matrix on the target phone when available.
  Existing patient context, rich text, original media, clinical/AI gates remain
  separate work; this UX release does not establish full product completion.

**Gotchas**
- System UI/launcher ANRs occurred at emulator boot even after an isolated restart;
  do not report them as MedOS ANRs or infer a phone performance result.
- Fresh dump per action; never reuse a failed dump. Gboard may be absent from its
  XML despite covering app controls; inspect IME state before lower taps. Back may
  dismiss the keyboard before navigating. Quote multi-parameter deep links for
  the device shell. Local synthetic proofs stay in ignored `private/ux-0.11.4`.

## 2026-09-30 — Consistent import labels and a reliable record star (0.11.4)

**Agent:** GPT-6 via Codex
**Commits:** this follow-up to `ee9c49f`; version/code remain 0.11.4/20.

**Changed**
- Matched inbox/audio route titles to the navigation labels. Replaced the long
  call-recording setup paragraph with the actual file/share action and one clear
  statement that MedOS does not record calls itself. Import handlers are unchanged.
- Native inspection found the record star had a 22dp visible target (46dp including
  hitSlop). Reused the standard 48dp IconButton and report a rejected star write;
  the old handler silently dropped its promise. No schema or dependency change.

**Verified**
- `ee9c49f` is pushed; hosted CI succeeded. Fresh `npm run check`: 76 suites /
  832 app tests + 3 workflow tests, typecheck/lint/format green.
- The new SQLite trigger regression failed on the old star handler, then passed
  with the fix. Successful toggle/reverse writes affect only the displayed patient.
- Preflight x86_64 release (parent plus import-label edits) starts offline on the
  dedicated API 36.1 emulator. Round keyboard hides only the footer, skip leaves
  seen count at zero, return retains the patient's summary, and seen advances its
  count. All eight record destinations are visible with font scale 1.6.

**Not verified**
- This commit's new star still needs rebuilding/native bounds verification.
  Preflight is not acceptance of a later artifact. No physical-phone run, speed
  benchmark, TalkBack, camera/audio/alarms or restore acceptance in this step.

**Open threads** (what the next session should pick up)
- Finish the release builds and bounded native checks; record exact source/ABI/hash.
  Plans 001-005 stay SOFTWARE VERIFIED until their complete acceptance matrix runs.
- D08 shift identity/manual-form drafts, C05 audio import durability, D05/D10 native
  interruption/recovery and W/C feature gates retain their IMPLEMENTATION scope.

**Gotchas**
- Run builds and expensive diagnostics separately. A diagnostic follow-up test
  timed out during compilation/emulator boot; it passed in isolation (5 tests),
  and the subsequent full check passed without a worker-exit warning.
- On this image uiautomator can dump app bounds behind Gboard. Check keyboard
  visibility/hide it before tapping a lower control; do not treat a missed tap
  through the keyboard as an app write failure. Test-only SQL injection uses
  TestDatabase.sqlite, not a production db/client import from a .tsx test.

## 2026-09-30 — Direct ward workflows and safer, readable controls (0.11.4)

**Agent:** GPT-6 via Codex
**Commits:** this implementation commit (parent `3b02ad4`); 0.11.4 / code 20.

**Changed**
- Implemented UX plans 001-005: Today opens the exact admitted/all-starred list,
  an unanswered consult opens its answer form, filters synchronize with the URL,
  and only an explicit fresh-list link clears search. Read errors have retry and
  unknown counts; a failed read never claims an empty list.
- Shift entry precedes long Today previews. Full follow-up counts and `All` open
  `/followups?mode=due|upcoming`, a virtualized list reusing existing queries/cards.
  Mode/day changes wait for an active outcome prompt to close; the card is keyed
  by follow-up id to avoid recycling another record's local prompt state.
- Draft/chart publication and inbox/audio-import labels now describe the actual
  operation. Chips/segments/task/review/follow-up controls have 48dp minimums;
  textFaint passes contrast tests on all four ordinary surfaces in both themes.
  All eight record destinations remain visible, with wrapping/two columns at
  larger fonts. Buttons can grow/wrap; skip has a screen-reader hint.
- Round next/seen actions are outside scrolling content and still use the real
  SaveGroup. They hide during keyboard input, then return with the card intact;
  false flush, failed reviewed write and repeated taps do not advance/discard.
- Found/fixed a separate query bug: omitted patient status used the schema's
  legacy admitted default, inventing an admission. Quick creation now explicitly
  uses outpatient until an admission exists. No schema/migration/dependency change.

**Verified**
- Baseline and origin `3b02ad4` were clean; its hosted CI succeeded. Initial route/
  consult regressions failed before their fixes. No subagents.
- Fresh `npm run check`: 75 suites / 830 app tests + 3 workflow tests;
  typecheck, ESLint and formatting passed. Queries run on migrated SQLite;
  new list tests use actual useLive, round tests actual AutosaveScope/SaveGroup.
  Covered full vs preview counts through 40 rows, initial/refresh failure/retry,
  route return/reentry, prompt text at midnight, flush false and duplicate taps.

**Not verified**
- At this commit: no new APK/native UI acceptance or physical-phone run; software
  tests do not prove touch bounds, keyboard/header behavior or speed. See the next
  native evidence entry when available. No new clinical-content/restore acceptance.

**Open threads** (what the next session should pick up)
- Finish native acceptance for plans 001-005, recording exact build/ABI/scenarios;
  target-phone usability, TalkBack, camera/audio/alarms and speed remain separate.
- D08 active-shift identity transitions, other auxiliary reads and manual-form
  drafts remain open; the round footer does not close this correctness thread.
- C05 durable audio-import identity/journaling, orphan-copy recovery, filename
  collisions and actual Cube-provider acceptance remain open.
- D05/D10 native exits/process death/interrupted restore; W02/W05-W10, rich text
  and C01-C04 retain their ledger scope and validation gates. See IMPLEMENTATION.

**Gotchas**
- Focused tests from root need `npm run test --workspace=@medos/mobile -- --runInBand ...`;
  the root forwarding script otherwise drops flags. Plans' commands were corrected.
- Only the read region is keyed by filters; search remains mounted. render-time
  conditional state adjustment handles fresh-list/scope requests before paint;
  the effect only consumes the URL flag. Do not copy form records in effects.
- Footer has one bottom safe-area owner (Screen); hiding it never unregisters
  the card's savers. Added keyboard-controller stand-ins to two existing suites
  because Round now imports that installed native component directly.

## 2026-09-30 — Bounded UX plans for faster ward work (analysis only)

**Agent:** GPT-6 via Codex
**Commits:** this documentation commit; app source remains at `7c8a1bd`.

**Changed**
- Recorded five self-contained proposed UX changes in `plans/README.md` and
  `plans/001-005`: filtered/direct destinations, honest draft/inbox language,
  readable touch controls, shift-first Today with reachable overflow, and a round
  action footer that preserves autosave. All statuses are TODO; no app code changed.
- Plans name source evidence, scope, tradeoffs, focused tests, drift checks and
  native acceptance. Keep the five bottom tabs and eight record destinations;
  avoid speculative frameworks, extra dashboards or unmeasured speed claims.

**Verified**
- Clean app base `7c8a1bd`; `npm run brief` and `npm run check` passed: 67 suites /
  786 app tests + 3 workflow tests. Current source reviewed; no subagents.
- Independently calculated palette contrast: light small `textFaint` on white
  2.90:1, on background 2.68:1, on surfaceAlt 2.55:1; dark on surface 4.01:1.
  Checked Android's official 48dp / small-text 4.5:1 accessibility guidance.

**Not verified**
- Proposed UI changes are not implemented. No native UI test, target-phone speed
  measurement, new APK, new clinical-content review or new restore acceptance.

**Open threads**
- Execute/reconcile the UX plans one at a time within `IMPLEMENTATION.md` priorities;
  mark software and native verification separately. They do not replace safety work.
- D08: active-shift query identity transitions, other auxiliary read failures and
  manual-form drafts; real useLive transitions still need regression/acceptance.
- C05: durable audio-import identity/journaling across process death, orphan-copy
  recovery, filename-marker collisions and actual Cube-provider acceptance.
- D05/D10: native exits/process death and interrupted backup/restore acceptance;
  W02/W05-W10, rich text and C01-C04 retain their existing scope and validation gates.
- Later UX candidates: patient/encounter context in editors and cards; safe folding
  of per-patient handoff editors; measured large-list/search behavior. See plan index.

**Gotchas**
- `useLive` intentionally retains loaded rows through dependency changes. A route
  filter must not relabel old results as a new complete list. Manual filter choices
  need URL synchronization so a repeat external destination still applies.
- Hiding editable sections can unregister unsaved fields. A fixed footer must have
  one safe-area owner and preserve the lifetime save guard; tests alone cannot prove
  Android keyboard/header/navigation-bar behavior.

## 2026-09-27 — Atomic audio imports and truthful shift recovery (0.11.3)

**Agent:** GPT-6 via Codex
**Commits:** `28585b4` (calls), `5796701` (shift/round), `05036fb` (release); test-worker limit in this commit.

**Changed**
- Rechecked the builder's current base `26f67ea` and its successful hosted CI before edits;
  baseline `npm run check`: 66 suites / 759 app tests + 3 workflow tests. No subagents.
- Audio import now commits note/version/attachment/filed hint together, refuses a patient
  deleted during copying, and does not assign historical audio to today's encounter.
  Unknown or file-derived time is labelled in the note and attachment. Failed imports
  retain the source and patient selection; duplicate taps are blocked; newer incoming
  shares survive completion of an earlier copy. Post-commit navigation errors say saved.
- Shift/round reads expose retry and withhold false empty/completion claims, preserving
  loaded handoff text. Round note/consult lookups have retry. Failed patient-add keeps its
  selection; start/add actions guard overlapping taps. No schema or dependency changes.
- Version 0.11.3 / code 19; synchronized stale lockfile workspace version/engine metadata.
  `IMPLEMENTATION.md` and `architecture.md` record the boundaries, not just the fixes.
- Capped Jest at two workers: the default seven on this host repeated a 5-second
  follow-up UI timeout in the pre-push check. All tests and their time limits remain
  enabled; concurrency is bounded at the cost of less parallelism. No APK runtime change.

**Verified**
- Regression failures reproduced before fixes; focused calls/read-recovery: 5 suites / 53
  tests. Final `npm run check` with two workers: 67 suites / 786 app tests + 3 workflow
  tests; Jest completed in 35.5 seconds. Assertions and the 5-second time limit are unchanged.
- `npm run apk` succeeded. `dist/MedOS-0.11.3.apk`: code 19, arm64-v8a only,
  52,630,487 bytes; aapt metadata and apksigner verification passed. Its signing certificate
  matches 0.11.2 (SHA-256 `1119f776...be87e0c`). APK SHA-256:
  `d8cb1eb8ecd4d27c82c1e3ac208001711bb087fc3fec25e0fad9cb1a239785b5`.
- API 36.1 x86_64 release emulator: synthetic audio picked through Android's real Files
  provider -> patient -> phone-follow-up note with a one-second attachment and the explicit
  file-time provenance; header Save exited without a MedOS crash. Added the synthetic
  patient to the active shift, opened the round, entered handoff text, waited for autosave,
  force-stopped the app, reopened the round and read the same text and latest imported note.
  Synthetic patient moved to trash; source WAV removed; existing shift membership restored.
  No playback/acoustic claim: the generated WAV was silent.

**Not verified**
- Physical phone, actual Cube audio/share, native injected read/write errors, interruption
  before autosave/while copying or committing, low-disk/interrupted restore and real
  reminder delivery in this session. Waiting for autosave then force-stopping is narrower
  than proving recovery of every pending edit.

**Open threads**
- Continue the full ordered scope in `IMPLEMENTATION.md`; these fixes do not complete it.
- D08: key/reset membership query state when active-shift identity changes; audit other
  auxiliary lookups and retained manual-form drafts. Tests here inject reads with a hook
  stand-in; real useLive dependency transitions need their own regression/acceptance.
- C05: durable import identity/journaling across process death; orphan file recovery;
  filename marker collisions. The marker remains a bounded display hint, and deliberate
  reimport still creates another note. Actual Cube-provider acceptance remains open.
- D05/D10: native exit/process-death and interrupted backup/restore acceptance; then
  W02/W05-W10 everyday flows. Rich text and the C01-C04 clinical/AI scope remain in the
  ledger with their validation gates; do not replace them with speculative infrastructure.

**Gotchas**
- Concurrent Gradle + emulator + Jest exhausted test time budgets: follow-up UI and scrypt
  each exceeded 5 seconds. The same full check passed unchanged with those jobs stopped.
  The default-worker pre-push run later repeated the follow-up timeout, so serializing
  our own build jobs alone was insufficient. Avoid concurrent heavy validation and keep
  the bounded test-worker default; no timeout was increased or pre-push hook bypassed.
- First cold native build failed at packageRelease without a cause in the ordinary log;
  incremental retry with `--stacktrace --max-workers=2` passed unchanged. Gradle warned
  about its 512 MiB metaspace; do not label the original failure as proven OOM. The emulator
  also showed a System UI ANR during boot/installation, dismissed with Wait before app tests.
- During that loaded emulator session, a long `adb input text` name lost its suffix before
  changing focus; the later short handoff string was verified exactly before/after restart.
  App versus IME/input-injection cause is unverified; fast physical typing needs acceptance.

## 2026-09-26 (0.11.2, phone) — Sharing a recording to MedOS, walked on the phone

**Agent:** claude-opus-5-5 via Claude Code
**Commits:** this one (handoff only)

**Verified on the phone (0.11.2)**
- No «Share Test» had been left by the earlier interrupted attempt (search over all statuses).
- A fake WAV in Download, shared from Samsung «My Files» → Android's chooser, Personal tab
  → «More» → MedOS: MedOS opened on the patient picker; a temporary patient was chosen;
  the note opened as «پیگیری تلفنی», title from the file name, 20:30 read from the run-on
  stamp, recording attached (0:04), and it plays (AudioTrack started for MedOS's pid). This
  is a provider content URI with a share grant — the same path Cube's share takes.
- Cleaned up: the temporary patient (→ trash), the test file. No crash in the crash log.

**Not verified**
- Sharing from Cube itself (the owner's own recordings; left to the owner).

**Gotchas**
- On this phone the share sheet has Personal/Work tabs (the second Android user); a sideways
  swipe on the app row switches tabs. MedOS is under Personal → «More».

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
