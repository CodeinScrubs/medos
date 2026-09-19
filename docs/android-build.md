# Android build notes

Everything about turning this repository into an APK on the owner's machine. Written down
because each of these cost hours to find. The npm scripts already do the right thing; this
explains why, for when something changes.

## Things that already cost hours

- **Gradle must run on JDK 21, not 24+.** Android Studio ships JDK 25; on it, AGP's
  prefab step prints a JVM "restricted method" warning and AGP treats that as a failure in
  `configureCMake…` of react-native-screens / worklets. `plugins/with-android-build-tuning.js`
  pins the Gradle daemon to 21 via `gradle/gradle-daemon-jvm.properties`; Gradle finds the
  JDK 21 it provisioned under `~/.gradle/jdks`. Do not remove this.
- **arm64-v8a only** (same plugin). Add `x86_64` only for an emulator build.
- **Debug builds are a separate app**, `com.shayan.medos.dev` / "MedOS Dev"
  (`plugins/with-dev-variant.js`). Same package name would make Android refuse to install a
  debug-key build over the release-key app, and Android Studio then offers to uninstall —
  wiping the real data. Launch it with `expo run:android --app-id com.shayan.medos.dev`.
- **Release signing** comes from `<repo>/private/keystore.properties` via
  `plugins/with-release-signing.js`. That keystore is the app's identity: an APK signed with
  anything else cannot update the installed app without uninstalling it, which deletes the
  on-phone database. The plugin throws rather than silently fall back. `private/` is
  gitignored and must never be committed.
- **Network:** downloads from `dl.google.com` and Maven Central sometimes time out from
  the owner's connection. Gradle failures that say "Connection timed out" are that, not the
  build; `scripts/build-apk.js` already passes long timeouts and retries, and a rerun picks
  up where the last one stopped.
- `android/` is generated and gitignored. Anything that must survive `prebuild --clean`
  goes in a config plugin under `apps/mobile/plugins/`.

## Commands

```bash
npm run apk                 # signed release APK -> dist/MedOS-<version>.apk
npm run android             # debug "MedOS Dev" on a USB phone, with Metro
npm run start               # Metro only (for Android Studio's Run button)
cd apps/mobile && npm run bundle            # JS bundle only: fast validation, no Gradle
cd apps/mobile && npm run android:prebuild  # regenerate android/ from app.json + plugins
```

`scripts/android-env.js` fills in JAVA_HOME / ANDROID_HOME from Android Studio's standard
locations when they are unset — the owner's machine has neither set, and the Gradle
launcher refuses to start without them. Use it (or the npm scripts) for anything that runs
Gradle.

## Verifying a build

```bash
# package name, version, ABI
"$LOCALAPPDATA/Android/Sdk/build-tools/<latest>/aapt2.exe" dump badging dist/MedOS-<version>.apk

# signing certificate: the SHA-256 must not change between releases, or the update
# cannot install over the phone's existing app without deleting its data
"$LOCALAPPDATA/Android/Sdk/build-tools/<latest>/apksigner.bat" verify --print-certs dist/MedOS-<version>.apk
```
