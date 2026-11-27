# MedOS 0.11.70 acceptance

## Source and artifact

| Item | Value |
| --- | --- |
| App source | `c82e04921b8be29c1cf94870e3a830f1f9809ebd` |
| Owner APK | `dist/MedOS-0.11.70.apk`, 53,584,779 bytes, code 86, arm64-v8a |
| APK SHA-256 | `76beff0aa420fc0c591be47307bd92ad1f099695aa51e0bcd15f29cedb656b88` |
| Signing certificate SHA-256 | `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c` |
| Embedded Hermes bundle SHA-256 | `64151e6cb6b254bf5b605e4235091e60f78b794928f2e911a61048a8772f6d04` |

`npm run check` passes 197 suites, 2,967 mobile tests and five workflow tests.
The pre-push gate reran the same checks. The accelerated 24-hour test crosses
Jalali New Year with 40 synthetic patients and verifies 960 tasks, 480 note
versions and 1,440 lab values. It exercises a deliberately failed handoff
write, retry, reordered rounds, episode ownership and a dataset replacement.
Its clock is simulated.

## Physical Android check

The Samsung Galaxy A52s ran a separately installed debuggable arm64 release
variant. Its Hermes bundle bytes match the signed owner artifact. The QA
variant changes the app identity, label, deep links and debuggable flag. The
main installation remained on 0.11.2 throughout, with no access to its data.

- Seeded a synthetic SQLite fixture from the prior migration level, then
  launched the app. Migration 0032 added nullable specimen and method. Seven
  fixture tables match the original columns except the expected startup
  search reindex and reminder acknowledgments. SQLite integrity and foreign
  key checks pass.
- With 42 memberships and 40 active patients, opening the shift and round
  shows the transferred patient's new ward/bed and current task. Searching
  for a previously discharged patient gives no active result. The existing
  shift task link reaches that patient's open work and still does so after a
  cold restart.
- Discharged the synthetic transferred patient through the form. The warning
  listed one open task. Active count moved from 40 to 39, the patient left
  the active search, the next patient opened in round, and the task list
  still showed both discharged patients' open work.
- Viewed and switched between the separate ABG and VBG pH groups. Three
  excluded values are shown as raw rows below each respective two-point
  chart, including a legacy panel with an ambiguous specimen.
- No fatal crash was present in the accepted QA process crash-buffer check.
  The app's bounded native acceptance does not measure an entire ward round.

The first Windows ADB binary stream truncated the synthetic fixture before
launch. Seed transfer succeeded after ASCII encoding and verification of the
exact bytes. The first row comparison exposed the documented startup
maintenance edits, which were then checked independently.

## Remaining acceptance

The primary APK was inspected and kept local. A production in-place
upgrade, physical whole-shift timing, complete encrypted archive restore,
image markup, and Android alarm delivery across reboot/Doze still require
separate verification. The synthetic checks do not approve a clinical
calculator or the outstanding per-item discharge reconciliation.
