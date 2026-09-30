/** Check actual APK entries, not Gradle success or the advertised ABI alone. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { androidEnv } = require('./android-env');

const REQUIRED_LIBRARIES = [
  'libappmodules.so',
  'libc++_shared.so',
  'libexpo-modules-core.so',
  'libexpo-sqlite.so',
  'libhermesvm.so',
  'libreactnative.so',
  'libreanimated.so',
  'libworklets.so',
];

function validateNativeEntries(entries, abi) {
  if (!['arm64-v8a', 'x86_64'].includes(abi)) throw new Error('Unsupported MedOS APK ABI');
  const names = new Set(entries.map((name) => name.trim()).filter(Boolean));
  const missing = REQUIRED_LIBRARIES.filter((name) => !names.has(`lib/${abi}/${name}`));
  if (missing.length) throw new Error(`Incomplete ${abi} APK: missing ${missing.join(', ')}`);
  const unexpected = [...names].filter(
    (name) => /^lib\/[^/]+\/[^/]+\.so$/.test(name) && !name.startsWith(`lib/${abi}/`),
  );
  if (unexpected.length)
    throw new Error('APK contains an unexpected ABI; owner and emulator builds must stay separate');
}

function checkApkNativeLibraries(apkPath, abi, env = androidEnv()) {
  if (!fs.existsSync(apkPath)) throw new Error('APK file not found');
  if (!env.JAVA_HOME) throw new Error('Java runtime not found; use the configured Android toolchain');
  const jar = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar');
  // An executable with separate arguments: no shell interpretation of file names.
  const result = spawnSync(jar, ['tf', path.resolve(apkPath)], { env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Could not inspect APK archive entries');
  validateNativeEntries(result.stdout.split(/\r?\n/), abi);
}

module.exports = { checkApkNativeLibraries, validateNativeEntries, REQUIRED_LIBRARIES };

if (require.main === module) {
  const [apkPath, abi] = process.argv.slice(2);
  try {
    if (!apkPath || !abi) throw new Error('usage: node scripts/apk-native-check.js <apk> <arm64-v8a|x86_64>');
    checkApkNativeLibraries(apkPath, abi);
    console.log(`[MedOS] Required native libraries verified (${abi}).`);
  } catch (error) {
    console.error(`[MedOS] ${error.message}`);
    process.exitCode = 1;
  }
}
