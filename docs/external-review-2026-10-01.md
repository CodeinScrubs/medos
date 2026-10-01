# Verification of the external 0.11.8 emulator review

This is a review of the owner's supplied AI transcript, not a new acceptance
claim for the whole application. Application code, dependencies, routes,
permissions, migrations and backup schemes were left unchanged.

## Reviewed snapshot and independent evidence

- Checkout: `bb0100ad19d0da2679c6c40978261f38e9ae6729`; final application source
  `e82a622bc65055fbfa7a7924f356f198d2265a8f`, version 0.11.8 / code 24.
- Fresh `npm run check`: 82 suites / 966 app tests + 3 workflow tests;
  typecheck, lint and formatting passed. Remote main matched this checkout;
  its [hosted CI](https://github.com/CodeinScrubs/medos/actions/runs/36794133205)
  completed successfully.
- Booted the existing isolated test AVD on `emulator-5556`, Android 16 / API
  36.1, x86_64, 1080x2400, font scale 1.0, light theme, three-button navigation.
  Pulled its installed `base.apk` and matched its SHA-256 and size to
  the final emulator artifact recorded in [0.11.8 validation](validation-0.11.8.md):
  `0ea6f6b2cfb86f1c0118f506f59774aca57a31e7eef74dc060ee3634cf9ba913`
  (54,305,522 bytes). The independent native-entry CLI also passed for this
  installed APK. This is the emulator copy, not the arm64 owner APK.
- Repeated only the disputed keyboard/modal and bottom-form observations.
  Used synthetic data and a synthetic backup key on that AVD. No patient
  record or credential was published. No encrypted archive was exported or
  restored. Other ADB serials were not driven.
- Screenshots and UI hierarchies are retained in ignored
  `private/review-0.11.8-claims/`; they are not public repository evidence.
  A System UI not-responding dialog appeared during emulator boot and was
  dismissed with its observed Wait action. It is not a MedOS crash witness.

## Incorrect or unsupported assertions

1. **Argon2id is incorrect.** `src/lib/crypto.ts` imports `scryptAsync` and
   `deriveKey` uses scrypt. `DEFAULT_KDF` is N=2^15, r=8, p=1 with passphrase
   scheme 2. AES-GCM encrypts archive chunks. SecureStore stores the phone's
   backup keyset; that part of the external description is consistent with
   the code. Do not add Argon2id or change existing schemes to match the report.

2. **POD, generated SBAR and an SLA counter are not implemented features.**
   The source has no corresponding postoperative-day clock, SBAR generator
   or service-level deadline. `encounters/logic.ts` measures admission elapsed
   days/hours, with an approximate display for an unknown admission hour.
   Antibiotic D-count is a separate calendar-day count. `consults/open-consults.tsx`
   shows status, urgency and relative request/creation time. These existing
   functions do not establish the features claimed by the final results table.

3. **The chart claim contradicts the earlier report.** Its first report says
   the WBC screen displayed the requirement for two numeric values. Its final
   table instead claims a line trend was exercised. Only one value per analyte
   is demonstrated in the supplied actions. `labs/trend-screen.tsx` renders a
   chart only when `numeric.length >= 2`. A chart implementation exists, but
   this transcript does not establish a native multi-point chart test.

4. **81 suites / 958 tests is historical, not invented, but is not current
   final-source evidence.** Those counts match the preceding 09d2762 stage;
   the final source passes 82 / 966 plus 3 workflows. Version 0.11.8 alone
   cannot bind a run to a binary: several corrected artifacts have this same
   version/code. The supplied report gives neither source SHA nor APK hash.

5. **The blanket acceptance conclusions exceed the evidence.** A rendered
   clinical example does not validate medical correctness; a trash restore
   does not prove every record/media byte returned; a memory snapshot around
   225 MB does not prove optimal performance or absence of leaks. Filtering
   some Logcat lines does not prove the absence of all crashes or data loss.
   The transcript also contains startup/native-loader troubleshooting, so
   an unqualified assertion that no crash happened throughout is misleading.
   A repaired-build interval would need to be identified separately.

6. **Passphrase verification is not archive recovery.**
   `backup/keys.ts::checkBackupPassphrase` derives a key using the stored salt
   and KDF, then compares it to the stored phone key. It does not open an
   archive, validate its media manifest or restore a second dataset. The
   reported archive size and correct/incorrect-password UI checks cannot
   close native backup/restore, interruption or second-device acceptance.

7. **The legacy `vault` path is not a request for a security feature.**
   Current credentials screens are the owner's ordinary organized notebook.
   Keep that product decision; the review's use of the word vault does not
   authorize reintroducing biometric gates or key-management workflows there.
   Encrypted owner-controlled backups remain a separate frozen contract.

The intake, SOAP notes, kardex, lab entry, consult status/reply, round,
doctors, extensions, knowledge, credentials, trash and diagnostics modules
do exist. The transcript records attempts to interact with many of them.
That is useful smoke-test context, not a verified pass for every described
scenario. Most pasted command entries omit their outputs. Earlier shared-AVD
observations were also excluded from the existing 0.11.8 acceptance record.

## Disposition of the five proposed fixes

| Proposal | Independent finding | Disposition |
| --- | --- | --- |
| Add bottom inset plus an arbitrary 60 to every form/list | `components/ui/layout.tsx::Screen` already consumes the bottom safe edge and adds scroll-content padding. The cited forms use it. On this AVD a normal upward swipe, followed by a settled screenshot, put patient actions at y=1707-2148 and credential actions at y=1864-2148; navigation begins at y=2274. No held overscroll was needed. | Alleged missing-safe-area root cause is incorrect. Do not blanket-pad every screen. Encounter/lab/follow-up native edge cases on other configurations remain untested in this review. |
| Add submitting state / delay to consult reply | `answer-screen.tsx` already has a synchronous `acting` ref, busy state, flush and atomic publication; its button uses `loading={busy}` and the shared Button disables loading presses. | Missing-submit-guard claim is incorrect. A transition touch problem is not independently reproduced; a distinct second touch on an already exposed screen is not proof of event leakage. Preserve existing guards and investigate only with a reproducible native event sequence. |
| Handle keyboard before dismissing PromptModal | Independently reproduced in the backup passphrase-test modal: with the actual IME visible and dirty masked text, one Back key event hid the keyboard and opened the discard dialog. Choosing Continue retained the same text. | Confirmed UX issue; text loss was not observed. A keyboard listener proposal is plausible, but its event ordering still needs native verification before calling it a fix. |
| Chain first backup passphrase field to confirmation | `PassphraseSetup` has no next-submit focus handler/ref; shared Input already forwards a TextInput ref. Native editor information reported Done (action 6), and Enter left the second field empty/unfocused. | Confirmed small UX omission. Direct-tap latency is not established. This needs simple focus wiring, not a new component/dependency. |
| Add an `errors` redirect route | The app opens `/diagnostics`; no exact `medos://errors` or `/errors` caller was found in current app code, README or docs. The supplied tester first tried its own unsupported URL, then found the correct route. | Correct the test instructions. No compatibility alias is justified by this evidence. |

Three paths advertised as exact fix locations do not exist:
`encounters/encounter-form.tsx`, `labs/lab-form.tsx` and
`vault/vault-editor-screen.tsx`. Their actual screens are
`encounter-form-screen.tsx`, `lab-entry-screen.tsx` and
`credential-form-screen.tsx` in the corresponding feature folders.

### Automation pitfall behind several alleged form errors

The supplied transcript types into fixed coordinates with the keyboard
changing the visible area. Its reported complaint text appended to a bed
value does not independently establish a field-state bug. Fresh UI bounds
can themselves be clipped, inverted or obscured by an IME that is absent
from the accessibility hierarchy. In this review, an initial scroll gesture
through such an obscured area typed into the keyboard instead of scrolling.
That observation was discarded, its synthetic draft removed, and the bottom
check repeated after dismissing the IME. Use screenshots plus actual IME
visibility/insets, settled fresh bounds, and post-action assertions. Do not
classify that kind of coordinate error as clinical database corruption.

## Narrow follow-up for the builder

Follow the existing AGENTS.md check-in/check-out. Keep D05/D08 manual-form
recovery and D10/C05 native recovery acceptance open. This review does not
change their priority or validate clinical tools.

1. Fix **PromptModal's first-Back behavior** in the shared component. With
   dirty text and the IME actually visible, first Back should hide the IME
   while retaining the modal and text. A subsequent Back with the IME hidden
   should retain the existing discard choice. Test secret and ordinary-text
   callers, untouched and dirty values, Continue/Discard, explicit Cancel,
   and backdrop handling. Prove Android keyboard-event ordering on the
   corrected native artifact; mocked keyboard events alone are insufficient.
   Keep this narrow: no navigation delays or new UI/settings.
2. Wire **PassphraseSetup's first Next action** to the existing second Input
   ref, with Done on the confirmation input. Verify focus/text on Android
   with its IME visible; Enter must not accidentally trigger key replacement.
   No new dependency, crypto change or extra explanatory UI is needed.
3. If the consult transition symptom recurs, capture the exact originating
   route, fresh pre/post hierarchy, IME state, touch timing and native logs.
   Distinguish duplicate publication, a wrong back-stack entry and an actual
   touch delivered after navigation. Do not weaken the synchronous guard or
   add speculative sleeps.
4. Record every future acceptance run with source SHA, APK SHA-256, device
   serial/API/ABI, settings, initial synthetic dataset and actual assertions.
   Include failures, not just issued commands. Never put patient data, backup
   keys, colleague ratings or raw credential text in public evidence.

No physical phone was used. This review did not execute full encrypted
backup/restore, complete trash/media recovery, consult transition timing,
all 13 module flows, clinical validation, power/low-space cases or an app-wide
performance/accessibility benchmark. Keep these limits explicit.
