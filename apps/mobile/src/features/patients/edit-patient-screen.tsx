import { useLocalSearchParams } from 'expo-router';

import { EditGate } from '@/components/edit-gate';
import { useLive } from '@/db/use-live';
import { PatientForm } from '@/features/patients/patient-form';
import { patientQuery } from '@/features/patients/queries';

export function EditPatientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, retry } = useLive(patientQuery(id), [id]);
  return (
    <EditGate editing rows={data} error={error} onRetry={retry} what="پرونده">
      {(patient, readNotice) =>
        patient ? <PatientForm key={patient.id} patient={patient} readNotice={readNotice} /> : null
      }
    </EditGate>
  );
}
