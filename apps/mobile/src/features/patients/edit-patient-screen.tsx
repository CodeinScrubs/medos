import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { PatientForm } from '@/features/patients/patient-form';
import { patientQuery } from '@/features/patients/queries';
import { useTheme } from '@/theme';

export function EditPatientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data, error } = useLive(patientQuery(id), [id]);

  if (error) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="پرونده باز نشد" description={error.message} />
      </Screen>
    );
  }

  // `data` is undefined only on the very first render, before the query settles.
  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const patient = data[0];
  if (!patient) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="پرونده پیدا نشد" />
      </Screen>
    );
  }

  return <PatientForm patient={patient} />;
}
