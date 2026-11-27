import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { QuickDateField } from '@/components/quick-date-field';
import { Button, ChipSelect, Column, Input, Row, Screen, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import { useNow } from '@/components/use-now';
import type { Order } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { AllergyBanner } from '@/features/patients/patient-header';
import { patientQuery } from '@/features/patients/queries';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormPort, FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { dateInputText } from '@/lib/date-input';
import { formatJalali } from '@/lib/jalali';
import { formatClock } from '@/lib/time';
import { useTheme } from '@/theme';

import { orderFormContext, orderFormStart, type OrderFormFields } from './form-draft';
import { orderContextLabelQuery, orderFormIntentQuery, orderFormPort } from './form-draft-queries';
import { FREQUENCIES, ORDER_KIND_LABELS, ROUTES } from './labels';
import { lastOrderNamed, suggestOrderNames } from './queries';

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
  return (
    <AutosaveScope>
      <OrderIntent />
    </AutosaveScope>
  );
}

function OrderIntent() {
  const {
    id: patientId,
    orderId,
    draftId,
  } = useLocalSearchParams<{ id: string; orderId?: string; draftId?: string }>();
  // Route-param reuse must not place a cached order under another patient's allergy context.
  // Retain this editing intent and its input; a changed route makes it read-only.
  const [context] = useState(() => ({
    patientId: patientId ?? '',
    orderId: orderId ?? null,
    draftId: draftId ?? null,
  }));
  const { stale } = useDatasetIntent();
  const contextChanged =
    context.patientId !== (patientId ?? '') ||
    context.orderId !== (orderId ?? null) ||
    context.draftId !== (draftId ?? null);
  const { data, error, retry } = useLive(orderFormIntentQuery(context.patientId, context.orderId, context.draftId), [
    context.orderId,
    context.patientId,
    context.draftId,
  ]);
  const row = data?.[0];
  const [original, setOriginal] = useState<{
    port: FormPort<Order, OrderFormFields>;
    allergy: string | null | undefined;
  }>();
  let contextError: Error | undefined;
  if (!original && !stale && !contextChanged && row && !error) {
    try {
      if (context.draftId !== null && row.draft?.id !== context.draftId) throw new Error('این پیش‌نویس در دسترس نیست.');
      if (context.orderId !== null && !row.record && !row.draft) throw new Error('این دستور در دسترس نیست.');
      const owner = row.draft
        ? orderFormContext(row.draft.parentId)
        : row.record
          ? { patientId: row.record.patientId, encounterId: row.record.encounterId }
          : { patientId: context.patientId, encounterId: row.activeEpisode };
      if (owner.patientId !== context.patientId) throw new Error('مسیر بیمار تغییر کرده است.');
      setOriginal({ port: orderFormPort(owner), allergy: row.patient?.allergies });
    } catch (cause) {
      contextError = cause instanceof Error ? cause : new Error('پیش‌نویس قابل خواندن نیست.');
    }
  }
  if (original)
    return (
      <WorkspaceFormGate port={original.port} recordId={context.orderId} draftId={context.draftId}>
        {(seed, readNotice, unavailable) => (
          <OrderForm
            seed={seed}
            port={original.port}
            allergyAtOpen={original.allergy}
            patientId={context.patientId}
            readNotice={
              <>
                {readNotice}
                <ErrorNotice error={error} what="نوبت کاردکس" onRetry={retry} />
              </>
            }
            unavailable={unavailable || !!error || contextChanged}
          />
        )}
      </WorkspaceFormGate>
    );
  if (contextError && row?.draft)
    return (
      <Screen scroll>
        <Column>
          <ErrorNotice error={contextError} what="پیش‌نویس کاردکس" onRetry={retry} />
          <Text selectable>{row.draft.body}</Text>
        </Column>
      </Screen>
    );
  return (
    <EditGate editing rows={contextError ? [] : undefined} error={error} onRetry={retry} what="کاردکس" fenceDataset>
      {() => null}
    </EditGate>
  );
}

