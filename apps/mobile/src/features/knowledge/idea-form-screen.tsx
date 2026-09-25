import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { EditGate } from '@/components/edit-gate';
import { alertError, notify } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, ChipSelect, Column, Input, Screen } from '@/components/ui';
import type { Idea } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { useTheme } from '@/theme';

import { createIdea, ideaQuery, suggestIdeaAreas, updateIdea } from './ideas-queries';
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
  const { ideaId } = useLocalSearchParams<{ ideaId?: string }>();
  const { data, error, retry } = useLive(ideaQuery(ideaId ?? ''), [ideaId]);
  return (
    <EditGate editing={Boolean(ideaId)} rows={data} error={error} onRetry={retry} what="ایده">
      {(idea, readNotice) => <IdeaForm readNotice={readNotice} idea={idea} />}
    </EditGate>
  );
}

function IdeaForm({ idea, readNotice }: { readNotice: ReactNode; idea: Idea | null }) {
  const router = useRouter();
  const { spacing } = useTheme();

  const [title, setTitle] = useState(idea?.title ?? '');
  const [body, setBody] = useState(idea?.body ?? '');
  const [kind, setKind] = useState<Idea['kind']>(idea?.kind ?? 'feature');
  const [status, setStatus] = useState<Idea['status']>(idea?.status ?? 'inbox');
  const [priority, setPriority] = useState<Idea['priority']>(idea?.priority ?? 'normal');
  const [area, setArea] = useState(idea?.area ?? '');
  const [areas, setAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // The areas used before, so the field is a tap rather than typing the same
  // word again. Read once: the list only changes when an idea is saved.
  useEffect(() => {
    void suggestIdeaAreas().then(setAreas);
  }, []);

  async function save() {
    if (!title.trim()) {
      notify('عنوان لازم است');
      return;
    }
    setSaving(true);
    try {
      const payload = { title, body, kind, status, priority, area };
      if (idea) await updateIdea(idea.id, payload);
      else await createIdea(payload);
      router.back();
    } catch (e) {
      alertError('ذخیره نشد', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenOptions options={{ title: idea ? 'ویرایش ایده' : 'ایده‌ی جدید' }} />
      <Column gap="md" style={{ paddingTop: spacing.md }}>
        {readNotice}
        <Input label="عنوان" required value={title} onChangeText={setTitle} placeholder="در یک جمله" />
        <Input label="توضیح" value={body} onChangeText={setBody} multiline />
        <ChipSelect label="نوع" options={KIND_OPTIONS} value={kind} onChange={(v) => v && setKind(v)} />
        <ChipSelect label="وضعیت" options={STATUS_OPTIONS} value={status} onChange={(v) => v && setStatus(v)} />
        <ChipSelect label="اولویت" options={PRIORITY_OPTIONS} value={priority} onChange={(v) => v && setPriority(v)} />
        {areas.length > 0 ? (
          <ChipSelect
            label="بخش"
            options={areas.map((a) => ({ value: a, label: a }))}
            value={areas.includes(area) ? area : null}
            onChange={(v) => setArea(v ?? '')}
            allowDeselect
          />
        ) : null}
        <Input label="کدام بخش اپ" value={area} onChangeText={setArea} placeholder="کاردکس، آزمایش، بکاپ…" />

        <Button
          label={idea ? 'ذخیره' : 'ثبت ایده'}
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
