/*
 * Walking the list, one patient at a time.
 *
 * The shift screen is the list; the round is the walk. The difference matters
 * on a ward round, where looking at a list means looking away from the person
 * in front of you and losing your place in it.
 *
 * Everything here is arithmetic on the order the shift already has. Nothing is
 * stored: a round has no row of its own, because the only durable fact it
 * produces — "I have seen this person" — already has one, on the shift.
 */

/**
 * A row of the shift list, as `shiftPatientsQuery` returns it — narrowed to
 * the two fields a round actually walks on.
 */
export type RoundMember = { member: { id: string; reviewedAt: Date | null } };

/**
 * Where to start, or carry on from.
 *
 * The first person not yet seen, so leaving the round and coming back resumes
 * where it was rather than starting over. When everyone has been seen there is
 * no index: the round is finished, and saying "back to the first" would send
 * somebody round the ward a second time.
 */
export function startIndex(members: readonly RoundMember[]): number | null {
  const i = members.findIndex((m) => m.member.reviewedAt == null);
  return i === -1 ? null : i;
}

/**
 * The next person after this one.
 *
 * Unseen first, looking forward and then wrapping round to the start, because
 * somebody skipped at the top of the corridor still has to be seen before the
 * round is done. Null means nobody is left: finished is a state, not a
 * position.
 *
 * `includeCurrent` is the difference between the two buttons, and it is not
 * cosmetic. Skipping somebody leaves them owed a visit, so if they are the
 * only one left the honest answer is to stay on them. Marking them seen means
 * they are done — and the list this is called with was read before that write
 * landed, so the person just ticked off has to be excluded by hand or the
 * round would offer them up again instead of ending.
 */
export function nextIndex(
  members: readonly RoundMember[],
  from: number,
  { includeCurrent = false }: { includeCurrent?: boolean } = {},
): number | null {
  const n = members.length;
  const furthest = includeCurrent ? n : n - 1;
  for (let step = 1; step <= furthest; step += 1) {
    const i = (from + step) % n;
    if (members[i]?.member.reviewedAt == null) return i;
  }
  return null;
}

/**
 * Keep the cursor pointing at the same person when the list moves underneath.
 *
 * Someone can be added to or taken off the shift from another screen while the
 * round is open. Following the id rather than the position is what stops that
 * from silently advancing the round onto a person who was never looked at.
 */
export function indexOfMember(members: readonly RoundMember[], memberId: string | null): number | null {
  if (!memberId) return null;
  const i = members.findIndex((m) => m.member.id === memberId);
  return i === -1 ? null : i;
}

/** How far along the round is, for the counter at the top. */
export function roundProgress(members: readonly RoundMember[]): { seen: number; total: number; done: boolean } {
  const seen = members.filter((m) => m.member.reviewedAt != null).length;
  return { seen, total: members.length, done: members.length > 0 && seen === members.length };
}