function OrderForm({
  patientId,
  seed,
  port,
  readNotice,
  unavailable,
  allergyAtOpen,
}: {
  readNotice: ReactNode;
  patientId: string;
  seed: FormSeed<Order, OrderFormFields>;
  port: FormPort<Order, OrderFormFields>;
  unavailable: boolean;
  allergyAtOpen: string | null | undefined;
}) {
  const { data: patientRows, error: patientError, retry: retryPatient } = useLive(patientQuery(patientId), [patientId]);
  const patient = patientRows?.[0];
  const router = useRouter();
  const navigation = useNavigation();
  const { stale } = useDatasetIntent();
  const [originalContext] = useState(() => orderFormContext(port.parentId ?? null));
  const {
    data: contextRows,
    error: episodeError,
    retry: retryEpisode,
  } = useLive(orderContextLabelQuery(originalContext), [originalContext.patientId, originalContext.encounterId]);
  const episode = contextRows?.[0];
  const currentLabel =
    originalContext.encounterId === null
      ? 'بدون نوبت بستری'
      : episode
        ? ['بستری', episode.admittedAt ? formatJalali(episode.admittedAt) : null, episode.ward]
            .filter(Boolean)
            .join(' · ')
        : contextRows === undefined
          ? 'در حال خواندن بستری…'
          : 'بستریِ اصلی در دسترس نیست';
  const [ownedContextLabel, setOwnedContextLabel] = useState(() =>
    stale ? (originalContext.encounterId === null ? 'بدون نوبت بستری' : 'بستریِ اصلی فرم قدیمی') : currentLabel,
  );
  if (!stale && !episodeError && contextRows !== undefined && ownedContextLabel !== currentLabel)
    setOwnedContextLabel(currentLabel);
  // Cache only display text: live corrections may refresh it, a restore cannot.
  // A recovered child can first mount after replacement; only the parent intent's
  // original read can seed its old-dataset banner in that case.
  const [ownedAllergy, setOwnedAllergy] = useState(() =>
    stale ? allergyAtOpen : patient ? patient.allergies : allergyAtOpen,
  );
  if (!stale && !patientError && patient && ownedAllergy !== patient.allergies) setOwnedAllergy(patient.allergies);
  const allergy = stale ? ownedAllergy : patient?.allergies;
  const { colors, radii, spacing } = useTheme();
  const isEdit = seed.document.recordId !== null;
  const now = useNow();
  const readable =
    patientRows !== undefined &&
    patient != null &&
    !patientError &&
    (originalContext.encounterId === null || (!!episode && !episodeError));
  const editing = useWorkspaceForm(port, seed, unavailable || !readable, () => router.back());
  const fields = editing.document.fields;
  const latest = useRef(fields);
  useLayoutEffect(() => {
    latest.current = fields;
  }, [fields]);
  const { kind, name, dose, route, frequency, rate, isPrn, prnCondition, indication, notes } = fields;
  let startAt = fields.hasStart ? new Date(fields.dateValue) : null;
  try {
    startAt = orderFormStart(fields, new Date(now));
  } catch {
    /* The invalid raw date stays visible. */
  }
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const saving = editing.busy;
  const completed = !!editing.completed;
  const suggestionIntent = useRef(0);
  const [suggestionError, setSuggestionError] = useState<Error>();
  const [prefillFailure, setPrefillFailure] = useState<{ picked: string; intent: number; error: Error }>();
  const [suggestionAttempt, setSuggestionAttempt] = useState(0);
  const locked = editing.locked;
  const dateValidation = useDateValidation();

  function mayEdit() {
    return editing.canChange();
  }
  function update(patch: Partial<OrderFormFields>) {
    if (!mayEdit()) return;
    // Invalidate any pending suggestion on any manual edit, including editing then clearing a dose.
    suggestionIntent.current++;
    setPrefillFailure(undefined);
    const next = { ...latest.current, ...patch };
    latest.current = next;
    editing.change(patch);
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

  function save() {
    return editing.save((value) => {
      if (value.hasStart && !dateValidation.check()) return false;
      if (!value.name.trim()) {
        notify('نام دستور لازم است');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <Column collapsable={false} gap="md" pointerEvents={saving ? 'none' : 'auto'} style={{ paddingTop: spacing.md }}>
        {readNotice}
        <WorkspaceFormStatus editing={editing} port={port} />
        <ErrorNotice error={patientError} what="بیمار" onRetry={retryPatient} />
        <ErrorNotice error={episodeError} what="بستری کاردکس" onRetry={retryEpisode} />
        <Text variant="caption" color="textMuted">
          {stale ? ownedContextLabel : currentLabel}
        </Text>
        {!patientError && patientRows !== undefined && !patient ? (
          <Text color="danger">پروندهٔ بیمار در دسترس نیست؛ نوشته‌های روی صفحه حفظ شده‌اند.</Text>
        ) : null}
        {unavailable ? (
          <Text color="danger">این دستور فعلاً در دسترس نیست؛ نوشته‌های روی صفحه حفظ شده‌اند.</Text>
        ) : null}
        {completed ? (
          <Column gap="sm">
            <Button label="بستن" onPress={editing.close} />
          </Column>
        ) : null}
        {/* The allergy line where the order is written, not only on the record's
            header. Shown, never checked: matching a drug to an allergy class is a
            clinical rule that would need its own validation (invariant 10). */}
        {allergy !== undefined ? <AllergyBanner text={allergy} /> : null}
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
            rawInput={fields.date}
            onRawInputChange={(patch) => update({ date: { ...latest.current.date, ...patch } })}
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
              onPress={() => {
                const at = new Date(now);
                update({
                  hasStart: true,
                  dateValue: at.getTime(),
                  date: { dateText: dateInputText(at), clockText: formatClock(at), customOpen: false },
                });
              }}
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
          <Button label="بستن" disabled={saving || completed} variant="ghost" onPress={editing.close} haptic={false} />
        </Row>
        <WorkspaceFormDiscard editing={editing} />
      </Column>
    </Screen>
  );
}
