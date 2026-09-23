import { describe, expect, it } from '@jest/globals';

import { answerDraftsReducer, EMPTY_ANSWER } from './answer-drafts';

describe('consult reply identity', () => {
  it('keeps a cancelled reply with A without pre-filling B', () => {
    let state = answerDraftsReducer({ activeId: null, entries: {} }, { type: 'open', id: 'A' });
    state = answerDraftsReducer(state, {
      type: 'edit',
      id: 'A',
      patch: { response: 'A reply', instruction: 'A follow-up' },
    });
    state = answerDraftsReducer(state, { type: 'close' });
    state = answerDraftsReducer(state, { type: 'open', id: 'B' });
    expect(state.entries.B ?? EMPTY_ANSWER).toEqual({ response: '', instruction: '' });
    state = answerDraftsReducer(state, { type: 'edit', id: 'B', patch: { response: 'B reply' } });
    state = answerDraftsReducer(state, { type: 'submitted', id: 'B' });
    state = answerDraftsReducer(state, { type: 'open', id: 'A' });
    expect(state.entries.A).toEqual({ response: 'A reply', instruction: 'A follow-up' });
  });

  it('a late submission for A does not clear the active reply for B', () => {
    const state = answerDraftsReducer(
      { activeId: 'B', entries: { A: { response: 'A', instruction: '' }, B: { response: 'B', instruction: '' } } },
      { type: 'submitted', id: 'A' },
    );
    expect(state.activeId).toBe('B');
    expect(state.entries.B?.response).toBe('B');
  });
});
