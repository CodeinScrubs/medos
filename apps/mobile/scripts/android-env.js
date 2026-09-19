#!/usr/bin/env node
/**
 * Run a command with the Android toolchain found automatically.
 *
 *   node scripts/android-env.js npx expo run:android
 *
 * Gradle's launcher needs JAVA_HOME (or `java` on PATH) just to start, and
 * Android Studio does not set either for the rest of the system. Rather than
 * asking anyone to edit Windows environment variables, this fills them in for
 * the one command, from the standard install locations, only when missing:
 *
 * - JAVA_HOME     -> Android Studio's bundled JDK. That JDK is 25, which is
 *                    fine for *launching* Gradle; the build itself runs on
 *                    JDK 21, pinned by plugins/with-android-build-tuning.js.
 * - ANDROID_HOME  -> the default SDK folder.
 * - PATH          -> + platform-tools, so `adb` works.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function firstExisting(candidates) {
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

function javaCandidates(env) {
  if (process.platform === 'win32') {
    return [
      path.join(env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
      path.join(env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio', 'jbr'),
    ];
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Android Studio.app/Contents/jbr/Contents/Home'];
  }
  return ['/opt/android-studio/jbr', path.join(os.homedir(), 'android-studio', 'jbr')];
}

function sdkCandidates(env) {
  if (process.platform === 'win32') return [path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')];
  if (process.platform === 'darwin') return [path.join(os.homedir(), 'Library', 'Android', 'sdk')];
  return [path.join(os.homedir(), 'Android', 'Sdk')];
}

function androidEnv(base = process.env) {
  const env = { ...base };

  if (!env.JAVA_HOME) {
    const java = firstExisting(javaCandidates(env));
    if (java) env.JAVA_HOME = java;
  }
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    const sdk = firstExisting(sdkCandidates(env));
    if (sdk) env.ANDROID_HOME = sdk;
  }

  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  const extra = [env.JAVA_HOME && path.join(env.JAVA_HOME, 'bin'), sdk && path.join(sdk, 'platform-tools')].filter(
    Boolean,
  );
  // Windows spells it Path; keep whichever key the environment already uses.
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = [...extra, env[pathKey] ?? ''].join(path.delimiter);

  return env;
}

function explainMissing(env) {
  const problems = [];
  if (!env.JAVA_HOME) problems.push('Android Studio (and its bundled Java) was not found.');
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) problems.push('The Android SDK was not found.');
  if (problems.length) {
    console.error(`\n[MedOS] ${problems.join(' ')}`);
    console.error('[MedOS] Install Android Studio, open it once so it downloads the SDK, then try again.\n');
  }
  return problems.length === 0;
}

/**
 * Run a command, inheriting the terminal. On Windows `npx` and `gradlew.bat`
 * only resolve through cmd.exe, and Node wants a single, already-quoted
 * command line when a shell is used, rather than separate arguments.
 */
function spawnCommand(command, args, options) {
  if (process.platform !== 'win32') return spawnSync(command, args, options);
  const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
  return spawnSync([command, ...args].map(quote).join(' '), { ...options, shell: true });
}

module.exports = { androidEnv, explainMissing, spawnCommand };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('usage: node scripts/android-env.js <command> [args...]');
    process.exit(2);
  }
  const env = androidEnv();
  if (!explainMissing(env)) process.exit(1);
  const result = spawnCommand(command, args, { stdio: 'inherit', env });
  process.exit(result.status ?? 1);
}
