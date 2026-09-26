import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EditGate } from '@/components/edit-gate';
import { alertError, notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Order } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { AllergyBanner } from '@/features/patients/patient-header';
import { patientQuery } from '@/features/patients/queries';
import { useTheme } from '@/theme';

import { FREQUENCIES, ORDER_KIND_LABELS, ROUTES } from './labels';
import { createOrder, lastOrderNamed, orderQuery, suggestOrderNames, updateOrder } from './queries';

const KIND_OPTIONS = (['drug', 'fluid', 'diet', 'nursing', 'other'] as const).map((k) => ({
  value: k,
  label: ORDER_KIND_LABELS[k],
}));

const NAME_HINTS: Record<Order['kind'], string> = {
  drug: 'مثلاً Ceftriaxone',
  fluid: 'مثلاً NaCl 0.9% / DW5%',
  diet: 'مثلاً NPO / Soft diet / DM diet',
  nursing: 'مثلاً I/O chart / V/S Q4H',
  lab: 'مثلاً CBC',
  imaging: 'مثلاً CXR',
  consult: 'مثلاً Cardiology',
  other: '',
};

/** Create or edit a kardex order. Params: `id` (patient), optional `orderId`. */
export function OrderFormScreen() {
  const { id: patientId, orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  const { data, error, retry } = useLive(orderQuery(orderId ?? ''), [orderId]);
  return (
    <EditGate editing={Boolean(orderId)} rows={data} error={error} onRetry={retry} what="کاردکس">
      {(order, readNotice) => <OrderForm readNotice={readNotice} patientId={patientId} order={order} />}
    </EditGate>
  );
}

function OrderForm({
  patientId,
  order,
  readNotice,
}: {
  readNotice: ReactNode;
  patientId: string;
  order: Order | null;
}) {
  const { data: patientRows } = useLive(patientQuery(patientId), [patientId]);
  const patient = patientRows?.[0];
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const isEdit = order != null;

  const [kind, setKind] = useState<Order['kind']>(order?.kind ?? 'drug');
  const [name, setName] = useState(order?.name ?? '');
  const [dose, setDose] = useState(order?.dose ?? '');
  const [route, setRoute] = useState<string | null>(order?.route ?? null);
  const [frequency, setFrequency] = useState<string | null>(order?.frequency ?? null);
  const [rate, setRate] = useState(order?.rate ?? '');
  const [isPrn, setIsPrn] = useState(order?.isPrn ?? false);
  const [prnCondition, setPrnCondition] = useState(order?.prnCondition ?? '');
  const [startAt, setStartAt] = useState(() => order?.startAt ?? new Date());
  const [indication, setIndication] = useState(order?.indication ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();

  // Suggestions from this user's own past orders, not a drug database.
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    void suggestOrderNames(name).then((names) => {
      if (!cancelled) setSuggestions(names.filter((n) => n !== name));
    });
    return () => {
      cancelled = true;
    };
  }, [name, isEdit]);

  async function applySuggestion(picked: string) {
    setName(picked);
    setSuggestions([]);
    const last = await lastOrderNamed(picked);
    if (!last) return;
    // Prefill only what is still empty, so nothing the user typed is overwritten.
    setKind(last.kind);
    if (!dose) setDose(last.dose ?? '');
    if (!route) setRoute(last.route);
    if (!frequency) setFrequency(last.frequency);
    if (!rate) setRate(last.rate ?? '');
  }

  const isMedication = kind === 'drug' || kind === 'fluid';

  async function save() {
    if (!dateValidation.check()) return;
    if (!name.trim()) {
      notify('نام دستور لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      kind,
      name: name.trim(),
      dose: isMedication ? dose.trim() || null : null,
      route: isMedication ? route : null,
      frequency: kind === 'drug' ? frequency : null,
      rate: kind === 'fluid' ? rate.trim() || null : null,
      isPrn: kind === 'drug' ? isPrn : false,
      prnCondition: kind === 'drug' && isPrn ? prnCondition.trim() || null : null,
      startAt,
      indication: indication.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (order) await updateOrder(order.id, payload);
      else await createOrder({ patientId, ...payload });
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        {/* The allergy line where the order is written, not only on the record's
            header. Shown, never checked: matching a drug to an allergy class is a
            clinical rule that would need its own validation (invariant 10). */}
        {patient ? <AllergyBanner text={patient.allergies} /> : null}
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && setKind(v)} />

        <Column gap="xs">
          <Input
            label={kind === 'drug' ? 'نام دارو' : 'دستور'}
            required
            value={name}
            onChangeText={setName}
            placeholder={NAME_HINTS[kind]}
            ltr
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={!isEdit}
          />
          {suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => void applySuggestion(s)}
                  style={{
                    paddingHorizontal: spacing.md,
                    height: 32,
                    justifyContent: 'center',
                    borderRadius: radii.full,
                    backgroundColor: colors.primarySoft,
                  }}
                >
                  <Text variant="caption" color="primary" ltr>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Column>

        {isMedication && (
          <Input
            label={kind === 'fluid' ? 'حجم' : 'دوز'}
            value={dose}
            onChangeText={setDose}
            placeholder={kind === 'fluid' ? '1000 cc' : '1 g'}
            ltr
            numericFold
            autoCorrect={false}
          />
        )}

        {isMedication && (
          <ChipSelect label="روش مصرف" options={ROUTES} value={route} onChange={setRoute} allowDeselect ltr />
        )}

        {kind === 'drug' && (
          <ChipSelect label="دفعات" options={FREQUENCIES} value={frequency} onChange={setFrequency} allowDeselect ltr />
        )}

        {kind === 'fluid' && (
          <Input label="سرعت" value={rate} onChangeText={setRate} placeholder="80 cc/h" ltr numericFold />
        )}

        {kind === 'drug' && (
          <>
            <Toggle label="PRN" description="فقط در صورت نیاز" value={isPrn} onChange={setIsPrn} />
            {isPrn && (
              <Input
                label="شرط مصرف"
                value={prnCondition}
                onChangeText={setPrnCondition}
                placeholder="مثلاً if T > 38.5"
                ltr
              />
            )}
          </>
        )}

        <QuickDateField
          onValidityChange={dateValidation.setValid}
          label="شروع"
          value={startAt}
          onChange={setStartAt}
          direction="past"
        />

        <Input label="اندیکاسیون" value={indication} onChangeText={setIndication} placeholder="مثلاً CAP" ltr />
        <Input label="یادداشت" value={notes} onChangeText={setNotes} multiline />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={isEdit ? 'ذخیره' : 'افزودن به کاردکس'}
              icon="checkmark"
              onPress={() => void save()}
              loading={saving}
              full
            />
          </View>
          <Button label="انصراف" variant="ghost" onPress={() => router.back()} haptic={false} />
        </Row>
      </Column>
    </Screen>
  );
}
