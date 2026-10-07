# 0.11.29 — patient shift deck, recoverable occasions and calendar boundaries

## Baseline and intent

The owner requested another complete review, heavy-shift simulation and an
honest senior-developer/release handoff. Clean baseline was main/origin
`80dc57f0c2f71855513da05c679d06b1f10c917f`, 0.11.28 / code 44. Check-in passed
118 suites / 1536 app tests, three workflow tests, typecheck, lint and formatting.
All five open PR heads were refreshed and unchanged from the exact dispositions
in project-audit-2026-10-07.md. No PR was merged/approved/commented on. Work is solo.

## What changed and why

- A compact shift deck includes age/sex, ward/bed, Jalali admission/duration,
  impression, important note and next task. Today shows a small preview with
  inline expansion/search; the shift page reaches all 40 members without another
  navigation branch. Task/record/note links are direct. Hide optional handoff
  editors until requested; filtering keeps active editors mounted. Reorder is
  accessible, flushes pending text and atomically compares all live memberships.
- Resolve the next task, pinned encounter and member in one watched SQL query.
  Another episode/shift's task cannot become that patient's next action. A
  superseded episode with unknown discharge time does not show a fabricated
  continuing stay. Failed reads suppress completion claims and expose retry.
- Occasions previously had manual-only form persistence. Migration 0021 adds
  exact raw draft recovery, including incomplete/invalid dates and multiline
  templates. Validate publication, compare revisions/base, retire the raw draft
  in the same transaction, and make retry return the same occasion. Preserve
  original dataset ownership through delayed confirmation and native scheduling.
- Reminder failure is reported after successful occasion publication and is
  repairable; it cannot turn Save retry into a duplicate. All configured message
  channels fit in one sheet rather than Android's three-button alert. Handover
  is `ready`; only owner confirmation is `sent`. Prepared history cannot hide
  the last confirmed send. SQL retry does not reopen the external messenger.
- Strict Jalali parsing rejects garbage, fractional/out-of-range values and
  inconsistent separators. Unsupported stored dates remain visible as invalid
  raw input instead of crashing/clearing/rolling over. Annual Esfand 30 behavior
  is tested; lunar events default to one-off rather than pretending to repeat on
  the same solar date. Greeting substitutions preserve paragraphs and are not
  recursively expanded.
- Root patient read errors now invoke the existing retry, retaining Scope/input.
  The senior review guide removes stale counts/blanket portability claims and
  lists the relevant integrity contracts and acceptance commands.
- Version 0.11.29 / code 45. No new dependency, route, permission, framework,
  clinical formula, archive format or passphrase scheme. Two existing transitive
  dependencies receive compatible patches; one additive table is introduced.

## Software evidence

Before the changes, the clean check-in was green. New regression tests were
added alongside the fixes; they are not all claimed as separately run pre-fix
witnesses. The first complete post-change run exposed six integration failures:
old tests still assumed an always-visible handoff/manual occasion query, and a
real missing reminder-failure notice. The tests were updated to exercise the
new coherent query/editor opening while retaining failure/retry assertions;
failure-only reminder feedback was restored instead of deleting that assertion.

The corrected four-suite recovery run passed 106 checks. The first complete
green source run passed 124 suites / 1608 app tests plus three workflows,
typecheck and formatting. Two import-order warnings were then corrected. The
final versioned zero-warning check and exact-source CI are recorded below when
they execute; no later artifact is inferred from this intermediate check.

The versioned check repeated green with zero lint warnings. Final manual review
then added a doctor-title snapshot refusal and its regression (an unrelated
private-note edit still does not block handover). Final `npm run check` passed
124 suites / **1609 app tests**, three workflows, typecheck, zero-warning lint
and formatting. Regenerating Drizzle migrations reported no further changes.
Exact-source CI and APK execution remain independent gates below.

New checks include migrated SQLite transactions/CAS/rollback and actual React
handlers: 40-row search/direct destinations, hidden editor retention, failed
flush blocking collapse/reorder/exit, task join refresh, stale replacement intent,
occasion invalid raw recovery/background acknowledgment/retirement, comparison
conflicts, cancelled/delayed duplicate confirmations, reminder failure and
message opening/recording failure/retry. Native services/navigation are stand-ins
in these handler tests and are not device acceptance.

