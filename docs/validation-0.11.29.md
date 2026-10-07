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

Exact source is `1fb86ffffbeeb49f3abb4502d8844676ee160c58`. Its
[GitHub CI run](https://github.com/CodeinScrubs/medos/actions/runs/37647712032)
completed successfully, including clean-install checks, migration regeneration
and the Android bundle. The arm64 `npm run apk` completed in 13m29s; a separate
x86_64 build completed in 5m29s. Native libraries, package/version/ABI and release
signature were inspected rather than inferred from Gradle success.

| Artifact at this checkpoint | Bytes | SHA-256 |
|---|---:|---|
| Signed arm64 0.11.29 / code45 | 52,924,119 | `167ba5a8c59354d297d4126be6f4f982c21fe563ae05ed2bbc777034ee1bd42b` |
| Private signed x86_64, same source | 54,532,446 | `e46b429bd9e55a563fa4892ae8bfe40fdf3e81ee6a65ed131dc92c527f8013f1` |

The signer certificate SHA-256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`,
matching the previous release. The x86 build never went to dist. Pulling the
installed base APK established exact agreement with the inspected x86 artifact.

Native acceptance used the separately owned API36.1 x86_64 AVD on
emulator-5556, Tehran timezone, airplane mode with mobile data/Wi-Fi off. No
physical phone was attached and no app data was cleared/uninstalled. A full
native SAF archive was taken on 0.11.28 before an in-place `adb install -r`
upgrade. Independent Node AES-GCM/scrypt authentication/decryption and SQLite
comparison of fresh before/after archives preserved all **135 original rows in
39 application tables and all 18 media files byte-for-byte**. The new draft
table was empty; 22 migrations, integrity `ok`, no foreign-key violations.
Operational settings/audit/backup/migration bookkeeping was excluded explicitly.

An encrypted private fixture retained that database/media and added the software
heavy-shift rows: 40 synthetic patients, 3,884 additional rows, 4,019 total
application rows in 40 tables. Native SAF restore acknowledged 41 total patients
(40 new plus the original) and 18 files. A fresh native full archive independently
matched all 4,019 rows and all 18 media hashes, with integrity and foreign keys
clean. No native reminder-column differences occurred. The fixture's clinical
times remain March 2025; opening it now does not simulate a real-time 24h shift.

All 40 intended patient routes opened with the correct identity and the same
process id throughout read stress. The crash buffer was empty afterward. Maximum
action-to-fresh-hierarchy time was 6,666ms, including ADB/UIAutomator, so it is not
an app-render timing measurement. Recorded PSS was 467,496KB; software-rendered
emulator gfxinfo reported 1,633 janky frames out of 1,925 (84.83%). Forty stacked
deep links and software rendering are not a normal phone benchmark. These
numbers do **not** prove smoothness; physical-device timing/profiling stays open.

Native occasion checks verified acknowledged title and exact invalid date
`1404/12/30` after force-stop/cold reopening, refusal to publish that invalid
date, corrected `1403/12/30` publication and the visible next annual occurrence
on Esfand 29 of non-leap 1405. The native message sheet/copy/close worked; no
external message was sent. Scheduling permission was exercised, not actual
future notification delivery. The final native checkpoint retains an additional
unsubmitted raw occasion for the next in-place upgrade test.

Two findings from native work are addressed by **0.11.30**, not by these APKs:
the shift header wastes space (duplicate top inset/large administrative controls),
and an old form's delayed native acknowledgment can globally pop a newer deep
linked screen. The navigation witness fails on 0.11.29 and is tested again after
the fix. See [validation-0.11.30.md](validation-0.11.30.md).

Harness limitations are retained: early AVD boot produced a System UI ANR on the
old app version, not a MedOS crash, and that attempt was not accepted as stable
startup. Early restore polling expired before its later successful acknowledgment.
The fixture initially had no doctor; one was created through the real UI. One
label-based input helper selected the wrong flattened native field; the date
test was repeated with the exact observed field/hint and acknowledgment. No
failed harness attempt is counted as a passing application check.

For decode-uri-component, installed Expo Router's linking uses its forked
getStateFromPath and URL.searchParams for parsing. The old React Navigation
parser still imports query-string.parse; current output formatting uses
query-string.stringify. This is a bounded source trace, not proof that every
bundle/deep-link entry point avoids the advisory. No incompatible ESM override
was applied.

## Remaining release gates

The code is reviewable by a senior developer with AGENTS, HANDOFF, architecture,
IMPLEMENTATION and review-guide. A comprehensive review handoff is not the same
as sign-off for replacing paper. Physical A52s timing, Android/OEM reminder
delivery after reboot/permission changes, interruptions/low storage, durable
stopped voices for new note/capture, manual lab/contact raw recovery, remaining
trash/move/rich-text/workbook/transcription flows, independent clinical review
and a measured owner shift remain explicit gates. No tests or emulator run
can honestly guarantee that every possible crash is absent.
