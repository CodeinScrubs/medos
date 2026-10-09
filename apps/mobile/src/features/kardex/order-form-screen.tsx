import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError, notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Order } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { AllergyBanner } from '@/features/patients/patient-header';
import { patientQuery } from '@/features/patients/queries';
import { datasetGeneration } from '@/lib/dataset-write';
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

type OrderFields = {
  kind: Order['kind'];
  name: string;
  dose: string;
  route: string | null;
  frequency: string | null;
  rate: string;
  isPrn: boolean;
  prnCondition: string;
  startAt: Date | null;
  indication: string;
  notes: string;
};

/** Create or edit a kardex order. Params: `id` (patient), optional `orderId`. */
export function OrderFormScreen() {
  const { id: patientId, orderId } = useLocalSearchParams<{ id: string; orderId?: string }>();
  // Route-param reuse must not place a cached order under another patient's allergy context.
  // Retain this editing intent and its input; a changed route makes it read-only.
  const [context] = useState(() => ({ patientId: patientId ?? '', orderId }));
  const { stale } = useDatasetIntent();
  const contextChanged = context.patientId !== (patientId ?? '') || context.orderId !== orderId;
  const { data, error, retry } = useLive(orderQuery(context.orderId ?? '', context.patientId), [
    context.orderId,
    context.patientId,
  ]);
  const [seed, setSeed] = useState<Order | undefined>(() => data?.[0]);
  if (!stale && seed === undefined && data?.[0]) setSeed(data[0]);
  const unavailable = Boolean(context.orderId) && (error !== undefined || data === undefined || data.length === 0);
  return (
    <EditGate
      editing={Boolean(context.orderId)}
      rows={seed ? [seed] : data}
      error={error}
      onRetry={retry}
      what="کاردکس"
      fenceDataset
    >
      {(order, readNotice, generation) => (
        <OrderForm
          readNotice={readNotice}
          patientId={context.patientId}
          order={order}
          generation={generation}
          contextChanged={contextChanged}
          unavailable={unavailable}
        />
      )}
    </EditGate>
  );
}

