# Validation checkpoint: 0.11.50

Application source `1915ee54d89d7072b79ecdc74fd5cef7c74d3069`, Android code 66.
This is bounded software/emulator evidence for note recovery and reachable Today
previews, not full-shift performance, physical-device acceptance or a crash-free
release. Raw fixtures, hierarchy, archives and decoder logs stay in ignored
`private/validation-0.11.50/`; all records in these witnesses are synthetic.

## Source and artifact

- Final `npm run check`:160 suites/2,255 application tests and five workflow
  checks; typecheck, lint and both formatting checks pass without warnings.
  Database regeneration reports 52 tables and no new changes beyond migration0028.
- The latest source adds no dependency, native permission, route or schema.
  The three additive draft columns were introduced in `65ffa0d`; native .50
  inputs remain identical. Existing migrations and backup schemes are untouched.
- Frozen-source x86_64 QA build succeeds in 2m53s. Gradle/dependency/environment
  warnings remain in native build output; it is not warning-free native evidence.
- Inspected package `com.shayan.medos`, version 0.11.50/code 66, min24/target36,
  x86_64 only. Required React Native/Expo/Reanimated/Worklets libraries pass
  inspection. The QA APK is private and was not copied into `dist/`.
- APK54,962,818 bytes, SHA-256
  `b6bbde1f90e378620db83da9646c2b564acb69c086294bb268d9e94147856fd6`.
  Signing-certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- In-place `adb install --user 0 -r` succeeds on owned QA AVD
  `MedOS_Restore_0_11_10_F`. Pulled installed bytes match that inspected APK.
  No app-data clear or uninstall. The unrelated emulator is not driven.

Earlier package `5cea420` is54,960,550 bytes, SHA-256
`ca07979d984a67a69dc6fc23ff43975be99507a0ea95b6878662b347bab85a18`.
Its5m8s build/install witnesses precede the Today correction. The still earlier
`65ffa0d` QA build was not the installed/final candidate. These artifacts are
distinct even though each carries the unreleased .50 version/code.

### Owner Android artifact

After emulator acceptance and acknowledged baseline cleanup, the generated app
build is cleaned and the same frozen source is built for arm64-v8a. Gradle
assemble succeeds in 11m32s (about12m12s including the preceding app clean and
build wrapper). Native/environment warnings remain. `npm run apk` checks the
required libraries before copying into `dist/MedOS-0.11.50.apk`.

Independent package/signature inspection confirms version 0.11.50/code 66,
`com.shayan.medos`, arm64-v8a only, min24/target36 and the owner certificate
listed above. The actual file is53,354,491 bytes, SHA-256
`b2cc7a2c8a71852e9025c44357de47f6a2367a66cd76a8b04c5ad8fdf5840c08`.
It is a sideload test candidate, not physical-device or final-release acceptance.
No physical phone is connected, and this arm64 file was not installed on one.

## Software regressions

- Real migrated SQLite first reproduces outpatient draft reattachment to a
  later admission and an obsolete draft overwriting a newer chart correction.
  Original encounter/null, complete Note basis and raw date/clock now persist.
  Changed clinical basis requires explicit raw-only adoption before publication.
- Canonical voice acknowledgment is included in recovery before the query limit.
  Empty recorder rows cannot hide meaningful older text/voice, and the card
  selects the exact scoped draft. Foreign/deleted metadata does not count.
- Actual mounted recovery initially cannot reach older drafts after20 rows.
  Stable time/ID pages now reach all41 tied drafts, including retired cursor and
  emptied older-page return. Three previews keep Today short; expansion stays
  within its existing section, and collapsing returns to the newest preview.
- Three mounted deck regressions fail before correction: unbounded due work,
  a full-list destination with a different scope, and recovery below the work.
  A fourth reproduces an oversized recovery preview. The corrected group
  passes81 focused cases with migrated SQLite, inclusive deadlines, explicit
  priority, matching counts, search, scope switches and61-row load-more.
- A changed scope replaces only its read results. Same-scope failures retain
  rows with retry and withhold unreliable totals; headers and controls remain.
  Ownership/conflict/dataset/lifecycle/import/audit rollback tests also pass.

## Native note and archive witnesses

1. A fresh .49 full export matches the preceding cold base exactly. Upgrade to
   frozen `5cea420` .50 then preserves all4,117 original application rows across
   49 tables and34 media hashes. Only `note_drafts.origin=null`, `raw_date=null`
   and `revision=0` are added. Schema29 migrations, integrity`ok`, FK clean.
