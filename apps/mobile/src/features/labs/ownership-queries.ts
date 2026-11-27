import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { labPanels, labValues, patients } from '@/db/schema';

/**
 * Quarantine the whole panel: reflag cannot safely retain a mixed-owner
 * snapshot, so even its correctly owned siblings may carry an old verdict.
 * Keep the real table in the SQL tree so useLive observes child-only changes.
 */
export function labPanelHasForeignValues() {
  return sql`exists (select 1 from ${labValues} as lab_owner_value
    where lab_owner_value.panel_id = ${labPanels.id}
      and lab_owner_value.deleted_at is null
      and lab_owner_value.patient_id <> ${labPanels.patientId})`;
}

/** Count affected panels without reading either patient's clinical contents. */
export function patientLabOwnershipIssuesQuery(patientId: string) {
  return db
    .select({ count: sql<number>`count(*)` })
    .from(labPanels)
    .innerJoin(patients, eq(patients.id, patientId))
    .where(
      and(
        isNull(labPanels.deletedAt),
        isNull(patients.deletedAt),
        labPanelHasForeignValues(),
        // Both candidate branches use existing patient indexes. A correlated
        // OR against every panel would rescan unrelated patients on each deck.
        sql`${labPanels.id} in (
          select lab_candidate_panel.id from ${labPanels} as lab_candidate_panel
            where lab_candidate_panel.patient_id = ${patientId}
          union
          select lab_candidate_value.panel_id from ${labValues} as lab_candidate_value
            where lab_candidate_value.patient_id = ${patientId}
              and lab_candidate_value.deleted_at is null
        )`,
      ),
    );
}
