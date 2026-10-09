# Validation checkpoint: 0.11.49

Source `a1aeaaaad7bfb759e57d018242c17a7447fbc486`, Android code65.
This is bounded emulator evidence for note ownership and history restoration,
not full-shift performance, physical-device acceptance or a crash-free release.

## Source and artifact

- Final source checks:158 suites/2,194 application tests and five workflow
  checks. Typecheck, lint and both formatting checks pass without warnings.
- Exact-source hosted CI succeeds:
  <https://github.com/CodeinScrubs/medos/actions/runs/37956325222>.
- Frozen-source x86_64 QA build succeeds in10m12s. Native build output contains
  dependency/Gradle/environment warnings; it is not warning-free native evidence.
- Inspected package `com.shayan.medos`, version0.11.49/code65, min24/target36,
  x86_64 only. Required React Native/Expo/Reanimated/Worklets libraries pass
  inspection. This QA APK is private and was not copied into `dist/`.
- APK54,936,626 bytes, SHA-256
  `f1b25a87571592d2d72979b1b679c87ddbb6b155907b30d4c463dfb460aad0df`.
  Signing-certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- In-place `adb install --user 0 -r` succeeds on the owned QA emulator. Pulled
  installed APK bytes match the inspected artifact exactly. No uninstall/wipe.

## Native witnesses

All actions use freshly observed hierarchy bounds on one owned emulator.
Fixtures contain synthetic records only; archives, hierarchy and decoder output
remain under ignored `private/validation-0.11.49/`.

1. After upgrade, an actual UI full export independently decrypts and matches
   all4,117 original application rows across49 tables and all34 media hashes.
   Integrity is `ok`, foreign keys clean, schema28 migrations.
2. An original editor remains readable across an acknowledged fixture restore.
   Its explicit local close returns without changing the imported dataset.
3. The same note ID under another live patient's route exposes no editor fields;
   the actual screen says it was not found. Its history route exposes neither
   note bodies nor restore controls. Normal exits retain the app process.
4. The correct route recovers the synthetic unpublished draft exactly. Opening
   history from that editor shows both published versions. Explicitly restoring
   the older version returns to the original patient workspace, showing the
   restored body, rather than the retained obsolete editor.
5. A real UI full export after that action independently matches all4,124
   expected rows:4,117 original rows, six fixture rows and exactly one new note
   version. Only the specified note fields/search/timestamp and intended draft
   retirement change. Original versions remain exact; one id-only restore audit
   has null summary/detail. All34 media hashes remain exact.
6. After observing and tapping restore completion, force-stop/cold reopen and
   another actual UI export reproduce all4,117 original rows and34 media hashes
   exactly. The synthetic additions are absent.

No fatal app exception for the retained action PID was observed in these bounded
note/restore/close witnesses. This does not establish absence of crashes or ANRs
under every workload.

## Independent archive evidence

Node AES-GCM/scrypt and sql.js inspect the actual exported archives without
importing application backup, crypto, comparison or note-publication code.
Whole-row equality covers every column in49 application tables. Device-specific
settings, backup history, audit and migration bookkeeping are excluded from that
whole-row comparison; schema/integrity/FK and the new restore audit are checked
separately. Every media path/size/hash is compared.

| Archive | SHA-256 | Result |
|---|---|---|
| Upgrade export | `e13e409d7bb3f372a2b6b587f60499e64403c3c439c4e25bff456f88676c1e41` |4,117 original rows/34 media exact |
| Synthetic note fixture | `9bdd25630dd52e6e58f3b7206a039ca7c5737a0f5749f2780cb134dfe309a755` | Original rows/media retained; six additions |
| Post-history-restore export | `a9502d664f1061994ac353da95e0475e46a4cc4b85fbf30e1ee36343879f10bb` |4,124 intended rows/34 media exact |
| Acknowledged restore and cold export | `f50795f156673459dbb0842cc24d25d364ad2d94976e9c68817f5e70be30dfde` |4,117 original rows/34 media exact |

## Rejected or limited attempts

- The first launch hierarchy contains the splash only; readiness uses a fresh
  later hierarchy with the actual application controls.
- During base cleanup, ordinary `uiautomator dump` reports that it cannot obtain
  an idle state. These reads do not prove restore completion or an app failure.
  A non-idle fast hierarchy first shows the backup page, then the completion
  dialog. A premature selector retry cannot find its target under that dialog;
  one fast dump cannot be pulled. Neither is accepted as a restore witness.
- No force-stop occurs during the unobserved cleanup. A fresh ordinary hierarchy
  subsequently observes completion; the acknowledgment is tapped and checked
  before the accepted cold restart/export.
- The crash buffer contains an earlier UiAutomation-service registration failure
  for an automation process. It is not attributed to MedOS. The retained MedOS
  process remains alive throughout the bounded actions.

## Remaining gates

Persisted recovered-draft basis, original new-note encounter ownership and raw
invalid note-date recovery remain separate software work. The eight manual raw
forms, correction/trash workflows, rich text, full follow-up/shift workflows and
clinical review are not completed by this checkpoint. Forty-patient timings,
pressure/IME/large-font checks, low-space/provider/power interruption and physical
camera/audio/alarm/second-device recovery remain open. No owner arm64 .49 build
or physical-phone acceptance was run; `dist/` remains the .39 owner artifact.
