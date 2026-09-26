/**
 * Long-press the MedOS icon: «ثبت سریع», «بیمار جدید», «بیماران», «شیفت».
 *
 * Android's static app shortcuts. Each one opens a deep link the app already
 * routes (medos://capture and so on), so the fastest path to writing
 * something down starts on the home screen instead of on Today.
 *
 * The icons are Ionicons glyphs rendered to PNG (assets/shortcuts/): an
 * adaptive icon on Android 8+, and a round badge for 7.1, which has
 * shortcuts but no adaptive icons. Shortcuts target the release package, so
 * in a debug build ("MedOS Dev") they open the real app.
 */
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');

const SHORTCUTS = [
  { id: 'capture', label: 'ثبت سریع', url: 'medos://capture' },
  { id: 'new_patient', label: 'بیمار جدید', url: 'medos://patient/new' },
  { id: 'patients', label: 'بیماران', url: 'medos://patients' },
  { id: 'shift', label: 'شیفت', url: 'medos://shift' },
];

function shortcutsXml(pkg) {
  const items = SHORTCUTS.map(
    (s) => `  <shortcut
    android:shortcutId="${s.id}"
    android:enabled="true"
    android:icon="@drawable/shortcut_${s.id}"
    android:shortcutShortLabel="@string/shortcut_${s.id}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${s.url}"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity" />
  </shortcut>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by plugins/with-app-shortcuts.js -->
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
`;
}

const adaptiveIcon = (id) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by plugins/with-app-shortcuts.js -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/iconBackground" />
  <foreground android:drawable="@drawable/shortcut_${id}_fg" />
</adaptive-icon>
`;

module.exports = function withAppShortcuts(config) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('[with-app-shortcuts] app.json has no android.package');

  config = withStringsXml(config, (cfg) => {
    for (const s of SHORTCUTS) {
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [{ $: { name: `shortcut_${s.id}`, translatable: 'false' }, _: s.label }],
        cfg.modResults,
      );
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const meta = (activity['meta-data'] ??= []);
    if (!meta.some((m) => m.$['android:name'] === 'android.app.shortcuts')) {
      meta.push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const icons = path.join(cfg.modRequest.projectRoot, 'assets', 'shortcuts');
      const dir = (name) => {
        const d = path.join(res, name);
        fs.mkdirSync(d, { recursive: true });
        return d;
      };
      fs.writeFileSync(path.join(dir('xml'), 'shortcuts.xml'), shortcutsXml(pkg));
      for (const s of SHORTCUTS) {
        fs.copyFileSync(path.join(icons, `${s.id}.png`), path.join(dir('drawable-xxxhdpi'), `shortcut_${s.id}_fg.png`));
        fs.copyFileSync(
          path.join(icons, `${s.id}-legacy.png`),
          path.join(dir('drawable-xxxhdpi'), `shortcut_${s.id}.png`),
        );
        fs.writeFileSync(path.join(dir('drawable-anydpi-v26'), `shortcut_${s.id}.xml`), adaptiveIcon(s.id));
      }
      return cfg;
    },
  ]);

  return config;
};
