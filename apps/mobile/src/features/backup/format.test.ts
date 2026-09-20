import { describe, expect, it } from '@jest/globals';
import type { FileHandle } from 'expo-file-system';

import { DEFAULT_KDF, equalBytes, randomBytes, SALT_BYTES, TAG_BYTES } from '@/lib/crypto';

import {
  archiveEnd,
  archiveStart,
  buildHeader,
  CHUNK_BYTES,
  decodeJson,
  DecryptingReader,
  encodeJson,
  EncryptingWriter,
  ENTRY_FILE,
  ENTRY_MANIFEST,
  entryHeader,
  HEADER_BYTES,
  MIN_CHUNK_BYTES,
  NotABackupError,
  parseHeader,
  readArchiveStart,
  streamsMatch,
  readEntryHeader,
  WrongPassphraseError,
} from './format';

/** An in-memory stand-in for an expo-file-system FileHandle. */
class MemoryFile {
  bytes: Uint8Array = new Uint8Array(0);
  offset = 0;

  writeBytes(data: Uint8Array): void {
    const next = new Uint8Array(this.bytes.length + data.length);
    next.set(this.bytes);
    next.set(data, this.bytes.length);
    this.bytes = next;
  }

  readBytes(n: number): Uint8Array {
    const out = this.bytes.slice(this.offset, this.offset + n);
    this.offset += out.length;
    return out;
  }

  static of(bytes: Uint8Array): MemoryFile {
    const file = new MemoryFile();
    file.bytes = bytes;
    return file;
  }
}

const asHandle = (file: MemoryFile) => file as unknown as FileHandle;

