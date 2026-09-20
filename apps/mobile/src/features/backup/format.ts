import type { FileHandle } from 'expo-file-system';

import {
  chunkCipher,
  isPassphraseScheme,
  isSaneKdf,
  NONCE_PREFIX_BYTES,
  randomBytes,
  SALT_BYTES,
  TAG_BYTES,
  type ChunkCipher,
  type KdfParams,
} from '@/lib/crypto';

/**
 * The `.medosbak` file format, version 1.
 *
 *   ┌──────────── header, 48 bytes, plaintext, authenticated as AAD ───────────┐
 *   │ "MEDOSBAK" │ ver │ kdf │ log2N │ r │ p │ 3×0 │ salt 16 │ nonce-prefix 7 │
 *   │   (kdf = scrypt with passphrase scheme 1 or 2; see lib/crypto.ts)          │
 *   │ 0 │ chunk size u32le │ 4×0                                              │
 *   ├──────────── body ────────────────────────────────────────────────────────┤
 *   │ chunk 0: AES-256-GCM(1 MiB plaintext) ‖ tag                              │
 *   │ chunk 1 …                                                                │
 *   │ last chunk: < 1 MiB plaintext (possibly empty) ‖ tag, sealed "last"      │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 * The decrypted body is an archive:
 *
 *   "MEDOSARC" │ ver │ entries… │ 0x00
 *   entry  = type u8 │ path-len u16le │ path utf8 │ size u64le │ bytes
 *   type 1 = file, type 2 = manifest (JSON)
 *
 * Deliberately simple and fully specified here, so the data is recoverable
 * even without this app: anyone with the passphrase and this comment can write
 * a decoder.
 */

export const MAGIC = 'MEDOSBAK';
export const ARCHIVE_MAGIC = 'MEDOSARC';
export const FORMAT_VERSION = 1;
export const ARCHIVE_VERSION = 1;
export const HEADER_BYTES = 48;
export const CHUNK_BYTES = 1024 * 1024;
/** Chunk sizes a reader accepts; anything else is a damaged or foreign header. */
export const MIN_CHUNK_BYTES = 1024;
export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
/** The manifest is a small JSON document; a huge one means a damaged file. */
export const MAX_MANIFEST_BYTES = 1024 * 1024;

export const ENTRY_END = 0;
export const ENTRY_FILE = 1;
export const ENTRY_MANIFEST = 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type BackupHeader = {
  version: number;
  kdf: KdfParams;
  salt: Uint8Array;
  noncePrefix: Uint8Array;
  chunkBytes: number;
  raw: Uint8Array;
};

/** `chunkBytes` is recorded in the header, so readers follow whatever the writer chose. */
export function buildHeader(kdf: KdfParams, salt: Uint8Array, chunkBytes = CHUNK_BYTES): BackupHeader {
  if (salt.length !== SALT_BYTES) throw new Error('bad salt length');
  if (chunkBytes < MIN_CHUNK_BYTES || chunkBytes > MAX_CHUNK_BYTES) throw new Error('bad chunk size');
  const raw = new Uint8Array(HEADER_BYTES);
  const view = new DataView(raw.buffer);
  raw.set(encoder.encode(MAGIC), 0);
  raw[8] = FORMAT_VERSION;
  raw[9] = kdf.scheme; // scrypt + passphrase normalisation scheme
  raw[10] = kdf.log2N;
  raw[11] = kdf.r;
  raw[12] = kdf.p;
  raw.set(salt, 16);
  const noncePrefix = randomBytes(NONCE_PREFIX_BYTES);
  raw.set(noncePrefix, 32);
  view.setUint32(40, chunkBytes, true);
  return { version: FORMAT_VERSION, kdf, salt, noncePrefix, chunkBytes, raw };
}

export class NotABackupError extends Error {}

