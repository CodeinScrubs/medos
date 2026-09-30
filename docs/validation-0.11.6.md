# 0.11.6 validation

This evidence covers the shift workspace and patient-form corrections. It does
not close the remaining product, native recovery or clinical-validation gates.
No subagents, dependency changes, migrations or clinical calculators were used.

## Source and software evidence

- Shift corrections: `2edf9e5`; patient editor and age validation: `a285afa`.
- `npm run check` passed on the final implementation: typecheck, lint,
  formatting, 76 suites / 868 app tests and 3 workflow tests. The pre-push gate
  also passed.
- [CI for a285afa](https://github.com/CodeinScrubs/medos/actions/runs/36725032641)
  completed successfully.
- Two shift regressions first failed on the old screens. Migrated SQLite,
  real useLive and SaveGroup integration tests cover removed members, closed
  and consecutive shifts, externally completed rounds, read/write failures,
  and new typing while an older save is in flight. Exact archived text and
  its original identity are preserved without reviving the membership.
- Six patient editor regressions first failed on the old handlers. The tests
  cover retained manual input on refresh failure/retry, independent star/tag
  edits, invalid whole-year age, initial read failure and Persian input.
  Scientific notation follows the existing parseDecimal contract; this form
  accepts only whole, nonnegative, safe-integer years or blank/unknown.

## Signed owner artifact

- `dist/MedOS-0.11.6.apk`: 52,640,827 bytes; package `com.shayan.medos`;
  version 0.11.6 / code 22; **arm64-v8a only**.
- SHA-256:
  `cdbcab78b2cf8460f39aaf30defd731b6159d168e3ab5e4207c68c8ef89b458d`.
- `apksigner verify --print-certs` passed. Certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches the preceding signed release. No signing secret is in this document.

## Native acceptance

- Separate signed x86_64 APK from `a285afa`: 54,249,154 bytes, version
  0.11.6 / code 22. SHA-256:
  `630ff550da5e72d6dacb7caa019350cff4f2a0eb1cf5e3245314c05227d19d15`.
  Signature verified; kept in ignored `private/ux-0.11.6`, never `dist/`.
- AVD `MedOS_UX_0_11_4`, Android 16 / API 36.1, 1080x2400, 420dpi.
  Upgraded the existing 0.11.4 installation with `adb install --user 0 -r`;
  no uninstall or data reset. Existing synthetic patients, the discharged
  patient's star, notes and two-member shift remained readable.
- Wi-Fi and mobile data were disabled (both settings read zero). Actions
  used fresh uiautomator bounds, with failed/missing nodes rejecting the
  action. Screenshots/dumps remain in ignored `private/ux-0.11.6`.
- Entering `24.5` in the patient editor and pressing Save retained `24.5`
  with the whole-year validation error; it did not navigate or create `245`.
  Correcting it to `24` saved successfully, retained the patient's star,
  and reopening the editor showed `24`.
- Changed a seen patient back to unseen and entered a new round summary.
  Header Back with the keyboard open and re-entering the round retained the
  exact text. Entered a handoff, dismissed the keyboard and used Seen and
  next; the round completed with two seen members. The shift showed both
  new texts. Force-stop/relaunch after those completed saves retained them;
  this is not a test of killing an uncommitted editor.
- Dark mode, font scale 1.6 and three-button navigation: seen cards retained
  normal readable text; the round footer stayed above the system navigation
  area after scrolling. Both actions measured 126px high at 2.625 density
  (48dp). Opening Gboard hid the footer and retained the handoff text.
- Edited the handoff again with the keyboard open, exited via header Back,
  ended the shift through confirmation and opened history. The final text,
  summary and both identities remained in the ended shift. History did not
  reactivate it. A new empty shift reported zero members; adding the one
  admitted patient gave zero seen of one, without old summary/handoff text.
- Captured AndroidRuntime/ReactNativeJS error output contained no matching
  lines. A System UI not-responding dialog occurred at emulator boot and was
  dismissed with Wait; it was not a MedOS ANR. This bounded run is not a
  crash-free guarantee or a benchmark of the target phone.

The owner and emulator artifacts have different ABIs and hashes. These native
observations do not prove physical-phone execution of the arm64 owner APK.

## Remaining boundaries

- Patient forms retain loaded input after a read failure, but still require
  manual Save. Durable raw drafts, guarded exit and concurrent-field conflict
  handling remain open. Do not describe this as full patient-form autosave.
- Shift text is protected when workspace identity changes. This does not add
  full shift-text version history or resolve edits from independent editors.
- No physical-phone, TalkBack, camera, live call-recorder import, notification
  delivery/reboot/battery, interrupted restore, low-space, power-loss or
  uncommitted process-death acceptance in this batch.
- Forty-patient performance, the wider W/C scope, original media, rich text,
  clinical tools and AI retain their gates in IMPLEMENTATION.md.
- Native SQLite write/read failure injection, external workspace-change races
  and the complete accessibility matrix were not exercised here. Their
  software tests do not substitute for the remaining native acceptance.
- On this image, hardware-style ADB key events needed explicit `-d 0` to edit
  reliably. Verify the subsequent field value, not just the command exit code.
  UI dumps can also describe bounds behind Gboard; inspect its actual presence
  before tapping a lower action. See the preceding 0.11.4 protocol notes.