/** Megabytes of incompressible filler, faster than asking the OS for random bytes. */
function noise(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = 0x9e3779b9 ^ n;
  for (let i = 0; i < n; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

const KEY = randomBytes(32);
const SALT = randomBytes(SALT_BYTES);

/*
 * The chunk size is recorded in every header and readers follow it, so these
 * tests use small chunks: the same multi-chunk logic with a fraction of the
 * data to push through AES in JavaScript. One test uses the real size.
 */
const CHUNK = MIN_CHUNK_BYTES * 4;
const sealedChunk = CHUNK + TAG_BYTES;

type Entry = { type: number; path: string; data: Uint8Array };

/** Jest's deep equality walks typed arrays element by element — far too slow for megabytes. */
function expectSameEntries(actual: Entry[], expected: Entry[]): void {
  expect(actual.map((e) => [e.type, e.path, e.data.length])).toEqual(
    expected.map((e) => [e.type, e.path, e.data.length]),
  );
  actual.forEach((e, i) => expect(equalBytes(e.data, expected[i]!.data)).toBe(true));
}

async function writeArchive(entries: Entry[], key = KEY, chunkBytes = CHUNK): Promise<Uint8Array> {
  const file = new MemoryFile();
  const writer = await EncryptingWriter.open(asHandle(file), key, buildHeader(DEFAULT_KDF, SALT, chunkBytes));
  await writer.write(archiveStart());
  for (const e of entries) {
    await writer.write(entryHeader(e.type, e.path, e.data.length));
    await writer.write(e.data);
  }
  await writer.write(archiveEnd());
  await writer.finish();
  return file.bytes;
}

async function readArchive(bytes: Uint8Array, key = KEY): Promise<Entry[]> {
  const file = MemoryFile.of(bytes);
  const header = parseHeader(file.readBytes(HEADER_BYTES));
  const reader = await DecryptingReader.open(asHandle(file), key, header, bytes.length);
  await readArchiveStart(reader);
  const out: Entry[] = [];
  for (;;) {
    const info = await readEntryHeader(reader);
    if (!info) break;
    const parts: Uint8Array[] = [];
    await reader.pipe(info.size, (chunk) => parts.push(chunk.slice()));
    const data = new Uint8Array(info.size);
    let at = 0;
    for (const p of parts) {
      data.set(p, at);
      at += p.length;
    }
    out.push({ type: info.type, path: info.path, data });
  }
  await reader.finish();
  return out;
}

const manifest = { type: ENTRY_MANIFEST, path: 'manifest.json', data: encodeJson({ app: 'MedOS', n: 1 }) };

describe('backup file format', () => {
  it('round-trips a manifest, a multi-chunk database and media', async () => {
    const entries: Entry[] = [
      manifest,
      { type: ENTRY_FILE, path: 'db/medos.db', data: noise(5 * CHUNK + 1234) },
      { type: ENTRY_FILE, path: 'media/2024/06/photo.jpg', data: noise(5000) },
      { type: ENTRY_FILE, path: 'media/2024/06/empty.m4a', data: new Uint8Array(0) },
    ];
    const read = await readArchive(await writeArchive(entries));
    expectSameEntries(read, entries);
    expect(decodeJson<{ app: string }>(read[0]!.data).app).toBe('MedOS');
  });

  it('handles a body that is an exact multiple of the chunk size', async () => {
    // archive start (9) + entry header (1 + 2 + 1 + 8) + data + end (1)
    const overhead = 9 + 12 + 1;
    const entries: Entry[] = [{ type: ENTRY_FILE, path: 'x', data: noise(CHUNK - overhead) }];
    const bytes = await writeArchive(entries);
    // One full chunk, then an empty final chunk sealed as "last".
    expect(bytes.length).toBe(HEADER_BYTES + sealedChunk + TAG_BYTES);
    expectSameEntries(await readArchive(bytes), entries);
  });

  it('works with the production chunk size', async () => {
    const entries: Entry[] = [manifest, { type: ENTRY_FILE, path: 'db/medos.db', data: noise(CHUNK_BYTES + 99) }];
    const bytes = await writeArchive(entries, KEY, CHUNK_BYTES);
    // archive start + two entries (11-byte header + path + data each) + end marker
    const plaintext = 9 + (11 + 13 + manifest.data.length) + (11 + 11 + CHUNK_BYTES + 99) + 1;
    expect(bytes.length).toBe(HEADER_BYTES + plaintext + 2 * TAG_BYTES); // exactly two chunks
    expectSameEntries(await readArchive(bytes), entries);
  });

  it('round-trips an archive with no entries', async () => {
    expect(await readArchive(await writeArchive([]))).toEqual([]);
  });

  it('writes the documented header layout', () => {
    const header = buildHeader(DEFAULT_KDF, SALT).raw;
    expect(new TextDecoder().decode(header.subarray(0, 8))).toBe('MEDOSBAK');
    expect(Array.from(header.subarray(8, 16))).toEqual([1, DEFAULT_KDF.scheme, 15, 8, 1, 0, 0, 0]);
    expect(header.subarray(16, 32)).toEqual(SALT);
    expect(header[39]).toBe(0);
    expect(new DataView(header.buffer).getUint32(40, true)).toBe(CHUNK_BYTES);
    expect(Array.from(header.subarray(44, 48))).toEqual([0, 0, 0, 0]);
  });

  it('encodes entry sizes as 64-bit little-endian', () => {
    const header = entryHeader(ENTRY_FILE, 'a', 2 ** 32 + 5);
    expect(Array.from(header)).toEqual([1, 1, 0, 97, 5, 0, 0, 0, 1, 0, 0, 0]);
  });
});

describe('a damaged or foreign file fails before anything is restored', () => {
  const entries: Entry[] = [manifest, { type: ENTRY_FILE, path: 'db/medos.db', data: noise(3 * CHUNK) }];
  let original: Uint8Array;

  const fresh = async () => {
    original ??= await writeArchive(entries);
    return original.slice();
  };

  it('reports a wrong passphrase as such', async () => {
    await expect(readArchive(await fresh(), randomBytes(32))).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('detects a changed byte', async () => {
    const bytes = await fresh();
    const at = HEADER_BYTES + sealedChunk + 100; // inside the second chunk
    bytes[at] = bytes[at]! ^ 0x01;
    await expect(readArchive(bytes)).rejects.toThrow('آسیب دیده');
  });

  it('detects a file cut off at a chunk boundary', async () => {
    const bytes = await fresh();
    const cut = bytes.subarray(0, HEADER_BYTES + 2 * sealedChunk);
    await expect(readArchive(cut)).rejects.toThrow();
  });

  it('detects a file cut off mid-chunk', async () => {
    const bytes = await fresh();
    await expect(readArchive(bytes.subarray(0, bytes.length - 10))).rejects.toThrow();
  });

  it('detects chunks swapped around', async () => {
    const bytes = await fresh();
    const a = HEADER_BYTES + sealedChunk;
    const b = HEADER_BYTES + 2 * sealedChunk;
    const first = bytes.slice(a, a + sealedChunk);
    bytes.copyWithin(a, b, b + sealedChunk);
    bytes.set(first, b);
    await expect(readArchive(bytes)).rejects.toThrow();
  });

  it('detects data appended after the end', async () => {
    const bytes = await fresh();
    const longer = new Uint8Array(bytes.length + 64);
    longer.set(bytes);
    await expect(readArchive(longer)).rejects.toThrow();
  });

  it('detects a changed header, which is authenticated too', async () => {
    const bytes = await fresh();
    bytes[16] = bytes[16]! ^ 0x01; // first salt byte
    await expect(readArchive(bytes)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});

describe('parseHeader', () => {
  const valid = () => buildHeader(DEFAULT_KDF, SALT).raw.slice();

  it('accepts what buildHeader writes', () => {
    const parsed = parseHeader(valid());
    expect(parsed.kdf).toEqual(DEFAULT_KDF);
    expect(parsed.chunkBytes).toBe(CHUNK_BYTES);
  });

  it.each([
    ['a short file', (h: Uint8Array) => h.subarray(0, 20)],
    ['another file type', (h: Uint8Array) => h.fill(0x41, 0, 8)],
    ['a newer format version', (h: Uint8Array) => h.fill(2, 8, 9)],
    ['an unknown passphrase scheme', (h: Uint8Array) => h.fill(9, 9, 10)],
    ['a memory-exhausting scrypt cost', (h: Uint8Array) => h.fill(30, 10, 11)],
    ['a zero chunk size', (h: Uint8Array) => h.fill(0, 40, 44)],
    ['a huge chunk size', (h: Uint8Array) => h.fill(0xff, 40, 44)],
  ])('rejects %s', (_, damage) => {
    expect(() => parseHeader(damage(valid()))).toThrow(NotABackupError);
  });
});

describe('streamsMatch', () => {
  const reader = (bytes: number[]) => {
    let at = 0;
    return {
      read(length: number) {
        const out = Uint8Array.from(bytes.slice(at, at + length));
        at += out.length;
        return out;
      },
    };
  };

  const source = [1, 2, 3, 4, 5, 6, 7];

  it('accepts a copy that is byte for byte the same', () => {
    expect(streamsMatch(reader(source), reader([...source]), source.length, 3)).toBe(true);
  });

  // The whole point: a destination whose length was reported correctly and
  // whose contents are not what was written.
  it('rejects a copy of the same length with a byte changed', () => {
    expect(streamsMatch(reader(source), reader([1, 2, 3, 9, 5, 6, 7]), source.length, 3)).toBe(false);
  });

  it('rejects a copy that runs out early', () => {
    expect(streamsMatch(reader(source), reader([1, 2, 3, 4]), source.length, 3)).toBe(false);
  });

  it('rejects a copy with something appended to it', () => {
    expect(streamsMatch(reader(source), reader([...source, 8]), source.length, 3)).toBe(false);
  });

  it('reads in chunks, whatever the chunk size', () => {
    expect(streamsMatch(reader(source), reader([...source]), source.length, 1)).toBe(true);
    expect(streamsMatch(reader(source), reader([...source]), source.length, 1024)).toBe(true);
  });
});
