type TerminalStatus = { isFinished: boolean; hasError: boolean; url: string | null };

/** One native recording: a cached URI or resolved stop Promise is not completion. */
export class RecordingCompletion {
  private expectedUri: string | null = null;
  private uri: string | null = null;
  private failure: Error | null = null;
  private waiters = new Set<() => void>();

  get error(): Error | null {
    return this.failure;
  }

  begin(expectedUri: string | null): void {
    if (this.waiters.size) throw new Error('تأیید ضبط قبلی هنوز در حال انجام است.');
    this.expectedUri = expectedUri || null;
    this.uri = null;
    this.failure = null;
  }

  receive(status: TerminalStatus): void {
    if (!status.isFinished && !status.hasError) return;
    // The native recorder object can be reused, but each prepared file is unique.
    if (this.expectedUri && status.url && status.url !== this.expectedUri) return;
    if (status.hasError) {
      this.failure ??= new Error('پایان ضبط با خطا همراه بود؛ این وویس ذخیره نشد.');
      this.uri = null;
    } else if (!this.failure && status.isFinished && status.url?.trim()) {
      this.uri = status.url;
    }
    if (this.failure || this.uri) this.waiters.forEach((wake) => wake());
  }

  waitForUri(timeoutMs: number): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.uri) return Promise.resolve(this.uri);
    return new Promise((resolve, reject) => {
      const complete = () => {
        if (!this.failure && !this.uri) return;
        this.waiters.delete(complete);
        clearTimeout(timer);
        if (this.failure) reject(this.failure);
        else resolve(this.uri!);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(complete);
        reject(new Error('پایان ضبط هنوز تأیید نشده است؛ دوباره تلاش کنید.'));
      }, timeoutMs);
      this.waiters.add(complete);
    });
  }
}
