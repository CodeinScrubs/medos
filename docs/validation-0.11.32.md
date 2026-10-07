# 0.11.32 — stopped voice on a new note's durable draft

## Scope and evidence

Solo continuation from `3a512b3`, which records native acceptance of application
`d61b11d` (0.11.31/code47). This patch is 0.11.32/code48. The five open PR heads
were refreshed on 2026-10-08 and match the audited heads; their dispositions
remain unchanged. No remote PR merge, approval or comment was made.

Before enabling the new target, eleven migrated-SQLite contract checks failed:
pending publication/discard, gallery isolation, voice-only publication, atomic
movement rollback, ready recovery without cache and parent retargeting. These
define a previously unsupported internal draft target; they are not eleven
proven reachable bugs in the old application. Additional checks cover autosave
retargeting, malformed metadata and independent recovery from text autosave.

Actual NoteEditor handlers also exposed two weaknesses in the former path:
the first native copy began before the typed draft existed, and dataset writer
admission was not retained through copying. A deferred publication acknowledgment
witness exposed a late global Back over a newer route. Two further witnesses
failed on the initial patch: submitted fields remained editable after SQL
publication while acknowledgment was pending, and a successful keep-draft was
reported as failed when the originating route lost focus. These are software
witnesses with native stand-ins, not Android timing or power-loss evidence.

## Implementation

- `note_draft` is an internal, voice-only attachment target for a live **new**
  note draft with a live canonical patient. It is not a new user-visible module.
  Unpublished draft media is excluded from the clinical patient gallery.
- The existing recording journal owns reservation, streamed fingerprint/copy,
  ready recovery, stable operation identity and atomic attachment acknowledgment.
  It retains the original dataset admission throughout native waits. There is
  no second media pipeline or restore authority for ordinary feature code.
- The NoteEditor flushes its latest text before reservation and again after
  copying, using only its text saver. Its recorder remains in the screen's one
  always-on AutosaveScope; recursively flushing that group from the recorder
  callback would deadlock. Typing during ordinary copying stays enabled.
- New voice metadata lives in `attachments`, outside the full-shape text draft's
  legacy `voices` JSON. Recovery cannot be erased by a later `voices: []`
  autosave. Existing JSON voices retain their display/publication and recording
  timestamp fallback; no stored legacy row is rewritten merely by upgrading.
- Copying, ready and discarding jobs block draft publication, retirement and
  retargeting in their synchronous transactions. Acknowledged canonical voices
  also prevent a text autosave from silently changing their parent.
- Explicit publication validates metadata and moves each existing attachment
  row to the new note in the same transaction as note/history creation and draft
  retirement. Identity, file path, hash, length, duration and original capture
  time are preserved. A voice-only draft is publishable. Failure rolls back all
  clinical and parent changes; it does not create a second file or note.
- Final Save/Discard holds the original dataset lease through acknowledgment,
  temporarily freezes editable controls and rejects retained edit callbacks.
  Failed publication re-enables editing and keeps the draft. Acknowledged forms
  cannot publish again; delayed Back checks the original navigation focus.
  Header title/right-slot presence stay stable during close to avoid the known
  Android native-header crash. A successful keep-draft on an unfocused route
  neither closes that newer route nor invents a failed-save message.
- Removed the obsolete, unreferenced `stageRecording` WeakMap pipeline. Its
  retained-object identity test now exercises the actual journal entry point;
  the other existing recording tests remain. ChipSelect gains an accessible
  disabled state for the brief final-submission interval.

No new route, normal-path dialog, dependency, native permission, clinical rule,
SQL migration, backup header or passphrase scheme. Drizzle's enum is a TypeScript
constraint on the existing text column: `npm run db:generate` reports no changes
and leaves all migration SQL and snapshots untouched.

## Verification checkpoints

Private reproduction/verification logs are retained under
`private/validation-0.11.29/`. They contain only synthetic QA fixtures and are
not repository artifacts. Source and Android acceptance are recorded separately.

- Initial query and editor witnesses fail before their respective fixes.
- Final focused migrated-SQLite/editor checks: two suites / 29 tests pass,
  including original text before IO, admission through copying, newer typing,
  metadata retry, publication rollback, late focus and editing after failure.
