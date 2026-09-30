import { describe, expect, it } from '@jest/globals';

import { followUpListMode, upcomingFollowUps } from './list-logic';

describe('follow-up list selection', () => {
  it('validates modes without trusting repeated route parameters', () => {
    expect(followUpListMode('upcoming')).toBe('upcoming');
    for (const value of [undefined, 'other', ['upcoming'], 1]) expect(followUpListMode(value)).toBe('due');
  });
  it('uses the local day boundary and preserves the query order', () => {
    const now = new Date(2026, 8, 30, 12);
    const rows = [
      { id: 'today', followUp: { dueAt: new Date(2026, 8, 30, 23, 59, 59, 999) } },
      { id: 'tomorrow', followUp: { dueAt: new Date(2026, 9, 1) } },
      { id: 'later', followUp: { dueAt: new Date(2026, 9, 2) } },
    ];
    expect(upcomingFollowUps(rows, now).map((r) => r.id)).toEqual(['tomorrow', 'later']);
    expect(upcomingFollowUps(rows, new Date(2026, 9, 1)).map((r) => r.id)).toEqual(['later']);
  });
  it.each([0, 1, 5, 6, 40])('counts all %i upcoming rows before any preview limit', (count) => {
    const rows = Array.from({ length: count }, (_, id) => ({ id, followUp: { dueAt: new Date(2026, 9, 1) } }));
    expect(upcomingFollowUps(rows, new Date(2026, 8, 30)).length).toBe(count);
  });
});
