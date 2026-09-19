import { Directory, File, Paths } from 'expo-file-system';

import { redactErrorText } from '@/lib/redact';

/**
 * A small on-phone log of errors, so a problem seen on the ward can be
 * diagnosed later. Nothing is sent anywhere: the log is a file in app-private
 * storage, shared only when the user chooses to share it.
 *
 * Messages are redacted before they are written (see lib/redact.ts).
 */

const LOG_DIR = 'logs';
const LOG_FILE = 'errors.jsonl';
const MAX_ENTRIES = 100;

export type ErrorSource = 'boundary' | 'global' | 'handled' | 'startup';

export type ErrorEntry = {
  at: string;
  source: ErrorSource;
  fatal?: boolean;
  message: string;
  stack?: string;
  context?: string;
};

function logFile(): File {
  const dir = new Directory(Paths.document, LOG_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, LOG_FILE);
}

export function readErrorLog(): ErrorEntry[] {
  try {
    const file = logFile();
    if (!file.exists) return [];
    return file
      .textSync()
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ErrorEntry];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/**
 * Record an error. Synchronous on purpose: the global handler calls this just
 * before a fatal error ends the process, and an async write would be lost.
 */
export function logError(error: unknown, meta: { source: ErrorSource; fatal?: boolean; context?: string }): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const entry: ErrorEntry = {
      at: new Date().toISOString(),
      source: meta.source,
      fatal: meta.fatal,
      message: redactErrorText(err.message).slice(0, 2000),
      stack: err.stack ? redactErrorText(err.stack).slice(0, 4000) : undefined,
      context: meta.context,
    };
    const entries = [...readErrorLog(), entry].slice(-MAX_ENTRIES);
    logFile().write(entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  } catch {
    // Logging must never be the thing that crashes.
  }
}

export function clearErrorLog(): void {
  try {
    const file = logFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to clear.
  }
}

/** The log file, for the share sheet. Null when there is nothing logged. */
export function errorLogUri(): string | null {
  const file = logFile();
  return file.exists ? file.uri : null;
}

type GlobalErrorUtils = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};

let installed = false;

/**
 * Record every uncaught JS error, then hand it to React Native's own handler,
 * which shows the red screen in development and ends the app in release.
 */
export function installGlobalErrorLogging(): void {
  if (installed) return;
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    logError(error, { source: 'global', fatal: isFatal });
    previous(error, isFatal);
  });
}
