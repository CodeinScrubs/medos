import { createCapture, discardCaptureIfEmpty, updateCapture, type CaptureInput } from './queries';

export type CaptureFields = { text: string; patientId: string | null };

/**
 * The capture screen's row, created at the last useful moment.
 *
 * Three things on that screen can be the first to produce something worth
 * keeping — the keyboard, the recorder, the camera — and all three need the
 * same row. Creating it up front would leave an empty line in the inbox every
 * time the screen was opened by accident; creating it three times would leave
 * three.
 *
 * So the id is one promise, made on the first call and shared by whoever asks
 * next. Nothing here is awaited twice and nothing is created twice, including
 * when the recorder finishes in the same tick as an autosave.
 */
export class CaptureWriter {
  private id: Promise<string> | null = null;
  private fields: CaptureFields = { text: '', patientId: null };

  constructor(initial?: Partial<CaptureFields>) {
    this.fields = { text: initial?.text ?? '', patientId: initial?.patientId ?? null };
  }

  /** The newest values, as the screen last set them. */
  get current(): CaptureFields {
    return this.fields;
  }

  /** Has a row been written yet? */
  get started(): boolean {
    return this.id != null;
  }

  set(fields: CaptureFields): void {
    this.fields = fields;
  }

  /** The row id, creating it the first time somebody needs one. */
  ensure(seed: CaptureInput = {}): Promise<string> {
    this.id ??= createCapture({ text: this.fields.text, patientId: this.fields.patientId, ...seed });
    return this.id;
  }

  /** Write the current values through. Used by autosave. */
  async write(fields: CaptureFields): Promise<void> {
    this.set(fields);
    const id = await this.ensure();
    await updateCapture(id, fields);
  }

  /**
   * On the way out: drop the row if it never got anything in it.
   *
   * A row that was never created cannot be empty, so this does nothing at all
   * in the common case of opening the screen and changing your mind.
   */
  async discardIfEmpty(): Promise<boolean> {
    if (!this.id) return false;
    return discardCaptureIfEmpty(await this.id);
  }
}
