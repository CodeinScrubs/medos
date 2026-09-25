import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, DataRow, Divider, Row, SectionHeader, Text } from '@/components/ui';
import type { Patient } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { ConsultsSection } from '@/features/consults/consults-section';
import { DiagnosesSection } from '@/features/diagnoses/diagnoses-section';
import { doctorDisplayName } from '@/features/doctors/logic';
import { ENCOUNTER_KIND_LABELS } from '@/features/encounters/labels';
import { admissionElapsed, formatAdmissionElapsed, isInpatient } from '@/features/encounters/logic';
import { activeEncounterDetailQuery } from '@/features/encounters/queries';
import { FollowUpCard } from '@/features/followups/follow-up-card';
import { patientFollowUpsQuery } from '@/features/followups/queries';
import { isHighlighted } from '@/features/notes/logic';
import { patientNotesQuery } from '@/features/notes/queries';
import { TasksSection } from '@/features/tasks/tasks-section';
import { formatJalali, formatJalaliDateTime, formatJalaliLong, formatRelative } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { CallRow } from './patient-header';
import { deletePatientContact, patientContactsQuery } from './queries';

export function OverviewTab({ patient }: { patient: Patient }) {
  const router = useRouter();
  const { colors } = useTheme();
  const patientId = patient.id;

  const { data: contacts } = useLive(patientContactsQuery(patientId), [patientId]);
  const { data: followUps } = useLive(patientFollowUpsQuery(patientId), [patientId]);
  const { data: notes } = useLive(patientNotesQuery(patientId), [patientId]);

  const pendingFollowUps = (followUps ?? []).filter((f) => f.status === 'pending');
  const events = (notes ?? []).filter(isHighlighted).slice(0, 8);

  const historyFields = [
    { label: 'سابقه بیماری', value: patient.pastMedicalHistory },
    { label: 'سابقه دارویی', value: patient.drugHistory },
    { label: 'عادات', value: patient.habitualHistory },
    { label: 'سابقه خانوادگی', value: patient.familyHistory },
  ].filter((f) => f.value);

  return (
    <Column gap="none">
      <AdmissionCard patientId={patientId} />

      <DiagnosesSection patientId={patientId} />

      <TasksSection patientId={patientId} title="کارهای این بیمار" limit={8} />

      <ConsultsSection patientId={patientId} />

      <SectionHeader
        title="پیگیری‌ها"
        count={pendingFollowUps.length}
        action={
          <Pressable
            hitSlop={8}
            onPress={() => router.push({ pathname: '/patient/[id]/followup', params: { id: patientId } })}
          >
            <Text variant="captionStrong" color="primary">
              + پیگیری
            </Text>
          </Pressable>
        }
      />
      {pendingFollowUps.length > 0 ? (
        <Column gap="sm">
          {pendingFollowUps.map((f) => (
            <FollowUpCard key={f.id} followUp={f} patient={patient} />
          ))}
        </Column>
      ) : (
        <Card tone="alt">
          <Text variant="caption" color="textFaint">
            پیگیری بازی نیست.
          </Text>
        </Card>
      )}

      {events.length > 0 && (
        <>
          <SectionHeader title="رویدادهای مهم" count={events.length} />
          <Card>
            {events.map((n, i) => (
              <View key={n.id}>
                {i > 0 && <Divider />}
                <Row gap="sm" align="flex-start" style={{ paddingVertical: 8 }}>
                  <Ionicons
                    name={n.type === 'event' ? 'flash' : 'pin'}
                    size={14}
                    color={n.type === 'event' ? colors.warning : colors.primary}
                    style={{ marginTop: 5 }}
                  />
                  <Column gap="xxs" style={styles.grow}>
                    <Text variant="bodyStrong">{n.title || n.body || n.assessment || '—'}</Text>
                    {n.title && n.body ? (
                      <Text variant="caption" color="textMuted" numberOfLines={2}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text variant="tiny" color="textFaint">
                      {formatJalaliDateTime(n.noteDate)}
                    </Text>
                  </Column>
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader
        title="همراهان"
        count={contacts?.length ?? 0}
        action={
          <Pressable
            hitSlop={8}
            onPress={() => router.push({ pathname: '/patient/[id]/contact', params: { id: patientId } })}
          >
            <Text variant="captionStrong" color="primary">
              + شماره
            </Text>
          </Pressable>
        }
      />
      {contacts && contacts.length > 0 ? (
        <Column gap="sm">
          {contacts.map((c) => (
            <Pressable
              key={c.id}
              onLongPress={() =>
                Alert.alert('حذف این شماره؟', c.name ?? c.phone, [
                  { text: 'انصراف', style: 'cancel' },
                  {
                    text: 'حذف',
                    style: 'destructive',
                    onPress: () => void deletePatientContact(c.id).catch((e) => alertError('حذف نشد', e)),
                  },
                ])
              }
            >
              <CallRow phone={c.phone} label={c.name ?? 'همراه'} relation={c.relation} />
              {c.notes ? (
                <Text variant="tiny" color="textFaint" style={{ marginTop: 2, marginHorizontal: 4 }}>
                  {c.notes}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </Column>
      ) : (
        <Card tone="alt">
          <Text variant="caption" color="textFaint">
            شماره‌ی همراه ثبت نشده است.
          </Text>
        </Card>
      )}

      {historyFields.length > 0 && (
        <>
          <SectionHeader title="سابقه" />
          <Card>
            {historyFields.map((f, i) => (
              <View key={f.label}>
                {i > 0 && <Divider />}
                <DataRow label={f.label} value={f.value} multiline />
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="شناسه" />
      <Card>
        <DataRow label="کد ملی" value={patient.nationalId} numeric />
        <DataRow label="شماره پرونده" value={patient.fileNumber} numeric />
        <DataRow label="تاریخ تولد" value={patient.birthDate ? formatJalaliLong(patient.birthDate) : null} />
        <DataRow label="شهر" value={patient.city} />
        <DataRow label="آدرس" value={patient.address} multiline />
        <DataRow label="ثبت در" value={formatJalaliDateTime(patient.createdAt)} />
      </Card>
    </Column>
  );
}

/**
 * Where the patient is right now and for how long. Shown first, because it is
 * the first thing anyone asks on rounds.
 */
function AdmissionCard({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { data } = useLive(activeEncounterDetailQuery(patientId), [patientId]);
  const current = data?.[0];

  if (!current) {
    return (
      <Row gap="sm" style={{ marginTop: spacing.lg }}>
        <View style={styles.grow}>
          <Button
            label="ثبت بستری / ویزیت"
            icon="bed-outline"
            variant="ghost"
            full
            onPress={() => router.push({ pathname: '/patient/[id]/encounter', params: { id: patientId } })}
          />
        </View>
      </Row>
    );
  }

  const { encounter, place, attending } = current;
  const elapsed = formatAdmissionElapsed(admissionElapsed(encounter.admittedAt, encounter.admittedAtHasTime));
  const location = [place?.name, encounter.ward, encounter.bed ? `تخت ${toPersianDigits(encounter.bed)}` : null]
    .filter(Boolean)
    .join(' • ');
  const isAdmission = isInpatient(encounter.kind);

  return (
    <Card style={{ marginTop: spacing.lg, borderColor: colors.primary, borderWidth: 1 }}>
      <Column gap="sm">
        <Row justify="space-between" align="flex-start">
          <Column gap="xxs" style={styles.grow}>
            <Row gap="xs">
              <Badge label={ENCOUNTER_KIND_LABELS[encounter.kind]} tone="primary" />
              {encounter.service ? <Badge label={encounter.service} tone="neutral" /> : null}
            </Row>
            {location ? <Text variant="subheading">{location}</Text> : null}
            {attending ? (
              <Text variant="caption" color="textMuted">
                اتند: {doctorDisplayName(attending)}
              </Text>
            ) : null}
          </Column>

          {isAdmission && elapsed ? (
            <View
              style={{
                backgroundColor: colors.primarySoft,
                borderRadius: radii.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                alignItems: 'center',
              }}
            >
              <Text variant="subheading" color="primary">
                {elapsed}
              </Text>
              <Text variant="tiny" color="primary">
                از بستری
              </Text>
            </View>
          ) : null}
        </Row>

        {encounter.chiefComplaint ? (
          <Text variant="body" color="textMuted">
            CC: {encounter.chiefComplaint}
          </Text>
        ) : null}

        {encounter.admittedAt ? (
          <Text variant="tiny" color="textFaint">
            از {formatJalali(encounter.admittedAt)} ({formatRelative(encounter.admittedAt)})
          </Text>
        ) : null}

        <Row gap="sm">
          <View style={styles.grow}>
            <Button
              label="ویرایش"
              icon="create-outline"
              variant="ghost"
              size="sm"
              full
              onPress={() =>
                router.push({
                  pathname: '/patient/[id]/encounter',
                  params: { id: patientId, encounterId: encounter.id },
                })
              }
            />
          </View>
          {isAdmission && (
            <View style={styles.grow}>
              <Button
                label="ترخیص"
                icon="exit-outline"
                variant="secondary"
                size="sm"
                full
                onPress={() =>
                  router.push({
                    pathname: '/patient/[id]/discharge',
                    params: { id: patientId, encounterId: encounter.id },
                  })
                }
              />
            </View>
          )}
        </Row>
      </Column>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
