import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { AutosaveScope } from '@/components/autosave-scope';
import { CollapsibleSection } from '@/components/collapsible-section';
import { notify } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Credential } from '@/db/schema';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { toIsoDate } from '@/lib/jalali';
import { useTheme } from '@/theme';

import type { CredentialFormFields } from './form-draft';
import { credentialFormPort } from './form-draft-queries';
import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';

const CATEGORY_OPTIONS = (Object.keys(CREDENTIAL_CATEGORY_LABELS) as Credential['category'][]).map((c) => ({
  value: c,
  label: CREDENTIAL_CATEGORY_LABELS[c],
}));
const OWNER_OPTIONS = (Object.keys(CREDENTIAL_OWNER_LABELS) as Credential['ownerKind'][]).map((o) => ({
  value: o,
  label: CREDENTIAL_OWNER_LABELS[o],
}));

/** Add or edit one credential. Param: optional `credentialId`. */
export function CredentialFormScreen() {
  const { credentialId, draftId } = useLocalSearchParams<{ credentialId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={credentialFormPort} recordId={credentialId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => (
          <CredentialForm seed={seed} readNotice={readNotice} unavailable={unavailable} />
        )}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function CredentialForm({
  seed,
  readNotice,
  unavailable,
}: {
  seed: FormSeed<Credential, CredentialFormFields>;
  readNotice: ReactNode;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();
  const isEditing = seed.document.recordId !== null;
  const editing = useWorkspaceForm(credentialFormPort, seed, unavailable, () => router.back());
  const {
    systemName,
    category,
    url,
    username,
    secret,
    clearSecret,
    secondFactorNotes,
    ownerKind,
    ownerName,
    ownerConsentNote,
    notes,
    tags,
    expiresValue,
    expiresText,
    starred,
  } = editing.document.fields;
  const setSystemName = (systemName: string) => editing.change({ systemName });
  const setCategory = (category: Credential['category']) => editing.change({ category });
  const setUrl = (url: string) => editing.change({ url });
  const setUsername = (username: string) => editing.change({ username });
  const setSecondFactorNotes = (secondFactorNotes: string) => editing.change({ secondFactorNotes });
  const setOwnerKind = (ownerKind: Credential['ownerKind']) => editing.change({ ownerKind });
  const setOwnerName = (ownerName: string) => editing.change({ ownerName });
  const setOwnerConsentNote = (ownerConsentNote: string) => editing.change({ ownerConsentNote });
  const setNotes = (notes: string) => editing.change({ notes });
  const setTags = (tags: string) => editing.change({ tags });
  const setStarred = (starred: boolean) => editing.change({ starred });
  const dateValidation = useDateValidation();
  function save() {
    if (editing.completed || editing.stale) {
      editing.close();
      return;
    }
    void editing.save((fields) => {
      if (!dateValidation.check()) return false;
      if (!fields.systemName.trim()) {
        notify('نام سامانه لازم است');
        return false;
      }
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش رمز' : 'رمز جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus editing={editing} port={credentialFormPort} />
        <Input
          label="نام سامانه"
          required
          value={systemName}
          editable={!editing.locked}
          onChangeText={setSystemName}
          placeholder="سامانه‌ی نسخه‌ی الکترونیک"
        />
        <ChipSelect
          disabled={editing.locked}
          label="دسته"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => v && setCategory(v)}
        />
        <Input
          editable={!editing.locked}
          label="یوزرنیم"
          value={username}
          onChangeText={setUsername}
          ltr
          autoCapitalize="none"
        />
        <Input
          label={isEditing ? 'رمز جدید' : 'رمز'}
          value={secret}
          editable={!editing.locked}
          onChangeText={(v) => {
            editing.change({ secret: v, ...(v ? { clearSecret: false } : {}) });
          }}
          secureTextEntry
          ltr
          autoCapitalize="none"
          hint={
            clearSecret
              ? 'با ذخیره، رمز ذخیره‌شده پاک می‌شود'
              : isEditing
                ? 'خالی بگذارید تا رمز فعلی دست نخورد'
                : undefined
          }
        />
        {isEditing && !secret ? (
          <Toggle
            label="رمز ذخیره‌شده پاک شود"
            description="فقط خود رمز؛ بقیه‌ی اطلاعات این سامانه می‌ماند"
            value={clearSecret}
            onChange={(clearSecret) => editing.change({ clearSecret })}
            disabled={editing.locked}
          />
        ) : null}
        <Input
          editable={!editing.locked}
          label="آدرس سامانه"
          value={url}
          onChangeText={setUrl}
          ltr
          autoCapitalize="none"
          keyboardType="url"
        />

        <CollapsibleSection
          title="جزئیات"
          icon="options-outline"
          defaultOpen={Boolean(secondFactorNotes || notes || tags || expiresText)}
          filledCount={[secondFactorNotes, notes, tags, expiresText].filter(Boolean).length}
        >
          <Column gap="md">
            <Input
              label="ورود دو مرحله‌ای"
              value={secondFactorNotes}
              editable={!editing.locked}
              onChangeText={setSecondFactorNotes}
              multiline
              hint="شماره‌ی بازیابی، سؤال امنیتی، اپ توکن"
            />
            <JalaliDateField
              onValidityChange={dateValidation.setValid}
              label="تاریخ انقضا"
              value={expiresValue === null ? null : toIsoDate(new Date(expiresValue))}
              rawText={expiresText}
              onRawTextChange={(expiresText) => editing.change({ expiresText })}
              onChange={() => {
                /* The raw text is the source of truth. */
              }}
              editable={!editing.locked}
              allowFuture
            />
            <Input editable={!editing.locked} label="یادداشت" value={notes} onChangeText={setNotes} multiline />
            <Input
              editable={!editing.locked}
              label="برچسب‌ها"
              value={tags}
              onChangeText={setTags}
              hint="با ویرگول جدا کنید"
            />
          </Column>
        </CollapsibleSection>

        <SectionHeader title="مال کیست" />
        <ChipSelect
          disabled={editing.locked}
          options={OWNER_OPTIONS}
          value={ownerKind}
          onChange={(v) => v && setOwnerKind(v)}
        />
        {ownerKind !== 'self' ? (
          <>
            <Input editable={!editing.locked} label="نام صاحب رمز" value={ownerName} onChangeText={setOwnerName} />
            <Input
              label="چرا دست شماست"
              value={ownerConsentNote}
              editable={!editing.locked}
              onChangeText={setOwnerConsentNote}
              multiline
              placeholder="مثلاً: شیفت‌هایش را پوشش می‌دهم و خودش دسترسی داده."
            />
          </>
        ) : null}

        <Toggle disabled={editing.locked} label="ستاره‌دار" value={starred} onChange={setStarred} />

        <Button
          label={editing.completed || editing.stale ? 'بستن' : isEditing ? 'ذخیره' : 'ثبت رمز'}
          icon="checkmark"
          onPress={() => void save()}
          loading={editing.busy}
          disabled={editing.busy || (editing.locked && !editing.completed && !editing.stale)}
          full
        />
        <Button label="بستن" variant="ghost" onPress={editing.close} disabled={editing.busy} full haptic={false} />
        <WorkspaceFormDiscard editing={editing} />
      </Column>
    </Screen>
  );
}
