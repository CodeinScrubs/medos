/**
 * MedOS in Android's share menu for audio: a call recorder's «اشتراک‌گذاری»
 * → MedOS → pick the patient → filed.
 *
 * Cube ACR, the recorder the owner uses, keeps its recordings in its own
 * private storage, so no folder can be chosen for them; sharing one recording
 * at a time is the way out. Voice messages from a messenger arrive the same way.
 *
 * The shared file is turned into a link the router already knows —
 * medos://calls?shared=<content uri as hex>&name=<file name> — before React
 * sees the intent, so no native module is needed. The URI travels as hex
 * because the link's query is decoded more than once on its way to the
 * screen, and a content URI's own escapes ("primary%3ARecordings") must reach
 * its provider untouched. The read grant Android gives with the share is
 * enough to copy the file into MedOS's storage right away.
 */
const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const MARKER = 'medosShareTarget';

function insertAfter(contents, anchor, text) {
  const at = contents.indexOf(anchor);
  if (at < 0) throw new Error(`[${MARKER}] could not find "${anchor.trim()}" in MainActivity.kt`);
  return contents.slice(0, at + anchor.length) + text + contents.slice(at + anchor.length);
}

function insertBefore(contents, anchor, text) {
  const at = contents.indexOf(anchor);
  if (at < 0) throw new Error(`[${MARKER}] could not find "${anchor.trim()}" in MainActivity.kt`);
  return contents.slice(0, at) + text + contents.slice(at);
}

function applyShareTarget(contents) {
  if (contents.includes(MARKER)) return contents;

  let next = insertAfter(
    contents,
    'import android.os.Bundle\n',
    'import android.content.Intent\nimport android.net.Uri\nimport android.provider.OpenableColumns\nimport androidx.core.content.IntentCompat\n',
  );

  next = insertBefore(next, '    super.onCreate(null)\n', '    medosShareToLink(intent)\n');

  const classEnd = next.lastIndexOf('}');
  if (classEnd < 0) throw new Error(`[${MARKER}] could not find the end of MainActivity`);
  return (
    next.slice(0, classEnd) +
    `
  // ${MARKER}: audio shared to MedOS arrives as medos://calls?shared=…&name=…
  override fun onNewIntent(intent: Intent) {
    medosShareToLink(intent)
    super.onNewIntent(intent)
  }

  private fun medosShareToLink(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_SEND) return
    val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: return
    val name = try {
      contentResolver.query(stream, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (e: Exception) {
      null
    }
    intent.action = Intent.ACTION_VIEW
    val hex = stream.toString().toByteArray(Charsets.UTF_8).joinToString("") { "%02x".format(it) }
    intent.data = Uri.parse("medos://calls?shared=" + hex + "&name=" + Uri.encode(name ?: ""))
  }
` +
    next.slice(classEnd)
  );
}

module.exports = function withShareTarget(config) {
  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = (activity['intent-filter'] ??= []);
    const already = filters.some((f) =>
      (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'),
    );
    if (!already) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'audio/*' } }],
      });
    }
    return cfg;
  });

  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') throw new Error(`[${MARKER}] expected a Kotlin MainActivity`);
    cfg.modResults.contents = applyShareTarget(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyShareTarget = applyShareTarget;
