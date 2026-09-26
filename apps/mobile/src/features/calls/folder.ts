import { Directory, File } from 'expo-file-system';

import { CALL_FOLDER_HINT, isRecordingFile, parseRecordingName, recordingKey } from './logic';
import type { CallRecording } from './queries';

/**
 * Ask for the recordings folder through Android's own picker, opened at
 * Recordings/Call (the dialer's, where it records) — any recorder's folder
 * can be chosen instead. The grant is persistable, so the list keeps working
 * after restarts; nothing outside that one folder becomes readable.
 */
export async function chooseCallsFolder(): Promise<string | null> {
  try {
    return (await Directory.pickDirectoryAsync(CALL_FOLDER_HINT)).uri;
  } catch {
    return null;
  }
}

/** One audio file from anywhere — another recorder, a messenger's voice message. */
export async function pickRecordingFile(): Promise<CallRecording | null> {
  const picked = await File.pickFileAsync({ mimeTypes: 'audio/*', initialUri: CALL_FOLDER_HINT });
  if (picked.canceled) return null;
  return describe(picked.result);
}

/**
 * The newest recordings in the chosen folder, newest first. Null when the
 * folder no longer opens: the grant was lost with a restore onto another
 * phone, or the folder was deleted.
 */
export function listRecordings(folderUri: string, limit = 60): CallRecording[] | null {
  let entries: (File | Directory)[];
  try {
    const dir = new Directory(folderUri);
    if (!dir.exists) return null;
    entries = dir.list();
  } catch {
    return null;
  }
  return entries
    .filter((entry): entry is File => entry instanceof File && isRecordingFile(entry.name))
    .map(describe)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
    .slice(0, limit);
}

const UNKNOWN = new Date(0);

function describe(file: File): CallRecording {
  let sizeBytes: number | null = null;
  try {
    sizeBytes = file.size ?? null;
  } catch {
    // A provider that cannot say the size still hands over the file.
  }
  const parsed = parseRecordingName(file.name, UNKNOWN);
  // The file's own time is read only when the name has none: one more call per
  // file to the storage provider, for a folder that can hold hundreds.
  const recordedAt = parsed.recordedAt === UNKNOWN ? modifiedAt(file) : parsed.recordedAt;
  return {
    uri: file.uri,
    name: file.name,
    sizeBytes,
    recordedAt,
    who: parsed.who,
    key: recordingKey(file.name),
  };
}

function modifiedAt(file: File): Date {
  try {
    const time = file.info().modificationTime;
    return time ? new Date(time) : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** Names only, for the count on Today: one listing, no call per file. Null when the folder does not open. */
export function listRecordingNames(folderUri: string): string[] | null {
  try {
    const dir = new Directory(folderUri);
    if (!dir.exists) return null;
    return dir.list().map((entry) => entry.name);
  } catch {
    return null;
  }
}
