# Workspace-form raw recovery — 0.11.51/code67

This milestone connects the shared idea/topic recovery pilot to the actual
existing forms and lists. It does not complete D05 or MedOS release acceptance.
Current status is also recorded in HANDOFF and IMPLEMENTATION.

## Source and scope

Branch `codex/workspace-form-recovery` is based on `2dcd60b`. Application
version0.11.51/code67 adds migration0029 and its bundled journal entry. Existing
migrations, dependencies, Android permissions, routes and frozen archive/KDF
schemes are unchanged. Only workspace idea/topic ports are enabled. Clinical
draft stores, orders and permanent correction history are separate work.

## Reproduction and automated evidence

Before connecting recovery, three mounted-form regressions fail: unfinished
idea/topic words disappear after remount, and an acknowledgment after focus
loss closes another route. After implementation these regressions pass.
The harness uses migrated real SQLite and actual form/hook components, with
host UI/date/native stand-ins. It does not prove IME, headers or hardware.

The repaired starting check passes161 suites/2,275 app tests and five workflow
tests, including20 then-untracked shared-codec cases on the .50 base. The
initial connected five-suite run passes125 cases. A later targeted run passes
46 mounted/SQLite cases. Final `npm run check` passes163 suites/2,325 app tests
plus five workflows, with clean typecheck/lint/both formatting checks. This
includes the later foreign-document loading regression and selectable-raw
assertion. Jest completes in306.104 seconds with zero snapshots.
Regeneration reports no schema changes, with exact pre/post hashes for the
new SQL/snapshot, bundled migration JS and journal. Older migrations are untouched.
The first full attempt stops at formatting of the added restore cases; its
typecheck/lint pass. Formatting is corrected before the next full attempt.
Earlier renderer-observer failures from invalid act boundaries are preserved
privately; they are not asserted application crashes.

Coverage includes exact whitespace/tags/partial date text, strict future/foreign
document refusal, new/edit scope separation, complete-basis comparison with
equal timestamps, revision competition/overflow, single publication/replay,
deleted target refusal, atomic audit-failure rollback, soft discard, old/current
archive imports, background/Back recovery, read failures, same-id actual dataset
replacement, dialog/focus/route/read/unmount ownership, selected retired drafts,
bounded tied-time recovery pages, raw-only adoption and separate Save. Topic
publication uses visible dates and transactional teacher/specialty reads; unchanged
timestamps retain seconds/milliseconds. Malformed receipt replay cannot claim
publication. Unsupported raw documents stay selectable without a fresh form.

## Hosted and native evidence

Previous .50 final-head `2dcd60b` hosted CI38007035821 is successful, including
full checks, regeneration and the Android bundle. PR1–5 retain their previously
reviewed exact heads. Pilot `d1c0a5f` is pushed normally, attached as draft PR6,
and passes exact-head CI38011864223. Its frozen x86 build succeeds with essential
native-library inspection. This precedes the historical-reference correction;
it is not native acceptance of that later source.

One later real-SQLite reproduction shows that archiving a teacher/specialty
incorrectly blocks editing an already-linked topic. The correction retains
unchanged historical references and their search names, shows archived names
without making them picker choices, and refuses a newly selected unavailable
reference without changing the target, draft or audit. All51 targeted SQL and
mounted cases pass, including four new regression cases. Full checks then pass
163 suites/2,329 app tests and five workflows in172.951 Jest seconds. One test
import-order warning is corrected afterward and scoped lint is clean.
Regeneration reports no schema changes. The normal push hook subsequently runs
all checks on the corrected source without that warning:163 suites/2,329 app
tests and five workflow tests pass. Exact application commit `a541ce5` passes
hosted CI38013693701, including regeneration and the Android bundle.

### Frozen Android acceptance

The corrected `a541ce5` source is frozen before each build. An x86_64 release
copy is installed in place over .50 in the owned read-only QA emulator; the
pulled installed APK matches the inspected source artifact's exact hash.
The emulator is not the owner's phone. Its original userdata/encryption-key
image hashes match before startup and after the acknowledged shutdown.

Actual UI actions and explicit process-stop/cold-reopen boundaries verify:

