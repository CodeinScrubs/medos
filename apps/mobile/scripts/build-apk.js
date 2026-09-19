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

// android/ is generated and gitignored; create it on a fresh checkout.
if (!fs.existsSync(androidDir)) {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobileRoot);
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

const version = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const dist = path.join(repoRoot, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `MedOS-${version}.apk`);
fs.copyFileSync(built, out);

console.log(`\n[MedOS] APK ready: ${out}\n`);
