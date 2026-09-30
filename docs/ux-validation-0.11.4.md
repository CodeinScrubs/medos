# 0.11.4 UX validation

This is evidence for the bounded ward UX batch, not acceptance of the whole app.
No subagents, new dependencies, migrations or clinical calculators were used.

## Sources and artifacts

- Main implementation: `ee9c49f`; wording/record-star follow-up: `3c2c215`.
- Fresh software gate at `3c2c215`: `npm run check`, 76 suites / 832 app tests
  and 3 workflow tests, typecheck/lint/format passed. The new star write-failure
  regression first failed against its old handler.
- Signed owner APK: `dist/MedOS-0.11.4.apk`, 52,636,111 bytes,
  `com.shayan.medos`, version 0.11.4 / code 20, **arm64-v8a only**.
  SHA-256: `91b778e79c50be63e2384e66cad413fb6f7a0cc296e9478d306b4ebd594ef4fe`.
  `apksigner verify --print-certs` passed; certificate matches the 0.11.3 APK.
- Emulator APK built from `3c2c215`: **x86_64 only**, kept in ignored `private/`,
  never `dist/`. SHA-256:
  `f0ac7c5b1d30d18241022907617668c4e3423ee4fefc27614e5b97f546e7f937`.
  The owner APK and emulator APK have different ABIs/hashes. Emulator execution
  does not prove the arm64 APK's physical-phone behavior.

## Native protocol

Dedicated AVD `MedOS_UX_0_11_4`, Android 16 system image `android-36.1`,
x86_64, 1080x2400, 420dpi. Only synthetic records were entered through the UI;
Wi-Fi and mobile data were disabled. ADB taps came from fresh uiautomator bounds.
Screenshots/dumps remain in ignored `private/ux-0.11.4`.

Preflight used the `ee9c49f` implementation plus the later import wording,
before the record-star fix (APK SHA-256:
`c6eb2bb927bdafc85e6b06ad2f84bf62e8050ca903f02b544242cd7c54b1eeb5`).
Observed: patient creation/admission, a discharged
starred patient, a two-patient shift, a retained round summary after skip/return,
zero seen count on skip and one on seen. Opening Gboard removed the footer without
discarding the field; closing it restored the actions above the gesture bar.
Record destinations changed from four columns to two at font scale 1.6, with all
eight visible. Sample filter/segment/round/follow-up bounds measured 48dp.

The preflight record star measured 22dp plus 12dp hitSlop per side (46dp effective),
and source inspection found an unhandled write rejection. `3c2c215` reuses the
48dp IconButton and reports a failed write; SQLite trigger tests preserve the
stored flag.

## Final-build native observations

These checks used the x86_64 `3c2c215` artifact above, with two synthetic patients,
one admitted and one discharged/starred, and a two-patient active shift.

- The record star's observed bounds were 126x126 physical pixels at 2.625 density
  (48x48dp). Toggle persisted after leaving/reopening the record; reverse worked.
- Today's starred tile reached the discharged starred patient. A name search
  survived return using the header Back action. Changing to admitted scope gave
  zero results for that search; selecting Today's starred tile again restored all
  starred statuses and explicitly cleared the old search. The admitted tile opened
  the one admitted patient, with the same full count and no star restriction.
- Six due follow-ups were entered through the UI. Today and its `All` destination
  both reported six; one list scroll exposed the sixth and its 48dp outcome action.
  Navigation did not complete any record.
- The sixth outcome prompt retained typed text through Back's discard warning,
  choosing Continue, and a same-route deep link requesting upcoming mode. Submitting
  applied the pending upcoming mode only after the prompt closed. That list correctly
  showed zero; Today then showed five due items. This is a synthetic completion,
  not evidence of an actual patient contact or Android reminder delivery.
- An unanswered consult on Today opened that patient's answer form directly,
  with the matching specialty/question. Header Back returned to the same Today
  position and the consult remained unanswered; no intermediate record screen.
- A new note's typed title/Subjective field survived guarded header exit and
  reopening, with the recovered-draft label. Explicit `ثبت` (publication) then
  added it to the patient's note list. This covers a guarded exit, not process
  death or power loss.
- In dark mode, font scale 1.6 and three-button navigation, the record displayed
  all eight destinations in two columns without observed label clipping. After
  scrolling the round, both footer controls remained 48dp and above the system
  navigation area. Gboard hid only the footer; dismissal restored it and retained
  the lower handoff field. Skip on the only unseen member left the seen count at
  one and stayed on that member, as the existing round algorithm requires.
  Exit/reopen retained the same patient's handoff; `Seen and next` then completed
  the two-member round. No native write-failure injection was performed.
- Calls and inbox route titles matched their navigation labels. The calls screen
  offered the actual folder/file/share actions and explicitly said MedOS does not
  record calls. No file import, microphone or call transmission was executed here.
- Final captured AndroidRuntime/ReactNativeJS error output contained no matching
  fatal/error lines. Wi-Fi/mobile-data settings were both zero. These observations
  do not establish crash-free operation under untested workloads.

## Limits and remaining acceptance

- No physical phone, TalkBack, camera, live recording, actual call-recorder provider,
  alarms/reboot/battery, interrupted restore or power-loss acceptance in this batch.
- Forty-row counts and scope/read/failure races have SQLite/component coverage;
  a full forty-patient native shift and the complete plan matrix remain separate.
- No latency or usability benchmark. System UI/launcher ANRs occurred during boot
  both with compilation and after an isolated restart; they were not MedOS ANRs.
  One diagnostic Jest test timed out during competing build/boot work, then passed
  in isolation; the next full software gate passed without a worker-exit warning.
  Do not infer the cause or phone performance from this host/image.
- On this image uiautomator can report app bounds behind Gboard. Check actual
  keyboard visibility before tapping a lower control; screenshots/dumps are
  observations, not proof that an occluded control received the tap.
- Reject failed/null UI dumps instead of reusing the last XML file. Quote the
  entire deep-link URL for the device shell when it contains `&`; otherwise ADB
  can execute URL pieces as shell commands and invalidate the navigation test.
- Plans 001-005 retain SOFTWARE VERIFIED until their complete native acceptance
  is recorded. D08/C05/D05/D10 and the other IMPLEMENTATION gates stay open.
