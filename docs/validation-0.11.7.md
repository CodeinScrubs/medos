# 0.11.7 validation

This release adds recoverable raw create/edit patient forms. This evidence is
bounded; it does not close other manual forms, permanent patient-field history,
native fault/restore acceptance, or the clinical/AI backlog.

## Source and software evidence

- Main implementation: `adc54e3b358d2339293a1f7246b136099c2a44b0`; final source,
  including the explicit-clock correction:
  `2cb27e4ed16ede6a558c977fd5cbf335f15b4dfc`. Version 0.11.7 / code 23.
- Baseline: 76 suites / 868 app tests + 3 workflow tests. Two form recovery
  regressions failed on the preceding code before implementation.
- Final `npm run check` and pre-push gate passed: typecheck, lint without warnings,
  formatting, 78 suites / 907 app tests + 3 workflow tests. The main implementation
  passed 905 app tests before the two clock regressions were added.
- Migration regeneration reported no further changes. Migration 0016 is
  additive; no previous migration or backup format was edited. No dependency,
  route, external data flow or clinical calculator was added.
- [CI for final source 2cb27e4](https://github.com/CodeinScrubs/medos/actions/runs/36764574279)
  passed installation, software gates, migration comparison and Android bundle.
- Migrated SQLite tests cover exact incomplete/invalid raw text, chart isolation,
  atomic publication/retirement rollback, idempotent retries, duplicate warnings,
  wrong/deleted scopes, stale revisions, independent chart fields/star/tags,
  same-field conflicts and checked explicit rebasing. Unknown document versions
  remain unchanged, without the document leaking through codec errors.
- Form tests exercise real useLive and date-field handlers with native widgets
  and navigation stood in. They cover initial/refresh failure and retry, raw
  date/age recovery, immediate-submit latest input, background/exit flush, write
  failure, duplicate confirmation, post-commit navigation retry, in-flight
  discard and confirmed loading of a competing draft.
- A final audit reproduced a clock-injection bug: with a simulated Jalali 1416
  clock, `16/01/01` used the real system clock and returned 1316. Two failing
  tests cover shared validation and patient publication. The follow-up passes
  the same explicit clock through validation, preview and conversion. This
  witness does not claim that current real-device four-digit dates were wrong.
- Backup table-import tests preserve exact raw drafts and refuse to treat their
  invalid fields as published values. A backup predating this table clears
  drafts from the replaced dataset. This is not a complete native encrypted
  archive/SAF/interrupted-restore acceptance test.

## Signed owner artifact

- `dist/MedOS-0.11.7.apk`: 52,674,887 bytes, package `com.shayan.medos`,
  version 0.11.7 / code 23, arm64-v8a only.
- SHA-256: `3e9763e58529a7a2b690a9dad1fbb33a10dfe0e0261e8cf2c50e1b48eebdfe29`.
- `apksigner verify --print-certs` passed. Certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches the preceding release. No signing secret is in this evidence.
- Built from final source above, after its checks and push; no application
  source edits during either final build. Intermediate same-version builds from
  adc54e3 are superseded and remain only in ignored private storage.

## Native acceptance

- Separate signed x86_64 APK from the same final source: 54,283,214 bytes,
  package/version/code as above. SHA-256:
  `084d01d4f96ef15964a8f01c68c06e0c601b6bef9d44ff992888cc9250d70a7d`.
  Signature verified; kept in ignored `private/ux-0.11.7`, never `dist/`.
- AVD `MedOS_UX_0_11_4`, Android 16 / API 36.1, 1080x2400, 420dpi. The
  existing 0.11.6 installation was upgraded without uninstall to the intermediate
  0.11.7 build, then updated to the final 0.11.7 build. This is the actual
  two-step upgrade exercised, not evidence of a direct 0.11.6-to-final run.
  Existing synthetic patient records and the discharged patient's star remained
  visible; no real patient data was used.
- Final package version/code were read back as 0.11.7/23. Wi-Fi and mobile-data
  settings read zero. Actions used fresh uiautomator bounds and subsequent text
  checks; captures remain in ignored `private/ux-0.11.7`.
- The unpublished new-patient draft from the intermediate build recovered on
  the final build, including its exact raw date and fractional age. On final
  source, changed the date to incomplete `1405/07/` while age `24.5` remained,
  observed completed save,
  exited via header Back, force-stopped and reopened. Both raw values and names
  recovered exactly. This tests completed persistence, not killing an in-flight
  save or losing power.
- Save rejected the incomplete date with its Persian validation dialog. After
  correcting the date to `1381/05/12`, Save retained `24.5` with the whole-year
  error. Correcting the age to `24` then created the patient and opened its
  record. The all-status list showed the two prior records and exactly one new
  record, rather than a duplicate from the rejected attempts.
- An edited summary autosaved separately: header exit left the published record
  unchanged; reopening recovered the summary with the recovery notice. Explicit
  Save published it and navigated back. A subsequent summary was discarded only
  through confirmation; the prior published summary remained and reopening the
  editor did not recover the discarded text.
- Dark mode, three-button navigation and font scale 1.6: inspected the patient
  editor with the actual record loaded. After scrolling, Save and Close remained
  readable above the system navigation area; Close returned to the record with
  its published summary. Font scale was restored to 1.0. This is a bounded check,
  not the full accessibility or keyboard matrix.
- AndroidRuntime/ReactNativeJS error capture was empty for the final run. A
  System UI not-responding dialog appeared at emulator boot and was dismissed
  with Wait; it was the system process, not a MedOS dialog. This run does not
  establish a crash-free guarantee or performance on the owner's phone.

The owner and emulator APKs have different ABIs and hashes. Emulator execution
does not validate physical-phone execution of the arm64 owner artifact.

## Remaining boundaries

- Autosave schedules after 800 ms quiet or a 3 s scheduling ceiling; actual
  completed persistence is the durability boundary. Uncommitted keystrokes or
  an interrupted write may still be lost. Autosave is not an independent backup.
- A draft revision is a conflict token, not permanent history of every field.
  Other manual forms and independent shift editors retain their recovery work.
- No physical-phone, native write/read fault, power/low-space, interrupted
  encrypted restore, alarm/reboot/battery, camera/call-recorder or full
  forty-patient/accessibility/performance acceptance is claimed by this batch.
- The owner arm64 artifact and emulator x86_64 artifact are separate builds;
  emulator execution cannot validate the owner's phone or the arm64 binary.
