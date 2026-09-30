import type { PatientStatus } from '@/db/schema';

import { PATIENT_STATUS_ORDER } from './labels';
import { CURRENT_STATUSES } from './logic';

export type PatientListScope = 'current' | 'all' | PatientStatus;

/** URL filters are shared by Today links and the list's own controls. */
export function parsePatientListRoute(params: { status?: unknown; starred?: unknown }) {
  const scope: PatientListScope =
    params.status === 'all' ||
    params.status === 'current' ||
    PATIENT_STATUS_ORDER.includes(params.status as PatientStatus)
      ? (params.status as PatientListScope)
      : 'current';
  return { scope, starredOnly: params.starred === '1' };
}

export function patientListStatuses(scope: PatientListScope, searching: boolean): PatientStatus[] | undefined {
  if (scope === 'all' || (scope === 'current' && searching)) return undefined;
  return scope === 'current' ? [...CURRENT_STATUSES] : [scope];
}
