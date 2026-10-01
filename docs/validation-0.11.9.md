# 0.11.9 validation

This release changes two existing keyboard interactions: Back hides a prompt's
IME before offering to discard text, and backup setup's first Next action focuses
the confirmation field. It adds no screen, setting, dependency or explanatory UI.

## Source and software evidence

- Application source: `ccb87e43df56088c0d6fd5c5e0c1f94ad8f24722`, version
  0.11.9 / code 25. The later evidence commit changes documentation and removes
  a styling dependency from a test locator; it changes no application source.
- Baseline `npm run check`: 82 suites / 966 app tests + 3 workflows, green.
  Four first-Back witnesses failed on the previous PromptModal implementation.
  Seven corrected prompt tests and existing follow-up save/retry tests passed.
- Final local `npm run check`: 83 suites / 973 app tests + 3 workflows; typecheck,
  lint and formatting passed. No UI snapshots were introduced.
- Prompt tests exercise ordinary/secret values, unchanged/empty values, Continue,
  Discard, backdrop protection, explicit Cancel, reopen clearing and exact secret
  versus trimmed ordinary submission. Native IME visibility is stood in.
- The existing keyboard controller tracks Android Modal's separate window.
  The guard uses that visibility and React Native's keyboard dismissal, with no
  timer or navigation delay. Backup setup uses the existing forwarded Input ref.
- No schema, migration, permission, route, dependency, backup format or passphrase
  scheme changed. There is no new credential-vault gate or clinical tool.

## Signed artifacts

Both builds used the application source above without intervening source edits.
Actual native ZIP entries, ABI, package/version and APK signatures were checked.
The installed emulator package was pulled and hashed independently.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Owner `dist/MedOS-0.11.9.apk`, arm64-v8a | 52,697,831 | `acb1ab3a19fd68cbc69b83826732d3be4e60835449ddc0390dff6c759f5a5c62` |
| Private emulator copy, x86_64 | 54,306,158 | `4d613d22d9c8bfc0e5e69b42052c6ef7659ac51c1a1b4fa0f0371f33ee797532` |

- Package `com.shayan.medos`, version 0.11.9 / code 25. Each APK contains only
  its intended ABI and passes the required-native-library gate.
- `apksigner verify --verbose --print-certs` passed for both. Certificate SHA-256
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`
  matches the preceding release. No signing secret is in this record.
- The arm64 build regenerated the generated Android project for the new version.
  The x86_64 build used `:app:clean :app:assembleRelease` with the explicit ABI;
  only generated app build output was cleaned. No app data was cleared.
- On Windows use the absolute gradlew.bat path with android-env.js. The initial
  `./gradlew.bat` invocation was rejected before Gradle started; the absolute-path
  invocation succeeded. The emulator APK is kept outside `dist/`.

## Native protocol and observations

- Isolated AVD `MedOS_Keyboard_0_11_9`, serial emulator-5556, Android 16 / API
  36.1, x86_64, 1080x2280 / density 440. Three-button navigation, airplane mode
  enabled and Wi-Fi disabled. Normal checks used font scale 1.0 / light mode;
  the bounded large-text check used 1.6 / dark mode.
- Initial dataset was empty. Final 0.11.8/e82a622 was installed first; one
  synthetic outpatient and one synthetic diagnosis were created. Upgrade with
  `adb install --user 0 -r` retained both. No owner/patient data was used.
- In the old backup setup, the first field exposed IME Done, and hardware Enter
  did not focus the second field. In the old ordinary prompt, with IME visibility
  actually true, one Back opened the discard alert.
- In corrected setup the first field exposed IME Next. With its IME shown,
  `adb shell input keyevent 66` moved focus to the second field, retaining the
  first field's 18-character masked value. Confirmation Enter hid the IME; both
  values remained and setup still existed. Only tapping Set configured the
  synthetic key; the normal keyed-backup screen remained after force-stop.
- The handoff used hardware Enter, not a tap on the software IME's Next key.
  The IME was hidden after that hardware handoff. This proves the focus/event
  wiring, not continuous software-keyboard visibility or IME-specific behavior.
- Corrected secret and ordinary prompts were tapped/focused and their actual
  IME visibility checked before Back. First Back hid the IME, retained the modal
  and value and displayed no discard alert. Ordinary text matched exactly;
  secret text retained its masked length, with exact-string behavior checked
  separately by component tests.
- A subsequent Back offered the existing discard choice. Continue retained the
  text; Discard closed the prompt, with the saved diagnosis unchanged. Reopening
  the secret prompt cleared its previous input. An empty secret prompt retained
  its dialog on first Back and closed on second Back. Explicit Cancel with the
  IME shown still closed directly.
- An unchanged ordinary prompt, with its IME confirmed visible, retained its
  original value/dialog on first Back. Second Back dismissed it without a discard
  choice and without navigating away from the patient screen.
- A tap outside the measured ordinary dialog card opened the discard choice.
  Coordinates were derived from fresh UI hierarchy bounds, not screenshots.
- At font scale 1.6 / dark mode, secret prompt first Back retained its masked
  value without a discard alert; Cancel remained readable and reachable after
  keyboard dismissal. This is a bounded dialog check, not an accessibility audit.

## Rejected observations and limits

The first boot produced a System UI ANR before MedOS was installed. UI dumps
also briefly returned a null root during transitions. Initial typing before
focus had settled and a prompt observation with its IME hidden were excluded
from behavior claims. A deep link sent during font/theme recreation did not
reach the requested page; cold relaunch and fresh route assertions were used.
Clipped/inverted bounds were refused and scrolling repeated with fresh bounds.

No physical phone, software-IME Next tap, back gesture, full encrypted archive/
restore, real recorder/provider grants, power/low-space recovery, all-module
acceptance, clinical validation or app-wide performance/accessibility benchmark
was performed. Software tests, packaging and these native observations are
separate evidence. D05/D08 other form/date recovery, D10 native restore and C05
recorder/interruption/restore gates remain open.
