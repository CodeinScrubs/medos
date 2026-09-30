import { describe, expect, it, jest } from '@jest/globals';

// Pure config transform, not evidence of Android grants or runtime recreation.
const { applyShareTarget } = jest.requireActual<{
  applyShareTarget: (source: string) => string;
}>('../../../plugins/with-share-target.js');
const fixture =
  'package example\nimport android.os.Bundle\nclass MainActivity {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(null)\n  }\n}\n';

describe('share-target generation', () => {
  it('creates one UUID per SEND conversion and retains the latest converted intent', () => {
    const patched = applyShareTarget(fixture);
    expect(patched).toContain('intent.action != Intent.ACTION_SEND');
    expect(patched).toContain('intent.action = Intent.ACTION_VIEW');
    expect(patched).toContain('"&request=" + java.util.UUID.randomUUID().toString()');
    expect(patched).toContain('medosShareToLink(intent)\n    setIntent(intent)\n    super.onNewIntent(intent)');
    expect(applyShareTarget(patched)).toBe(patched);
  });
  it('upgrades an already generated activity without duplicating its hooks', () => {
    const expected = applyShareTarget(fixture);
    const legacy = expected
      .replace('    setIntent(intent)\n', '')
      .replace(' + "&request=" + java.util.UUID.randomUUID().toString()', '');
    expect(applyShareTarget(legacy)).toBe(expected);
  });
  it('fails on unsupported anchors rather than generating an incomplete activity', () => {
    expect(() => applyShareTarget('class MainActivity {}')).toThrow('could not find');
    expect(() => applyShareTarget('import android.os.Bundle\nclass MainActivity {}')).toThrow('could not find');
    expect(() => applyShareTarget('// medosShareTarget\nclass MainActivity {}')).toThrow('unsupported existing');
  });
});
