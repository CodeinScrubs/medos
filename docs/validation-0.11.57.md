# Lab ownership isolation and truthful retained forms — 0.11.57

Continuation on `codex/clinical-history-recovery`, application .57/code73,
based on .56 source `8ee111a`. No new dependency, migration, route, permission,
backup format or clinical formula. An independent read-only reviewer inventoried
the live result paths; the primary agent implemented and verified the change.

## Problem and contract

An imported result can satisfy foreign keys while naming a patient other than
its panel's patient. .56 may expose it in that patient's table/chart and blocks
the next start when strict correction-history capture refuses the mixed panel.
Three real-SQLite tests reproduce these failures before the fix.

- Keep the inconsistent panel, all its siblings and separately deleted children
  intact. Do not reparent, delete, guess ownership or manufacture their history.
- Reflag healthy panels in the existing synchronous transaction. Explicit owner
  defects are preflighted within that transaction; real SQL/history/storage errors
  still reject and roll back the whole pass. Aggregate audit contains counts only.
- Withhold all live results of a mixed-owner panel, including seemingly normal
  siblings, from the patient snapshot, flowsheet, trend and timeline preview.
  Parent panel/patient deletion also fences direct result reads. A separately
  deleted foreign child does not quarantine otherwise healthy live results.
- Keep panel metadata in its owner's list with a short conditional warning.
  Count affected panels for both named patients without reading foreign clinical
  contents. Child-only changes remain observable. No empty/photo-only or normal
  claim substitutes for the withheld results. An SQL read failure retains retry.
- Editor reads retain their original raw snapshot rather than silently filtering
  foreign rows into a clean/empty form. Publication/deletion remain strict.
  Reload validates the new clinical basis before cancellation/reset, and refuses
  replacement if the preceding draft flush was not acknowledged.
- The panel-list ownership marker is a read projection; strip it before passing
  the stored full-row deletion basis. Otherwise every healthy delete would fail CAS.

## Software evidence

The resumed .56 baseline passes175 suites/2,607 app tests in263.113s plus five
workflow tests and typecheck/lint/format. Initial new ownership tests fail3/3
on the expected old behavior; the same three pass after the query/repair fix.
An integrated focused run passes165 tests/9 suites. Additional retained-form/
live-UI tests pass70 tests/5 suites after correcting a test text observer and a
fixture tuple type. The earlier intermediate typecheck/observer failures are
retained privately and do not verify final source.

New tests use the app's migrated SQLite, actual query/repair/history code and
retained UI handlers. They cover mixed siblings, correct-looking stored flags,
both patient identities, separately deleted children, deleted parents, metadata
projection/CAS, full rollback on real flag/history SQL failures, first and later
StartupGate runs, raw editor refusal, delayed reload and failed draft flush.
The StartupGate tests isolate other startup stages/native services; they are not
full migration/restore or hardware proof. The snapshot test uses the real useLive
hook with injected native database-change events to exercise child-only refresh.

The corrected full `npm run check` passes177 suites/2,625 app tests in211.156s,
five workflow tests and typecheck/lint/format without warnings. Migration
regeneration reports no schema changes. The added SQLite query-plan regression
verifies patient/panel indexes for issue-count candidates; this is not a measured
physical-device latency guarantee. Frozen native upgrade/restore/cold restart,
independent whole-archive comparisons, owner artifact inspection and exact-head
hosted CI were pending at that source checkpoint. The follow-on evidence below
belongs to frozen application source `36d4ff14f67ca424b6dfcc0351a5590d3fcf8e1b`.

## Frozen native artifacts and delivery

Both release builds retain that source/HEAD and unchanged unrelated WIP. The
generated app build is cleaned before each ABI switch. Actual APK inspection,
signature verification and required-JNI checks pass, rather than inferring
contents from a successful Gradle exit. The owner copy and private archive copy
have identical hashes. QA bytes stay private; only arm64 is copied to `dist/`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.57.apk`, arm64-v8a | 53,505,643 | `1bbbe874feaf75d0c189dc760acdde0ca1d92ac380e6db6947c281ef7bcb7157` |
| Private x86_64 QA APK | 55,113,970 | `060ca8ab868911dfeb60b9ff252d158286cc34acec859eb54f69160dad715809` |

Both actual packages are `com.shayan.medos`, version `0.11.57`/code73, min SDK24,
target SDK36. The verified signing-certificate SHA-256 is
`1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
Gradle reports dependency deprecations/path/hardlink warnings; successful builds
are not warning-free builds. No source changes occur during either build.

