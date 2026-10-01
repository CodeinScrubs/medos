# 0.11.11 validation

This slice persists the unfinished follow-up form separately from clinical work.
It retains raw date/clock input, the original encounter context and an explicit
publication token. It does not schedule a reminder or publish a follow-up merely
because the draft autosaved.

## Source and software evidence

- Application source `a30ca5bcc253f3449f5a23b621fa9eb885976a85`, version
  0.11.11 / code 27. Baseline: 85 suites / 998 app tests + 3 workflows.
- Final `npm run check`: 87 suites / 1029 app tests + 3 workflows; typecheck,
  lint and formatting passed. Pre-push validation repeated this complete gate.
  [Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36861055438)
  completed successfully.
- Migration 0018 adds `follow_up_form_drafts`; 40 tables / 19 migrations.
  Migration regeneration produced no schema diff. Existing migrations and
  backup/passphrase schemes were not changed.
- Real migrated-SQLite and component-handler tests cover raw recovery, failed
  writes and retry, guarded/background flush, stale comparison, confirmed
  load/discard, captured encounter ownership and atomic idempotent publication.
  They also cover SQL rollback, native reminder denial and older backups missing
  the new table. These tests use native stand-ins, not Android lifecycle evidence.
- Three failing local-schema witnesses reproduced false schema-zero metadata.
  Failed/missing/zero local migration reads now refuse the operation. Historic
  manifests, including scheme-compatible schema-zero archives, remain readable.
- No dependency, permission, route, clinical tool or credential-vault gate added.

## Signed artifacts

Both intended builds use the application source above without intervening
application-source edits. Documentation and private probes do not change the APK.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.11.apk`, arm64-v8a | 52,734,779 | `98bdd7d6845107abc66aa898c1cdb4ae8fe25c2d8bfe267405574404bb8b50e9` |
| Separate x86_64 emulator APK | 54,343,106 | `9eb23510fd4b57e57ddec492fad22310ed30aa991756128c2355b1fac6a724b1` |

- Owner build succeeded in 14 minutes 12 seconds. Native-library gate passed;
  actual package `com.shayan.medos`, code 27 / version 0.11.11, ARM ABI only.
- APK signature verification passed; certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches preceding releases. No key is published.
- Emulator package passed the same ABI/library/version/signature gates. Pulling
  its installed `base.apk` reproduced the exact x86_64 hash above. It is kept
  under ignored `private/`; it is not the owner artifact in `dist/`.
- First clean emulator build failed explicitly at native-library/resource merge
  because the host C drive was full. Only generated `android/app/build` and
  `android/app/.cxx` outputs moved to local F-drive storage, with junctions at
  their original paths. No source, keystore, AVD userdata or app data moved or
  was deleted. The retry succeeded in 1 minute 44 seconds and passed the native
  gate. `prebuild --clean` may remove those local junctions; verify free space.

## Additional reproduced issue, outside this release's fix

A bounded private probe against this source changes a media file from three to
four bytes when its read handle opens, after the archive entry length was captured.
The real encryption/backup orchestration returns success; the resulting archive
then refuses restoration. The clinical database remains unchanged on that refusal.
One expected-refusal witness fails; a separate successful-creation/unrestorable-
archive witness passes. Native files are memory stand-ins, and KDF work uses the
existing orchestration test key. This is not a physical filesystem/power test.

Post-build source work adds exact entry-length checks and exclusion between whole
call-file jobs and backup/restore/recovery. These changes are **not in the signed
0.11.11 packages above**. Ordinary clinical writes, other media workflows and old
loaded editors require separate restoration acceptance; a call-file lease alone
does not prove those safe.

## Native protocol

Isolated owned AVD `MedOS_Restore_0_11_10_F`, Android 16 / API 36.1, x86_64,
1080 x 2400 / density 420, Asia/Tehran, font scale 1.0, three-button navigation,
airplane mode and Wi-Fi off. Fabricated data only. Upgrade from 0.11.10 retained
the patient, drafts, call journal, original WAV and SAF folder/key configuration.
Measured fresh XML bounds drove each action.

| Check | Observed result |
|---|---|
| Save acknowledgement then force-stop/reopen | Exact reason and incomplete raw date `1405/08/` / clock `2:` returned with the recovered-draft notice. |
| Publish invalid raw fields | Existing validation dialog refused publication; reason/date/clock remained. |
| Correct date/clock, visit channel and high priority, then publish | One pending follow-up, expected date/time and choices; route returned without an observed header crash. |
| Deny Android notification permission | Clinical record remained; its card showed the reminder unavailable and a retry action. No alarm-delivery claim. |
| Close unfinished form and reopen | Reason recovered. Cancelled discard retained it; confirmed discard retired it. Cold reopening was blank. |
| New incomplete draft, full SAF backup | One published follow-up plus its retired draft, the discarded draft and one live raw draft; original media included. |
| Restore 0.11.10 full archive lacking the new draft table | Restore completed; cold opening had no draft from the replaced dataset. |
| Restore current 0.11.11 archive, cold reopen | Exact unfinished reason/date/clock recovered; upcoming list contained one published follow-up with expected channel/priority/time and unavailable reminder. |

The default `/followups` route intentionally lists work due today. The future
fixture appeared under `/followups?mode=upcoming`; its absence from today's list
was not data loss. Transitional dumps, a boot System UI ANR, a not-yet-booted
install refusal and early typing attempts without settled field focus were
excluded. Final raw-recovery assertions used confirmed exact values.

## Independent archive and database comparison

An ignored Node decoder uses Node scrypt/AES-GCM and separately checks header
authentication, nonce/chunk ordering, archive framing, entry lengths and SQLite
integrity/foreign keys. This fixture uses an ASCII test passphrase; it is not an
independent test of every Unicode passphrase scheme.

| Full native archive | Bytes | SHA-256 |
|---|---:|---|
| Current fixture before restore | 2,945,074 | `871f24ffb92cf4082dbf0cefe7f69622aa10a607e637e2e3671db9a3f1c79e07` |
| Fresh full backup after old/current restore and cold reopen | 2,945,074 | `2aa66581011632af1d2413050c47fd59fb7a106c405afffe60b86cadc66ba5cb` |

Both authenticate three chunks, report schema 19, include 40 application tables
plus `__drizzle_migrations`, pass `PRAGMA integrity_check` and have no foreign-key
violations. Nine clinical/draft tables compare exactly: patients, notes,
note_versions, note_drafts, patient_form_drafts, tasks, attachments, call_imports
and follow_up_form_drafts. All follow-up clinical fields also match, and there
are **no** differences in its reminder bookkeeping fields. Device backup state
and audit history are intentionally outside that equality claim.

The sole original WAV is 2,240,044 bytes, SHA-256
`9a25d920bbbb9dc8b37759cb2310f937fb04f1b5567ed6602b8ec8e57aca5cb6`,
identical in both archives and the preceding native fixture.

## Limits

No physical phone was connected. Software-IME actions, swipe-back, native alarm
delivery/reboot/battery, critical media-swap/commit or power-loss interruption,
full-disk/provider grant loss, concurrent ordinary editors/imports during restore,
all other forms and clinical validation remain open. These native results belong
to source `a30ca5b`, not subsequent unbuilt source fixes.
