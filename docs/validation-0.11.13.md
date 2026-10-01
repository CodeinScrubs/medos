# 0.11.13 validation

Raw admission/edit/discharge input is persisted separately from clinical state.
Publication validates the saved raw document and clinical context, then applies
the effect and retires its retry token in one synchronous transaction.

## Source and software evidence

- Application source `947d0b4397e4944e5709969da81205d323fa4835`, version
  0.11.13 / code 29. `npm run check`: 90 suites / 1098 app tests + 3 workflows;
  typecheck, lint and formatting passed, including repeated pre-push validation.
  [Exact-source CI](https://github.com/CodeinScrubs/medos/actions/runs/36889531190)
  succeeded, with its head SHA checked.
- Additive migration 0019: 41 application tables / 20 migrations. Regeneration
  produced no further schema change. Existing migrations and backup/passphrase
  schemes remain unchanged. No new dependency, permission, route or menu.
- Migrated-SQLite/component-handler tests cover raw invalid fields in all modes,
  retry/flush/read recovery, rapid changes, scope/revision/clinical conflicts,
  confirmed load/discard, deleted parents/destinations, atomic rollback,
  publication replay and current/older table-absent backups. Native APIs are
  stand-ins in those tests. Draft revision is not clinical-field history.

## Signed artifacts

Application source remains frozen for both builds; documentation/private probes
do not change the application bundle.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.13.apk`, arm64-v8a | 52,779,663 | `ec8566a66152232b49fbba93cb161350f23b5cc32f8fb8e58837a7248e8cb2f0` |
| Isolated emulator package, x86_64 | 54,387,990 | `ee4f45a3ff38938892186bd05fa75687fe478333627d4485c82045fc1e54c0f3` |

- Owner build succeeded in 10 minutes 49 seconds. Actual package
  `com.shayan.medos`, version 0.11.13 / code 29, arm64-v8a only; essential
  native-library gate passed.
- Signature verification passed, certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`,
  matching preceding packages. Generated build/CMake outputs reused verified
  local F-drive junctions after prebuild recreated Android. No app data reset.
- Emulator build succeeded in 6 minutes 1 second; actual package/version/code,
  x86_64-only ABI, essential native libraries and signature passed. Installed
  with `adb install --user 0 -r` over 0.11.12 without clearing data. The pulled
  installed base APK hash equals the pinned emulator package above.

## Bounded native protocol

One owned isolated Android 16 / API 36.1 x86_64 emulator, airplane mode, Tehran
time zone and three-button navigation. All input is synthetic; native UI actions
use fresh XML bounds. No physical phone or microphone/camera acceptance.

- New admission: exact ward plus incomplete raw date `1405/07/` and clock `2:`
  survived force-stop after the visible save acknowledgement. Invalid publication
  was refused. Corrected date/time published one active admission; it appeared
  on Today and the patient's encounter card.
- Edit: CC and both incomplete date/time fields survived acknowledged force-stop.
  Corrected publication updated the same encounter. The independent archive
  contains exactly one encounter with the expected ward/CC and two retired
  new/edit draft tokens; it does not contain a duplicate encounter.
- Discharge: outcome and raw incomplete date/time survived acknowledged
  force-stop. Invalid publication was refused without closing the admission.
  After the backup round trip below, corrected publication closed the encounter
  and changed the patient to discharged. The existing open task stayed open.
- Discharge controls were exercised at system font scale 1.3 in dark mode;
  screenshot inspection and actual tap confirm the publish control remains above
  the three-button bar. Font scale and night mode were returned to their baseline.
- Two automation issues were corrected before continuing: an initial cold dump
  can precede query completion, and a vertical swipe over a multiline input
  scrolls that input. Bounded fresh dumps and the observed form gutter resolved
  them. Neither is evidence of application failure. A busy restore also temporarily
  refused an idle UI dump; its later success dialog was checked independently.

## Actual backup round trip

Full backup through the configured Android SAF folder, old/current restoration,
cold reopening and a fresh full backup completed on that same isolated device.

| Archive | Bytes | SHA-256 |
|---|---:|---|
| Current 0.11.13 | 2,961,458 | `e5ea76116a7119fadd2707e7b0d5f6b838a9cdeda9ddd4ca4530d5e83df6be78` |
| Fresh backup after restoration | 2,961,458 | `1cc6e079646b9c2259d298145deee4462c628d43bbe241ecd537bd1445da2d5a` |

- Independent Node crypto decoding authenticates all three chunks, archive
  framing, entry lengths and hashes. Both SQLite integrity checks return `ok`;
  foreign-key checks are empty. The manifest records 20 migrations / full media.
- The source archive contains the unpublished raw discharge draft, active edited
  admission, earlier raw patient/follow-up drafts, published records and audio.
- Restoring the preceding 0.11.12 archive (19 migrations, no encounter draft table)
  then cold opening the admission route produced a fresh form, without the newer
  ward or a recovered encounter-draft notice.
- Restoring the current archive then force-stopping recovered the exact raw
  discharge outcome/date/clock. A newly created full backup preserves **all 38
  application tables outside audit/backup/settings exactly**, including empty
  tables. Migration bookkeeping is excluded from clinical-row comparison.
  The original 2,240,044-byte WAV remains SHA-256
  `9a25d920bbbb9dc8b37759cb2310f937fb04f1b5567ed6602b8ec8e57aca5cb6`.
- Private XML/screenshots, artifacts, archives, independent decoder reports and
  comparison script stay under ignored `private/validation-0.11.13/`. This is one
  small dataset, not general acceptance of every size/provider/interruption case.

## Open reproduced media gaps

An ignored private probe against this exact source uses real migrated SQLite
and a file stand-in preserving the move/copy contract. Two expected-behavior
tests fail: after a rejected attachment insert, retrying the moved recording's
original URI fails; attachment publication for a soft-deleted patient succeeds.
The first attempt at running this outside the application failed to load SQL
imports; it was corrected to use the application's Babel config before either
behavior was observed. These are software witnesses, not native microphone or
filesystem evidence. They are not fixed by this release.

The installed Expo image-picker Android source also shows that native editing
returns the cropped asset URI; the attachment pipeline's retained "original" is
that returned asset. It cannot preserve the uncropped source through that path.
This is source evidence, not a native crop/clinical image-quality test. W08 must
preserve the source before editing without simply removing the requested crop.

## Limits

No physical phone, software-IME/gesture coverage,
alarm delivery, critical file-swap/commit interruption, power loss, full disk/
provider loss, ordinary editor/photo/voice-versus-restore or clinical acceptance
is claimed here. The bounded native results above do not complete the product.
