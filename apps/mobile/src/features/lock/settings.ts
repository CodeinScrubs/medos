import { z } from 'zod';

import { defineSetting } from '@/db/settings';

export const lockEnabled = defineSetting('lock.enabled', z.boolean(), false);

/** Seconds in the background before the app locks again. */
export const lockGraceSeconds = defineSetting('lock.graceSeconds', z.number().int().min(0).max(3600), 60);
