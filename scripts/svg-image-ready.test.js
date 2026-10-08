const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { patchSvgImageReady } = require('../apps/mobile/plugins/with-svg-image-ready');

test('SVG native readiness acknowledges cache hits once and protects source changes', () => {
  const packagePath = require.resolve('react-native-svg/package.json');
  const current = fs.readFileSync(
    path.join(path.dirname(packagePath), 'android/src/main/java/com/horcrux/svg/ImageView.java'),
    'utf8',
  );
  const patched = patchSvgImageReady(current);
  assert.match(patched, /doRender\(canvas, paint, bitmap, opacity\);\s+dispatchLoaded\(bitmap, uriString\);/);
  assert.match(patched, /dispatchLoaded\(bitmap, requestedUri\);/);
  assert.match(patched, /requestedUri.equals\(mLoadedUri\)/);
  assert.match(patched, /!requestedUri.equals\(uriString\)/);
  assert.equal(patchSvgImageReady(patched), patched);
});
test('SVG native source drift fails explicitly', () => {
  assert.throws(() => patchSvgImageReady('class ImageView {}'), /source changed/);
});
