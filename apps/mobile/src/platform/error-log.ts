import Constants from 'expo-constants';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import {
  DIAGNOSTIC_FRAME_LIMIT,
  errorDiagnostic,
  safeCode,
  safeContext,
  safeErrorForHandler,
  type DiagnosticFrame,
  type ErrorDiagnostic,
  type KnownContext,
  type KnownCode,
} from '@/lib/error-diagnostic';
import { newId } from '@/lib/ids';

const LOG_DIR = 'logs';
const LOG_FILE = 'errors.jsonl';
const LOG_WRITE_MARKER = 'errors-writing';
export const ERROR_LOG_MAX_ENTRIES = 100;
export const ERROR_LOG_READ_BYTES = 1024 * 1024;
export const ERROR_LOG_LINE_BYTES = 32 * 1024;
const MAX_CANDIDATE_LINES = 400;
export const ERROR_SHARE_MAX_FILES = 20;
export const ERROR_SHARE_MAX_BYTES = 10 * 1024 * 1024;
export const ERROR_SHARE_GRACE_MS = 24 * 60 * 60 * 1000;
const SHARE_NAME = /^medos-errors-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/;
const offeredShares = new Map<string, number>();
const sources = ['boundary', 'global', 'handled', 'startup'] as const;
export type ErrorSource = (typeof sources)[number];
export type ErrorEntry = {
  version: 2;
  at: string;
  source: ErrorSource;
  fatal?: boolean;
  context?: KnownContext;
  diagnostic: ErrorDiagnostic;
  legacy?: true;
  recordedAppVersion?: string;
  recordedVersionCode?: number;
  count?: number;
  bytes?: number;
};
export type ErrorLogSnapshot = {
  entries: ErrorEntry[];
  incomplete: boolean;
  legacyConverted: number;
  skippedInWindow: number;
  earlierBytesOmitted: boolean;
  writeFailureObserved: boolean;
};
export type ErrorLogRead = { status: 'ok'; snapshot: ErrorLogSnapshot } | { status: 'error'; error: Error };
let writeFailureObserved = false;
const encoder = new TextEncoder();

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1900 &&
    date.getUTCFullYear() <= 2999 &&
    date.toISOString() === value
  );
}
function version(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
}
function appIdentity(): Pick<ErrorEntry, 'recordedAppVersion' | 'recordedVersionCode'> {
  const config = Constants.expoConfig;
  return {
    recordedAppVersion: version(config?.version) ? config.version : undefined,
    recordedVersionCode: integer(config?.android?.versionCode, 2147483647) ? config.android.versionCode : undefined,
  };
}
function decodeFrame(value: unknown): DiagnosticFrame | undefined {
  const frame = object(value);
  if (!frame || frame.bundle !== 'android' || !integer(frame.line, 2147483647) || frame.line < 1) return undefined;
  if (
    frame.coordinate === 'bytecode' &&
    onlyKeys(frame, ['bundle', 'coordinate', 'line', 'offset']) &&
    integer(frame.offset, 2147483647)
  )
    return { bundle: 'android', coordinate: 'bytecode', line: frame.line, offset: frame.offset };
  if (
    frame.coordinate === 'source' &&
    onlyKeys(frame, ['bundle', 'coordinate', 'line', 'column']) &&
    integer(frame.column, 2147483647) &&
    frame.column > 0
  )
    return { bundle: 'android', coordinate: 'source', line: frame.line, column: frame.column };
  return undefined;
}
function decodeDiagnostic(value: unknown): ErrorDiagnostic | undefined {
  const data = object(value);
  if (
    !data ||
    !onlyKeys(data, ['kind', 'code', 'frames', 'detailsOmitted', 'framesOmitted']) ||
    data.detailsOmitted !== true ||
    typeof data.framesOmitted !== 'boolean' ||
    !Array.isArray(data.frames) ||
    data.frames.length > DIAGNOSTIC_FRAME_LIMIT
  )
    return undefined;
  const kind = errorDiagnostic({ name: data.kind }).kind;
  if (kind !== data.kind || (data.code !== undefined && safeCode(data.code) === undefined)) return undefined;
  const frames = data.frames.map(decodeFrame);
  if (frames.some((frame) => !frame)) return undefined;
  return {
    kind,
    code: safeCode(data.code),
    frames: frames as DiagnosticFrame[],
    detailsOmitted: true,
    framesOmitted: data.framesOmitted,
  };
}
/** Project every accepted field; no parsed object is returned or spread into output. */
export function decodeErrorEntry(value: unknown): ErrorEntry | undefined {
  const data = object(value);
  if (
    !data ||
    !timestamp(data.at) ||
    !sources.some((source) => source === data.source) ||
    (data.fatal !== undefined && typeof data.fatal !== 'boolean')
  )
    return undefined;
  const base = {
    version: 2 as const,
    at: data.at,
    source: data.source as ErrorSource,
    fatal: data.fatal as boolean | undefined,
  };
  if (data.version === undefined) {
    if (
      !onlyKeys(data, ['at', 'source', 'fatal', 'message', 'stack', 'context']) ||
      typeof data.message !== 'string' ||
      data.message.length > 2000 ||
      (data.stack !== undefined && (typeof data.stack !== 'string' || data.stack.length > 4000)) ||
      (data.context !== undefined && typeof data.context !== 'string')
    )
      return undefined;
    return {
      ...base,
      context: safeContext(data.context),
      legacy: true,
      diagnostic: errorDiagnostic({ name: 'Error', message: data.message, stack: data.stack }),
    };
  }
  if (
    data.version !== 2 ||
    !onlyKeys(data, [
      'version',
      'at',
      'source',
      'fatal',
      'context',
      'diagnostic',
      'legacy',
      'recordedAppVersion',
      'recordedVersionCode',
      'count',
      'bytes',
    ]) ||
    (data.context !== undefined && safeContext(data.context) !== data.context) ||
    (data.legacy !== undefined && data.legacy !== true) ||
    (data.recordedAppVersion !== undefined && !version(data.recordedAppVersion)) ||
    (data.recordedVersionCode !== undefined && !integer(data.recordedVersionCode, 2147483647)) ||
    (data.count !== undefined && !integer(data.count, 1000000)) ||
    (data.bytes !== undefined && !integer(data.bytes))
  )
    return undefined;
  const diagnostic = decodeDiagnostic(data.diagnostic);
  if (!diagnostic || (data.legacy && (data.recordedAppVersion !== undefined || data.recordedVersionCode !== undefined)))
    return undefined;
  return {
    ...base,
    context: safeContext(data.context),
    diagnostic,
    legacy: data.legacy as true | undefined,
    recordedAppVersion: data.recordedAppVersion as string | undefined,
    recordedVersionCode: data.recordedVersionCode as number | undefined,
    count: data.count as number | undefined,
    bytes: data.bytes as number | undefined,
  };
}
function logFile(createDirectory = false): File {
  const dir = new Directory(Paths.document, LOG_DIR);
  if (createDirectory && !dir.exists) dir.create({ intermediates: true });
  return new File(dir, LOG_FILE);
}
function writeMarker(createDirectory = false): File {
  const dir = new Directory(Paths.document, LOG_DIR);
  if (createDirectory && !dir.exists) dir.create({ intermediates: true });
  return new File(dir, LOG_WRITE_MARKER);
}
function emptySnapshot(): ErrorLogSnapshot {
  return {
    entries: [],
    incomplete: writeFailureObserved,
    legacyConverted: 0,
    skippedInWindow: 0,
    earlierBytesOmitted: false,
    writeFailureObserved,
  };
}
function serializedLog(snapshot: ErrorLogSnapshot): string {
  return (
    [
      JSON.stringify({ version: 2, type: 'meta', incomplete: snapshot.incomplete }),
      ...snapshot.entries.map((entry) => JSON.stringify(entry)),
    ].join('\n') + '\n'
  );
}
/** A failed/partial rewrite must remain incomplete after a process restart. */
function rewriteLog(snapshot: ErrorLogSnapshot): void {
  const marker = writeMarker(true);
  if (!marker.exists) marker.create();
  marker.write('1');
  if (!marker.exists || marker.size !== 1) throw new Error('Diagnostic write marker was not acknowledged.');
  const body = serializedLog(snapshot);
  const file = logFile(true);
  file.write(body);
  if (!file.exists || file.size !== encoder.encode(body).length)
    throw new Error('Diagnostic write was not acknowledged.');
  marker.delete();
  if (marker.exists) throw new Error('Diagnostic write marker was not retired.');
}
/** A small byte window is the read boundary; textSync/slice read whole native files. */
export function readErrorLog(): ErrorLogRead {
  try {
    const file = logFile();
    const snapshot = emptySnapshot();
    snapshot.incomplete ||= writeMarker().exists;
    if (!file.exists) return { status: 'ok', snapshot };
    const handle = file.open(FileMode.ReadOnly);
    let bytes: Uint8Array;
    try {
      const size = handle.size;
      if (!integer(size)) throw new Error();
      const start = Math.max(0, size - ERROR_LOG_READ_BYTES);
      handle.offset = start;
      snapshot.earlierBytesOmitted = start > 0;
      const requested = Math.min(size, ERROR_LOG_READ_BYTES);
      bytes = handle.readBytes(requested);
      if (bytes.length !== requested) throw new Error();
      if (snapshot.earlierBytesOmitted) {
        const newline = bytes.indexOf(10);
        bytes = newline < 0 ? new Uint8Array() : bytes.subarray(newline + 1);
      }
    } finally {
      handle.close();
    }
    const lines: Uint8Array[] = [];
    let candidateCount = 0;
    let start = 0;
    for (let i = 0; i <= bytes.length; i++) {
      if (i !== bytes.length && bytes[i] !== 10) continue;
      if (i > start) lines[candidateCount++ % MAX_CANDIDATE_LINES] = bytes.subarray(start, i);
      start = i + 1;
    }
    if (candidateCount > MAX_CANDIDATE_LINES) snapshot.earlierBytesOmitted = true;
    const first = candidateCount > MAX_CANDIDATE_LINES ? candidateCount % MAX_CANDIDATE_LINES : 0;
    const ordered = [...lines.slice(first), ...lines.slice(0, first)];
    let needsRewrite = false;
    for (const line of ordered) {
      try {
        if (line.length > ERROR_LOG_LINE_BYTES) throw new Error();
        const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
        const meta = object(data);
        if (
          meta?.version === 2 &&
          meta.type === 'meta' &&
          onlyKeys(meta, ['version', 'type', 'incomplete']) &&
          typeof meta.incomplete === 'boolean'
        ) {
          snapshot.incomplete ||= meta.incomplete;
          continue;
        }
        const entry = decodeErrorEntry(data);
        if (!entry) throw new Error();
        snapshot.entries.push(entry);
        if (object(data)?.version === undefined) needsRewrite = true;
        if (entry.legacy) snapshot.legacyConverted++;
      } catch {
        snapshot.skippedInWindow++;
        needsRewrite = true;
      }
    }
    if (snapshot.entries.length > ERROR_LOG_MAX_ENTRIES) snapshot.earlierBytesOmitted = true;
    snapshot.entries = snapshot.entries.slice(-ERROR_LOG_MAX_ENTRIES);
    snapshot.incomplete ||= snapshot.earlierBytesOmitted || snapshot.skippedInWindow > 0;
    if (needsRewrite) {
      try {
        rewriteLog(snapshot);
      } catch {
        writeFailureObserved = true;
        snapshot.writeFailureObserved = true;
        snapshot.incomplete = true;
      }
    }
    return { status: 'ok', snapshot };
  } catch {
    return { status: 'error', error: new Error('گزارش خطاها خوانده نشد؛ دوباره تلاش کنید.') };
  }
}
/** Synchronous/best effort for the fatal path; never overwrite after a failed read. */
export function logError(
  error: unknown,
  meta: { source: ErrorSource; fatal?: boolean; context?: string; code?: KnownCode; count?: number; bytes?: number },
): void {
  try {
    if (!sources.includes(meta.source)) return;
    const read = readErrorLog();
    if (read.status === 'error') {
      writeFailureObserved = true;
      return;
    }
    const diagnostic = errorDiagnostic(error);
    diagnostic.code = safeCode(meta.code) ?? diagnostic.code;
    const entry: ErrorEntry = {
      version: 2,
      at: new Date().toISOString(),
      source: meta.source,
      fatal: typeof meta.fatal === 'boolean' ? meta.fatal : undefined,
      context: safeContext(meta.context),
      diagnostic,
      ...appIdentity(),
      count: integer(meta.count, 1000000) ? meta.count : undefined,
      bytes: integer(meta.bytes) ? meta.bytes : undefined,
    };
    if (!decodeErrorEntry(entry)) throw new Error();
    read.snapshot.entries = [...read.snapshot.entries, entry].slice(-ERROR_LOG_MAX_ENTRIES);
    rewriteLog(read.snapshot);
  } catch {
    writeFailureObserved = true; /* A diagnostic failure must not crash. */
  }
}
export function clearErrorLog(): void {
  const file = logFile();
  if (file.exists) file.delete();
  if (file.exists) throw new Error('Diagnostic clear was not acknowledged.');
  const marker = writeMarker();
  if (marker.exists) marker.delete();
  if (marker.exists) throw new Error('Diagnostic write marker was not cleared.');
  writeFailureObserved = false;
}
function shareCache(): Directory {
  return new Directory(Paths.cache, 'diagnostics');
}

