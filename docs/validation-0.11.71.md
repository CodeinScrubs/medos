# MedOS 0.11.71 acceptance

## Exact source and owner APK

- App source `92f291d056e03f496a145237bf59d9c35b78d3a1`.
- Signed owner APK `dist/MedOS-0.11.71.apk`, version code 87, arm64-v8a,
  53,585,087 bytes.
- SHA-256 `fa7e20c7b75e21f57d68d352ae7c581e6da4a9d8a94a3872cabe0308a898c195`.
- Signer SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Both the owner and isolated x86_64 QA variant contain the same Hermes
  payload, SHA-256 `395caa2fbf7d0f8d1783dfb1605b54e869800c1f9c4e2d1043593d36477c2fe8`.
- `npm run check` passed 198 suites, 2,971 mobile tests and five workflow tests,
  including the accelerated 24-hour, 40-patient shift. PR CI and CodeQL passed
  on the app source. No new migration.

## Native acceptance

- On the pre-existing A52s .70 QA variant, configured the synthetic key and a
  dedicated local Documents folder. Android returned permission and one
  encrypted archive appeared. The cable disconnected before that file could
  be pulled or restored. No action touched the owner's install or database.
- On the isolated .71 emulator, a prior-schema ward fixture loaded with 40
  active patients. The ABG chart showed same-day collection clocks and
  proportional spacing for three unevenly timed draws. VBG and ambiguous
  values were separately visible. From the discharge form, a named open task
  was shown; the discharge left 39 active patients.
- Android's document picker reopened an older synthetic encrypted archive.
  A wrong passphrase showed the expected refusal. With the correct phrase
  and notification permission denied, the app reported restored records and
  a reminder warning. With QA notification and exact-alarm permissions
  enabled, the repeated restore reported completion.
- After cold restart, independent SQLite comparison found 14 complete
  clinical tables equal on shared columns, verified task and follow-up
  ownership/status, and matched all 34 archived media SHA-256 digests. Both
  SQLite integrity checks passed. The app-created .71 full export was also
  decrypted and validated independently: 16 authenticated chunks, 42
  patients, 248 notes and 35 exact media digests, including the additional
  synthetic local file. No folder was configured on the AVD; its UI correctly
  reported that the file was in cache and had no delivered copy.
- The emulator showed an Android System UI ANR during warm-up. Waiting
  recovered it so the application checks could run. No MedOS fatal crash
  appeared in the bounded crash-buffer check.

## A52s physical acceptance

After USB reconnected, the isolated arm64 QA package was upgraded in place
from .70 to .71 without wiping its synthetic dataset. Its Hermes payload
hash matches the signed owner APK above. Seven clinical fixture tables
matched across the install before the first launch; the owner package
remained on .11.2 and its dataset was outside this test.

- Pulled the app-produced .70 encrypted archive from the synthetic Documents
  folder and authenticated it independently. After deliberately completing
  one synthetic task and replacing the test image bytes, the wrong passphrase
  left eight clinical tables and the changed bytes identical.
- Verified same-day ABG/VBG clocks and named discharge work. Completing a
  second synthetic discharge took the active deck from 39 to 38. Correct
  restore reopened the deliberately completed task, restored the admission
  and original media bytes, and returned the deck to 39 after a cold launch.
  Compared 14 full clinical tables on shared columns plus task and follow-up
  ownership/status. SQLite integrity and foreign-key checks passed.
- After explicitly enabling QA notification and exact-alarm permissions, a
  newly scheduled synthetic task was posted in the Android notification list
  while MedOS was in the background. Tapping it opened the expected task.
- A seeded synthetic image accepted highlight, text and crop in the native
  editor. Two persisted revisions and a cold reopen were checked
  independently, with both working and full-resolution original bytes
  matching the fixture. This editor check starts from an existing attachment.
- The .71 app wrote a new encrypted full archive through the same granted
  Documents folder. An independent read authenticated the archive, confirmed
  42 fixture patients and three media files, and found the saved photo edit
  revision. Test archives and media stayed local.

## Still outside this evidence

The owner-package in-place upgrade with live data, second-device physical
restore, whole-shift measurements, on-device media picker/camera acceptance
and alarm delivery through reboot/Doze remain separate.
Result receipt, clinical review and closure require explicit workflow
states and remain tracked in issue 21. The saved APK is a local sideload
artifact and was never uploaded.
