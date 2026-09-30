# 0.11.8 validation

This release makes a selected audio-file import recoverable without creating a
second note when the same operation is retried. A deliberate fresh import is a
new operation; filename hints do not prove that file contents are duplicates.

## Source and software evidence

- Implementation: `77a750133e4a24cdfc12c353010def408824e7cd`; queued-share fix
  `09d27624efe3c1050631f6b89e46378dda1bf9b1`; provider-name/native-entry fix
  `27106486d607ca74ccd98a4de20ba8597e4037fb`; final application source, with
  failed-import feedback inside its picker:
  `e82a622bc65055fbfa7a7924f356f198d2265a8f`. Version 0.11.8 / code 24.
- Baseline: 78 suites / 907 app tests + 3 workflow tests. Two retry-identity
  witnesses failed on the preceding code. A later queued-share witness failed
  on 77a7501 before the correction. Corrected application source passed 81
  suites / 958 app tests + 3 workflows, typecheck, lint and formatting.
- [09d2762 CI](https://github.com/CodeinScrubs/medos/actions/runs/36782252006)
  passed. Migration regeneration reported no further changes. Additive migration
  0017 adds the import journal; no previous migration, backup format, permission,
  runtime dependency, route or clinical calculator changed.
- Migrated SQLite tests cover reservation before copy, atomic note/history/media/
  journal publication and rollback, same-id retry and concurrent retry, changed
  copied bytes, wrong/deleted scope, protected attachment paths, cancellation
  during copy, and interrupted cleanup. Current/older backup-table tests retain
  journal links or clear jobs from a replaced dataset. They do not prove native
  encrypted-archive or concurrent restore/import safety.
- Component tests exercise recovery, read errors, patient selection, failed
  copy/retry, navigation failure, confirmation and new incoming share identity.
  Native modules/navigation are stood in. Streamed file hashing is checked
  against independent Node SHA-256, including bounded/short reads and EOF.
- The artifact gate adds four tests and passed 82 suites / 962 app tests + 3
  workflows. Three provider-name/time/cancel tests brought the count to 965.
  Final source passed 82 suites / 966 app tests + 3 workflows, with
  typecheck/lint/format passing. The gate uses the existing JDK, without another
  dependency. [2710648 CI](https://github.com/CodeinScrubs/medos/actions/runs/36789173246)
  passed its pre-push checks and hosted checks.
  [Final e82a622 application-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36791088588)
  also passed; the later evidence commit changes documentation only.
- Native Downloads selection on 09d2762 exposed `File.name` returning a URI
  document id, not the displayed filename. A witness failed before the fix.
  The existing DocumentPicker supplies the original name, with automatic cache
  copying disabled. Its fallback `lastModified` is not call-time evidence.
- Another native witness on 09d2762 showed a failed source returning to the
  patient picker with no visible message, while recovery-card retry showed its
  error dialog. Two component witnesses failed on the same handlers at 2710648.
  The final correction displays a short source-scoped notice inside the modal;
  retry/success/close/new incoming shares do not inherit the old failure.

## Signed owner artifact

- `dist/MedOS-0.11.8.apk`: 52,697,195 bytes, package `com.shayan.medos`,
  version 0.11.8 / code 24, arm64-v8a only.
- SHA-256: `d202e12193f53526ca9a43101e12e83d01a88b53aa279dc2108839672a09af9b`.
- `apksigner verify --verbose --print-certs` passed. Certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches the preceding release. No signing secret is in this record.
- Built from final e82a622 source; native entries checked both before copying
  to dist and independently afterward. No application source edits during the
  final arm64 or x86_64 builds. Earlier 77a7501, 09d2762 and 2710648 same-version
  artifacts are superseded and private.
- This is packaging/signature evidence; the owner artifact has not been run on
  the target physical phone.

## Native packaging failure and repair

- The first incremental x86_64 build from 09d2762 reported Gradle success, but
  its actual ZIP omitted `libexpo-modules-core.so`, `libreanimated.so` and
  `libworklets.so`. It crashed on launch; the native loader identified the
  missing Expo core. The JS EventEmitter error was a symptom of that failure.
- The new native-entry CLI rejected that exact APK. `:app:clean` followed by
  `:app:assembleRelease -PreactNativeArchitectures=x86_64` rebuilt a complete
  package. No dependency sources, APK ZIP entries or app data were patched.
- Repaired signed x86_64 APK: 54,305,178 bytes, same package/version/code;
  SHA-256 `6e7a6ac30acc881bac4f3c9c7bf8b736bc92a7cf1c74a861091846269461607c`.
  Signature and all required native entries passed. It remains in ignored
  `private/ux-0.11.8`, never `dist/`.
- `npm run apk` now checks essential native entries and the owner ABI before
  copying to `dist/`. The explicit CLI also checks emulator artifacts. This
  detects missing libraries, not arbitrary runtime, signature or UI defects.
- The earlier AVD showed changing pages/data between observations. Its UI
  scenarios are excluded from acceptance; use an isolated AVD/ADB serial.

## Native acceptance

- Final e82a622 signed x86_64 APK: 54,305,522 bytes, same package/version/code
  and certificate as the owner artifact. SHA-256
  `0ea6f6b2cfb86f1c0118f506f59774aca57a31e7eef74dc060ee3634cf9ba913`.
  Required native entries and signature passed; this separate emulator copy
  stays in ignored private storage. It is not the arm64 owner APK.
- Isolated Android 16 / API 36.1 AVD, serial emulator-5556, airplane mode and
  three-button navigation. Actual upgrade sequence was 0.11.7 -> 09d2762 ->
  e82a622, retaining one synthetic patient and its imported audio note. This
  does not prove a direct 0.11.7-to-final upgrade or the target phone's behavior.
- A selected missing-source operation remained visible after force-stop and
  emulator restart. Final-source retry kept the same operation; three distinct
  selected requests produced three pending cards, and retry added no fourth.
  Confirmed cancellation removed each card. The already published note remained.
- Initial and repeated failed selection showed the short notice inside the
  patient picker. The native error dialog sometimes appeared only after closing
  that modal; the inline notice is therefore the visible failure guarantee.
  Recovery actions and confirmation were readable and usable at font scale 1.6
  in dark mode, above the three-button bar. This is a bounded screen check,
  not app-wide accessibility acceptance.
- Final-source native DocumentPicker selection of an 88,244-byte synthetic WAV
  preserved its original name in the note title and displayed its two-second
  duration. File-time fallback was explicitly distinguished from confirmed call
  time. The note and voice attachment remained after force-stop. The old
  pre-correction document-id title was deliberately left unchanged.
- A fresh explicit VIEW request used the provider URI observed in Android's
  grant record. After importing it, editing/saving a title marker and force-stop,
  replaying the same UUID reopened the marked note and its two-second attachment.
  The patient's complete note list contained three notes: the earlier import,
  the final picker import and this deliberate fresh request; replay added none.
  This exercises VIEW/retry identity with an existing provider grant, not a
  real recorder's SEND intent or an expired grant.
- The original Downloads file was still present and byte-identical after
  import/cancellation: SHA-256
  `192486c20128fe6f258b1f3513920deed04a47bda67a0482f3f65e506f2ef6d2`.
  Duration/player loading was observed; audible output was not assessed.
- Cleared logs before the final cold-launch/replay sequence; the crash buffer
  and selected AndroidRuntime/SoLoader/ReactNativeJS error logs were empty
  afterward. UI dumps/screenshots/build/signature logs are retained privately.

Not verified: physical phone; real Cube/other-recorder SEND and grant expiry or
activity recreation; interruption during native copy/hash/publication/cleanup;
large audio, low disk or power loss; native encrypted backup/restore, second-device
recovery or concurrent restore/import. Older orphan files and content-based
duplicate detection remain separate work. Software, packaging and this emulator
run do not close the wider manual-form, clinical-tool or AI backlog.
