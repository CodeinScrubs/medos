import { z } from 'zod';

import { defineSetting } from '@/db/settings';

/** The folder backups are written to: an Android storage-access-framework URI. */
export const backupFolderUri = defineSetting('backup.folderUri', z.string().min(1).nullable(), null);

export const backupAutoEnabled = defineSetting('backup.autoEnabled', z.boolean(), true);

export const backupAutoIncludeMedia = defineSetting('backup.autoIncludeMedia', z.boolean(), true);

export const backupIntervalHours = defineSetting(
  'backup.intervalHours',
  z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  24,
);

/** Unix ms of the last backup that completed. */
export const backupLastSuccessAt = defineSetting('backup.lastSuccessAt', z.number().nullable(), null);

/**
 * A restore that has replaced the media files but not yet the database.
 *
 * The key deliberately does **not** start with `backup.`: those settings are
 * this phone's and are kept through a restore, while everything else is
 * replaced by the backup's own rows. So this marker disappears in the same
 * SQLite transaction that commits the new database — present means the swap
 * was not committed, absent means it was, with nothing in between. That is the
 * only thing in the app that survives the process being killed mid-restore.
 */
export const restoreInFlight = defineSetting(
  'restore.inFlight',
  z.object({ dir: z.string().min(1), at: z.number() }).nullable(),
  null,
);

/**
 * How many files a restore could not put back, still unresolved.
 *
 * Recovery does not throw — refusing to start the app would leave the owner
 * with no way to reach the records that *are* intact. But the dataset and the
 * files on disk disagree until this is zero, so it is written down where the
 * screens and the automatic backup can see it rather than being logged and
 * forgotten. Not a `backup.` key: a restore that succeeds clears it.
 */
export const restoreMediaUnresolved = defineSetting('restore.mediaUnresolved', z.number().int().min(0), 0);