The normal push runs the full check without bypass. Exact-source
[hosted CI](https://github.com/CodeinScrubs/medos/actions/runs/38118700197)
passes typecheck/lint/format/tests, migration consistency and Android bundling.
[Draft PR9](https://github.com/CodeinScrubs/medos/pull/9) is incremental against
PR8. Its source includes .56 history/restore and this ownership correction;
earlier PRs are not merged automatically. Later evidence-only commits do not
change the application source frozen into these APKs.
The evidence-only delivery check also passes177 suites/2,625 app tests
in208.049s, five workflow tests and typecheck/lint/format without warnings.

## Bounded native ownership and recovery acceptance

The inspected x86 APK is installed in place on an owned read-only emulator;
the installed base APK hash equals the frozen QA hash. A synthetic compatible
archive starts from the .56 accepted dataset and adds two panels, three values
and a second patient. One panel has a live child naming the other patient; the
other is healthy and needs flag repair. Existing history/media remain present.
The fixture removes the flag-version setting, so restore housekeeping runs the
version0-to1 repair. No real patient data or messaging is involved.

Observed UI bounds drive these actions, with one acknowledged restore intent:

- Healthy flowsheet/trend results remain available; the mixed panel and all
  live siblings are withheld. Both affected patients have a conditional notice.
- The original owner's panel list retains both panel metadata entries. The mixed
  panel cannot become an empty editable form; opening error details confirms
  the specific ownership refusal. No foreign values or false empty-state claim
  appear in the observed tables/trends/snapshot/timeline preview.
- Force-stop and cold start retain the repaired state and notices. This is a
  native cold start with the flag-version already1, **not** native version0
  first-start acceptance. The first/later version0 StartupGate paths have the
  separately scoped software tests above; production adbd refuses root.
- One healthy panel is deleted and restored through the existing trash, using
  its displayed patient/title and confirmation. This accepts the new ownership
  projection/CAS boundary; it does not repeat .56's seven-kind matrix.

Native exports are independently authenticated/decrypted and compared across
all51 application tables. The repair and cold exports check all4,217 prior and
added application rows, allowing only the healthy value's derived flag to
change to null. All55 prior complete versions remain exact; two new full typed
before/after versions describe that repair. The mixed panel and every sibling
remain byte-for-field intact, with no invented correction history. The new
aggregate audit counts one changed value, one cleared flag, one blocked panel
and two skipped values; prior audit records remain present.

The subsequent deletion comparison checks all4,219 prior application rows:
only the healthy panel's tombstone/touch changes, with one complete version and
required audit. Restoration checks all4,220 prior rows: only that parent is
revived/touched, with one additional version/audit. All lab children stay exact.
Final history has59 versions. Every comparison verifies all34 original media
hashes,32 migrations, SQLite integrity and clean foreign keys.

| Native witness | Archive SHA-256 |
|---|---|
| Repair | `edaf5b7e8c32af4e3d78c75b37aa2302599cf11f9aff74378c907036f4ef81ca` |
| Cold restart | `1493856b040f01994f110f65ad0f021ab33a6889df5ea6adeed5c10c755f4f88` |
| Healthy panel deleted | `655d6a2230cdb237a49eed9593c9a6199578fa84dac5eb249b2525b339d4ee05` |
| Healthy panel restored | `59654976571a74a30ce5f50d2c6149c64ff300a26041cfcc3fd2a337b692d117` |

Raw XML/screenshots/logs, fixtures and independent decoder/oracle reports remain
gitignored under `private/validation-0.11.57/`. Reports include actual observer
failures corrected before accepting the final witnesses; an incorrect expected
text/spacing in a probe is not an application fix. Owned emulator shutdown is
verified and its two base-image hashes remain unchanged.

No MedOS fatal/ANR is observed in this bounded window. Android System UI and
other system processes report boot ANRs; the System UI Wait dialog is observed
and cleared before acceptance. Those logs are retained, rather than calling the
whole Android session healthy. No keyboard composition, audio or physical-phone
test is inferred from these click/read/archive witnesses.

## Separate acceptance

The new source must have its own native evidence; .56 witnesses are historical.
Physical Persian/English IME, focus/interruption/provider/low-space/power behavior,
the full timed40-patient shift and clinical review remain separate. Rich text,
remaining trash kinds and the full follow-up loop remain in IMPLEMENTATION.
No physical phone or clinical validation is claimed here.