/** Only direct files with this producer's exact name are eligible for retirement. */
function makeShareRoom(dir: Directory, addedBytes: number, now: Date): void {
  const rows = dir
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && SHARE_NAME.test(entry.name) && entry.uri === new File(dir, entry.name).uri,
    )
    .map((file) => {
      const bytes = file.size;
      if (!integer(bytes)) throw new Error('اندازهٔ گزارش‌های موقت خوانده نشد؛ دوباره تلاش کنید.');
      return { file, bytes, modified: file.modificationTime };
    });
  let bytes = rows.reduce((total, row) => total + row.bytes, 0);
  if (!integer(bytes)) throw new Error('اندازهٔ گزارش‌های موقت خوانده نشد؛ دوباره تلاش کنید.');
  let count = rows.length;
  const eligible = rows
    .filter(
      (row) =>
        !offeredShares.has(row.file.uri) &&
        integer(row.modified) &&
        now.getTime() - row.modified >= ERROR_SHARE_GRACE_MS,
    )
    .sort((a, b) => a.modified! - b.modified! || a.file.uri.localeCompare(b.file.uri));
  while (count >= ERROR_SHARE_MAX_FILES || bytes + addedBytes > ERROR_SHARE_MAX_BYTES) {
    const row = eligible.shift();
    if (!row) throw new Error('گزارش‌های موقت قبلی هنوز نگه داشته می‌شوند؛ بعداً دوباره تلاش کنید.');
    row.file.delete();
    if (row.file.exists) throw new Error('پاک‌سازی گزارش موقت تأیید نشد؛ دوباره تلاش کنید.');
    count--;
    bytes -= row.bytes;
  }
}

