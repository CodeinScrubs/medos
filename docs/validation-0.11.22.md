# Validation scope: 0.11.22

Version 0.11.22 / Android code 38 makes search, lab reflagging and legacy note
history repair read/write units synchronous and transactional. No dependency,
permission, migration, route, archive/key scheme or visible feature was added.
See architecture's matching decision for the responsiveness tradeoff and scope.

## Reproduction and software evidence

`features/search/repair-races.test.ts` runs on real sql.js SQLite migrated with
the application's bundled migrations. A spy observes a completed real SELECT
and queues a genuine SQL edit; it supplies no replacement SQL results. This
pins the JS yield between the old snapshot read and its stale write. The patient
witness calls the actual patient update query. Other fixtures acknowledge a
correction and its correct index/flag through real SQL.

The finalized 21 witnesses all failed on pinned previous commit `02d2432`:

- Twelve search rebuild entry points overwrote an acknowledged newer index.
- Five related-name paths used an old specialty, teacher or place name.
- Lab reflagging applied the old value/range verdict to a corrected value.
- A later lab SQL failure left earlier flags changed; version remained unset.
- Parallel legacy-history passes inserted duplicate baseline versions.
- A later baseline SQL failure left earlier versions inserted.

All fourteen owned runtime files were preserved and restored byte-for-byte
around the old-source probe; no build or native session overlapped. The current
transactional implementation passed the targeted suite. Real SQLite abort
triggers verify rollback of the complete lab/history pass and successful retry.
The lab rollback/retry case also compares complete rows: only derived flags can
change, never clinical values or their edit times.

The first full typecheck rejected two test helpers: the afterEach callback
returned Jest rather than void, and search predicates needed `and(...matchesSearch)`.
Both were fixed without weakening types or lint rules. An initial root-cwd scoped
ESLint command could not find the mobile configuration; rerunning from the mobile
workspace passed. Prettier ran from the repository root on changed files only.

Full `npm run check` passed typecheck, lint without warnings, formatting,
108 suites / 1356 app tests and all three workflow tests. The normal push repeated
the full gate. Exact application commit
`846bce1bd7584bf9d5c80da7d86864bb1347a948` passed hosted CI
[37149450106](https://github.com/CodeinScrubs/medos/actions/runs/37149450106),
including migration regeneration and Android export. Tests do not prove native
SQLite scheduling or phone responsiveness. The primary agent owns review and
integration; the two existing reviewers could not complete their final attempts
because their account usage limit was reached. No further agents were started.

## Signed artifacts

Both packages contain frozen application source at `846bce1`. Only application
version/code changed in native configuration, so generated Gradle's previous
0.11.21/37 stamp was explicitly checked and synchronized to app.json 0.11.22/38
before `npm run apk`. No tracked native/plugin configuration changed, and prebuild
was not run. This reuses native caches; manifest, signature and library inspection
below verify the resulting artifacts instead of assuming their identity.

The arm64 build took 8m08s. The separate `:app:clean :app:assembleRelease
-PreactNativeArchitectures=x86_64` build took 12m58s; it was never copied to dist.
Both passed essential-native-library/ABI checks and signature verification.
Each is `com.shayan.medos`, version/code 0.11.22/38, min SDK 24, target SDK 36,
with the unchanged release certificate SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/MedOS-0.11.22.apk`, arm64 only | 52,841,807 | `978378c35ad13f0b49c6b342ed5d1f94b884f609fdf2110ebab365ba815690fb` |
| Private emulator APK, x86_64 only | 54,450,134 | `2df8882c7691486798cfc27b8adbda214d066b9da294c01591712c2de92c895c` |

## Bounded native repair acceptance, 2026-10-04

The isolated modern emulator was upgraded from 0.11.21 with `adb install --user
0 -r`, without wiping its data. Its pulled installed base APK matched the inspected
x86_64 hash exactly; airplane mode remained enabled. Cold boot separately showed
a **System UI** non-response dialog, resolved through the observed Wait button.
It is not recorded as an application crash.

A private synthetic fixture was made from the accepted 0.11.20 archive using an
independent Node AES-GCM codec, with fresh salt/nonce prefix. It retained every
old clinical row and all 18 media files. Deliberate changes were obsolete patient/
note indexes, zero repair markers, one legacy note with no history, and a new lab
panel with values 5 and 30 against explicit range 1-10 carrying wrong flags.
An independent decode matched the prepared SQL bytes exactly. Fixture size was
6,514,897 bytes, SHA-256
`5738d5bff5c514263391f86cdafd1462cb4d4a99c98bf1248cc4dd3cbccec6d7`.

The actual Android document picker selected this archive; its synthetic passphrase
was entered in the actual prompt. Back intended to hide the IME instead opened
the prompt's discard dialog because no software IME was visible. Choosing
continue writing retained the passphrase, then the observed Restore button was
used. A hierarchy read during busy work could not obtain idle state; a later
fresh hierarchy explicitly reported completion, without housekeeping warnings.

The actual full SAF export subsequently reported destination-content verification.
Independent Node decryption authenticated all seven chunks of the 6,518,993-byte
result, SHA-256
`ad08313b9e0672f8190f98e4c8fe69688b3310aca26d1726d5836160e0b425a2`.
Comparison checked **all 39 application tables**. Only expected derived changes
were accepted: patient/note search indexes, the two correct flags (normal/high),
one exact legacy baseline, and the three repair markers. All other clinical
fields/edit times and existing history were preserved. Audit/backup runs/settings/
migration bookkeeping were excluded from full-row comparison; the three markers
were checked explicitly. SQLite integrity was `ok`, with no foreign-key errors.
All 18 media entries and 14 voice attachments were unchanged, including known
prior unreferenced QA files. This does not claim orphan cleanup or fresh playback.

After force-stop, the native lab screen displayed `5` without a high/low flag and
`30 H`, with Latin clinical digits; its screenshot was inspected. Fresh header
Edit opened the actual patient editor. The final application crash buffer was
empty. The owned emulator was shut down without wiping its data.

## Native follow-up defect

The same patient root remained mounted on the navigation stack during restore.
Returning to it and tapping header Edit reproduced `DatasetChangedError`: its
AutosaveScope still holds the old generation even though live patient rows refresh.
The screen cannot start that fresh edit until reopened. This is a usability
regression in the earlier intent fencing, not a defect repaired by 0.11.22.

Do not auto-remount the patient subtree merely because `SaveGroup.unsaved` is
false: open manual vital/diagnosis forms are not registered there, and a clean
autosaved draft may still be unpublished. Renewal must preserve old local input
until explicit choice and keep old mutation/dialog callbacks fenced. Root review
and partial independent reviewer comments agree; neither reviewer delivered a
final approval because of their usage limit. This remains the next source task.

## Remaining boundaries

- These are atomic per-feature/pass repairs, not one transaction across all
  restore housekeeping. No cross-process transaction protocol is claimed.
- Other manual forms, delayed raw-draft actions and async continuations still
  need immutable dataset tokens and retained pending input. Fresh capture on
  retained root screens after restore remains a distinct acceptance case.
- Existing duplicate baselines are preserved; this patch does not delete history.
- No large-dataset benchmark, physical-phone/API 26 acceptance, power-loss or
  low-storage guarantee. Durable draft/capture stopped voice and originals before
  crop remain separate work. The project is not feature-complete.
- Native acceptance covers repair execution/result preservation, not an injected
  simultaneous-edit race or later-failure rollback on native SQLite. Those cases
  are pinned by migrated-SQL witnesses; phone/lifecycle evidence remains separate.
