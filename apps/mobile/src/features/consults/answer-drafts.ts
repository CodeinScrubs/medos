export type AnswerDraft = { response: string; instruction: string };
export type AnswerDrafts = { activeId: string | null; entries: Record<string, AnswerDraft> };
export type AnswerAction =
  | { type: 'open'; id: string }
  | { type: 'close' }
  | { type: 'edit'; id: string; patch: Partial<AnswerDraft> }
  | { type: 'submitted'; id: string };

export const EMPTY_ANSWER: AnswerDraft = { response: '', instruction: '' };

/** Keep unsent text attached to its consult when another card is opened. */
export function answerDraftsReducer(state: AnswerDrafts, action: AnswerAction): AnswerDrafts {
  switch (action.type) {
    case 'open':
      return { ...state, activeId: action.id };
    case 'close':
      return { ...state, activeId: null };
    case 'edit':
      return {
        ...state,
        entries: { ...state.entries, [action.id]: { ...(state.entries[action.id] ?? EMPTY_ANSWER), ...action.patch } },
      };
    case 'submitted': {
      const entries = { ...state.entries };
      delete entries[action.id];
      return { entries, activeId: state.activeId === action.id ? null : state.activeId };
    }
  }
}
