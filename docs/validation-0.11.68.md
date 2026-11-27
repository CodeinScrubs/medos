# Validation of ward intake (0.11.68)

This candidate is based on the combined trees of [PR 18](https://github.com/CodeinScrubs/medos/pull/18)
at `7269edd` and [PR 19](https://github.com/CodeinScrubs/medos/pull/19) at `4d6f4b0`,
including the calendar change from [PR 17](https://github.com/CodeinScrubs/medos/pull/17).
PR 19 had branched before the last fixes in PR 18. The integration keeps both
the corrected test fixtures and the workflow plan. Android versionCode is 84.
The app source is `1ea3f8b5c6d07fb95692390c839ce074b49d4eae`.

## Failure and repair

The previous batch was atomic on insert failure but checked only patient
IDs from the button's last render. With 40 synthetic patients already on the
shift, two mounted-screen tests added a 41st member when they should have
added none. One introduced a new eligible admission before the live refresh.
The other replaced the displayed patient's encounter while leaving the same
patient ID and admitted status.

The existing button now captures patient and active admission together. Its
transaction checks that the open shift still matches, every shown episode is
still current, and every unlisted eligible patient is already on the shift.
It keeps the shown order and existing member rows. Conflict refreshes the
list, displays a short notice and leaves the next tap to the physician.
Single-patient pick remains available. The shortcut covers all current
admissions across the directory, as before.

## Evidence

- Before the fix: both new mounted-screen checks failed on real migrated
  SQLite. After the fix: 91 checks passed across shift queries, the rendered
  shift deck and Jalali tests, including rollback after a rejected insert,
  idempotent retry, admission replacement and refreshing the count.
- The unchanged 0.11.65 standalone check initially timed out in the Kardex
  editor and lab screen suites. Both passed when isolated: 87 tests.
  A second parallel run also hit the Kardex test deadline. The two cases in
  its deferred lookup test retain their assertions with a 15-second deadline.
- Full `npm run check` passed on 0.11.68, including typecheck, architecture
  lint, formatting, 197 Jest suites with 2,956 app tests, and five workflow
  tests. The accelerated SQLite shift covers 40 synthetic patients, 24
  simulated hours, 1,440 lab values, Jalali year rollover and restore.
- The earlier owner APK was re-inspected locally. Its 0.11.65/code 81
  manifest, arm64 libraries, certificate and SHA-256 match its
  [frozen report](validation-0.11.65.md).
- Drizzle reports no schema changes and leaves bundled migrations untouched.
- GitHub reported passing current CI for PRs 17–20 when checked on
  2026-11-27. [PR 20](https://github.com/CodeinScrubs/medos/pull/20) is
  standalone CI maintenance with CodeQL and Dependabot. The PR body defers
  Dependency Review. GitHub reported main at 0.11.50 with protection off
  and an empty active ruleset list.
- The heads of PRs 1–5 still match the
  [October audit](project-audit-2026-10-07.md). Its existing findings continue
  to apply to those proposals. The newer CI badges do not assess their
  compatibility with this integrated candidate.

## Remaining acceptance

Test the current candidate's signed upgrade and bulk button on Android.
Measure an offline 40-patient shift on the owner phone and exercise
capture, note recovery, original images and editing, calendar reminders,
backup destination and restore. The accelerated SQLite workload exercises
the state transitions under simulated shift time. Phone latency, notification
delivery and physical recovery remain to be measured.
The wider workflow and clinical review gates are in the
[execution ledger](IMPLEMENTATION.md).
