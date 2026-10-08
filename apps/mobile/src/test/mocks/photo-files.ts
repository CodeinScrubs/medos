/** Native file contracts for photo interruption tests; writes retain byte identity. */
export const photoFiles = new Map<string, Uint8Array>();
export const photoNative = {
  copyError: false,
  truncateCopy: false,
  renderError: false,
  sequence: 0,
  beforeCopy: null as null | ((source: string, destination: string) => Promise<void> | void),
  beforeRender: null as null | ((source: string) => Promise<void> | void),
};
export const Paths = { document: 'file:///documents' };
export const FileMode = { ReadOnly: 'read' };

export class File {
  uri: string;
  constructor(...segments: (string | { uri: string })[]) {
    this.uri = segments.map((s) => (typeof s === 'string' ? s : s.uri)).join('/');
  }
  get name() {
    return this.uri.split('/').at(-1)!;
  }
  get exists() {
    return photoFiles.has(this.uri);
  }
  get size() {
    return photoFiles.get(this.uri)?.length ?? null;
  }
  open() {
    const bytes = photoFiles.get(this.uri);
    if (!bytes) throw new Error('Synthetic missing file');
    let offset = 0;
    return {
      readBytes(length: number) {
        const chunk = bytes.slice(offset, offset + length);
        offset += chunk.length;
        return chunk;
      },
      close() {},
    };
  }
  async copy(destination: File) {
    await photoNative.beforeCopy?.(this.uri, destination.uri);
    if (destination.exists) throw new Error('Synthetic overwrite refusal');
    const bytes = photoFiles.get(this.uri);
    if (!bytes) throw new Error('Synthetic unavailable source');
    if (photoNative.copyError) throw new Error('Synthetic native copy failure');
    photoFiles.set(destination.uri, bytes.slice(0, photoNative.truncateCopy ? 1 : undefined));
  }
}

export class Directory {
  uri: string;
  constructor(...segments: (string | { uri: string })[]) {
    this.uri = segments.map((s) => (typeof s === 'string' ? s : s.uri)).join('/');
  }
  get name() {
    return this.uri.split('/').at(-1)!;
  }
  get exists() {
    return [...photoFiles.keys()].some((path) => path.startsWith(`${this.uri}/`));
  }
  create() {}
  list(): (Directory | File)[] {
    const paths = [...photoFiles.keys()].filter((path) => path.startsWith(`${this.uri}/`));
    const names = [...new Set(paths.map((path) => path.slice(this.uri.length + 1).split('/')[0]!))];
    return names.map((name) =>
      paths.includes(`${this.uri}/${name}`) ? new File(this.uri, name) : new Directory(this.uri, name),
    );
  }
}

export const SaveFormat = { JPEG: 'jpeg' };
export const ImageManipulator = {
  manipulate(uri: string) {
    let edge = 640;
    return {
      resize(size: { width?: number; height?: number }) {
        edge = size.width ?? size.height ?? 640;
      },
      release() {},
      async renderAsync() {
        await photoNative.beforeRender?.(uri);
        if (photoNative.renderError) throw new Error('Synthetic render failure');
        const bytes = photoFiles.get(uri);
        if (!bytes) throw new Error('Synthetic missing source');
        return {
          release() {},
          async saveAsync({ compress }: { compress: number }) {
            const output = `file:///cache/render-${++photoNative.sequence}.jpg`;
            photoFiles.set(output, new Uint8Array([...bytes, compress > 0.8 ? 9 : 8]));
            return { uri: output, width: edge, height: (edge * 3) / 4 };
          },
        };
      },
    };
  },
};

export function resetPhotoFiles() {
  photoFiles.clear();
  Object.assign(photoNative, {
    copyError: false,
    truncateCopy: false,
    renderError: false,
    sequence: 0,
    beforeCopy: null,
    beforeRender: null,
  });
}
