import { z } from 'zod';

import { audit } from '@/db/audit';
import { defineSetting, readSetting, writeSetting } from '@/db/settings';
import { reindexCaptures } from '@/features/capture/queries';
import { reindexConsults } from '@/features/consults/queries';
import { reindexDoctors } from '@/features/doctors/queries';
import { reindexIdeas } from '@/features/knowledge/ideas-queries';
import { reindexPrescriptions } from '@/features/knowledge/prescriptions-queries';
import { reindexTopics } from '@/features/knowledge/queries';
import { reindexSpecialtyProfiles } from '@/features/knowledge/specialty-profiles-queries';
import { reindexNotes } from '@/features/notes/queries';
import { reindexPatients } from '@/features/patients/queries';
import { reindexPlaces } from '@/features/places/queries';
import { reindexTasks } from '@/features/tasks/queries';
import { reindexCredentials } from '@/features/vault/queries';

/**
 * Every searchable row stores a pre-normalised `searchText`. When the rules
 * that build it change — `normalizePersian` learns a new fold, or a
 * `*SearchText` function starts indexing another field — rows written before
 * the change silently stop matching.
 *
 * Bump this number with any such change. On the next launch every index is
 * rebuilt once; rows whose text is already right are left untouched. Any
 * mismatch triggers a rebuild, including a stored version newer than this
 * build's — a backup from a newer build restored into this one.
 */
export const SEARCH_INDEX_VERSION = 2;

const indexedVersion = defineSetting('search.indexVersion', z.number().int().min(0), 0);

export async function reindexSearchIfNeeded(): Promise<void> {
  const current = await readSetting(indexedVersion);
  if (current === SEARCH_INDEX_VERSION) return;

  const changed = {
    patients: await reindexPatients(),
    notes: await reindexNotes(),
    doctors: await reindexDoctors(),
    places: await reindexPlaces(),
    topics: await reindexTopics(),
    specialtyProfiles: await reindexSpecialtyProfiles(),
    prescriptions: await reindexPrescriptions(),
    ideas: await reindexIdeas(),
    credentials: await reindexCredentials(),
    tasks: await reindexTasks(),
    consults: await reindexConsults(),
    captures: await reindexCaptures(),
  };
  await writeSetting(indexedVersion, SEARCH_INDEX_VERSION);

  const total = Object.values(changed).reduce((a, b) => a + b, 0);
  if (total > 0) await audit('search.reindexed', { detail: { from: current, to: SEARCH_INDEX_VERSION, changed } });
}