The accelerated 24-hour shift creates 40 patients, 960 tasks, 240 notes with
480 versions and 1,440 lab values; serializes 40 handoff savers per cycle;
injects a save failure and refuses navigation; reverses/stores the full order;
crosses Esfand 30 into Nowruz; and checks standing/current/historical episode
ownership. It restores the SQLite snapshot with identical application rows,
passes integrity/foreign keys and rejects the old autosaver afterward. This is
an accelerated software simulation, not a 24-hour Android battery/OEM soak.
An additional `TZ=Asia/Tehran` run passed its three selected suites / 54 checks
and exported only a private synthetic database for native acceptance.

Calendar tests compare the first and last day of every month in Jalali
1300–1500 (4,824 boundary comparisons) against independent ICU/Intl, plus
round-trips and leap/invalid syntax cases. The
[jalaali-js authors](https://github.com/jalaali/jalaali-js) document agreement
with Intl in the practical Gregorian 1800–2256 range and later divergence.
Neither an official Iranian astronomical-year authority nor lunar-calendar
conversion is claimed to be established by this test.

Private evidence is under `private/validation-0.11.29/`; no synthetic database,
decoded media, key or patient-like fixture is committed as release data.

## Dependency triage

Fresh `npm audit --omit=dev` reported seven underlying advisories propagated to
46 affected package entries (one critical). `npm update shell-quote
source-map-js --ignore-scripts --no-audit` changed only these two lock entries:
shell-quote 1.10.0 → 1.12.0, source-map-js 1.2.1 → 1.2.2, each within its existing
parent's semver range. No framework downgrade, override or force fix.

The subsequent scan has 44 affected entries (27 high, 17 moderate, zero
critical), corresponding to five remaining underlying advisories. Counts are
package propagation, not 44 independently exploitable Android bugs.

| Package/path | Primary advisory | Remaining assessment |
|---|---|---|
| shell-quote, React Native devtools | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | Patched compatible 1.12.0; advisory fixes begin at 1.11.0 |
| source-map-js, Expo Metro/PostCSS | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Patched compatible 1.2.2 |
| braces 3.0.3, Jest/micromatch | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | No patched published version at verification; bound build/test pattern input |
| decode-uri-component 0.2.2, router/query-string 7 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | 0.5.0 is ESM, while parent 7 requires CJS. Do not blindly override; runtime URL reachability/bounds need separate validation |
| node-forge 1.4.0, Expo CLI/code-signing tooling | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | No patched version listed; trace verification use in build/update tooling, not MedOS AES backup |
| sprintf-js 1.0.3, Jest coverage/js-yaml/argparse | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | No published patched latest; keep formatter inputs trusted/bounded in test tooling |
| uuid 7.0.3, xcode/config-plugins | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Major upgrade requires parent/API review; this is an iOS build-tool path, not MedOS `newId()` |

Advisories, parent dependencies and registry versions were checked live. Source
and bundle reachability must remain separate from the audit count; this patch
does not certify a clean supply chain or remove every advisory.

## Release and native acceptance

Signed arm64 APK, isolated x86_64 upgrade/40-patient navigation, independent
archive comparison, cold recovery and bounded crash/ANR evidence are pending
execution at this source checkpoint. Record exact source, signatures/hashes and
executed results here after testing; do not mark them passed in advance.

## Remaining release gates

The code is reviewable by a senior developer with AGENTS, HANDOFF, architecture,
IMPLEMENTATION and review-guide. A comprehensive review handoff is not the same
as sign-off for replacing paper. Physical A52s timing, Android/OEM reminder
delivery after reboot/permission changes, interruptions/low storage, durable
stopped voices for new note/capture, manual lab/contact raw recovery, remaining
trash/move/rich-text/workbook/transcription flows, independent clinical review
and a measured owner shift remain explicit gates. No tests or emulator run
can honestly guarantee that every possible crash is absent.
