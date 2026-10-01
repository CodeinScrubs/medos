# 0.11.12 validation

This release rejects incomplete backup entry streams, excludes whole call-file
jobs from backup/restore/recovery, and validates encounter changes against the
live clinical state inside their transaction. It does not provide raw recovery
for the admission/discharge forms or serialize every ordinary clinical write.

## Source and software evidence

- Application source `c5627ce68a7ada4a537d04b29005079eb5d45f53`, version
  0.11.12 / code 28. `npm run check`: 88 suites / 1066 app tests + 3 workflows;
  typecheck, lint and formatting passed. Pre-push validation repeated the gate.
  [Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36877663719)
  succeeded, with its head SHA checked independently.
- Real migrated SQLite and file/navigation stand-ins cover changed entry sizes,
  short reads/EOF, call-file/maintenance exclusion, failed provider settings,
  stale encounter/status changes, deleted parents and repeated submissions.
  No migration, dependency, permission or backup/passphrase scheme change.

## Signed artifacts

Both packages were built before the later encounter-draft source work began.
That unfinished source is not present in these packages.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.12.apk`, arm64-v8a | 52,739,823 | `e64681571421b85eb2e39bd1a9d2f17d1e4717acee57d6e0faf531c105f00920` |
| Separate x86_64 emulator APK | 54,348,150 | `1185c34db2b6b8b45fdd07b1dc038a6c7ffa728bec589aab582d87a888bbab46` |

- Actual package `com.shayan.medos`, version 0.11.12 / code 28. Each contains
  only its intended ABI and passed the essential native-library gate.
- Signature verification passed with the same certificate SHA-256 as the
  preceding releases:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
  Pulling the installed emulator `base.apk` reproduced its exact hash above.
- The first build was stopped explicitly with Gradle's stop command as host C
  space fell to 82 MiB. Only generated app/native-module build and CMake outputs
  moved to local F storage, with junctions at their original paths. No source,
  signing key, AVD/userdata or application data moved or was deleted. The owner
  retry succeeded in 5 minutes 9 seconds; the x86_64 build in 5 minutes 47 seconds.
  Prebuild regenerated Android and removed the old app-output junctions, even
  without `--clean`. Check free space and junctions before another native build.

## Native protocol

Owned isolated Android 16 / API 36.1 x86_64 AVD, 1080 x 2400 / density 420,
Asia/Tehran, font scale 1.0, three-button navigation, airplane mode and Wi-Fi off.
Fabricated records only. Fresh XML bounds drove all actions. Upgrade from
0.11.11 retained the patient, drafts, original audio and SAF/key configuration.

| Check | Observed result |
|---|---|
| Full backup to existing SAF folder | Completed with the verified-content notice and updated last-success time. |
| Cancel the folder picker | Back navigated up to its root before cancelling. The original folder remained selected; actual cancellation produced no error alert. |
| Restore the current full archive | Confirmation and passphrase flow completed; success included the retained local safety copy. |
| Force-stop and cold-open the follow-up editor | Exact unfinished reason and partial date/clock returned with the recovered-draft notice. |
| Open Upcoming follow-ups | The published follow-up remained with its expected date/time, channel and priority. Denied notification permission remained visible; no alarm-delivery claim. |
| Create another full SAF backup after restore/reopen | Completed and independently authenticated and compared below. |

An immediate dump during key derivation could not reach an idle UI; the later
settled success dialog was the acceptance evidence. Back within the picker first
navigated its folders; those intermediate states were not counted as cancellation.

## Independent round trip

The ignored QA decoder uses Node scrypt/AES-GCM, separate archive framing and
entry-length checks, and sql.js integrity/foreign-key checks. Its ASCII fixture
passphrase does not independently validate every Unicode passphrase scheme.

| Full native archive | Bytes | SHA-256 |
|---|---:|---|
| Before restore | 2,945,074 | `a12ed4cb708f6e8f586aa1a7318d3029beb5d30060b88be6327b8a36db50585a` |
| After restore and cold reopen | 2,945,074 | `81075d871793a5586dd2877b33535048beec5086f337862a3e656fc5a0588326` |

Both authenticate three chunks, report schema 19 and contain 40 application
tables plus `__drizzle_migrations`. Integrity is `ok`, with no foreign-key errors.
All 37 application tables outside audit/backup/settings compare exactly, including
the full follow-up/reminder rows, raw follow-up drafts and clinical/media links.
Empty tables are included in that count; this is one small synthetic dataset.
Audit, backup runs, device settings and migration bookkeeping are excluded from
the equality claim. The original WAV remained 2,240,044 bytes, SHA-256
`9a25d920bbbb9dc8b37759cb2310f937fb04f1b5567ed6602b8ec8e57aca5cb6`.

## Reproduced gap and limits

Before upgrading, a separate probe against installed 0.11.11 typed an unsubmitted
ward, confirmed the exact visible text, then force-stopped and cold-opened the
correct encounter route. The text was absent. This is a manual-form recovery
gap, not loss after an autosave acknowledgement. A first incorrect deep link
and transitional UI dumps were excluded. New encounter-draft source work needs
its own version, artifacts and native evidence.

No physical phone, native concurrent-import/encounter races, software-IME or
gesture coverage, delivered alarms, critical file-swap/commit interruption,
power loss, full disk/provider grant loss or second-device recovery was tested.
Ordinary clinical writes, old editors and generic photo/voice workflows versus
restore remain open. This release is not complete-product or clinical acceptance.