- Full `npm run check` passes: typecheck, lint, formatting, 127 suites / 1,668
  app tests and three workflow checks. Three import-order lint warnings on
  touched files were subsequently corrected; final lint is checked separately
  and the ordinary pre-push hook reruns the complete gate.
- Exact-source hosted CI, signed APK identity/library checks and native
  upgrade/recovery are not yet accepted at this source checkpoint. They will
  be appended with exact commit/artifact hashes after running, rather than
  inferred from the previous version's green results.

## Limits and next work

Durability starts after the text parent and recording journal can commit. This
does not preserve an active/unconfirmed recording, failed initial SQL, a
pre-journal interruption or evicted cache before a verified copy. Canonical media
is isolated from text autosave, but the older note editor does not gain general
cross-editor text CAS or an unlimited raw-keystroke history in this patch.

Physical A52s microphone/speaker, audible output/live player progress, low space,
power loss, OEM reminders, performance and a 24-hour native soak are separate
gates. Prior emulator jank was 89.61%; do not claim smooth heavy-shift performance.
Next P0 is manual lab/contact raw recovery and remaining form ownership/navigation
audits. Dependency, clinical and broader product acceptance remain open.

## Exact-source artifact and native checkpoint (2026-10-08)

Application `f1a7e0383bd02d620b1140824c877d73878162ac` passed hosted CI
[37691882057](https://github.com/CodeinScrubs/medos/actions/runs/37691882057),
including migration agreement and the Android bundle. The ordinary pre-push
hook also passed the complete source gate with no lint warnings.

Both APKs were signed and inspected for package/version, ABI and essential
native libraries. Signing certificate SHA-256:
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner arm64, code48 | 52,937,631 | `be8ce7a3bf4979172eb02298c4b40ab5271e64b4ce2852855dcb814a257f9baa` |
| Private QA x86_64, code48 | 54,545,958 | `83a4c21338a259ecc8d80d998b71a9b7af2e89d04fe4876a739c63d91af346ec` |

The installed QA APK was pulled and its full hash matches the inspected file.
The offline API36.1 emulator upgrade from the hash-verified 0.11.31 installation
preserved all 4,036 rows across 40 application tables and all 22 media files.
This includes a real 0.11.31 legacy JSON draft voice, cold-reopened before
upgrading. Independent Node scrypt/AES-GCM decoding, SQLite integrity/foreign
keys and complete row/file comparisons validate the archives, not screenshots.

**Native acceptance failed on closing the note.** Publication of that recovered
legacy draft reproduced a Fabric `addViewAt` / "child already has a parent"
fatal exception twice. The app process exited. The independent post-crash export
does preserve the intended note/version/attachment, original text, recording
time, JSON and audio hash with unrelated rows unchanged. Successful SQL does not
make the crashing close acceptable. Do not install/recommend 0.11.32 as an
accepted candidate; continue with the header-lifecycle correction in 0.11.33.

The former editor test replaced `Screen` and `ScreenOptions` with string hosts.
It missed that the completed branch switches from scrolling to plain `Screen`,
which changes the real child ancestry and remounts `ScreenOptions` during Back.
Two new witnesses use the actual screen/header components (native keyboard
scrolling remains a stand-in); both publication and discard make a second
`setOptions` call before the correction. This is a concrete source witness,
not a claim that a mock can reproduce the native exception itself.

The native QA also found two evidence limitations:

- A keyboard-obscured automation swipe inserted text in an early trial. That
  trial was rejected, the observed IME was dismissed before later swipes, and
  pristine text was restored and rechecked before the crash reproduction.
- Restoring the older archive retains an additional unreferenced 836,561-byte
  voice file. The engine replaces only incoming paths and full backup includes
  all files in the media directory; it does not prune unrelated files. A new
  post-restore baseline proves all original rows and 22 files unchanged, with
  exactly that one unreferenced file already present. Publication against this
  baseline preserves all 23 files without adding another. Do not silently
  delete the file or describe this as exact archive media membership. Safe
  orphan-media accounting/cleanup is separate unfinished storage work.

Private source, archive, device identity and reproduction logs are retained in
`private/validation-0.11.32/`. No physical phone, audible playback, native SQL/
power fault injection, low-space or performance acceptance is implied.
