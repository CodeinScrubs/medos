# 0.11.55 — remaining workspace form recovery

Android application 0.11.55/code71 on `codex/remaining-form-recovery`, starting
from delivered PR7 `3d458ab`. The primary owns integration and verification;
two authorized GPT-6.1 Sol extra-high agents implement disjoint knowledge/place
changes. No dependency, route, permission, SQL migration or backup/KDF change.

## Scope and software evidence

- Specialty profile, personal prescription, place, extension and credential
  screens use the existing raw-document/CAS/publication lifecycle. Recovery
  links stay in their existing lists, with three-row cursor pages and a safe
  descriptive-field projection. No extra dashboard or recovery route.
- Exact partial text, secret whitespace, invalid expiry, tags and stable
  prescription-line keys recover independently of publication. A blank-drug
  line with other text refuses Save rather than disappearing. Invalid imported
  personal-fit ratings remain editable raw data and need explicit correction.
- Complete published-basis checks, synchronous feature/search writes, receipt
  retirement and required audits commit together. Failed domain/receipt audits
  roll back, including secret clearing and extension child-index updates.
- Unrelated credential edits retain plaintext/legacy payload exactly. Explicit
  replacement/removal clears legacy ciphertext/nonce. Secrets never enter search
  or recovery-list projections. Unchanged expiry milliseconds are retained;
  invalid visible text cannot publish the previous parsed date.
- Live parent/reference checks retain the existing deleted-place refusal and
  allow only an unchanged archived specialty. Original route/read/focus/dataset,
  one unconditional removal guard, failed-input retention, separate conflict
  adoption and native screen parents are exercised in mounted regressions.
- Replacement labels/choices cannot appear beside original raw fields, including
  knowledge children first mounted after replacement.

Baseline `3d458ab`: full root check succeeds with 166 suites/2,388 app tests and
five workflow checks (207.624s). Targeted vault tests first fail for absent raw
recovery and legacy-secret resurrection (two failures, 6.087s), before the vault
implementation; the shared kind union was already extended in that working copy.
The original vault code is unchanged from `3d458ab` in that negative probe.

Integration review adds three genuine failing regressions after the agents'
focused tests: two late-child replacement labels and an imported invalid rating
making the entire profile uneditable (10.425s). Corrected focused runs pass 63
tests across three suites (13.152s). Initial full source check passes171 suites/
2,471 app tests and five workflow checks (186.899s), with three import-order
warnings; those imports and integration defects are corrected before the final
full check. Scoped agent runs pass knowledge 4 suites/97 tests, places 3/41 and
the primary vault 3/30; these overlap and must not be added to a full-run count.

Final root `npm run check` passes 171 suites/2,474 app tests (203.895s), five
workflow checks, TypeScript, architecture lint and formatting, without warnings.
An earlier attempt stops at the test harness's `react/no-children-prop` lint rule;
the wrapper is corrected without suppressing the rule. Schema regeneration
reports no changes and migration files have no diff. Version/lock changes are
scoped; no dependency changes. Frozen-source native/artifact evidence is still
pending at this source checkpoint. Neither an earlier run nor .54's native/APK
evidence accepts this newer source.

Further source review reproduces six failing mounted regressions (10.672s):
the two knowledge specialty selectors appear enabled after completion, dataset
replacement or a read failure, although their mutations are guarded. Both now
pass the existing lock state into `SelectField`, disabling its picker and clear
controls with the same accessible state as the surrounding inputs. Recovery
of a read failure enables the controls again. Corrected full root check passes
171 suites/2,474 app tests (221.402s), five workflow checks and typecheck/lint/
format without warnings. Final-source native artifacts are recorded below when
completed; the earlier artifact is not reused.

## Frozen native acceptance

Final application source is `948883a30140c01c970416a06affbf3cb58d8cf1`.
The tracked source and HEAD stay unchanged during both builds. Unrelated,
untracked audit documents appear after the QA build; their private hash
inventory is preserved and none enters the application or this change.
QA uses only the owned x86_64 read-only AVD. Installed bytes are pulled back
and match the inspected APK. No physical phone or real patient data is used.

The five raw fixtures were initially captured on intermediate `bab597f`.
After an in-place upgrade, final source `948883a` is force-stopped and reopened:
PID 10591 becomes 10736. All five forms recover their exact partial fields,
including spaced text/password, invalid expiry, partial latitude/internal
number and a blank-drug prescription line with a dose. Final-source corrections,
publication and replacement below run in that retained PID. The intermediate
capture is not relabeled as final-source capture of every field.

An independent Node AES-GCM/scrypt decoder authenticates complete exports.
The oracle compares table names/schema and every field in all 50 application
tables, excluding settings, audit/backup bookkeeping and migration metadata.
It also compares all 34 media hashes and checks integrity and foreign keys.
These are intended-state comparisons, not count-only checks:

| Stage | Application rows | Result |
|---|---:|---|
| Intermediate .55 baseline (bab597f) | 4,117 | Every prior field and media hash unchanged |
| Final-source cold raw recovery | 4,123 | Five raw forms plus one separately created live parent; no domain publication |
| Invalid Save refusal | 4,123 | Invalid expiry and partial prescription line retained; no domain publication |
| Five separate publications | 4,128 | Exactly one record per form and five retired raw receipts; prior data unchanged |
| Old-backup replacement | 4,117 | Exact prior application state; no stale raw or published additions |

The original fixture has no places. A separate existing-picker creation supplies
one live hospital parent for the unfinished extension; it does not publish the
unfinished place form. The oracle explicitly checks that parent and permits no
other additions. Publication keeps password whitespace, clears corrected expiry
to null, preserves both prescription items and their exact dose text, and removes
only editor line keys. Each publication has its required ID-only audit; no
synthetic secret appears in audit contents. All five records are then observed
through their existing feature lists, including the knowledge tab's two sections.

A new credential raw form stays mounted through actual replacement by the old
.54 archive. After explicit restore completion/acknowledgment, its original
words remain visible in a disabled input with the stale-form notice; publication
is replaced by Close. The final authenticated application state exactly matches
the original 4,117 rows and 34 media hashes. Restore completion observation takes
95.425s from the helper's post-password observation point through acknowledgment;
polling/observer cost is included. This is not an isolated restore-phase or
target-phone performance measurement.

PID 10736 survives the checked publications, retrievals and restore. Its checked
crash buffer contains no fatal for that process; this does not establish a
crash-free app. After owned-emulator shutdown, its SDK processes exit and both
original userdata/encryption QCOW2 hashes are byte-identical. Private archives,
fixtures, raw credentials, UI dumps and harnesses remain uncommitted.

Authenticated archive SHA-256 values:

| Stage | SHA-256 |
|---|---|
| Upgrade | `38e66962b4fb001e825a4ad3e72d348ea8bf41cd6cd147afee1b531f4d15516e` |
| Final-source cold raw | `835fe64c361cdfeb8785df24ec6ba273a48320142ce28a4552640c1dbea2c5e5` |
| Rejected Save | `1340655ee5fe2c52f1cf8064c9cc3350dc1ea5a007c437ca96187da77f0a54b5` |
| Published | `3a889fe1377cda816439f5f760ab6e77dd1870e2fca2e13691f765f7e775b635` |
| Replacement | `7d25e00cc507c60530e5ebbaefc88d008413545bf7a361e3d4251c540faf3c3f` |

## Observation failures and remaining input diagnosis

Intermediate `bab597f` observation first encounters an actual System UI ANR;
the observed Wait action restores observation. A synthetic `input text` attempt
requests a whole name but displays only two characters while a host native build
is active. A later idle retry is exact, as are the accepted fixture and final
corrections. Neither successful retry proves why the mismatch happened. Keep
IME readiness, native event ordering and host/target pressure diagnosis open;
do not attribute it to the app, Android or the harness without stronger evidence.

Private observation attempts also fail on empty-input hints, flattened paired
columns, repeated prescription labels, incorrect scroll direction, an incorrect
knowledge-tab URL (`library` is the actual route), an assumed return destination
after a deep link and actionable-only selectors rejecting readable disabled
inputs. Corrections use fresh native XML/bounds and explicit observed values.
The initial publication oracle incorrectly expects a trimmed dose; existing
`cleanItems` and its tests already specify exact dose whitespace. Its expectation
is corrected without changing application behavior. Failed attempts remain
private evidence and are not counted as passing checks or application defects.

## Inspected packages

Both packages identify com.shayan.medos, 0.11.55/code71, minSDK24/target36,
retain signer SHA-256
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
and contain their essential JNI libraries. The final QA build succeeds in 6m46s
without an app clean; the owner build succeeds in 3m42s without an app clean.
Source attribution is 948883a; the older intermediate
owner artifact does not accept it.

| Package | Bytes | SHA-256 |
|---|---:|---|
| Private x86_64 QA | 55,058,274 | `d58969b7f01544a4b5a0769eab8a0f04362ce7217c36e035b19e5f2397224344` |
| `dist/MedOS-0.11.55.apk`, arm64-v8a only | 53,449,947 | `cb9f38f7a771c8f29e14a8f85d33e3cbd54edb91d1b78e0260464c7670f56c27` |

Existing Gradle deprecation, SDK XML and Windows CMake path warnings are not
claimed repaired. Actual ABI/library/package/signature inspection passes.

## Deliberate boundaries

Raw recovery does not implement permanent clinical correction history, broader
trash restoration, visual rich text or every product workflow. No physical
phone run, every-keystroke power-loss guarantee, clinical content validation,
alarm/Doze/provider acceptance or full timed 40-patient shift is implied. Current
remaining work is in `IMPLEMENTATION.md`; the phone is not the sole remaining
gate. No private fixture, patient data, raw credential or signing key is published.
