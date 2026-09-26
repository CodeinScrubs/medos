import { z } from 'zod';

import { defineSetting } from '@/db/settings';

/**
 * The folder the dialer saves call recordings to, as an Android
 * storage-access-framework URI the owner granted once. A restore onto another
 * phone brings the old phone's URI, which no longer opens; the screen then
 * asks for the folder again.
 */
export const callsFolderUri = defineSetting('calls.folderUri', z.string().min(1).nullable(), null);

/**
 * Recordings already filed under a patient (`recordingKey`), newest last, so
 * the list can say so. Only a hint: filing the same call twice is allowed.
 */
export const callsFiled = defineSetting('calls.filed', z.array(z.string().max(600)).max(2000), []);

/** How many filed keys are kept; the folder shows the newest recordings only. */
export const CALLS_FILED_LIMIT = 1000;
