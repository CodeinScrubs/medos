# MedOS 0.11.72 acceptance

## Source and artifact

- App source `8676be553cc25790f3b0dd3b6a1d3e19205fa3fa`, schema migration 0033.
- Signed owner APK `dist/MedOS-0.11.72.apk`, version code 88, arm64-v8a,
  53,589,127 bytes.
- APK SHA-256 `f88b83e199ecd29f390d90e7051e72e90668a3538e31fd1fe0ffa302913cc734`.
- Signer SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- Owner and isolated x86_64 QA APKs share the Hermes payload SHA-256
  `18f51f83b84dc5afc29f1a6a0152f785a0bea7538287fd7dd5d95cea0746a99d`.
  Package ID, version, signature and essential native libraries were checked for both.
- `npm run check` passed 2,977 mobile tests in 198 suites and five workflow
  tests. Regenerating migrations produced no diff. The restore tests cover
  old archives without the column and current archives with an open result stage.

## Isolated Android 16 acceptance

- Installed the .71 QA APK and loaded a synthetic 40-patient active shift.
  Observed the pending result in the due list and verified the old SQLite
  schema. Upgraded in place to .72. The database file matched before first
  launch and SQLite migration retained both the open and the old closed record.
- Recorded receipt and verified it after force-stop and cold launch. Recorded
  review. Dismissing the native decision dialog with Back left the result
  reviewed. Choosing no action recorded the decision and left the result open.
- The discharge preview showed the named result and decision. Closing the
  admission reduced the active shift to 39. The result still appeared in
  today's follow-ups with its original encounter ownership.
- Explicit closure with a short summary removed the result from the due list
  after cold launch. Independent SQLite checks confirmed the outcome, stage,
  legacy closed record, clinical versions and three milestone audit entries.
  Integrity and foreign-key checks passed.
- Android System UI had a warm-up ANR and recovered through Wait. No MedOS QA
  fatal entry appeared in the checked Android crash buffer.

## Outside this acceptance

The A52s was unavailable over ADB. This run used synthetic data, an isolated QA
package and an emulator. Owner-package upgrade with real data and physical
reminder lifecycle testing remain separate. The signed APK is for local sideload.
