/** A resolved flush is not necessarily successful; navigation needs a true result. */
export async function saveBeforeLeave(
  flush: () => Promise<boolean>,
  leave: () => void | Promise<void>,
): Promise<boolean> {
  if (!(await flush())) return false;
  await leave();
  return true;
}

/** All mounted fields must finish before their screen changes patient or closes a shift. */
export class SaveGroup {
  private fields = new Set<{ readonly unsaved: boolean; flush(): Promise<boolean> }>();
  private acting = false;

  register(field: { readonly unsaved: boolean; flush(): Promise<boolean> }): () => void {
    this.fields.add(field);
    return () => {
      this.fields.delete(field);
    };
  }

  async flush(): Promise<boolean> {
    const results = await Promise.allSettled([...this.fields].map((field) => field.flush()));
    return (
      results.every((result) => result.status === 'fulfilled' && result.value) &&
      [...this.fields].every((field) => !field.unsaved)
    );
  }

  async perform(action: () => void | Promise<void>): Promise<'done' | 'unsaved' | 'busy'> {
    if (this.acting) return 'busy';
    this.acting = true;
    try {
      return (await saveBeforeLeave(() => this.flush(), action)) ? 'done' : 'unsaved';
    } finally {
      this.acting = false;
    }
  }
}