function OrderForm({
  patientId,
  order,
  readNotice,
  generation,
  contextChanged,
  unavailable,
}: {
  readNotice: ReactNode;
  patientId: string;
  order: Order | null;
  generation: number;
  contextChanged: boolean;
  unavailable: boolean;
}) {
  const { data: patientRows, error: patientError, retry: retryPatient } = useLive(patientQuery(patientId), [patientId]);
  const patient = patientRows?.[0];
  const router = useRouter();
  const navigation = useNavigation();
  const { stale } = useDatasetIntent(generation);
  const { colors, radii, spacing } = useTheme();
  const isEdit = order != null;
  const [basis] = useState(order);

  const [fields, setFields] = useState<OrderFields>(() => ({
    kind: order?.kind ?? 'drug',
    name: order?.name ?? '',
    dose: order?.dose ?? '',
    route: order?.route ?? null,
    frequency: order?.frequency ?? null,
    rate: order?.rate ?? '',
    isPrn: order?.isPrn ?? false,
    prnCondition: order?.prnCondition ?? '',
    startAt: order ? order.startAt : new Date(),
    indication: order?.indication ?? '',
    notes: order?.notes ?? '',
  }));
  const latest = useRef(fields);
  const { kind, name, dose, route, frequency, rate, isPrn, prnCondition, startAt, indication, notes } = fields;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const acting = useRef(false);
  const published = useRef(false);
  const mounted = useRef(true);
  const suggestionIntent = useRef(0);
  const [suggestionError, setSuggestionError] = useState<Error>();
  const [prefillFailure, setPrefillFailure] = useState<{ picked: string; intent: number; error: Error }>();
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const readable = patientRows !== undefined && patient != null && !patientError;
  const contextValid = useRef(!contextChanged && !unavailable && readable);
  useLayoutEffect(() => {
    contextValid.current = !contextChanged && !unavailable && readable;
  }, [contextChanged, unavailable, readable]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const locked = saving || completed || stale || contextChanged || unavailable || !readable;
  const dateValidation = useDateValidation();

  function mayEdit() {
    return (
      !acting.current &&
      !published.current &&
      mounted.current &&
      contextValid.current &&
      generation === datasetGeneration()
    );
  }
  function update(patch: Partial<OrderFields>) {
    if (!mayEdit()) return;
    // Invalidate any pending suggestion on any manual edit, including editing then clearing a dose.
    suggestionIntent.current++;
    setPrefillFailure(undefined);
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setFields(next);
  }

  // Suggestions from this user's own past orders, not a drug database.
  useEffect(() => {
    if (isEdit || locked || stale) return;
    let cancelled = false;
    void suggestOrderNames(name)
      .then((names) => {
        if (!cancelled) {
          setSuggestions(names.filter((n) => n !== name));
          setSuggestionError(undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionError(new Error('پیشنهادها خوانده نشدند.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name, isEdit, locked, stale, suggestionAttempt]);

  async function applySuggestion(picked: string) {
    if (!mayEdit() || !navigation.isFocused()) return;
    update({ name: picked });
    const intent = suggestionIntent.current;
    setSuggestions([]);
    try {
      const last = await lastOrderNamed(picked);
      if (
        !last ||
        !mayEdit() ||
        !navigation.isFocused() ||
        intent !== suggestionIntent.current ||
        latest.current.name !== picked
      )
        return;
      const current = latest.current;
      update({
        kind: last.kind,
        dose: current.dose || (last.dose ?? ''),
        route: current.route ?? last.route,
        frequency: current.frequency ?? last.frequency,
        rate: current.rate || (last.rate ?? ''),
      });
      setPrefillFailure(undefined);
    } catch {
      if (mayEdit() && navigation.isFocused() && intent === suggestionIntent.current)
        setPrefillFailure({ picked, intent, error: new Error('دستور قبلی خوانده نشد.') });
    }
  }

  const isMedication = kind === 'drug' || kind === 'fluid';

  async function save() {
    if (acting.current || published.current || !mounted.current || !contextValid.current || !navigation.isFocused())
      return;
    if (!dateValidation.check()) return;
    const value = latest.current;
    if (!value.name.trim()) {
      notify('نام دستور لازم است');
      return;
    }
    acting.current = true;
    setSaving(true);
    const medication = value.kind === 'drug' || value.kind === 'fluid';
    const payload = {
      kind: value.kind,
      name: value.name.trim(),
      dose: medication ? value.dose.trim() || null : null,
      route: medication ? value.route : null,
      frequency: value.kind === 'drug' ? value.frequency : null,
      rate: value.kind === 'fluid' ? value.rate.trim() || null : null,
      isPrn: value.kind === 'drug' ? value.isPrn : false,
      prnCondition: value.kind === 'drug' && value.isPrn ? value.prnCondition.trim() || null : null,
      startAt: value.startAt,
      indication: value.indication.trim() || null,
      notes: value.notes.trim() || null,
    };
    try {
      if (basis) await updateOrder(basis.id, payload, generation, basis);
      else await createOrder({ patientId, ...payload }, generation);
      published.current = true;
      if (mounted.current) setCompleted(true);
      if (mounted.current && navigation.isFocused()) router.back();
    } catch (e) {
      if (mounted.current && navigation.isFocused()) alertError('ذخیره نشد', e);
    } finally {
      acting.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Column collapsable={false} gap="md" pointerEvents={saving ? 'none' : 'auto'} style={{ paddingTop: spacing.md }}>
        {readNotice}
        <ErrorNotice error={patientError} what="بیمار" onRetry={retryPatient} />
        {contextChanged ? (
          <Text color="danger">مسیر بیمار تغییر کرده؛ این فرم فقط برای مرور نوشته‌های قبلی است.</Text>
        ) : null}
        {unavailable ? (
          <Text color="danger">این دستور فعلاً در دسترس نیست؛ نوشته‌های روی صفحه حفظ شده‌اند.</Text>
        ) : null}
        {completed ? (
          <Column gap="sm">
            <Text>دستور ثبت شد.</Text>
            <Button
              label="بستن"
              onPress={() => {
                if (navigation.isFocused()) router.back();
              }}
            />
          </Column>
        ) : null}
        {/* The allergy line where the order is written, not only on the record's
            header. Shown, never checked: matching a drug to an allergy class is a
            clinical rule that would need its own validation (invariant 10). */}
        {patient ? <AllergyBanner text={patient.allergies} /> : null}
        <ChipSelect
          label="نوع"
          disabled={locked}
          options={KIND_OPTIONS}
          value={kind}
          onChange={(v) => v && update({ kind: v })}
        />

        <Column gap="xs">
          <Input
            label={kind === 'drug' ? 'نام دارو' : 'دستور'}
            editable={!locked}
            required
            value={name}
            onChangeText={(name) => update({ name })}
            placeholder={NAME_HINTS[kind]}
            ltr
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={!isEdit}
          />
          <ErrorNotice
            error={suggestionError}
            what="پیشنهادهای کاردکس"
            onRetry={() => setSuggestionAttempt((n) => n + 1)}
          />
          <ErrorNotice
            error={prefillFailure?.error}
            what="دستور قبلی"
            onRetry={() => {
              if (
                !prefillFailure ||
                !mayEdit() ||
                !navigation.isFocused() ||
                suggestionIntent.current !== prefillFailure.intent ||
                latest.current.name !== prefillFailure.picked
              )
                return;
              void applySuggestion(prefillFailure.picked);
            }}
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
                  disabled={locked}
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
            editable={!locked}
            value={dose}
            onChangeText={(dose) => update({ dose })}
            placeholder={kind === 'fluid' ? '1000 cc' : '1 g'}
            ltr
            numericFold
            autoCorrect={false}
          />
        )}

        {isMedication && (
          <ChipSelect
            label="روش مصرف"
            disabled={locked}
            options={ROUTES}
            value={route}
            onChange={(route) => update({ route })}
            allowDeselect
            ltr
          />
        )}

        {kind === 'drug' && (
          <ChipSelect
            label="دفعات"
            disabled={locked}
            options={FREQUENCIES}
            value={frequency}
            onChange={(frequency) => update({ frequency })}
            allowDeselect
            ltr
          />
        )}

        {kind === 'fluid' && (
          <Input
            label="سرعت"
            editable={!locked}
            value={rate}
            onChangeText={(rate) => update({ rate })}
            placeholder="80 cc/h"
            ltr
            numericFold
          />
        )}

        {kind === 'drug' && (
          <>
            <Toggle
              label="PRN"
              disabled={locked}
              description="فقط در صورت نیاز"
              value={isPrn}
              onChange={(isPrn) => update({ isPrn })}
            />
            {isPrn && (
              <Input
                label="شرط مصرف"
                editable={!locked}
                value={prnCondition}
                onChangeText={(prnCondition) => update({ prnCondition })}
                placeholder="مثلاً if T > 38.5"
                ltr
              />
            )}
          </>
        )}

        {startAt ? (
          <QuickDateField
            onValidityChange={dateValidation.setValid}
            label="شروع"
            disabled={locked}
            value={startAt}
            onChange={(startAt) => update({ startAt })}
            direction="past"
          />
        ) : (
          <Column gap="xs">
            <Text variant="caption" color="textMuted">
              زمان شروع ثبت نشده است.
            </Text>
            <Button
              label="افزودن زمان شروع"
              disabled={locked}
              variant="ghost"
              onPress={() => update({ startAt: new Date() })}
            />
          </Column>
        )}

        <Input
          label="اندیکاسیون"
          editable={!locked}
          value={indication}
          onChangeText={(indication) => update({ indication })}
          placeholder="مثلاً CAP"
          ltr
        />
        <Input label="یادداشت" editable={!locked} value={notes} onChangeText={(notes) => update({ notes })} multiline />

        <Row gap="sm" style={{ marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={isEdit ? 'ذخیره' : 'افزودن به کاردکس'}
              icon="checkmark"
              onPress={() => void save()}
              loading={saving}
              disabled={stale || locked}
              full
            />
          </View>
          <Button
            label="انصراف"
            disabled={saving || completed}
            variant="ghost"
            onPress={() => {
              if (!acting.current && !published.current && mounted.current && navigation.isFocused()) router.back();
            }}
            haptic={false}
          />
        </Row>
      </Column>
    </Screen>
  );
}
