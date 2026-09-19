/**
 * Debug builds install as a separate app: "MedOS Dev", package
 * com.shayan.medos.dev.
 *
 * Why this exists: Android refuses to install an APK over an app signed with a
 * different key. The real app is signed with MedOS's own release key; debug
 * builds (Android Studio's Run button, `expo run:android`) are signed with the
 * generic debug key. With one shared package name, installing a debug build
 * over the real app fails — and Android Studio then offers to uninstall the
 * existing app, which deletes every patient record on the phone.
 *
 * With its own package name the debug app lives beside the real one, with its
 * own separate database: real data stays in "MedOS", experiments happen in
 * "MedOS Dev".
 */
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const MARKER = 'medosDevVariant';
const SUFFIX = '.dev';
const DEV_APP_NAME = 'MedOS Dev';

const DEBUG_BUILDTYPE = /(buildTypes\s*\{\s*debug\s*\{)/;

function applyDevSuffix(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!DEBUG_BUILDTYPE.test(contents)) {
    // Failing loudly is deliberate: silently dropping the suffix would bring
    // back the uninstall-wipes-data trap this plugin exists to prevent.
    throw new Error(`[${MARKER}] could not find the debug buildType in app/build.gradle`);
  }
  return contents.replace(
    DEBUG_BUILDTYPE,
    `$1\n            // ${MARKER}: debug builds install beside the real app, never over it.\n            applicationIdSuffix "${SUFFIX}"`,
  );
}

module.exports = function withDevVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyDevSuffix(cfg.modResults.contents);
    return cfg;
  });

  // A debug-only resource overlay renames the launcher label, so the two
  // icons on the phone cannot be confused.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug', 'res', 'values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'strings.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<!-- Written by plugins/with-dev-variant.js -->\n' +
          `<resources>\n  <string name="app_name">${DEV_APP_NAME}</string>\n</resources>\n`,
      );
      return cfg;
    },
  ]);

  return config;
};

module.exports.DEV_APPLICATION_ID_SUFFIX = SUFFIX;
