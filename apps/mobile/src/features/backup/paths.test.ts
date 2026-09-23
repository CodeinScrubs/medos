import { describe, expect, it } from '@jest/globals';

import { BACKUP_FILE_RE, backupFileName, backupNamesToPrune } from './paths';

describe('backup file identity and retention', () => {
  const at = new Date(2026, 8, 23, 12, 0, 0);
  const run1 = '00000000-0000-4000-8000-000000000001';
  const run2 = '00000000-0000-4000-8000-000000000002';

  it('gives repeated wall-clock times different names while keeping legacy names valid', () => {
    const first = backupFileName(at, true, run1);
    const second = backupFileName(at, true, run2);
    expect(first).not.toBe(second);
    expect(BACKUP_FILE_RE.test(first)).toBe(true);
    expect(BACKUP_FILE_RE.test(second)).toBe(true);
    expect(BACKUP_FILE_RE.test(backupFileName(at, true))).toBe(true);
    expect(() => backupFileName(at, true, '../wrong')).toThrow();
  });

  it('protects the verified copy after clock rollback and keeps both backup kinds', () => {
    const current = backupFileName(new Date(2025, 0, 1), true, run1);
    const full = Array.from({ length: 5 }, (_, i) => backupFileName(new Date(2026, 0, i + 1), true));
    const db = Array.from({ length: 10 }, (_, i) => backupFileName(new Date(2026, 0, i + 1), false));
    const foreign = 'personal-file.medosbak';
    const renamed = full[0]!.replace('.medosbak', ' (1).medosbak');
    const obsolete = backupNamesToPrune([current, ...full, ...db, foreign, renamed], current);
    expect(obsolete.has(current)).toBe(false);
    expect(full.filter((name) => !obsolete.has(name))).toHaveLength(2);
    expect(db.filter((name) => !obsolete.has(name))).toHaveLength(7);
    expect(obsolete.has(foreign)).toBe(false);
    expect(obsolete.has(renamed)).toBe(false);
  });

  it('prunes nothing if the verified file disappears from a second directory listing', () => {
    const names = Array.from({ length: 9 }, (_, i) => backupFileName(new Date(2026, 0, i + 1), true));
    expect(backupNamesToPrune(names, backupFileName(at, true, run1)).size).toBe(0);
  });
});
