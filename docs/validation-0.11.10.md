# 0.11.10 validation

This release preserves older safety snapshots on failed replacement, refuses
unreadable restore metadata and serializes backup/restore/recovery before their
first await. It changes no screen, dependency, permission, migration, archive
format or passphrase scheme. Ordinary clinical writes and audio imports are not
covered by this exclusion; concurrent restore/import remains open.

## Source and software evidence

- Application source: `194f4018ee50fb99b38440210488a96133d62b64`, version
  0.11.10 / code 26. Both signed builds below used that unchanged source.
- Baseline: 83 suites / 973 app tests + 3 workflows. Regression witnesses failed
  on the preceding behavior. Final local check: 85 suites / 998 app tests +
  3 workflows; typecheck, lint and formatting passed.
- Snapshot tests cover failed creation/nonempty checks before retention, partial
  cleanup, cleanup failure, unique names and clock rollback. A nonempty snapshot
  is not independently proven readable or durable across power loss.
- Engine tests use real AES-GCM archive authentication and the app's migrated
  SQLite import/rollback, with native files stood in and a deterministic test
  KDF. Existing independent crypto vectors cover the production KDF/schemes.
  Tests cover early exclusion, invalid markers, preserved displaced copies,
  failed rollback/retry, source-close errors and honest post-commit warnings.
- Import tests reject missing original-schema core tables/columns before
  replacing records; valid empty and older optional-table backups remain valid.
- Migration regeneration produced no diff: 39 tables / 18 migrations.
- Exact-source hosted CI passed:
  https://github.com/CodeinScrubs/medos/actions/runs/36851409371.
- One pre-push run during simultaneous native build/emulator startup exceeded
  the existing 5-second timeout in one follow-up-list test (997 passed). The
  push was blocked. With unchanged source, the subsequent complete check and
  push passed after the build ended. Load is an observation, not a proven cause;
  no timeout was raised to make that run pass.

## Signed artifacts

Actual native ZIP entries, ABI, package/version and signatures were checked.
The installed x86_64 package was pulled and independently hashed.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.10.apk`, arm64-v8a | 52,705,951 | `61a261442f2beca46ba8c2dc57d34a05ff0769005572a4a62c866c1cb6356901` |
| Private emulator copy, x86_64 | 54,314,278 | `9d8c719ba59ddd8f116d6aa0bd43478c5fe6625c49090452e4092e616aa8304d` |

- Package `com.shayan.medos`, version 0.11.10 / code 26; each contains only
  its intended ABI and passes the required-native-library gate.
- `apksigner verify --verbose --print-certs` passed for both. Certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches 0.11.9. No signing secret is in this report.
- The arm64 build regenerated Android; the emulator build explicitly cleaned
  only generated app build output and selected x86_64. No app data was cleared.

## Native protocol

- Dedicated fresh AVD `MedOS_Restore_0_11_10_F`, emulator-5556: Android 16 /
  API 36.1, x86_64, 1080x2400 / density 420, font scale 1.0 / light theme,
  airplane mode on and Wi-Fi off. No physical phone was connected.
- 0.11.9 was installed first. Only synthetic data were entered: one patient,
  one task, two notes (including an imported audio note), note versions and an
  unsubmitted patient form containing an incomplete Jalali date `1405/`.
- A locally generated 70-second PCM16 mono WAV (2,240,044 bytes) was selected
  through Android's document picker and filed to that patient. Its SHA-256 is
  `9a25d920bbbb9dc8b37759cb2310f937fb04f1b5567ed6602b8ec8e57aca5cb6`.
  This checks original-file preservation, not microphone/call recording.
- Automatic backup was disabled for controlled fixtures. An owned Downloads
  subfolder was selected with Android SAF and its access grant approved. Manual
  full backup displayed the destination-content verification message.
- The 0.11.9 backup (2,932,785 bytes, SHA-256
  `eb4aa1206b96ee59af329ef8ab1b13c07620e983352de44b90abec7da2b1f464`)
  was pulled. A separate Node decoder, without importing app crypto/format
  code, used Node scrypt/AES-GCM and sql.js: three chunks authenticated,
  manifest version 0.11.9 / 18 migrations, SQLite integrity `ok`, no FK errors,
  raw draft preserved and original WAV hash matched.
- Upgrade with `adb install --user 0 -r` retained records and the raw draft.
  The installed 0.11.10 APK hash matched the built emulator APK.
- The patient's first name was changed after the fixture. Wrong passphrase was
  rejected with the existing wrong-password message; the changed name remained.
- A copy with one ciphertext byte altered, while preserving its header, was
  rejected as damaged/incomplete with the correct passphrase. The changed name
  again remained. These UI observations alone do not prove whole-database byte
  equality after each rejected attempt.
- The intact 0.11.9 backup restored successfully: one patient / one file, with
  no cleanup warning. After force-stop and cold launch the original name returned.
  The unsubmitted form recovered its exact incomplete date and text.
- The selected SAF folder and local key survived restore. A new full 0.11.10
  backup displayed destination-content verification. Pulled size 2,932,786,
  SHA-256 `a6fa4e8e8d0353d749a9a2acb5e609ce49eb791642159650b2c64b2274ef0fd5`.
  Independent decoding again authenticated three chunks, found 18 migrations,
  SQLite integrity `ok`, no FK errors and the exact original WAV.
- Independent deep comparison of every column in eight clinical tables matched
  the baseline: patients, notes, note_versions, note_drafts, patient_form_drafts,
  tasks, attachments and call_imports. Settings differed for expected local
  backup/recovery housekeeping; no active `restore.inFlight` marker remained.

## Bounded process interruption

- Three-button navigation was enabled and verified before the current-backup
  and interruption checks. Earlier wrong-password/corrupt/old-restore checks
  used the initial gesture-mode configuration with hardware Back; no actual
  back gesture was tested.
- A valid synthetic archive with the same decoded body was separately encrypted
  with supported scheme 2 / N=2^17, r=8, p=1 to lengthen the attempt. Production
  KDF defaults were not changed. Independent decoding authenticated it.
- After the snapshot, the patient was starred and that state was observed.
  Restore was submitted; the app was force-stopped approximately 1.67 seconds
  after the tap. The immediate screenshot shows a closing passphrase dialog
  and disabled actions, but not an observable file/database phase.
- Cold launch preserved the star and opened the patient normally. This proves
  an early pre-commit process interruption retained the later clinical change;
  the exact instruction point is unknown. It does not test interruption during
  displaced-media movement, marker recovery or database commit.
- A subsequent normal restore of the current 0.11.10 archive succeeded. After
  force-stop/cold launch, the star was absent as in the backup, and the original
  note/task remained visible. The restore path remained usable after interruption.

## Rejected observations and remaining gates

The first C-drive AVD could not start because the system image required a 6 GiB
partition and more host space. Setting its config to 2 GiB did not overcome the
image minimum. A new isolated AVD on another drive was used; other AVDs/data
were preserved. A launcher ANR before usable MedOS state, transient null UI roots,
idle-dump failures during work and one mistyped deep link were excluded from
acceptance claims. Final route assertions used fresh UI hierarchies.

No physical phone, microphone/Cube recording, revoked provider grants, real
alarms/reboot/battery behavior, critical-swap or power-loss interruption, full-disk
restore, second-device recovery, gesture-back, all-form recovery, clinical-tool
validation or app-wide performance/accessibility acceptance was performed.
D10 is stronger, but still partial. D05/D08 remaining manual-form drafts, C05
concurrent restore/import and all broader clinical/AI gates remain open.
