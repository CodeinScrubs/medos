# Validation scope: 0.11.19

Version 0.11.19 / Android code 35 repairs the authenticated native AES output
capacity boundary discovered during API 26 restore and enforces immutable null
owners for recording journals. No dependency, permission, schema, archive format,
writer or passphrase scheme changes. No new screen or feature.

## Reproduction

The 0.11.18 API 26 SAF restore and direct native JCA output-count probe are
documented in [validation-0.11.18.md](validation-0.11.18.md). Before implementation,
the localized authenticated-provider/format and migrated-SQLite witnesses ran
three suites: nine new cases failed, 82 cases passed. A real WebCrypto decrypt
authenticated before the test wrapper reproduced the observed extra capacity;
the global native stand-in was not weakened. The null-owner witness changed a
generic capture's patient during the async copy, reproduced mismatched journal/
attachment ownership, and is not a failure in the current enabled patient UI.

## Software and native gates

`npm run check` passed typecheck, lint, formatting, 101 suites / 1302 app tests
and all three workflow tests. An initial typecheck caught a test cleanup callback
returning Jest instead of void; it was corrected before the successful full gate.
The normal push hook repeated the full gate. The first network upload failed an
SSL handshake after checks passed; a command-local proxy/HTTP 1.1 retry repeated
the gate and pushed successfully. Exact application commit
`059c686932668f1472a849c77d9b9df0beea3512` passed hosted CI
[37130150766](https://github.com/CodeinScrubs/medos/actions/runs/37130150766),
including migration regeneration without a diff and Android bundle export.
Two read-only reviewers found no actionable regression in the implementation
diff; neither ran tests, builds or native operations.

Tests cover exact/extra-zero/invalid native output sizes, preserved real trailing
zeros, empty final chunks, independent AES interoperability, frozen key schemes,
auth failure with changed ciphertext/tag/key/AAD/nonce/index/last flag, unchanged
multi-chunk archives and the exact-boundary empty final chunk. Recording tests
cover canonical null ownership after source read, copy and ready publication,
refused reattachment, retained bytes and successful replay after context restoration.

## Signed artifacts

Both artifacts were built from `059c686`, inspected for their required native
libraries and ABI, and passed signature verification. Package version/code is
0.11.19/35, min SDK 24 and target SDK 36. They retain the release certificate
SHA-256 `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `dist/MedOS-0.11.19.apk`, arm64 only | 52,829,031 | `5a64d1bb300c7eb3f48d45a518794c9b7e69e5409ecd03167f99d36c0b87d5da` |
| Private isolated-emulator APK, x86_64 only | 54,437,358 | `7aa91b2d6ea7e73f4f81ac6871e742b00b58397d662fa0a52be5a73304fcc0ee` |

The installed base APK was pulled back from both isolated emulators and matched
the inspected x86_64 artifact. Installation used `-r`; no app data was cleared.

## Offline native restore and preservation

Only synthetic QA records were used. An isolated rootable API 26 emulator ran
the actual SAF picker/passphrase/restore screens with airplane mode enabled.
The original independently authenticated 0.11.17 and 0.11.18 archives both
restored successfully, including the archive that failed on 0.11.18 before this
reader fix. A wrong passphrase was rejected; the prior attachments, recording
jobs and staged-file hashes were unchanged in an independent native read probe.

After each successful restore, a complete backup was written through SAF and
independently decrypted with Node AES-GCM. Real SQLite comparisons excluded only
audit, backup-run, device-setting and migration bookkeeping tables:

| Source restored on API 26 | Clinical/application rows | Source media | New full archive |
|---|---|---|---:|
| 0.11.17 | All 38 source application tables preserved; 37 exactly equal | All 13 files have identical sizes/hashes; original WAV retained | 9,035,469 bytes |
| 0.11.18 | All 39 source application tables preserved; 38 exactly equal | All 15 files have identical sizes/hashes; original WAV retained | 10,793,983 bytes |

The remaining table in each comparison is `follow_ups`: its clinical fields are
exactly equal; only a previously null `notification_id` became its canonical
native reminder id during restore reconciliation. The comparison explicitly
allowed that single metadata transition, not arbitrary row differences.

One known file from the preceding controlled fault dataset remained unreferenced
on API 26 after restore. Its pre-existing bytes/hash were unchanged; restore does
not implicitly purge other owned media. That explains the larger archive sizes,
and is not an additional published voice or new unknown file. Comparison checks
allowed only that exact prior file. The old empty unreferenced media entry also
remained unchanged. SQLite integrity passed and foreign-key checks were empty.
All 14 referenced voices from the restored 0.11.18 dataset were fully decoded by
FFmpeg; this is file playback evidence, not physical microphone validation.

On the separate modern emulator, offline upgrade from 0.11.18 retained all
**39 application tables exactly**, all 14 attachment rows, both recording jobs,
and all 15 media paths/sizes/hashes. The new SAF full archive was 6,474,457 bytes;
all seven chunks authenticated independently, SQLite integrity/FK checks passed,
and all 14 referenced voices decoded fully. The backup UI reported destination
content verification. No new recording was added during this preservation check.
After another cold reopen, the gallery showed 14 voices; playing an existing
voice exposed the native Stop control, which was tapped before shutdown. This
does not measure physical audio output quality.

Private logs, UI hierarchies, archives, decode/comparison results and media are
under `private/validation-0.11.19/`, never public repository fixtures. API 26 used
one bounded fast accessibility dumper because idle detection was unreliable;
only one native automation operation ran at a time. The modern cold boot initially
showed a System UI nonresponse dialog; waiting and using the correct singular
`/patient/<id>` route allowed the acceptance flow. This was not an app crash or
successful acceptance of the initially mistyped deep link.

## Still open

This is bounded old/current archive and upgrade acceptance, not complete backup,
dataset, voice or physical-phone acceptance. Durable raw note/quick-capture voice
targets, active/pre-journal/source-cache interruption, ordinary writes/old
editors/photo work versus restore, raw manual forms,
original-before-crop, low-space/power behavior and broader clinical workflows
remain separate gates. See `IMPLEMENTATION.md` for delivery priorities.