- An untitled idea retains its exact leading/trailing spaces after acknowledged
  raw persistence, without final Save. The recovered field is not a new seed.
- A topic retains title, summary and incomplete visible Jalali text
  `1404/10/`. Save refuses that invalid date; independent export confirms the
  topic remains unpublished. Two distinct cold-reopen process boundaries pass.
- An existing topic retains archived teacher/specialty names, original IDs and
  original seconds/milliseconds during an unrelated body correction. Archived
  names are visible and absent from new teacher choices.
- Three short recovery links and older pages reach the intended oldest tied
  draft, not another draft with the same update time. A future-version raw
  document remains readable without an editable replacement. Native clipboard
  copying of that future document is not tested.
- Stale idea publication refuses. Comparison shows current and local words.
  Explicit adoption changes only the raw draft; an actual export before a
  separate Save proves the published body is still the newer body. Separate
  Save then publishes once and retires the chosen raw draft.

Independent Node AES-GCM/scrypt and sql.js decoding authenticates complete
archives, including media. Upgrade matches all4,117 existing application rows
across49 prior tables and all34 media files, with only the additive empty draft
table. The synthetic action fixture adds21 declared rows. Adopted and final
exports each match all4,141 intended rows across50 application tables and all34
media hashes, including unrelated records, raw drafts and id-only audits.
SQLite integrity is `ok` and foreign-key checks are empty. These are whole-set
comparisons, not sampled counts or an in-process staging assertion.

The retained application process is7356 throughout the final page selection,
publication and exports. Observed application fatal/crash/ANR buffers are empty
for those actions. Cold startup separately encounters a System UI ANR and
other emulator system-service/input-method ANRs. The actual System UI wait
dialog is acknowledged before MedOS acceptance proceeds. This does not prove
the absence of ANRs generally, explain the older .33 pressure ANR, or establish
40-patient latency or a hardware performance budget.

Observer failures remain private evidence: early empty accessibility trees,
an ambiguous flattened field locator, one incorrect harness deep link and one
exact-case input mismatch. Assertions refuse them; subsequent steps use actual
visible bounds, the existing `medos://library` route and exact synthetic paste.
No failed attempt is counted as a successful application witness. Fixture
restore completion is observed and acknowledged before later mutations.

### Inspected artifacts

Both packages are from `a541ce5`, package `com.shayan.medos`, version.51/code67,
minSDK24/targetSDK36. Essential JNI libraries and actual ABI are inspected.
Owner certificate SHA256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.

| Artifact | Bytes | SHA256 |
|---|---:|---|
| Private x86_64 QA package | 55,015,086 | `c75f4d4c1ed4fc822bd4fbacaa83b52615449464645fb7c8ace5b322eb67f261` |
| `dist/MedOS-0.11.51.apk`, arm64-v8a only | 53,406,759 | `7fa7839358d08a6cbba23dff46dec6f8e977ab458dbf5ae36e3f14ec367666da` |

The owner build succeeds in8 minutes after cleaning only the generated app
build for the ABI switch. Gradle future-version deprecation, Windows CMake path
and color-environment warnings remain; they are not asserted repaired.
The arm64 package is built/inspected but not installed on a physical phone.
Archive hashes: upgrade `16eb68434e49707e205e7233c9ff257aac90f47d4b92e4050bf33e66a653da16`,
adopted `9db3acb4073cfa0aed689bde1a11941757415eb80f9020c9aad9126f4d1df838`,
final `14ed3ea019456934c205ea56a65876a226b92460bc30d780e0ff250d10f54c3a`.

## Remaining gates

Six manual forms still need raw recovery: Kardex order, specialty profile,
prescription, place, extension and credential. Do not erase their context or
copy eight engines. Clinical ports must retain original patient/encounter,
including null, and require clinical ownership/basis checks.

Physical camera/audio/alarm/Doze/provider/power and second-device acceptance,
complete40-patient timing/pressure, restore/KDF phase measurement, nonfatal
native warnings, rich text, permanent clinical correction history/appropriate
trash, fuller shift/follow-up flows and validated clinical tools remain open in
IMPLEMENTATION. Only phone testing is not yet the remaining work.