2. An independently constructed13-row fixture preserves those original rows
   and all media. Actual file selection, password and restore completion are
   observed; the completion acknowledgment is tapped before further actions.
3. The obsolete draft's review/adoption preserves the published newer chart
   and creates no clinical version. Its independent full export has4,130 rows.
   Separate Save then publishes its retained correction. Legacy draft adoption
   changes only its origin/raw revision; the next full export has4,131 rows.
   Each adoption has exactly one id-only audit with null summary/detail.
4. Separate legacy publication changes the intended existing note. Selecting the
   older outpatient draft creates one new note with encounter=null despite the
   active later admission; the newer unselected draft remains exact.
5. Actual incomplete date`1404/10/` and clock`2:` remain visible. Save refuses;
   its acknowledgment is tapped, and raw input remains unchanged. The accepted
   bounded actions retain the MedOS process without an observed fatal for it.
6. Installing final `1915ee5` retains the entire4,134-row intermediate dataset
   and all34 media hashes exactly in an actual UI full export. This distinguishes
   the Today-fix package from the previous native note witnesses.
7. The actual voice-only recovery card opens the exact other patient's editor;
   its play control is present. Separate Save returns to the originating Today
   screen and retires the card. Final independent whole-archive comparison
   has4,136 expected rows: original4,117 +13 fixture rows +two new notes +four
   new versions. Only intended publication/revision/attachment-link changes
   occur. The incomplete and newer unselected drafts remain exact; the original
   outpatient null association and all34 media hashes remain exact.
8. On the final package, Today exposes ten distinct scheduled patient tasks
   before the next section. Its All action opens the existing list with the
   due-patient scope selected and an actual total of40. This is the native
   synthetic deck count; the61-row load-more case is separate software evidence.
9. An independent fixture adds one synthetic patient and41 tied-time raw drafts
   to the final note archive. Actual native recovery shows three previews,
   visits20-card pages with anchors40/20/00, opens precisely draft00 and returns
   to the newest three previews when collapsed. The actual subsequent export
   preserves all4,178 application rows and34 media hashes exactly against that
   fixture; merely opening/leaving its unchanged editor does not publish a note.
10. The original .49 baseline is selected through the actual restore UI. Its
    successful completion is observed and acknowledged before force-stopping
    MedOS and launching a new process. A fresh UI export matches all 4,117
    original rows/34 media with only the three explicit additive draft defaults.
    Migration count29, integrity`ok`, FK clean. The temporary fixture rows are
    absent. This tests acknowledged restore/cold startup, not interruption during
    a swap, active write/recording or power loss.

This voice witness uses acknowledged synthetic media metadata and an existing
valid file. It does not prove microphone capture, audible playback, recording
under lock or durability of an active/pre-journal recording.

## Independent archive evidence

Node AES-GCM/scrypt and sql.js inspect actual UI exports without importing the
app's backup, crypto, note-publication or comparison code. Whole-row equality
covers every column in49 application tables. Device-specific settings, backup
history, audit and migration bookkeeping are excluded from that whole-row
comparison; schema/integrity/FK and adoption audits are checked separately.
Media path/size/hash equality covers every archived file.

| Archive | SHA-256 | Result |
|---|---|---|
| Fresh .49 pre-upgrade | `f8e02711dd5c94399a70856a5b3b22accc920fb671810dd4ce5598060d047878` |4,117 rows/34 media exact |
| .50 upgrade | `42d558d6b015ab77c772a5118e127433692b0ffa487b9f89dbaf5967903db185` | Only three explicit additive defaults |
|13-row fixture | `39b42baf3f2c117ab842176c73792265546888c2fa60fe2704daf0d1ebe90294` | Original rows/files preserved |
| Stale raw-only adoption | `fde8e611c44b46f20ebd21fbf430be896f64eddddcce3dd359efab3118c43462` |4,130 intended rows; no chart publication |
| Legacy raw-only adoption | `c9ce9503bd94debb83fdfda2314a1d794613abd3f782d0bcbb5c41b2543ddc6e` |4,131 intended rows; one prior publication |
| Before Today-fix install | `ee14d2ffc81b3a18d071aeb86d6d5b53d0ba8406ef13ad7992e150a13a4607e3` |4,134 intermediate rows |
| After Today-fix install | `44f885d964b0362dcf550274475a2da26ddc22b0674c79224468ae601e5fc3ae` | All intermediate rows/files exact |
| Final note publications | `52bf0f61139de9dbc0df047bd333b1a38ac4cda19a97e1d7a5cc3d471c8753e6` |4,136 expected rows/34 media exact |
|41-draft paging fixture | `b6759aa1329a6f5e6320c5f813a988878bfb0d58361c2d70870a3a2385cca39b` |4,178 intended rows/34 media |
| Actual recovery-page witness | `2a00dcff22f02e58626102c86de16ea36c8e4f2eed7f4afd98860a130df9062e` | All4,178 rows/34 media exact |
| Original baseline after restore/cold start | `64757f4bf5bab1a9a9584d5b3b7832625599fbf2c4bbefaad9226db245c59675` |4,117 rows/34 media; only explicit additive defaults |

