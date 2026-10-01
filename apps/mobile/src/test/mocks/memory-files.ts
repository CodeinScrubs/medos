/** Bounded synchronous File/Directory contracts for backup orchestration tests.
 * No native permissions, filesystem durability or SAF behavior is simulated.
 */
export const memoryFiles = new Map<string, Uint8Array>();
const directories = new Set<string>();
export const closeFailures = new Set<string>();

export function resetMemoryFiles(): void {
  memoryFiles.clear();
  directories.clear();
  closeFailures.clear();
}

type Path = string | { uri: string };
function uri(parts: Path[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, '')).join('/');
}

export const Paths = { document: 'file:///private', cache: 'file:///cache' };
export const FileMode = { ReadOnly: 'read', Truncate: 'truncate' };

export class File {
  uri: string;
  constructor(...parts: Path[]) {
    this.uri = uri(parts);
  }
  get name(): string {
    return this.uri.split('/').at(-1)!;
  }
  get exists(): boolean {
    return memoryFiles.has(this.uri);
  }
  get size(): number | null {
    return memoryFiles.get(this.uri)?.length ?? null;
  }
  get md5(): null {
    return null;
  }
  get parentDirectory(): Directory {
    return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/')));
  }
  create(options?: { overwrite?: boolean; intermediates?: boolean }): void {
    if (this.exists && !options?.overwrite) throw new Error('synthetic file exists');
    if (options?.intermediates) this.parentDirectory.create();
    memoryFiles.set(this.uri, new Uint8Array());
  }
  delete(): void {
    memoryFiles.delete(this.uri);
  }
  moveSync(to: File, options?: { overwrite?: boolean }): void {
    if (!this.exists) throw new Error('synthetic missing source');
    if (to.exists && !options?.overwrite) throw new Error('synthetic destination exists');
    memoryFiles.set(to.uri, memoryFiles.get(this.uri)!);
    memoryFiles.delete(this.uri);
    this.uri = to.uri;
  }
  async copy(to: File | Directory, options?: { overwrite?: boolean }): Promise<void> {
    const target = to instanceof Directory ? new File(to, this.name) : to;
    if (!this.exists) throw new Error('synthetic missing source');
    if (target.exists && !options?.overwrite) throw new Error('synthetic destination exists');
    memoryFiles.set(target.uri, memoryFiles.get(this.uri)!.slice());
  }
  open(mode: string) {
    const path = this.uri;
    if (!this.exists) throw new Error('synthetic missing file');
    if (mode === FileMode.Truncate) memoryFiles.set(path, new Uint8Array());
    let offset = 0;
    let closed = false;
    return {
      readBytes: (size: number) => {
        if (closed) throw new Error('synthetic closed handle');
        const bytes = memoryFiles.get(path)!;
        const part = bytes.slice(offset, offset + size);
        offset += part.length;
        return part;
      },
      writeBytes: (bytes: Uint8Array) => {
        if (closed) throw new Error('synthetic closed handle');
        const previous = memoryFiles.get(path)!;
        const next = new Uint8Array(Math.max(previous.length, offset + bytes.length));
        next.set(previous);
        next.set(bytes, offset);
        memoryFiles.set(path, next);
        offset += bytes.length;
      },
      close: () => {
        closed = true;
        if (closeFailures.delete(path)) throw new Error('synthetic close failure');
      },
    };
  }
}

export class Directory {
  uri: string;
  constructor(...parts: Path[]) {
    this.uri = uri(parts);
  }
  get name(): string {
    return this.uri.split('/').at(-1)!;
  }
  get exists(): boolean {
    return directories.has(this.uri) || [...memoryFiles.keys()].some((path) => path.startsWith(`${this.uri}/`));
  }
  create(_options?: { intermediates?: boolean; idempotent?: boolean }): void {
    directories.add(this.uri);
  }
  delete(): void {
    for (const path of memoryFiles.keys()) if (path.startsWith(`${this.uri}/`)) memoryFiles.delete(path);
    for (const path of directories) if (path === this.uri || path.startsWith(`${this.uri}/`)) directories.delete(path);
  }
  list(): (File | Directory)[] {
    const children = new Map<string, File | Directory>();
    for (const path of [...memoryFiles.keys(), ...directories]) {
      if (!path.startsWith(`${this.uri}/`)) continue;
      const relative = path.slice(this.uri.length + 1);
      const child = `${this.uri}/${relative.split('/')[0]!}`;
      children.set(child, relative.includes('/') || directories.has(child) ? new Directory(child) : new File(child));
    }
    return [...children.values()];
  }
}
