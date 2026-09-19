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