export function parseHeader(raw: Uint8Array): BackupHeader {
  if (raw.length < HEADER_BYTES || decoder.decode(raw.subarray(0, 8)) !== MAGIC) {
    throw new NotABackupError('این فایل، بکاپ MedOS نیست.');
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const version = view.getUint8(8);
  if (version !== FORMAT_VERSION) {
    throw new NotABackupError(`نسخه‌ی این بکاپ (${version}) با این نسخه‌ی اپ سازگار نیست.`);
  }

  // Everything below is read before it can be authenticated, so it is range
  // checked: a damaged header must fail here, not ask for gigabytes of memory.
  const scheme = view.getUint8(9);
  const kdf = isPassphraseScheme(scheme)
    ? { scheme, log2N: view.getUint8(10), r: view.getUint8(11), p: view.getUint8(12) }
    : null;
  if (!kdf || !isSaneKdf(kdf)) throw new NotABackupError('روش رمزنگاری این بکاپ شناخته نشد.');

  const chunkBytes = view.getUint32(40, true);
  if (chunkBytes < MIN_CHUNK_BYTES || chunkBytes > MAX_CHUNK_BYTES) {
    throw new NotABackupError('ساختار این فایل بکاپ شناخته نشد.');
  }

  return {
    version,
    kdf,
    salt: raw.slice(16, 32),
    noncePrefix: raw.slice(32, 32 + NONCE_PREFIX_BYTES),
    chunkBytes,
    raw: raw.slice(0, HEADER_BYTES),
  };
}

/* -------------------------------------------------------------------------- */
/*  Encrypting writer                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Buffers plaintext into 1 MiB chunks, seals each, and writes it out.
 * Memory use stays at about two chunks no matter how large the backup is.
 */
export class EncryptingWriter {
  private readonly buffer: Uint8Array;
  private fill = 0;
  private index = 0;
  bytesIn = 0;

  private constructor(
    private readonly out: FileHandle,
    private readonly cipher: ChunkCipher,
    header: BackupHeader,
  ) {
    this.buffer = new Uint8Array(header.chunkBytes);
    out.writeBytes(header.raw);
  }

  /** Writes the header and returns a writer for the body. */
  static async open(out: FileHandle, key: Uint8Array, header: BackupHeader): Promise<EncryptingWriter> {
    return new EncryptingWriter(out, await chunkCipher(key, header.noncePrefix, header.raw), header);
  }

  async write(bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(bytes.length - offset, this.buffer.length - this.fill);
      this.buffer.set(bytes.subarray(offset, offset + take), this.fill);
      this.fill += take;
      offset += take;
      this.bytesIn += take;
      if (this.fill === this.buffer.length) await this.flush(false);
    }
  }

  /** Always emits a final chunk (possibly empty) sealed as "last". */
  async finish(): Promise<void> {
    await this.flush(true);
  }

  private async flush(last: boolean): Promise<void> {
    // A copy, not a view: the buffer is refilled while the chunk is sealed.
    const sealed = await this.cipher.seal(this.index, last, this.buffer.slice(0, this.fill));
    this.out.writeBytes(sealed);
    this.index += 1;
    this.fill = 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  Decrypting reader                                                           */
/* -------------------------------------------------------------------------- */

export class WrongPassphraseError extends Error {}

const DAMAGED = 'فایل بکاپ آسیب دیده یا ناقص است.';

/**
 * Pull-based reader over the decrypted body. `readExactly` is for small
 * structural fields; `pipe` streams a file's bytes straight to disk.
 */
export class DecryptingReader {
  private current: Uint8Array = new Uint8Array(0);
  private pos = 0;
  private index = 0;
  private readonly sealedChunk: number;
  private readonly totalChunks: number;
  bytesOut = 0;

  private constructor(
    private readonly input: FileHandle,
    private readonly cipher: ChunkCipher,
    header: BackupHeader,
    fileSize: number,
  ) {
    this.sealedChunk = header.chunkBytes + TAG_BYTES;
    this.totalChunks = Math.ceil((fileSize - HEADER_BYTES) / this.sealedChunk);
  }

  /** A reader over the body of a file whose header has already been read. */
  static async open(
    input: FileHandle,
    key: Uint8Array,
    header: BackupHeader,
    fileSize: number,
  ): Promise<DecryptingReader> {
    if (fileSize - HEADER_BYTES < TAG_BYTES) throw new NotABackupError('فایل بکاپ ناقص است.');
    return new DecryptingReader(input, await chunkCipher(key, header.noncePrefix, header.raw), header, fileSize);
  }

  get progress(): number {
    return this.totalChunks === 0 ? 1 : this.index / this.totalChunks;
  }

  private async nextChunk(): Promise<boolean> {
    if (this.index >= this.totalChunks) return false;
    const last = this.index === this.totalChunks - 1;
    const sealed = this.input.readBytes(this.sealedChunk);
    try {
      this.current = await this.cipher.open(this.index, last, sealed);
    } catch {
      // On the first chunk a failure almost always means the passphrase is
      // wrong; later on it means the file was damaged or cut short.
      if (this.index === 0) throw new WrongPassphraseError('رمز بکاپ اشتباه است.');
      throw new Error(DAMAGED);
    }
    this.pos = 0;
    this.index += 1;
    return true;
  }

  async readExactly(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (this.pos >= this.current.length && !(await this.nextChunk())) {
        throw new Error('فایل بکاپ زودتر از انتظار تمام شد.');
      }
      const take = Math.min(n - filled, this.current.length - this.pos);
      out.set(this.current.subarray(this.pos, this.pos + take), filled);
      this.pos += take;
      filled += take;
    }
    this.bytesOut += n;
    return out;
  }

  /**
   * Confirm the archive ended exactly where the writer ended it: nothing left
   * over, and the final chunk — the one sealed with the "last" flag — read and
   * authenticated. Without this, a file cut off just after the end marker, or
   * with data appended, would pass unnoticed.
   */
  async finish(): Promise<void> {
    if (this.pos < this.current.length) throw new Error(DAMAGED);
    while (await this.nextChunk()) {
      if (this.current.length > 0) throw new Error(DAMAGED);
    }
  }

  /** Stream `n` bytes to `sink` without holding them all in memory. */
  async pipe(n: number, sink: (bytes: Uint8Array) => void): Promise<void> {
    let left = n;
    while (left > 0) {
      if (this.pos >= this.current.length && !(await this.nextChunk())) {
        throw new Error('فایل بکاپ زودتر از انتظار تمام شد.');
      }
      const take = Math.min(left, this.current.length - this.pos);
      sink(this.current.subarray(this.pos, this.pos + take));
      this.pos += take;
      left -= take;
    }
    this.bytesOut += n;
  }
}

/* -------------------------------------------------------------------------- */
/*  Archive entry encoding                                                      */
/* -------------------------------------------------------------------------- */

export function archiveStart(): Uint8Array {
  const out = new Uint8Array(9);
  out.set(encoder.encode(ARCHIVE_MAGIC), 0);
  out[8] = ARCHIVE_VERSION;
  return out;
}

export function entryHeader(type: number, path: string, size: number): Uint8Array {
  const pathBytes = encoder.encode(path);
  if (pathBytes.length > 0xffff) throw new Error('path too long');
  const out = new Uint8Array(1 + 2 + pathBytes.length + 8);
  const view = new DataView(out.buffer);
  out[0] = type;
  view.setUint16(1, pathBytes.length, true);
  out.set(pathBytes, 3);
  // u64 little-endian as two u32 halves; sizes stay far below 2^53.
  view.setUint32(3 + pathBytes.length, size >>> 0, true);
  view.setUint32(3 + pathBytes.length + 4, Math.floor(size / 2 ** 32), true);
  return out;
}

export function archiveEnd(): Uint8Array {
  return new Uint8Array([ENTRY_END]);
}

export async function readArchiveStart(reader: DecryptingReader): Promise<void> {
  const head = await reader.readExactly(9);
  if (decoder.decode(head.subarray(0, 8)) !== ARCHIVE_MAGIC || head[8] !== ARCHIVE_VERSION) {
    throw new Error('ساختار داخلی بکاپ شناخته نشد.');
  }
}

export type EntryInfo = { type: number; path: string; size: number };

export async function readEntryHeader(reader: DecryptingReader): Promise<EntryInfo | null> {
  const type = new DataView((await reader.readExactly(1)).buffer).getUint8(0);
  if (type === ENTRY_END) return null;
  const lenBytes = await reader.readExactly(2);
  const pathLen = new DataView(lenBytes.buffer).getUint16(0, true);
  const path = decoder.decode(await reader.readExactly(pathLen));
  const sizeBytes = await reader.readExactly(8);
  const view = new DataView(sizeBytes.buffer);
  const size = view.getUint32(0, true) + view.getUint32(4, true) * 2 ** 32;
  return { type, path, size };
}

export function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

export function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(decoder.decode(bytes)) as T;
}

/** Anything that hands back the next `length` bytes, or fewer at the end. */
export type ChunkReader = { read(length: number): Uint8Array };

/**
 * Do two byte streams hold the same `expected` bytes?
 *
 * Used to check a backup that was copied out against the one that was written,
 * without either of them being held in memory. A stream that runs out early —
 * the short file a storage provider leaves behind when a write is cut off —
 * fails like any other difference.
 */
export function streamsMatch(
  a: ChunkReader,
  b: ChunkReader,
  expected: number,
  chunkBytes = CHUNK_BYTES,
  onProgress?: (fraction: number) => void,
): boolean {
  let done = 0;
  while (done < expected) {
    const want = Math.min(chunkBytes, expected - done);
    const left = a.read(want);
    const right = b.read(want);
    if (left.length === 0 || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    done += left.length;
    onProgress?.(done / expected);
  }
  // Neither may have anything left over: a longer file is not this backup.
  return a.read(1).length === 0 && b.read(1).length === 0;
}
