/**
 * Two things MainActivity does that React Native does not.
 *
 * 1. The navigation bar follows a light/dark switch made while the app is
 *    running. React Native sets the bar's appearance once, when the activity
 *    starts, and the activity is not recreated when the theme changes. After a
 *    switch to dark (by hand, or by a sunset schedule while MedOS sat in the
 *    background) the three-button bar kept a white strip under a dark app.
 *
 * 2. The Recents screen shows no picture of the app (Android 13 and later).
 *    Its thumbnail was the last screen used — often a patient's record — to
 *    anyone who glanced at the phone. Screenshots still work.
 *
 * Written as a config plugin because android/ is generated.
 */
const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'medosSystemBars';

function insertAfter(contents, anchor, text) {
  const at = contents.indexOf(anchor);
  if (at < 0) {
    // Failing loudly is deliberate: a silently skipped edit would ship an app
    // that shows patient records in Recents.
    throw new Error(`[${MARKER}] could not find "${anchor}" in MainActivity.kt`);
  }
  return contents.slice(0, at + anchor.length) + text + contents.slice(at + anchor.length);
}

function applySystemBars(contents) {
  if (contents.includes(MARKER)) return contents;

  let next = insertAfter(
    contents,
    'import android.os.Bundle\n',
    'import android.content.res.Configuration\nimport androidx.core.view.WindowCompat\n',
  );

  next = insertAfter(
    next,
    'super.onCreate(null)\n',
    `    // ${MARKER}: no picture of a patient's record in Recents (Android 13+).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)
`,
  );

  const classEnd = next.lastIndexOf('}');
  if (classEnd < 0) throw new Error(`[${MARKER}] could not find the end of MainActivity`);
  return (
    next.slice(0, classEnd) +
    `
  // ${MARKER}: the navigation bar follows a light/dark switch made while the app runs.
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val night = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = !night
  }
` +
    next.slice(classEnd)
  );
}

module.exports = function withSystemBars(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error(`[${MARKER}] expected a Kotlin MainActivity`);
    cfg.modResults.contents = applySystemBars(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applySystemBars = applySystemBars;
