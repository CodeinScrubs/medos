import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { EditGate } from '@/components/edit-gate';
import { alertError } from '@/components/feedback';
import { JalaliDateField } from '@/components/jalali-date-field';
import { Button, ChipSelect, Column, Input, Screen, SectionHeader, Text, Toggle } from '@/components/ui';
import { useDateValidation } from '@/components/use-date-validation';
import type { Credential } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { fromIsoDate, toIsoDate } from '@/lib/jalali';
import { useTheme } from '@/theme';

import { CREDENTIAL_CATEGORY_LABELS, CREDENTIAL_OWNER_LABELS } from './labels';
import { secretHint } from './logic';
import { createCredential, credentialQuery, updateCredential } from './queries';

const CATEGORY_OPTIONS = (Object.keys(CREDENTIAL_CATEGORY_LABELS) as Credential['category'][]).map((c) => ({
  value: c,
  label: CREDENTIAL_CATEGORY_LABELS[c],
}));
const OWNER_OPTIONS = (Object.keys(CREDENTIAL_OWNER_LABELS) as Credential['ownerKind'][]).map((o) => ({
  value: o,
  label: CREDENTIAL_OWNER_LABELS[o],
}));

const toList = (text: string) =>
  text
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Add or edit one credential. Param: optional `credentialId`. */
export function CredentialFormScreen() {
  const { credentialId } = useLocalSearchParams<{ credentialId?: string }>();
  const { data } = useLive(credentialQuery(credentialId ?? ''), [credentialId]);
  return (
    <EditGate editing={Boolean(credentialId)} rows={data}>
      {(credential) => <CredentialForm credential={credential} />}
    </EditGate>
  );
}

function CredentialForm({ credential }: { credential: Credential | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [systemName, setSystemName] = useState(credential?.systemName ?? '');
  const [category, setCategory] = useState<Credential['category']>(credential?.category ?? 'prescription');
  const [url, setUrl] = useState(credential?.url ?? '');
  const [username, setUsername] = useState(credential?.username ?? '');
  /*
   * Editing never shows the stored password: it is only in the database as
   * ciphertext, and revealing it needs the phone's own check on the detail
   * screen. Left empty, the stored one is kept untouched.
   */
  const [secret, setSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [secondFactorNotes, setSecondFactorNotes] = useState(credential?.secondFactorNotes ?? '');
  const [ownerKind, setOwnerKind] = useState<Credential['ownerKind']>(credential?.ownerKind ?? 'self');
  const [ownerName, setOwnerName] = useState(credential?.ownerName ?? '');
  const [ownerConsentNote, setOwnerConsentNote] = useState(credential?.ownerConsentNote ?? '');
  const [notes, setNotes] = useState(credential?.notes ?? '');
  const [tags, setTags] = useState((credential?.tags ?? []).join('، '));
  const [expiresIso, setExpiresIso] = useState<string | null>(
    credential?.expiresAt ? toIsoDate(credential.expiresAt) : null,
  );
  const [starred, setStarred] = useState(credential?.starred ?? false);
  const [saving, setSaving] = useState(false);
  const dateValidation = useDateValidation();

  const hint = secretHint(secret);

  async function save() {
    if (!dateValidation.check()) return;
    if (!systemName.trim()) {
      Alert.alert('نام سامانه لازم است');
      return;
    }
    setSaving(true);
    const payload = {
      systemName,
      category,
      url,
      username,
      secondFactorNotes,
      ownerKind,
      ownerName,
      ownerConsentNote,
      notes,
      tags: toList(tags),
      expiresAt: fromIsoDate(expiresIso),
      starred,
    };
    try {
      if (credential) {
        /*
         * `secret` goes only when there is something to say about it. An empty
         * box means "leave the stored password alone", because editing a
         * username must not wipe it — clearing it on purpose is the button
         * below the field, which says so.
         */
        const secretChange = clearSecret ? { secret: '' } : secret ? { secret } : {};
        await updateCredential(credential.id, { ...payload, ...secretChange });
      } else {
        await createCredential({ ...payload, secret });
      }
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: credential ? 'ویرایش رمز' : 'رمز جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Input
          label="نام سامانه"
          required
          value={systemName}
          onChangeText={setSystemName}
          placeholder="سامانه‌ی نسخه‌ی الکترونیک"
        />
        <ChipSelect label="دسته" options={CATEGORY_OPTIONS} value={category} onChange={(v) => v && setCategory(v)} />
        <Input label="یوزرنیم" value={username} onChangeText={setUsername} ltr autoCapitalize="none" />
        <Input
          label={credential ? 'رمز جدید' : 'رمز'}
          value={secret}
          onChangeText={(v) => {
            setSecret(v);
            if (v) setClearSecret(false);
          }}
          secureTextEntry
          ltr
          autoCapitalize="none"
          hint={
            clearSecret
              ? 'با ذخیره، رمز ذخیره‌شده پاک می‌شود'
              : (hint ?? (credential ? 'خالی بگذارید تا رمز فعلی دست نخورد' : 'همان‌طور که می‌نویسید ذخیره می‌شود'))
          }
        />
        {credential && !secret ? (
          <Toggle
            label="رمز ذخیره‌شده پاک شود"
            description="فقط خود رمز؛ بقیه‌ی اطلاعات این سامانه می‌ماند"
            value={clearSecret}
            onChange={setClearSecret}
          />
        ) : null}
        <Input label="آدرس سامانه" value={url} onChangeText={setUrl} ltr autoCapitalize="none" keyboardType="url" />

        <CollapsibleSection
          title="جزئیات"
          icon="options-outline"
          filledCount={[secondFactorNotes, notes, tags, expiresIso].filter(Boolean).length}
        >
          <Column gap="md">
            <Input
              label="ورود دو مرحله‌ای"
              value={secondFactorNotes}
              onChangeText={setSecondFactorNotes}
              multiline
              hint="شماره‌ی بازیابی، سؤال امنیتی، اپ توکن"
            />
            <JalaliDateField
              onValidityChange={dateValidation.setValid}
              label="تاریخ انقضا"
              value={expiresIso}
              onChange={setExpiresIso}
              allowFuture
            />
            <Input label="یادداشت" value={notes} onChangeText={setNotes} multiline />
            <Input label="برچسب‌ها" value={tags} onChangeText={setTags} hint="با ویرگول جدا کنید" />
          </Column>
        </CollapsibleSection>

        <SectionHeader title="مال کیست" />
        <ChipSelect options={OWNER_OPTIONS} value={ownerKind} onChange={(v) => v && setOwnerKind(v)} />
        {ownerKind !== 'self' ? (
          <>
            <Input label="نام صاحب رمز" value={ownerName} onChangeText={setOwnerName} />
            <Input
              label="چرا دست شماست"
              value={ownerConsentNote}
              onChangeText={setOwnerConsentNote}
              multiline
              placeholder="مثلاً: شیفت‌هایش را پوشش می‌دهم و خودش دسترسی داده."
            />
            <Text variant="tiny" color="textFaint">
              رمز یک همکار یعنی دسترسی به سامانه‌ای که به نام او نسخه می‌نویسد. دلیلش را بنویسید و هر وقت لازم نبود پاکش
              کنید.
            </Text>
          </>
        ) : null}

        <Toggle label="ستاره‌دار" value={starred} onChange={setStarred} />

        <Button
          label={credential ? 'ذخیره' : 'ثبت رمز'}
          icon="checkmark"
          onPress={() => void save()}
          loading={saving}
          full
        />
        <Button label="انصراف" variant="ghost" onPress={() => router.back()} full haptic={false} />
      </Column>
    </Screen>
  );
}
