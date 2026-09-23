export type AnswerDraft = { response: string; instruction: string };
export class ConsultDraftConflict extends Error {
  constructor(message = 'نسخهٔ تازه‌تری ذخیره شده است؛ نوشتهٔ شما جایگزین آن نشد.') {
    super(message);
    this.name = 'ConsultDraftConflict';
  }
}
