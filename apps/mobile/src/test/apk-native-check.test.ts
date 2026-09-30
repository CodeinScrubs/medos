import { describe, expect, it, jest } from '@jest/globals';

const { REQUIRED_LIBRARIES, validateNativeEntries } = jest.requireActual<{
  REQUIRED_LIBRARIES: string[];
  validateNativeEntries: (entries: string[], abi: string) => void;
}>('../../scripts/apk-native-check.js');

describe('APK native entry gate', () => {
  it.each(['arm64-v8a', 'x86_64'])('accepts required libraries for one %s build', (abi) => {
    expect(() =>
      validateNativeEntries(
        REQUIRED_LIBRARIES.map((name) => `lib/${abi}/${name}`),
        abi,
      ),
    ).not.toThrow();
  });
  it('rejects the observed artifact shape: x86 RN/Hermes present but Expo core missing', () => {
    const entries = REQUIRED_LIBRARIES.filter((name) => name !== 'libexpo-modules-core.so').map(
      (name) => `lib/x86_64/${name}`,
    );
    expect(() => validateNativeEntries(entries, 'x86_64')).toThrow('missing libexpo-modules-core.so');
  });
  it('rejects missing SQLite, wrong/combined ABI and unsupported targets', () => {
    const arm = REQUIRED_LIBRARIES.map((name) => `lib/arm64-v8a/${name}`);
    expect(() =>
      validateNativeEntries(
        arm.filter((name) => !name.endsWith('/libexpo-sqlite.so')),
        'arm64-v8a',
      ),
    ).toThrow('libexpo-sqlite.so');
    expect(() => validateNativeEntries(arm, 'x86_64')).toThrow('missing');
    expect(() => validateNativeEntries([...arm, 'lib/x86_64/libreactnative.so'], 'arm64-v8a')).toThrow(
      'unexpected ABI',
    );
    expect(() => validateNativeEntries(arm, 'x86')).toThrow('Unsupported');
  });
});
