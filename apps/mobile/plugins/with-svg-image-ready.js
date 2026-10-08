const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * react-native-svg 15.15.4 only emits Image.onLoad for a decoded-cache MISS.
 * The editor/exporter need the same acknowledgement when an image is already
 * cached. Emit once per ImageView/source; never infer readiness from a timeout.
 * Fail closed on upstream changes rather than silently losing this contract.
 */
function patchSvgImageReady(input) {
  const source = input.replace(/\r\n/g, '\n');
  if (source.includes('// MedOS: one image-ready event for cached and newly decoded sources.')) {
    if (
      !source.includes('dispatchLoaded(bitmap, uriString);') ||
      !source.includes('dispatchLoaded(bitmap, requestedUri);')
    )
      throw new Error('Incomplete SVG image-ready patch');
    return input;
  }
  function replace(text, before, after) {
    if (text.split(before).length !== 2) throw new Error('SVG image-ready source changed; review the native contract');
    return text.replace(before, after);
  }
  let out = replace(source, '  private String uriString;', '  private String uriString;\n  private String mLoadedUri;');
  out = replace(
    out,
    '      uriString = src.getString("uri");',
    '      String nextUri = src.getString("uri");\n      if (nextUri == null || !nextUri.equals(uriString)) mLoadedUri = null;\n      uriString = nextUri;',
  );
  const event = `            final EventDispatcher mEventDispatcher =
                UIManagerHelper.getEventDispatcherForReactTag(mContext, getId());
            mEventDispatcher.dispatchEvent(
                new SvgLoadEvent(
                    UIManagerHelper.getSurfaceId(ImageView.this),
                    getId(),
                    mContext,
                    uriString,
                    bitmap.getWidth(),
                    bitmap.getHeight()));`;
  out = replace(out, event, '            dispatchLoaded(bitmap, requestedUri);');
  out = replace(
    out,
    '    mLoading.set(true);\n    final DataSource',
    '    mLoading.set(true);\n    final String requestedUri = uriString;\n    final DataSource',
  );
  out = replace(
    out,
    '        doRender(canvas, paint, bitmap, opacity);',
    '        doRender(canvas, paint, bitmap, opacity);\n        dispatchLoaded(bitmap, uriString);',
  );
  const helper = `  // MedOS: one image-ready event for cached and newly decoded sources.
  private void dispatchLoaded(Bitmap bitmap, String requestedUri) {
    if (bitmap == null || requestedUri == null || !requestedUri.equals(uriString)
        || requestedUri.equals(mLoadedUri)) return;
    EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(mContext, getId());
    if (dispatcher == null) return;
    mLoadedUri = requestedUri;
    dispatcher.dispatchEvent(new SvgLoadEvent(
        UIManagerHelper.getSurfaceId(ImageView.this), getId(), mContext,
        requestedUri, bitmap.getWidth(), bitmap.getHeight()));
  }

`;
  out = replace(out, '  private void loadBitmap(', `${helper}  private void loadBitmap(`);
  return out;
}
module.exports = function withSvgImageReady(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const packagePath = require.resolve('react-native-svg/package.json', { paths: [mod.modRequest.projectRoot] });
      if (JSON.parse(fs.readFileSync(packagePath, 'utf8')).version !== '15.15.4')
        throw new Error('Review SVG image readiness before upgrading react-native-svg');
      const file = path.join(path.dirname(packagePath), 'android/src/main/java/com/horcrux/svg/ImageView.java');
      const current = fs.readFileSync(file, 'utf8'),
        patched = patchSvgImageReady(current);
      if (patched !== current) fs.writeFileSync(file, patched);
      return mod;
    },
  ]);
};
module.exports.patchSvgImageReady = patchSvgImageReady;
