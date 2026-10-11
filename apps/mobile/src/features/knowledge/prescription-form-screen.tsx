import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
import { ScreenOptions } from '@/components/screen-options';
import {
  Button,
  Card,
  ChipSelect,
  Column,
  Input,
  Row,
  Screen,
  SectionHeader,
  SelectField,
  Text,
  Toggle,
} from '@/components/ui';
import type { PrescriptionTemplate, Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { specialtiesQuery } from '@/features/doctors/queries';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import {
  initialPrescriptionFields,
  prescriptionFormLine,
  type PrescriptionFormFields,
  type PrescriptionFormLine,
} from './form-draft';
import { describePrescription, prescriptionFormPort, specialtyFormReferenceQuery } from './form-draft-queries';
import { AGE_GROUP_LABELS } from './labels';

const AGE_OPTIONS = (Object.keys(AGE_GROUP_LABELS) as PrescriptionTemplate['ageGroup'][]).map((g) => ({
  value: g,
  label: AGE_GROUP_LABELS[g],
}));

/**
 * Write or edit one of the user's own prescription templates.
 *
 * Nothing here suggests a drug or checks a dose: the fields are boxes for
 * what the physician decided, and the app reproduces it later.
 *
 * Param: optional `templateId`.
 */
export function PrescriptionFormScreen() {
  const { templateId, draftId } = useLocalSearchParams<{ templateId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={prescriptionFormPort} recordId={templateId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => (
          <PrescriptionForm readNotice={readNotice} seed={seed} unavailable={unavailable} />
        )}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function PrescriptionForm({
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  seed: FormSeed<PrescriptionTemplate, PrescriptionFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const isEditing = seed.document.recordId !== null;
  const editing = useWorkspaceForm(prescriptionFormPort, seed, unavailable, () => router.back());
  const { title, condition, ageGroup, specialtyId, items, adviceText, cautionsText, followUpText, tags, starred } =
    editing.document.fields;
  const setTitle = (title: string) => editing.change({ title });
  const setCondition = (condition: string) => editing.change({ condition });
  const setAgeGroup = (ageGroup: PrescriptionTemplate['ageGroup']) => editing.change({ ageGroup });
  const setSpecialtyId = (specialtyId: string | null) => editing.change({ specialtyId });
  const setAdviceText = (adviceText: string) => editing.change({ adviceText });
  const setCautionsText = (cautionsText: string) => editing.change({ cautionsText });
  const setFollowUpText = (followUpText: string) => editing.change({ followUpText });
  const setTags = (tags: string) => editing.change({ tags });
  const setStarred = (starred: boolean) => editing.change({ starred });
  const [picking, setPicking] = useState(false);

  const { data: specialtyRows, error: specialtyError, retry: retrySpecialties } = useLive(specialtiesQuery());
  const {
    data: referenceRows,
    error: referenceError,
    retry: retryReferences,
  } = useLive(specialtyFormReferenceQuery(specialtyId), [specialtyId]);
  const liveSpecialtyItems = useMemo(
    () =>
      (specialtyRows ?? []).map((s: Specialty) => ({
        id: s.id,
        label: s.nameFa,
        sublabel: s.nameEn,
        keywords: (s.aliases ?? []).join(' '),
      })),
    [specialtyRows],
  );

  const selected = referenceRows?.[0]?.specialty;
  const currentSpecialty = selected?.id === specialtyId ? selected : null;
  const currentName = currentSpecialty
    ? `${currentSpecialty.nameFa}${currentSpecialty.deletedAt ? ' (بایگانی‌شده)' : ''}`
    : null;
  // Only a display label is retained; replacement reads never accompany old fields.
  const [retainedName, setRetainedName] = useState(() => (editing.stale ? null : currentName));
  if (!editing.stale && retainedName !== currentName) setRetainedName(currentName);
  const specialtyItems = editing.stale ? [] : liveSpecialtyItems;
  const specialtyName = editing.stale ? retainedName : currentName;
  function describeFields(fields: PrescriptionFormFields) {
    return describePrescription(
      fields,
      (!editing.stale ? specialtyRows?.find((row) => row.id === fields.specialtyId)?.nameFa : undefined) ??
        (fields.specialtyId === specialtyId ? (specialtyName ?? undefined) : undefined),
    );
  }

  function patchItem(key: string, patch: Partial<Omit<PrescriptionFormLine, 'key'>>) {
    editing.change((fields) => ({
      items: fields.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }

  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (!fields.title.trim()) {
        notify('عنوان لازم است');
        return false;
      }
      if (fields.items.every((item) => !item.drug.trim())) {
        notify('حداقل یک دارو بنویسید');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش نسخه' : 'نسخه‌ی جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus
          port={prescriptionFormPort}
          editing={editing}
          describeFields={describeFields}
          describeRecord={(row) => describeFields(initialPrescriptionFields(row))}
        />
        <Input
          editable={!editing.locked}
          label="عنوان"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="مثلاً UTI ساده"
        />
        <Input
          editable={!editing.locked}
          label="برای چه بیماری"
          value={condition}
          onChangeText={setCondition}
          placeholder="خانم بالغ، بدون تب و درد پهلو"
        />
        <ChipSelect
          label="گروه سنی"
          disabled={editing.locked}
          options={AGE_OPTIONS}
          value={ageGroup}
          onChange={(v) => v && setAgeGroup(v)}
        />
        <ErrorNotice error={specialtyError} what="تخصص‌ها" onRetry={retrySpecialties} />
        <ErrorNotice error={referenceError} what="تخصص انتخاب‌شده" onRetry={retryReferences} />
        <SelectField
          label="تخصص"
          disabled={editing.locked}
          icon="medkit-outline"
          value={specialtyName}
          onPress={() => {
            if (!editing.locked) setPicking(true);
          }}
          onClear={() => setSpecialtyId(null)}
        />

        <SectionHeader title="داروها" count={items.filter((i) => i.drug.trim()).length} />
        {items.map((item, index) => (
          <Card key={item.key} tone="alt">
            <Column gap="sm">
              <Row gap="sm" justify="space-between">
                <Text variant="captionStrong" color="textMuted">
                  قلم {toPersianDigits(index + 1)}
                </Text>
                {items.length > 1 ? (
                  <Pressable
                    disabled={editing.locked}
                    accessibilityRole="button"
                    accessibilityLabel={`حذف قلم ${toPersianDigits(index + 1)}`}
                    hitSlop={10}
                    onPress={() =>
                      editing.change((fields) => ({ items: fields.items.filter((line) => line.key !== item.key) }))
                    }
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </Row>
              <Input
                editable={!editing.locked}
                label="دارو"
                value={item.drug}
                onChangeText={(v) => patchItem(item.key, { drug: v })}
                ltr
                placeholder="Amoxicillin"
              />
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="دوز"
                    value={item.dose ?? ''}
                    onChangeText={(v) => patchItem(item.key, { dose: v })}
                    ltr
                    numericFold
                    placeholder="500 mg"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="شکل"
                    value={item.form ?? ''}
                    onChangeText={(v) => patchItem(item.key, { form: v })}
                    ltr
                    placeholder="cap"
                  />
                </View>
              </Row>
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="راه"
                    value={item.route ?? ''}
                    onChangeText={(v) => patchItem(item.key, { route: v })}
                    ltr
                    placeholder="PO"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="تعداد دفعات"
                    value={item.frequency ?? ''}
                    onChangeText={(v) => patchItem(item.key, { frequency: v })}
                    ltr
                    placeholder="TDS"
                  />
                </View>
              </Row>
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="مدت"
                    value={item.duration ?? ''}
                    onChangeText={(v) => patchItem(item.key, { duration: v })}
                    placeholder="۷ روز"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    editable={!editing.locked}
                    label="تعداد"
                    value={item.quantity ?? ''}
                    onChangeText={(v) => patchItem(item.key, { quantity: v })}
                    ltr
                    numericFold
                    placeholder="21"
                  />
                </View>
              </Row>
              <Input
                editable={!editing.locked}
                label="یا خط را خودتان بنویسید"
                value={item.sig ?? ''}
                onChangeText={(v) => patchItem(item.key, { sig: v })}
                ltr
                hint="اگر پر باشد، همین عیناً نوشته می‌شود"
              />
              <Input
                editable={!editing.locked}
                label="توضیح این قلم"
                value={item.notes ?? ''}
                onChangeText={(v) => patchItem(item.key, { notes: v })}
              />
            </Column>
          </Card>
        ))}
        <Button
          label="قلم بعدی"
          icon="add"
          variant="secondary"
          full
          disabled={editing.locked}
          onPress={() => editing.change((fields) => ({ items: [...fields.items, prescriptionFormLine()] }))}
        />

        <SectionHeader title="همراه نسخه" />
        <Input editable={!editing.locked} label="توصیه‌ها" value={adviceText} onChangeText={setAdviceText} multiline />
        <Input
          editable={!editing.locked}
          label="هشدارها"
          value={cautionsText}
          onChangeText={setCautionsText}
          multiline
          hint="چه چیزی یعنی بیمار باید برگردد"
        />
        <Input
          editable={!editing.locked}
          label="پیگیری"
          value={followUpText}
          onChangeText={setFollowUpText}
          multiline
        />
        <Input
          editable={!editing.locked}
          label="برچسب‌ها"
          value={tags}
          onChangeText={setTags}
          hint="با ویرگول جدا کنید"
        />
        <Toggle label="ستاره‌دار" value={starred} onChange={setStarred} disabled={editing.locked} />

        <Button
          label={editing.completed || editing.stale ? 'بستن' : isEditing ? 'ذخیره' : 'ثبت نسخه'}
          icon="checkmark"
          onPress={() => void save()}
          loading={editing.busy}
          disabled={editing.busy || (editing.locked && !editing.completed && !editing.stale)}
          full
        />
        <Button label="بستن" variant="ghost" disabled={editing.busy} onPress={editing.close} full haptic={false} />
        <WorkspaceFormDiscard editing={editing} />
      </Column>

      <PickerModal
        visible={picking}
        title="تخصص"
        items={specialtyItems}
        selectedId={specialtyId}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          setSpecialtyId(item.id);
          setPicking(false);
        }}
        emptyText="تخصصی با این نام نیست"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
