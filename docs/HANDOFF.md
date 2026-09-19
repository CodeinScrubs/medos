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
