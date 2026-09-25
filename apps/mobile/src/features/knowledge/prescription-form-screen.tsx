import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { PickerModal } from '@/components/picker-modal';
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
import type { PrescriptionItem, PrescriptionTemplate, Specialty } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { specialtiesQuery } from '@/features/doctors/queries';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { AGE_GROUP_LABELS } from './labels';
import { itemsOf } from './logic';
import { createPrescription, prescriptionQuery, updatePrescription } from './prescriptions-queries';

const AGE_OPTIONS = (Object.keys(AGE_GROUP_LABELS) as PrescriptionTemplate['ageGroup'][]).map((g) => ({
  value: g,
  label: AGE_GROUP_LABELS[g],
}));

const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

const EMPTY_ITEM: PrescriptionItem = { drug: '' };

/**
 * Write or edit one of the user's own prescription templates.
 *
 * Nothing here suggests a drug or checks a dose: the fields are boxes for
 * what the physician decided, and the app reproduces it later.
 *
 * Param: optional `templateId`.
 */
export function PrescriptionFormScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const { data, error, retry } = useLive(prescriptionQuery(templateId ?? ''), [templateId]);
  return (
    <EditGate editing={Boolean(templateId)} rows={data} error={error} onRetry={retry} what="قالب نسخه">
      {(template, readNotice) => <PrescriptionForm readNotice={readNotice} template={template} />}
    </EditGate>
  );
}

function PrescriptionForm({ template, readNotice }: { readNotice: ReactNode; template: PrescriptionTemplate | null }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const [title, setTitle] = useState(template?.title ?? '');
  const [condition, setCondition] = useState(template?.condition ?? '');
  const [ageGroup, setAgeGroup] = useState<PrescriptionTemplate['ageGroup']>(template?.ageGroup ?? 'any');
  const [specialtyId, setSpecialtyId] = useState<string | null>(template?.specialtyId ?? null);
  const [items, setItems] = useState<PrescriptionItem[]>(() => {
    const existing = template ? itemsOf(template) : [];
    return existing.length > 0 ? existing : [{ ...EMPTY_ITEM }];
  });
  const [adviceText, setAdviceText] = useState(template?.adviceText ?? '');
  const [cautionsText, setCautionsText] = useState(template?.cautionsText ?? '');
  const [followUpText, setFollowUpText] = useState(template?.followUpText ?? '');
  const [tags, setTags] = useState((template?.tags ?? []).join('، '));
  const [starred, setStarred] = useState(template?.starred ?? false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: specialtyRows } = useLive(specialtiesQuery());
  const specialtyItems = useMemo(
    () =>
      (specialtyRows ?? []).map((s: Specialty) => ({
        id: s.id,
        label: s.nameFa,
        sublabel: s.nameEn,
        keywords: (s.aliases ?? []).join(' '),
      })),
    [specialtyRows],
  );

  function patchItem(index: number, patch: Partial<PrescriptionItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    if (!title.trim()) {
      Alert.alert('عنوان لازم است');
      return;
    }
    if (items.every((i) => !i.drug.trim())) {
      Alert.alert('حداقل یک دارو بنویسید');
      return;
    }
    setSaving(true);
    const payload = {
      title,
      condition,
      specialtyId,
      ageGroup,
      items,
      adviceText,
      cautionsText,
      followUpText,
      tags: toList(tags),
      starred,
    };
    try {
      if (template) await updatePrescription(template.id, payload);
      else await createPrescription(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: template ? 'ویرایش نسخه' : 'نسخه‌ی جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Input label="عنوان" required value={title} onChangeText={setTitle} placeholder="مثلاً UTI ساده" />
        <Input
          label="برای چه بیماری"
          value={condition}
          onChangeText={setCondition}
          placeholder="خانم بالغ، بدون تب و درد پهلو"
        />
        <ChipSelect label="گروه سنی" options={AGE_OPTIONS} value={ageGroup} onChange={(v) => v && setAgeGroup(v)} />
        <SelectField
          label="تخصص"
          icon="medkit-outline"
          value={specialtyRows?.find((s) => s.id === specialtyId)?.nameFa ?? null}
          onPress={() => setPicking(true)}
          onClear={() => setSpecialtyId(null)}
        />

        <SectionHeader title="داروها" count={items.filter((i) => i.drug.trim()).length} />
        {items.map((item, index) => (
          <Card key={index} tone="alt">
            <Column gap="sm">
              <Row gap="sm" justify="space-between">
                <Text variant="captionStrong" color="textMuted">
                  قلم {toPersianDigits(index + 1)}
                </Text>
                {items.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`حذف قلم ${toPersianDigits(index + 1)}`}
                    hitSlop={10}
                    onPress={() => setItems((current) => current.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </Row>
              <Input
                label="دارو"
                value={item.drug}
                onChangeText={(v) => patchItem(index, { drug: v })}
                ltr
                placeholder="Amoxicillin"
              />
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    label="دوز"
                    value={item.dose ?? ''}
                    onChangeText={(v) => patchItem(index, { dose: v })}
                    ltr
                    numericFold
                    placeholder="500 mg"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    label="شکل"
                    value={item.form ?? ''}
                    onChangeText={(v) => patchItem(index, { form: v })}
                    ltr
                    placeholder="cap"
                  />
                </View>
              </Row>
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    label="راه"
                    value={item.route ?? ''}
                    onChangeText={(v) => patchItem(index, { route: v })}
                    ltr
                    placeholder="PO"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    label="تعداد دفعات"
                    value={item.frequency ?? ''}
                    onChangeText={(v) => patchItem(index, { frequency: v })}
                    ltr
                    placeholder="TDS"
                  />
                </View>
              </Row>
              <Row gap="sm">
                <View style={styles.grow}>
                  <Input
                    label="مدت"
                    value={item.duration ?? ''}
                    onChangeText={(v) => patchItem(index, { duration: v })}
                    placeholder="۷ روز"
                  />
                </View>
                <View style={styles.grow}>
                  <Input
                    label="تعداد"
                    value={item.quantity ?? ''}
                    onChangeText={(v) => patchItem(index, { quantity: v })}
                    ltr
                    numericFold
                    placeholder="21"
                  />
                </View>
              </Row>
              <Input
                label="یا خط را خودتان بنویسید"
                value={item.sig ?? ''}
                onChangeText={(v) => patchItem(index, { sig: v })}
                ltr
                hint="اگر پر باشد، همین عیناً نوشته می‌شود"
              />
              <Input
                label="توضیح این قلم"
                value={item.notes ?? ''}
                onChangeText={(v) => patchItem(index, { notes: v })}
              />
            </Column>
          </Card>
        ))}
        <Button
          label="قلم بعدی"
          icon="add"
          variant="secondary"
          full
          onPress={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
        />

        <SectionHeader title="همراه نسخه" />
        <Input label="توصیه‌ها" value={adviceText} onChangeText={setAdviceText} multiline />
        <Input
          label="هشدارها"
          value={cautionsText}
          onChangeText={setCautionsText}
          multiline
          hint="چه چیزی یعنی بیمار باید برگردد"
        />
        <Input label="پیگیری" value={followUpText} onChangeText={setFollowUpText} multiline />
        <Input label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
        <Toggle label="ستاره‌دار" value={starred} onChange={setStarred} />

        <Button
          label={template ? 'ذخیره' : 'ثبت نسخه'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
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
