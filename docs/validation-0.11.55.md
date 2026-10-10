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

## Deliberate boundaries

Raw recovery does not implement permanent clinical correction history, broader
trash restoration, visual rich text or every product workflow. No physical
phone run, every-keystroke power-loss guarantee, clinical content validation,
alarm/Doze/provider acceptance or full timed 40-patient shift is implied. Current
remaining work is in `IMPLEMENTATION.md`; the phone is not the sole remaining
gate. No private fixture, patient data, raw credential or signing key is published.
