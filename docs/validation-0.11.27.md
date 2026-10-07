# 0.11.27 — acknowledged consultation and faithful compact results

## Scope and baseline

Baseline is clean `466a1a886bba55b05defed59a1b741c7f7e21b5d` (0.11.26),
matching origin/main. Its exact-source CI `37573104289` was directly verified
completed/success. Standalone 0.11.26 native acceptance had not run before the
owner prioritized PR review; the 0.11.27 application retains that source slice.

The primary agent worked solo. No remote PR was merged, approved, closed or
commented on. Full five-PR findings, exact heads, evidence and product acceptance
criteria are in [project-audit-2026-10-07.md](project-audit-2026-10-07.md), with
synthetic repeatable review witnesses under `docs/reviews/2026-10-07`.
Private logs/native QA artifacts remain ignored under `private/validation-0.11.27`.

Production changes are deliberately small:

- Consult-answer routes ignore later taps/field changes only after acknowledged
  clinical publication. SQL failure still permits retry. Navigation failure is
  reported as a saved reply with failed return, not a failed clinical save. Keep
  the original generation lease and always-on exit guard, with acknowledged
  `acting.current = false` before navigation.
- Patient summary labs retain their recorded unit; missing units stay explicit.
  The row header identifies the latest sample, while results from older relative
  time groups show their own age. Values, flags, reference ranges and stored
  timestamps are unchanged. Existing held-order labels/overflow remain intact.
- Failed SMS/WhatsApp/Telegram opening asks the user to copy the message; it no
  longer asserts a clipboard copy that the helper never performed.

No new dependency, route, migration, permission, archive/key scheme, clinical
formula, telemetry or normal-path confirmation is added. Version is 0.11.27 /
Android code 43. Only the specified three lock version fields change.

## Reproduction and software checks

Eight new app tests cover acknowledged duplicate/late-input suppression,
separate navigation failure, real SQL publication failure/retry, recorded/missing
units, mixed-age laboratory values, and two external messenger failure messages.
They use real bundled migrations/SQLite for clinical state; navigation/linking
are stand-ins. An initial older-result assertion expected “2 days ago” instead
of the established relative-calendar wording. It was corrected to the existing
helper's “the day before yesterday”; assertions were not weakened to omit age.

The finalized pre-fix tests were then rerun in an isolated checkout on unchanged
0.11.26 production source: seven failed / thirteen passed / twenty total, with
no timeout or harness exception. After fixes all twenty passed in three suites,
including existing retry/restore/exit cases. No native outcome is inferred.

The published PR witness installer was also exercised on the unchanged local
integration. Initial missing/duplicate test imports were installer defects, not
PR evidence; they were corrected before its final run reproduced the same
24 failed / one passed / 22 skipped checks. A second installation refused
duplicates before writing. These fixtures stay outside ordinary app CI.

## Release gates

The final full `npm run check` passed: typecheck, lint with zero warnings,
formatting, 118 suites / 1515 app tests and three workflow tests. The complete
run is retained in `check-final-source.log`. The witness installer also passed
Node syntax checking and its isolated installation/refusal exercise. No
application source changes follow this gate before bundling.

A fresh GitHub `--state all` inventory confirmed exactly five open PRs, each at
the reviewed head above, with none merged. Remote main still matched `466a1a8`
before checkout. Application commit/CI, signed packages and native acceptance
will be entered after execution; those gates remain pending here.

## Remaining limits

This release does not adopt the proposed AI/referral/round/autocomplete features
as a group. It does not establish 40-patient speed, whole-product completion,
arbitrary prose anonymization, clinical content validation, actual message/alarm
delivery or physical-phone acceptance. Durable stopped-voice publication for
capture/new-note drafts, other raw recovery, interruption/low-space restore and
the complete workflow gates remain open in IMPLEMENTATION and the audit.
