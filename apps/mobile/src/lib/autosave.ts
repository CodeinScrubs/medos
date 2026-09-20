/**
 * When to write what is being typed.
 *
 * A plain debounce is the wrong tool on its own: it postpones the write for as
 * long as the typing continues, so a doctor writing a long admission note
 * without pausing is exactly the person whose work is least protected. So
 * there are two clocks — a short one after the last keystroke, and a hard
 * ceiling from the first unsaved change. Whichever comes first wins.
 *
 * Writes are serialized through one promise chain. Overlapping writes of the
 * same document would race on the row and could land an older value last.
 *
 * A failed write keeps its value. The next change or flush retries it, and the
 * state says "not saved" until one of them succeeds, because the one thing
 * this must never do is claim the text is safe when it is not.
 */

export type AutosaveState =
  /** Nothing has changed since the last successful write. */
  | { status: 'idle' }
  /** Changed, not written yet. */
  | { status: 'pending' }
  | { status: 'writing' }
  | { status: 'saved'; at: number }
  | { status: 'failed'; error: unknown; at: number };

export type AutosaveOptions<T> = {
  write: (value: T) => Promise<void>;
  /** Quiet time after the last change. */
  delayMs?: number;
  /** Longest a change may wait, however fast the typing. */
  maxWaitMs?: number;
  onState?: (state: AutosaveState) => void;
  now?: () => number;
};

export class Autosave<T> {
  private readonly write: (value: T) => Promise<void>;
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  private readonly onState: (state: AutosaveState) => void;
  private readonly now: () => number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  /** The value waiting to be written, if any. Also holds a failed one. */
  private pending: { value: T } | null = null;
  private firstChangeAt: number | null = null;
  private stopped = false;

  constructor(options: AutosaveOptions<T>) {
    this.write = options.write;
    this.delayMs = options.delayMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 3000;
    this.onState = options.onState ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  /** Record a new value and schedule the write. */
  change(value: T): void {
    if (this.stopped) return;
    this.pending = { value };
    if (this.firstChangeAt == null) this.firstChangeAt = this.now();
    this.onState({ status: 'pending' });
    const waited = this.now() - this.firstChangeAt;
    this.arm(Math.max(0, Math.min(this.delayMs, this.maxWaitMs - waited)));
  }

  /** Write whatever is waiting, now. Resolves once nothing is left to write. */
  async flush(): Promise<void> {
    this.clearTimer();
    await this.run();
  }

  /**
   * Stop scheduling and forget what was waiting.
   *
   * For a draft the user discarded, or an editor leaving the screen after its
   * content has been committed somewhere else. Writes already in flight are
   * not cancelled — they are already someone else's problem to finish.
   */
  cancel(): void {
    this.clearTimer();
    this.pending = null;
    this.firstChangeAt = null;
    this.stopped = true;
  }

  /** Is there a change that has not reached storage? */
  get unsaved(): boolean {
    return this.pending != null;
  }

  private arm(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private run(): Promise<void> {
    this.chain = this.chain.then(() => this.writeOnce());
    return this.chain;
  }

  private async writeOnce(): Promise<void> {
    const item = this.pending;
    if (!item) return;
    this.pending = null;
    this.onState({ status: 'writing' });
    try {
      await this.write(item.value);
      // Anything typed while this was in flight is already waiting in
      // `pending`; only a clean run resets the ceiling.
      if (this.pending == null) this.firstChangeAt = null;
      this.onState({ status: 'saved', at: this.now() });
    } catch (error) {
      // Keep the newer value if one arrived meanwhile; never overwrite it.
      if (this.pending == null) this.pending = item;
      this.onState({ status: 'failed', error, at: this.now() });
      if (!this.stopped) this.arm(this.delayMs);
    }
  }
}
