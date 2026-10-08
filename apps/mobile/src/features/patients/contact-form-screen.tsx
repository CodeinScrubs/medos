import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Card, ChipSelect, Column, Input, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { normalizePhone } from '@/lib/persian';
import { useTheme } from '@/theme';

import { decodeContactForm } from './contact-form-draft';
import { contactFormQuery, type ContactFormRow } from './contact-form-queries';
import { useContactForm } from './use-contact-form';

const RELATIONS = ['همسر', 'پسر', 'دختر', 'پدر', 'مادر', 'برادر', 'خواهر', 'نوه', 'همراه'];

export function ContactFormScreen() {
  const { id: patientId } = useLocalSearchParams<{ id: string }>();
  const parent = useAutosaveScope();
  const form = <ContactFormGate key={patientId} patientId={patientId ?? ''} />;
  // A child opened within a mounted editor retains that editor's original intent.
  return parent ? form : <AutosaveScope key={patientId}>{form}</AutosaveScope>;
}
function ContactFormGate({ patientId }: { patientId: string }) {
  const { stale } = useDatasetIntent();
  const scope = useAutosaveScope()!;
  const router = useRouter();
  const query = useLive(contactFormQuery(patientId), [patientId]);
  const [retained, setRetained] = useState<ContactFormRow[]>();
  const [reset, setReset] = useState(0);
  if (!stale && !retained && query.data?.[0]) setRetained([query.data[0]]);
  const rows = retained ?? query.data;
  let invalidDraft: Error | undefined;
  if (rows?.[0]?.draft) {
    try {
      decodeContactForm(rows[0].draft.body);
    } catch (e) {
      invalidDraft = e instanceof Error ? e : new Error('پیش‌نویس خوانده نشد.');
    }
  }
  if (invalidDraft || (stale && !retained))
    return (
      <Screen scroll>
        <ErrorNotice error={invalidDraft} what="پیش‌نویس همراه" />
        {stale ? <Text color="danger">اطلاعات جایگزین شده؛ فرم را دوباره باز کنید.</Text> : null}
        <Text selectable>{rows?.[0]?.draft?.body}</Text>
        <Button
          label="بازگشت"
          variant="ghost"
          onPress={() => {
            if (stale) scope.abandonStale();
            router.back();
          }}
        />
      </Screen>
    );
  return (
    <EditGate editing rows={rows} error={query.error} onRetry={query.retry} what="بیمار و پیش‌نویس همراه" fenceDataset>
      {(row, notice) =>
        row ? (
          <ContactForm
            key={reset}
            seed={row}
            readNotice={
              <>
                {notice}
                {!stale &&
                retained &&
                !query.error &&
                (query.data?.length === 0 || query.data?.[0]?.patient.deletedAt) ? (
                  <Text color="danger">بیمار در دسترس نیست؛ نوشته نگه داشته شد.</Text>
                ) : null}
              </>
            }
            onReset={(next) => {
              setRetained([next]);
              setReset((n) => n + 1);
            }}
          />
        ) : null
      }
    </EditGate>
  );
}
function ContactForm({
  seed,
  readNotice,
  onReset,
}: {
  seed: ContactFormRow;
  readNotice: ReactNode;
  onReset: (row: ContactFormRow) => void;
}) {
  const { spacing } = useTheme();
  const editing = useContactForm(seed, onReset);
  const f = editing.form;
  const disabled = editing.busy || !!editing.completed || editing.stale;
  const digits = normalizePhone(f.phone);
  const phoneError = f.phone.trim() && digits.length < 8 ? 'شماره کامل نیست' : undefined;
  let stored: ReturnType<typeof decodeContactForm>['fields'] | null = null;
  if (editing.comparison?.row.draft) {
    try {
      stored = decodeContactForm(editing.comparison.row.draft.body).fields;
    } catch {
      /* Never replace unreadable data with a blank form. */
    }
  }
  return (
    <Screen scroll>
      <ScreenOptions options={{ title: 'شمارهٔ همراه' }} />
      <Column
        gap="md"
        collapsable={false}
        pointerEvents={editing.busy ? 'none' : 'auto'}
        style={{ paddingTop: spacing.md }}
      >
        {readNotice}
        <Text variant="tiny" color={editing.state.status === 'failed' ? 'danger' : 'textMuted'}>
          {editing.completed === 'saved'
            ? 'شمارهٔ همراه ثبت شد.'
            : editing.completed === 'discarded'
              ? 'پیش‌نویس کنار گذاشته شد.'
              : editing.state.status === 'failed'
                ? 'پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.'
                : editing.state.status === 'pending' || editing.state.status === 'writing'
                  ? 'در حال ذخیرهٔ پیش‌نویس…'
                  : editing.state.status === 'saved'
                    ? 'پیش‌نویس ذخیره شد.'
                    : seed.draft
                      ? 'پیش‌نویس بازیابی شد.'
                      : 'نوشته‌ها خودکار در پیش‌نویس ذخیره می‌شوند.'}
        </Text>
        {seed.patient.deletedAt ? (
          <Text color="danger">بیمار حذف شده؛ پیش‌نویس حفظ شده است، ولی شماره ثبت نمی‌شود.</Text>
        ) : null}
        <Input
          label="شماره تماس"
          required
          value={f.phone}
          onChangeText={(phone) => editing.change({ phone })}
          numericFold
          ltr
          keyboardType="phone-pad"
          autoFocus
          error={phoneError}
          editable={!disabled}
        />
        <ChipSelect
          label="نسبت"
          options={RELATIONS.map((r) => ({ value: r, label: r }))}
          value={f.relation}
          onChange={(relation) => editing.change({ relation })}
        />
        <Input label="نام" value={f.name} onChangeText={(name) => editing.change({ name })} editable={!disabled} />
        <Input
          label="یادداشت"
          value={f.notes}
          onChangeText={(notes) => editing.change({ notes })}
          multiline
          placeholder="مثلاً: فقط عصرها پاسخ می‌دهد"
          editable={!disabled}
        />
        {editing.state.status === 'failed' && !editing.stale ? (
          <Button
            label="ذخیره نشد؛ تلاش دوباره"
            variant="ghost"
            disabled={disabled}
            onPress={() => void editing.retry()}
          />
        ) : null}
        {(editing.failedWrite || editing.state.status === 'failed') && !editing.completed && !editing.stale ? (
          <Button
            label="بررسی پیش‌نویس ذخیره‌شده"
            variant="ghost"
            disabled={disabled}
            onPress={() => void editing.compare()}
          />
        ) : null}
        {editing.comparison ? (
          <Card>
            <Column gap="sm">
              <Text variant="bodyStrong">پیش‌نویس ذخیره‌شده</Text>
              {stored ? (
                <>
                  <Text selectable>{stored.name}</Text>
                  <Text selectable numeric>
                    {stored.phone}
                  </Text>
                  <Text selectable>{stored.relation}</Text>
                  <Text selectable>{stored.notes}</Text>
                </>
              ) : (
                <Text>
                  {editing.comparison.row.draft
                    ? 'پیش‌نویس قابل خواندن نیست؛ داده تغییر نکرد.'
                    : 'پیش‌نویس باز دیگری ثبت نشده است.'}
                </Text>
              )}
              <Button
                label="بارگذاری پیش‌نویس ذخیره‌شده"
                variant="ghost"
                disabled={disabled}
                onPress={editing.loadStored}
              />
              {stored || !editing.comparison.row.draft ? (
                <Button label="نگه‌داشتن نسخهٔ من" variant="ghost" disabled={disabled} onPress={editing.keepMine} />
              ) : null}
            </Column>
          </Card>
        ) : null}
        <Button
          label={editing.completed ? 'بستن' : 'ذخیره'}
          onPress={() => {
            if (editing.completed) editing.close();
            else void editing.save();
          }}
          loading={editing.busy}
          disabled={editing.stale && !editing.completed}
        />
        {!editing.completed ? (
          <Button
            label={editing.stale ? 'بستن فرم قدیمی' : 'انصراف'}
            variant="ghost"
            onPress={editing.close}
            disabled={editing.busy}
          />
        ) : null}
        {editing.hasDraft && !editing.completed && !editing.stale ? (
          <Button label="حذف پیش‌نویس" variant="ghost" onPress={editing.discard} disabled={disabled} />
        ) : null}
      </Column>
    </Screen>
  );
}
