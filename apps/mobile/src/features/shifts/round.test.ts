import { describe, expect, it } from '@jest/globals';

import { indexOfMember, nextIndex, roundProgress, startIndex, type RoundMember } from './round';

const seen = new Date('2026-09-21T02:00:00Z');

function list(...reviewed: boolean[]): RoundMember[] {
  return reviewed.map((r, i) => ({ member: { id: `m${i}`, reviewedAt: r ? seen : null } }));
}

describe('where a round starts', () => {
  it('is the first person nobody has seen', () => {
    expect(startIndex(list(true, true, false, false))).toBe(2);
  });

  /*
   * Coming back to a half-finished round has to resume, not restart. Starting
   * over would send somebody round the ward twice, which is how a round stops
   * being trusted.
   */
  it('skips over everyone already seen, wherever they are in the list', () => {
    expect(startIndex(list(false, true, false))).toBe(0);
    expect(startIndex(list(true, false, true))).toBe(1);
  });

  it('is nowhere once everyone has been seen', () => {
    expect(startIndex(list(true, true))).toBeNull();
  });

  it('is nowhere on an empty shift', () => {
    expect(startIndex([])).toBeNull();
  });
});

describe('moving to the next patient', () => {
  it('goes forward to the next unseen one', () => {
    expect(nextIndex(list(false, false, false), 0)).toBe(1);
  });

  it('steps over people already seen', () => {
    expect(nextIndex(list(false, true, true, false), 0)).toBe(3);
  });

  /*
   * Someone skipped at the top of the corridor is still owed a visit, so the
   * walk wraps rather than ending at the bottom of the list.
   */
  it('wraps round to somebody who was skipped earlier', () => {
    expect(nextIndex(list(false, true, true), 2)).toBe(0);
  });

  /*
   * Skipping the only person left unseen has to leave you on them. Moving on
   * would mean the round declared itself finished while somebody was still
   * owed a visit.
   */
  it('stays on the last unseen person when they are skipped', () => {
    expect(nextIndex(list(true, false, true), 1, { includeCurrent: true })).toBe(1);
  });

  /*
   * Marking somebody seen is called with the list as it was a moment before
   * the write, so the person just ticked off is excluded deliberately.
   */
  it('ends the round when the person just seen was the last one', () => {
    expect(nextIndex(list(true, false, true), 1)).toBeNull();
  });

  it('is nowhere once everybody is seen', () => {
    expect(nextIndex(list(true, true, true), 1)).toBeNull();
    expect(nextIndex(list(true, true, true), 1, { includeCurrent: true })).toBeNull();
  });
});

describe('the cursor', () => {
  /*
   * The list can change from another screen while the round is open. Following
   * a position instead of a person would quietly move the round onto somebody
   * who was never looked at.
   */
  it('follows the person, not the position', () => {
    const before = list(false, false, false);
    expect(indexOfMember(before, 'm2')).toBe(2);

    const afterRemoval = [before[0]!, before[2]!];
    expect(indexOfMember(afterRemoval, 'm2')).toBe(1);
  });

  it('has no answer for somebody who left the shift', () => {
    expect(indexOfMember(list(false, false), 'gone')).toBeNull();
    expect(indexOfMember(list(false), null)).toBeNull();
  });
});

describe('round progress', () => {
  it('counts what is done and says when it is', () => {
    expect(roundProgress(list(true, false, true))).toEqual({ seen: 2, total: 3, done: false });
    expect(roundProgress(list(true, true))).toEqual({ seen: 2, total: 2, done: true });
  });

  it('is not "done" when there was nobody to see', () => {
    expect(roundProgress([])).toEqual({ seen: 0, total: 0, done: false });
  });
});