/** Pin through the entire native await, even when the source screen departs. */
export function retainErrorLogShare(uri: string): () => void {
  const dir = shareCache();
  // Android Directory.uri ends in '/', while File.name owns path parsing.
  const file = new File(uri);
  const name = file.name;
  if (!SHARE_NAME.test(name) || uri !== new File(dir, name).uri || !file.exists)
    throw new Error('گزارش آمادهٔ ارسال در دسترس نیست؛ دوباره تلاش کنید.');
  offeredShares.set(uri, (offeredShares.get(uri) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (offeredShares.get(uri) ?? 1) - 1;
    if (count) offeredShares.set(uri, count);
    else offeredShares.delete(uri);
  };
}

/** Immutable bounded cache snapshot; chooser completion does not prove recipient read. */
export function prepareErrorLogShare(snapshot: ErrorLogSnapshot, now: Date = new Date()): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('زمان گزارش معتبر نیست.');
  if (snapshot.entries.length > ERROR_LOG_MAX_ENTRIES) throw new Error('گزارش آماده نشد؛ دوباره تلاش کنید.');
  const entries = snapshot.entries.map(decodeErrorEntry);
  if (entries.some((entry) => !entry)) throw new Error('گزارش آماده نشد؛ دوباره تلاش کنید.');
  const body = JSON.stringify({
    format: 'medos-technical-errors',
    version: 2,
    exportedBy: appIdentity(),
    completeness: {
      incomplete: snapshot.incomplete === true,
      legacyConverted: integer(snapshot.legacyConverted, MAX_CANDIDATE_LINES) ? snapshot.legacyConverted : 0,
      skippedInWindow: integer(snapshot.skippedInWindow, MAX_CANDIDATE_LINES) ? snapshot.skippedInWindow : 0,
      earlierBytesOmitted: snapshot.earlierBytesOmitted === true,
      writeFailureObserved: snapshot.writeFailureObserved === true,
      retention: ERROR_LOG_MAX_ENTRIES,
    },
    entries,
  });
  const size = encoder.encode(body).length;
  if (size > ERROR_LOG_READ_BYTES) throw new Error('گزارش آماده نشد؛ دوباره تلاش کنید.');
  const dir = shareCache();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `medos-errors-${newId()}.json`);
  if (file.exists) throw new Error('گزارش موقت با این نام وجود دارد؛ دوباره تلاش کنید.');
  makeShareRoom(dir, size, now);
  let created = false;
  try {
    file.create();
    created = true;
    file.write(body);
    if (!file.exists || file.size !== size) throw new Error('گزارش کامل ذخیره نشد؛ دوباره تلاش کنید.');
  } catch (error) {
    // Never delete a pre-existing target or a URI already offered to another app.
    if (created && !offeredShares.has(file.uri)) {
      try {
        if (file.exists) file.delete();
      } catch {
        /* A later bounded cleanup may retry. */
      }
    }
    throw error;
  }
  return file.uri;
}
type GlobalErrorUtils = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};
let installed = false;
export function installGlobalErrorLogging(): void {
  if (installed) return;
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    logError(error, { source: 'global', fatal: isFatal });
    let handoff: Error;
    try {
      handoff = safeErrorForHandler(error);
    } catch {
      handoff = new Error('MedOS diagnostic unavailable.');
    }
    previous(handoff, isFatal);
  });
  // Best effort migration of existing raw legacy diagnostics, independent of
  // whether the owner opens this screen or another error occurs.
  if (readErrorLog().status === 'error') writeFailureObserved = true;
}