## Rejected or limited observer attempts

- Ordinary idle dumps fail while restore/export is busy. A fresh non-idle
  hierarchy is used; cached/missing/empty dumps never count as acceptance.
  Export requires exactly one new file and the re-enabled actual full-backup
  control. Restore requires observing and tapping its completion acknowledgment.
- Private harness attempts fail on a read-only PowerShell variable, paths/
  array concatenation, an enabled-only locator for a readable disabled input,
  premature export-file selection and Windows PowerShell5.1 UTF-8 parsing.
  Corrected fresh observations/independent archives establish the accepted
  witnesses; harness errors are not counted as app successes or app crashes.
- One install loses ADB's device connection before completion. A fresh device
  inventory finds the owned AVD; a later actual install succeeds and its pulled
  package bytes match. The interrupted attempt is not acceptance evidence.
- The voice publication observer initially expects a patient workspace after
  a card launched from Today. Fresh hierarchy shows the originating Today with
  the retired card absent, and the final independent publication oracle passes.
  The incorrect return-screen expectation is not repeated as a product claim.
- A due-preview observer expects an admitted-patient section that is hidden
  when a shift is active; the actual next section is Inbox. Fresh native rows
  establish ten previews. An early full-list read precedes its total; a later
  hierarchy establishes the selected scope and40 matching rows.
- Deep links retain Today's scroll position. The initial recovery-page
  observer scrolls farther down looking for a section already above it and
  fails its bounded search. Fresh reverse scrolling finds the existing section;
  the corrected three-page/editor/collapse witness and whole archive pass.
- The old unbounded40-task deck causes12 failed recovery-search swipes. This
  is the actual UX finding behind the bounded previews, not microphone evidence.
  Startup System UI/other-package observer anomalies remain distinct from MedOS.
- The additional paging-fixture restore exceeds the initial14-snapshot
  completion observer. MedOS remains alive/resumed in key derivation, with
  standard N=2^15/r=8/p=1. A later quiet interval/fresh hierarchy observes the
  actual successful completion, which is acknowledged before further work.
  CPU/memory pressure is recorded, not assigned as the proven cause. This
  is not evidence of a few-second KDF or an accepted performance budget.
  The separate baseline cleanup restore finishes after about465 seconds in its
  observer-inclusive quiet-check window. This includes polling and the whole
  restore, not a standalone cryptographic benchmark. Measure phase timings and
  target-device behavior before choosing an optimization; preserve recorded
  parameters, scheme normalization, golden keys and independent compatibility.
- PID-filtered native output contains MediaCodec dead-handler warnings and a
  keyboard-controller modal `Fabric View [-1]` soft exception. They are
  nonfatal in this retained process, not proof that they are harmless. Full
  native IME/modal and physical audio acceptance remain open.

## Remaining gates

Hosted final-head CI is pending at this documentation checkpoint. The exact
source has full local checks and both inspected artifacts; acknowledged base
restore/cold export, native recovery pages and matching full-task navigation
are accepted above. Larger timing/pressure/IME cases and native modal/audio
warnings remain separate.

GitHub PRs1–5 retain the exact heads documented in
[the existing PR review](reviews/2026-10-07/README.md); a fresh GitHub inventory
finds no additional or changed proposal. They are not merged by this checkpoint.

The eight manual raw forms, permanent patient/clinical correction history and
appropriate trash, visual rich text, complete follow-up/shift workflows and
clinical review remain open in `IMPLEMENTATION.md`. Forty-patient timings,
pressure/IME/large-font checks, low-space/provider/power interruption and physical
camera/audio/alarm/second-device recovery remain open. The owner arm64 .50
candidate now exists in `dist/`; physical-phone acceptance has not run.
