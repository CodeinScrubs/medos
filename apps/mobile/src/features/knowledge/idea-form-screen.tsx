import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { AutosaveScope } from '@/components/autosave-scope';
import { ErrorNotice } from '@/components/error-notice';
import { notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import type { Idea } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { WorkspaceFormGate } from '@/features/workspace-forms/form-gate';
import { WorkspaceFormDiscard, WorkspaceFormStatus } from '@/features/workspace-forms/form-status';
import type { FormSeed } from '@/features/workspace-forms/types';
import { useWorkspaceForm } from '@/features/workspace-forms/use-form';
import { useTheme } from '@/theme';

import type { IdeaFormFields } from './form-draft';
import { ideaFormPort } from './form-draft-queries';
import { ideaAreasQuery } from './ideas-queries';
import { IDEA_KIND_LABELS, IDEA_PRIORITY_LABELS, IDEA_STATUS_LABELS, IDEA_STATUS_ORDER } from './labels';

const KIND_OPTIONS = (Object.keys(IDEA_KIND_LABELS) as Idea['kind'][]).map((k) => ({
  value: k,
  label: IDEA_KIND_LABELS[k],
}));
const STATUS_OPTIONS = IDEA_STATUS_ORDER.map((s) => ({ value: s, label: IDEA_STATUS_LABELS[s] }));
const PRIORITY_OPTIONS = (Object.keys(IDEA_PRIORITY_LABELS) as Idea['priority'][]).map((p) => ({
  value: p,
  label: IDEA_PRIORITY_LABELS[p],
}));

/** Add or edit an idea. Param: optional `ideaId`. */
export function IdeaFormScreen() {
  const { ideaId, draftId } = useLocalSearchParams<{ ideaId?: string; draftId?: string }>();
  return (
    <AutosaveScope>
      <WorkspaceFormGate port={ideaFormPort} recordId={ideaId ?? null} draftId={draftId ?? null}>
        {(seed, readNotice, unavailable) => <IdeaForm readNotice={readNotice} seed={seed} unavailable={unavailable} />}
      </WorkspaceFormGate>
    </AutosaveScope>
  );
}

function IdeaForm({
  seed,
  readNotice,
  unavailable,
}: {
  readNotice: ReactNode;
  seed: FormSeed<Idea, IdeaFormFields>;
  unavailable: boolean;
}) {
  const router = useRouter();
  const { spacing } = useTheme();

  const editing = useWorkspaceForm(ideaFormPort, seed, unavailable, () => router.back());
  const { title, body, kind, status, priority, area } = editing.document.fields;
  const isEditing = seed.document.recordId !== null;
  const { data: areaRows, error: areaError, retry: retryAreas } = useLive(ideaAreasQuery());
  const areas = (areaRows ?? []).map((row) => row.area).filter((value): value is string => !!value);
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
      return true;
    });
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: isEditing ? 'ویرایش ایده' : 'ایده‌ی جدید' }} />
      <Column
        collapsable={false}
        gap="md"
        style={{ paddingTop: spacing.md }}
        pointerEvents={editing.busy ? 'none' : 'auto'}
      >
        {readNotice}
        <WorkspaceFormStatus port={ideaFormPort} editing={editing} />
        <Input
          label="عنوان"
          required
          value={title}
          editable={!editing.locked}
          onChangeText={(title) => editing.change({ title })}
          placeholder="در یک جمله"
        />
        <Input
          label="توضیح"
          value={body}
          editable={!editing.locked}
          onChangeText={(body) => editing.change({ body })}
          multiline
        />
        <ChipSelect
          label="نوع"
          disabled={editing.locked}
          options={KIND_OPTIONS}
          value={kind}
          onChange={(v) => v && editing.change({ kind: v })}
        />
        <ChipSelect
          label="وضعیت"
          disabled={editing.locked}
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => v && editing.change({ status: v })}
        />
        <ChipSelect
          label="اولویت"
          disabled={editing.locked}
          options={PRIORITY_OPTIONS}
          value={priority}
          onChange={(v) => v && editing.change({ priority: v })}
        />
        <ErrorNotice error={areaError} what="بخش‌های قبلی" onRetry={retryAreas} />
        {areas.length > 0 ? (
          <ChipSelect
            label="بخش"
            options={areas.map((a) => ({ value: a, label: a }))}
            value={areas.includes(area) ? area : null}
            onChange={(v) => editing.change({ area: v ?? '' })}
            disabled={editing.locked}
            allowDeselect
          />
        ) : null}
        <Input
          label="کدام بخش اپ"
          value={area}
          editable={!editing.locked}
          onChangeText={(area) => editing.change({ area })}
          placeholder="کاردکس، آزمایش، بکاپ…"
        />

        <Button
          label={editing.completed || editing.stale ? 'بستن' : isEditing ? 'ذخیره' : 'ثبت ایده'}
          icon="checkmark"
          onPress={() => void save()}
          loading={editing.busy}
          disabled={editing.busy || (editing.locked && !editing.completed && !editing.stale)}
          full
        />
        <Button label="بستن" variant="ghost" disabled={editing.busy} onPress={editing.close} full haptic={false} />
        <WorkspaceFormDiscard editing={editing} />
      </Column>
    </Screen>
  );
}
