/**
 * expo-crypto for tests, mapped in jest.config.js. It is native on the phone;
 * here it is backed by the Web Crypto API that Node provides.
 *
 * The contract the app depends on is kept: at most 1024 random bytes per call,
 * and for AES-GCM the same shapes as the native module —
 * `ciphertext({ includeTag: true })` is ciphertext ‖ tag, and
 * `fromParts(iv, ciphertextWithTag, tagLength)` splits them back (compare
 * node_modules/expo-crypto/android/.../aes/AesCryptoModule.kt). Whether the
 * resulting bytes are standard AES-GCM is checked separately, against an
 * independent implementation, in lib/crypto.test.ts.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const copy = (bytes: Uint8Array): Bytes => new Uint8Array(bytes);

export function getRandomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 1024) {
    throw new TypeError(`expo-crypto: getRandomBytes accepts 0 to 1024 bytes, got ${n}`);
  }
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export class AESEncryptionKey {
  private constructor(readonly raw: Bytes) {}

  static async import(bytes: Uint8Array): Promise<AESEncryptionKey> {
    if (![16, 24, 32].includes(bytes.length)) throw new Error('Invalid AES key size');
    return new AESEncryptionKey(copy(bytes));
  }
}

export class AESSealedData {
  private constructor(
    readonly iv: Bytes,
    readonly ciphertextWithTag: Bytes,
    readonly tagSize: number,
  ) {}

  static fromParts(iv: Uint8Array, ciphertextWithTag: Uint8Array, tagLength = 16): AESSealedData {
    if (ciphertextWithTag.length < tagLength) throw new Error('Invalid sealed data');
    return new AESSealedData(copy(iv), copy(ciphertextWithTag), tagLength);
  }

  async ciphertext({ includeTag = false }: { includeTag?: boolean } = {}): Promise<Uint8Array> {
    return includeTag ? copy(this.ciphertextWithTag) : this.ciphertextWithTag.slice(0, -this.tagSize);
  }
}

function gcmParams(iv: Bytes, tagBytes: number, additionalData?: Uint8Array): AesGcmParams {
  return {
    name: 'AES-GCM',
    iv,
    tagLength: tagBytes * 8,
    ...(additionalData ? { additionalData: copy(additionalData) } : {}),
  };
}

const subtleKey = (key: AESEncryptionKey, use: 'encrypt' | 'decrypt') =>
  crypto.subtle.importKey('raw', key.raw, 'AES-GCM', false, [use]);

export async function aesEncryptAsync(
  plaintext: Uint8Array,
  key: AESEncryptionKey,
  options: { nonce: { bytes: Uint8Array }; additionalData?: Uint8Array; tagLength?: number },
): Promise<AESSealedData> {
  const iv = copy(options.nonce.bytes);
  const tagLength = options.tagLength ?? 16;
  const sealed = await crypto.subtle.encrypt(
    gcmParams(iv, tagLength, options.additionalData),
    await subtleKey(key, 'encrypt'),
    copy(plaintext),
  );
  return AESSealedData.fromParts(iv, new Uint8Array(sealed), tagLength);
}

export async function aesDecryptAsync(
  sealed: AESSealedData,
  key: AESEncryptionKey,
  options: { additionalData?: Uint8Array } = {},
): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    gcmParams(sealed.iv, sealed.tagSize, options.additionalData),
    await subtleKey(key, 'decrypt'),
    sealed.ciphertextWithTag,
  );
  return new Uint8Array(plain);
}
