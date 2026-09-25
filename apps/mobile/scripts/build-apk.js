#!/usr/bin/env node
/**
 * Build the signed release APK and copy it to <repo>/dist/MedOS-<version>.apk.
 *
 *   npm run apk
 *
 * Refuses to run without the release keystore. The Gradle config would
 * otherwise fall back to the debug key, producing an APK that cannot update
 * the installed app without uninstalling it — which wipes the on-phone data.
 */
const fs = require('node:fs');
const path = require('node:path');

const { androidEnv, explainMissing, spawnCommand } = require('./android-env');

const mobileRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');
const androidDir = path.join(mobileRoot, 'android');

const env = androidEnv();
if (!explainMissing(env)) process.exit(1);

function run(command, args, cwd) {
  const result = spawnCommand(command, args, { stdio: 'inherit', env, cwd });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!fs.existsSync(path.join(repoRoot, 'private', 'keystore.properties'))) {
  console.error(
    '\n[MedOS] private/keystore.properties was not found, so the APK would be signed with the debug key.\n' +
      '[MedOS] Restore the private/ folder from your backup before building a release.\n',
  );
  process.exit(1);
}

const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;

/** The version Gradle will actually stamp into the APK, as prebuild last wrote it. */
function nativeVersion() {
  const gradle = path.join(androidDir, 'app', 'build.gradle');
  if (!fs.existsSync(gradle)) return null;
  const text = fs.readFileSync(gradle, 'utf8');
  return {
    code: Number(/versionCode\s+(\d+)/.exec(text)?.[1]),
    name: /versionName\s+"([^"]+)"/.exec(text)?.[1],
  };
}

// android/ is generated and gitignored: create it on a fresh checkout, and
// regenerate it when app.json has a newer version than the last prebuild.
// Without the second case the APK keeps the old version while being copied
// out under the new name — two different builds wearing one version number.
const before = nativeVersion();
if (!before || before.code !== app.android.versionCode || before.name !== app.version) {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobileRoot);
  const after = nativeVersion();
  if (!after || after.code !== app.android.versionCode || after.name !== app.version) {
    console.error(
      `\n[MedOS] android/ still says ${after?.name}/${after?.code}, app.json says ${app.version}/${app.android.versionCode}.\n` +
        '[MedOS] Refusing to build an APK whose version does not match its file name.\n',
    );
    process.exit(1);
  }
}

// Absolute path: some Windows setups (NoDefaultCurrentDirectoryInExePath)
// do not look in the current folder for a bare `gradlew.bat`.
const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

// Long timeouts and retries: the network this is built on drops connections to
// Google's and Maven's servers now and then, and a retry usually gets through.
run(
  gradlew,
  [
    'assembleRelease',
    '--console=plain',
    '-Dorg.gradle.internal.http.connectionTimeout=180000',
    '-Dorg.gradle.internal.http.socketTimeout=180000',
    '-Dorg.gradle.internal.repository.max.retries=8',
    '-Dorg.gradle.internal.repository.initial.backoff=2000',
  ],
  androidDir,
);

const version = app.version;
const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const dist = path.join(repoRoot, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `MedOS-${version}.apk`);
fs.copyFileSync(built, out);

console.log(`\n[MedOS] APK ready: ${out}\n`);
