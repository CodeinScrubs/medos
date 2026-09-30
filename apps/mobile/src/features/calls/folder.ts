import * as DocumentPicker from 'expo-document-picker';
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
  // File.name is a URI basename, not the provider's DISPLAY_NAME (e.g. msf:17).
  // Reuse the installed picker, but reserve our journal before making any copy.
  const picked = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: false,
    copyToCacheDirectory: false,
  });
  if (picked.canceled) return null;
  const source = picked.assets[0];
  if (!source) return null;
  // Picker lastModified can silently fall back to now; use actual File metadata.
  return describe(new File(source.uri), source.name.trim() || 'recording', source.size);
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
    .map((file) => describe(file))
    .sort((a, b) => (b.recordedAt?.getTime() ?? 0) - (a.recordedAt?.getTime() ?? 0))
    .slice(0, limit);
}

const UNKNOWN = new Date(0);

function describe(file: File, name = file.name, providerSize?: number): CallRecording {
  let sizeBytes: number | null = null;
  try {
    const size = providerSize ?? file.size;
    sizeBytes = size > 0 ? size : null;
  } catch {
    // A provider that cannot say the size still hands over the file.
  }
  const parsed = parseRecordingName(name, UNKNOWN);
  // The file's own time is read only when the name has none: one more call per
  // file to the storage provider, for a folder that can hold hundreds.
  const recordedAt = parsed.recordedAt === UNKNOWN ? modifiedAt(file) : parsed.recordedAt;
  return {
    uri: file.uri,
    name,
    sizeBytes,
    recordedAt: recordedAt === UNKNOWN ? null : recordedAt,
    timeSource: parsed.recordedAt !== UNKNOWN ? 'filename' : recordedAt !== UNKNOWN ? 'file' : 'unknown',
    who: parsed.who,
    key: recordingKey(name),
  };
}

function modifiedAt(file: File): Date {
  try {
    const time = file.info().modificationTime;
    return time && Number.isFinite(time) && time > 0 ? new Date(time) : UNKNOWN;
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

/**
 * A recording shared to MedOS from another app (plugins/with-share-target.js).
 * The provider's own file name carries the time when the recorder put it
 * there. Sharing is not evidence of when a call occurred: missing time stays unknown.
 */
export function describeShared(uri: string, name: string | null | undefined): CallRecording {
  let sizeBytes: number | null = null;
  let fileName = name?.trim() || '';
  try {
    const file = new File(uri);
    sizeBytes = file.size > 0 ? file.size : null;
    if (!fileName) fileName = file.name;
  } catch {
    // The copy will say so if the file cannot be read; the list only needs a label.
  }
  const parsed = parseRecordingName(fileName || 'recording.m4a', UNKNOWN);
  return {
    uri,
    name: fileName || 'recording.m4a',
    sizeBytes,
    recordedAt: parsed.recordedAt === UNKNOWN ? null : parsed.recordedAt,
    timeSource: parsed.recordedAt === UNKNOWN ? 'unknown' : 'filename',
    who: parsed.who,
    key: recordingKey(fileName || uri),
  };
}
