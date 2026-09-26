/*
 * Call recordings, as the phone's own dialer leaves them.
 *
 * MedOS cannot record a call. Since Android 10 only the system dialer may
 * capture call audio; an ordinary app holding the microphone during a call
 * gets silence or is refused. What MedOS can do is take the file a recorder
 * wrote — Samsung's dialer where the region allows it (Recordings/Call), or a
 * call-recorder app — and file it under a patient, with a note to write what
 * was said.
 */

const AUDIO_EXTENSIONS = new Set(['m4a', 'amr', 'awb', '3gp', 'mp3', 'aac', 'wav', 'ogg', 'opus']);

const MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  amr: 'audio/amr',
  awb: 'audio/amr-wb',
  '3gp': 'audio/3gpp',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
};

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** A file a recorder could have written; everything else in the folder is ignored. */
export function isRecordingFile(name: string): boolean {
  return AUDIO_EXTENSIONS.has(extension(name));
}

export function recordingMimeType(name: string): string | null {
  return MIME[extension(name)] ?? null;
}

/*
 * Timestamps as recorders write them, the last one in the name wins:
 * "…_260926_143012" (Samsung), "…_20260926_143012", "…_20260926143012",
 * "…2026-09-26_14-30-12".
 */
const COMPACT = /(^|\D)(\d{8}|\d{6})[ _-](\d{6}|\d{4})(?!\d)/g;
const RUN_ON = /(^|\D)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/g;
const DASHED = /(^|\D)(\d{4})-(\d{2})-(\d{2})[ _T](\d{2})[-.:](\d{2})(?:[-.:](\d{2}))?/g;

type Stamp = { at: Date; index: number; length: number };

function validDate(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const at = new Date(y, mo - 1, d, h, mi, s);
  // new Date rolls 31 September into October; a name that says that is not a date.
  return at.getMonth() === mo - 1 && at.getDate() === d ? at : null;
}

function lastStamp(base: string): Stamp | null {
  let found: Stamp | null = null;
  // Group 1 is the character before the stamp, so the digits of a phone
  // number next to it are never read as its date.
  for (const m of base.matchAll(COMPACT)) {
    const date = m[2]!;
    const time = m[3]!;
    const y = date.length === 8 ? Number(date.slice(0, 4)) : 2000 + Number(date.slice(0, 2));
    const rest = date.length === 8 ? date.slice(4) : date.slice(2);
    const at = validDate(
      y,
      Number(rest.slice(0, 2)),
      Number(rest.slice(2, 4)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4)),
      time.length === 6 ? Number(time.slice(4, 6)) : 0,
    );
    const index = m.index! + m[1]!.length;
    if (at && (!found || index >= found.index)) found = { at, index, length: m[0].length - m[1]!.length };
  }
  for (const m of [...base.matchAll(DASHED), ...base.matchAll(RUN_ON)]) {
    const [y, mo, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6], m[7] ?? '0'].map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const at = validDate(y, mo, d, h, mi, s);
    const index = m.index! + m[1]!.length;
    if (at && (!found || index >= found.index)) found = { at, index, length: m[0].length - m[1]!.length };
  }
  return found;
}

export type RecordingName = {
  /** The contact's name or number as the dialer wrote it, when there is one. */
  who: string | null;
  /** When the call was recorded: from the name when it carries a time, else the file's own time. */
  recordedAt: Date;
};

/**
 * What a recording's file name says. The time in the name is the call's own;
 * a file's modification time moves when it is copied, so it is only the
 * fallback.
 */
export function parseRecordingName(name: string, modifiedAt: Date): RecordingName {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const stamp = lastStamp(base);
  const rest = stamp ? base.slice(0, stamp.index) + base.slice(stamp.index + stamp.length) : base;
  const who = rest
    .replace(/^\s*(call[\s_-]*recording|recording|record|call)(?=[\s_@-]|$)@?/i, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();
  return { who: who || null, recordedAt: stamp?.at ?? modifiedAt };
}

/**
 * The same recording seen again in the folder; see `callsFiled`. The name is
 * enough: a dialer names each recording by its second of the day, and asking
 * the storage provider for every file's size only to tell two apart costs a
 * call per file.
 */
export function recordingKey(name: string): string {
  return name;
}

const DAY_MS = 24 * 3_600_000;

/**
 * How many recordings from the last two days are not in a record yet — for
 * the card on Today. A file whose name carries no time is not counted: its
 * age is unknown without asking the provider.
 */
export function unfiledRecentCount(
  names: readonly string[],
  filed: ReadonlySet<string>,
  now: Date,
  withinMs = 2 * DAY_MS,
): number {
  const unknown = new Date(0);
  return names.filter((name) => {
    if (!isRecordingFile(name) || filed.has(recordingKey(name))) return false;
    const { recordedAt } = parseRecordingName(name, unknown);
    const age = now.getTime() - recordedAt.getTime();
    return recordedAt !== unknown && age >= 0 && age <= withinMs;
  }).length;
}

/** Samsung's dialer keeps call recordings here; the folder picker starts there. */
export const CALL_FOLDER_HINT = 'content://com.android.externalstorage.documents/document/primary%3ARecordings%2FCall';
