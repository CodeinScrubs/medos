/**
 * Build settings for MedOS's Android project that must survive
 * `expo prebuild --clean`.
 *
 * 1. Gradle daemon pinned to JDK 21.
 *    Android Studio now ships JDK 25, and on JDK 24+ the JVM prints a
 *    "restricted method" warning when AGP's native-dependency tool (prefab)
 *    loads native code. AGP treats that stderr line as a failure, so the
 *    CMake configure step of react-native-screens / worklets fails with a
 *    message that looks unrelated. Gradle's daemon-JVM criteria make the build
 *    run on 21 whatever JAVA_HOME points at; Gradle finds (or has already
 *    provisioned) a JDK 21 under ~/.gradle/jdks.
 *
 * 2. arm64-v8a only.
 *    Every phone sold in years is arm64. Compiling the C++ of reanimated,
 *    worklets and screens for four ABIs quadruples native build time and
 *    doubles the APK for architectures this app will never run on. To test on
 *    an x86_64 emulator, add it here or pass
 *    `-PreactNativeArchitectures=x86_64` to Gradle for that build.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');

const DAEMON_JDK = '21';
const ARCHITECTURES = 'arm64-v8a';

function setProperty(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

module.exports = function withAndroidBuildTuning(config) {
  config = withGradleProperties(config, (cfg) => {
    setProperty(cfg.modResults, 'reactNativeArchitectures', ARCHITECTURES);
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'gradle', 'gradle-daemon-jvm.properties');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        '# Written by plugins/with-android-build-tuning.js. JDK 24+ breaks the native build; see there.\n' +
          `toolchainVersion=${DAEMON_JDK}\n`,
      );
      return cfg;
    },
  ]);

  return config;
};
