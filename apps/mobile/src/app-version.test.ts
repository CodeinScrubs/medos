import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

/*
 * One version number, in three files.
 *
 * `app.json` is what reaches the APK and the About screen; the two
 * `package.json` files are what `npm run brief` and every release note read.
 * They drifted apart once already — the phone said 0.7.0 while the repository
 * said 0.5.0 — and nothing noticed, because nothing was looking.
 */
const read = (path: string) => JSON.parse(readFileSync(join(__dirname, path), 'utf8')) as { version?: string };

describe('version numbers', () => {
  it('agree across app.json and both package.json files', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')) as {
      expo: { version: string; android: { versionCode: number } };
    };
    expect(app.expo.version).toBe(read('../package.json').version);
    expect(app.expo.version).toBe(read('../../../package.json').version);
    expect(app.expo.android.versionCode).toBeGreaterThan(0);
  });
});
