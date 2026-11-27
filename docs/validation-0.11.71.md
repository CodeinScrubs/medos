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
  was shown; the charge left 39 active patients.
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

## Still outside this evidence

Exact .71 device installation and production in-place upgrade on the A52s,
second-device restore on physical hardware, whole-shift measurements,
image markup and alarm delivery through reboot/Doze remain separate.
Result receipt, clinical review and closure require explicit workflow
states and remain tracked in issue 21. The saved APK is a local sideload
artifact and was never uploaded.
