import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { Button, Column, IconButton, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';
import { mediaViewerColors } from '@/theme';

import { CaptionConflict, decodeCaption, type CaptionDocument } from './caption-draft';
import {
  captionFormQuery,
  commitCaptionDraft,
  discardCaptionDraft,
  inspectCaption,
  replaceCaptionDraft,
  saveCaptionDraft,
  type CaptionComparison,
  type CaptionFormRow,
} from './caption-queries';

/** The existing viewer dialog is the recovery path; no new screen/navigation. */
export function CaptionEditor({ attachmentId }: { attachmentId: string }) {
  const { stale } = useDatasetIntent();
  const query = useLive(captionFormQuery(attachmentId), [attachmentId]);
  const [seed, setSeed] = useState<CaptionFormRow>();
  const [reset, setReset] = useState(0);
  if (!stale && !seed && query.data?.[0]) setSeed(query.data[0]);
  const row = seed ?? (!stale ? query.data?.[0] : undefined);
  if (!row) return <ErrorNotice error={query.error} what="پیش‌نویس توضیح" onRetry={query.retry} />;
  return (
    <CaptionForm
      key={reset}
      seed={row}
      readError={query.error}
      retry={query.retry}
      onReset={(next) => {
        setSeed(next);
        setReset((n) => n + 1);
      }}
    />
  );
}
function CaptionForm({
  seed,
  readError,
  retry,
  onReset,
}: {
  seed: CaptionFormRow;
  readError?: Error;
  retry?: () => void;
  onReset: (row: CaptionFormRow) => void;
}) {
  const scope = useAutosaveScope()!;
  const { generation, stale } = useDatasetIntent();
  const id = seed.attachment.id;
  let decodeError: Error | undefined;
  let recovered: CaptionDocument | undefined;
  try {
    if (seed.draft) recovered = decodeCaption(seed.draft.body);
  } catch (error) {
    decodeError = error as Error;
  }
  const [visible, setVisible] = useState(false);
  const [document, setDocument] = useState<CaptionDocument>(
    () =>
      recovered ?? {
        version: 1,
        text: seed.attachment.caption ?? '',
        baseCaption: seed.attachment.caption,
      },
  );
  const latest = useRef(document);
  const acting = useRef(false);
  const completed = useRef<'saved' | 'discarded' | null>(null);
  const mounted = useRef(true);
  const dialog = useRef<symbol | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [comparison, setComparison] = useState<CaptionComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [writer] = useState(() => {
    let draftId = seed.draft?.id ?? newId();
    let revision = seed.draft?.revision ?? 0;
    const saver = new Autosave<CaptionDocument>({
      generation,
      onState: setState,
      shouldRetry: (e) => !(e instanceof CaptionConflict),
      write: async (value) => {
        revision = await saveCaptionDraft(draftId, id, value, revision, generation);
      },
    });
    return {
      saver,
      id: () => draftId,
      revision: () => revision,
      adopt: (nextId: string, nextRevision: number) => {
        draftId = nextId;
        revision = nextRevision;
      },
    };
  });
  useEffect(
    () =>
      scope.group.register({
        get unsaved() {
          return acting.current || !!dialog.current || writer.saver.unsaved;
        },
        flush: async () => !acting.current && !dialog.current && (await writer.saver.flush()),
      }),
    [scope, writer],
  );
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void writer.saver.flush();
    });
    return () => {
      mounted.current = false;
      dialog.current = null;
      sub.remove();
      void writer.saver.flush();
    };
  }, [writer]);
  async function perform(work: () => Promise<void>) {
    if (acting.current || dialog.current || !mounted.current) return;
    acting.current = true;
    setBusy(true);
    try {
      await withDatasetWrite(generation, work);
      setFailure(false);
    } catch (e) {
      setFailure(true);
      alertError(completed.current ? 'عملیات انجام شد؛ تازه‌سازی انجام نشد' : 'توضیح ذخیره نشد', e);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function flush() {
    if (!(await writer.saver.flush()) || writer.saver.unsaved)
      throw new Error('پیش‌نویس ذخیره نشد؛ نوشته نگه داشته شد.');
  }
  function change(text: string) {
    if (acting.current || dialog.current || completed.current || decodeError || generation !== datasetGeneration())
      return;
    const next = { ...latest.current, text };
    latest.current = next;
    setDocument(next);
    writer.saver.change(next);
  }
  function confirm(work: () => Promise<void>, title: string, label: string, destructive = false) {
    if (acting.current || dialog.current || !mounted.current) return;
    const token = Symbol();
    dialog.current = token;
    setBusy(true);
    const consume = (yes: boolean) => {
      if (!mounted.current || dialog.current !== token) return;
      dialog.current = null;
      setBusy(false);
      if (yes) void perform(work);
    };
    Alert.alert(
      title,
      'پیش از ادامه نوشتهٔ این صفحه و نسخهٔ ذخیره‌شده را مرور یا کپی کنید.',
      [
        { text: 'انصراف', style: 'cancel', onPress: () => consume(false) },
        { text: label, style: destructive ? 'destructive' : 'default', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }
  async function refresh() {
    const next = await captionFormQuery(id);
    if (!next[0]) throw new CaptionConflict();
    if (mounted.current) onReset(next[0]);
  }
  let stored: CaptionDocument | undefined;
  try {
    if (comparison?.row.draft) stored = decodeCaption(comparison.row.draft.body);
  } catch {
    /* Preserve bytes. */
  }
  return (
    <>
      <IconButton
        icon="create-outline"
        label="ویرایش توضیح"
        color={mediaViewerColors.text}
        onPress={() => {
          if (completed.current) void perform(refresh);
          else setVisible(true);
        }}
      />
      <PromptModal
        visible={visible}
        title="توضیح عکس"
        initialValue={seed.attachment.caption ?? ''}
        value={document.text}
        onChangeText={change}
        multiline
        retainOnClose
        busy={busy}
        placeholder="مثلاً ضایعه‌ی ساق پای چپ، روز سوم درمان"
        onSubmit={() =>
          void perform(async () => {
            if (completed.current) {
              await refresh();
              return;
            }
            if (decodeError) throw decodeError;
            writer.saver.change(latest.current);
            await flush();
            await commitCaptionDraft(writer.id(), id, writer.revision(), generation);
            completed.current = 'saved';
            writer.saver.cancel();
            setVisible(false);
            await refresh();
          })
        }
        onCancel={() => {
          if (stale) {
            setVisible(false);
            return;
          } // Local review may close; original route guard remains fenced.
          void perform(async () => {
            await flush();
            setVisible(false);
          });
        }}
        footer={
          <Column gap="xs">
            <ErrorNotice error={readError ?? decodeError} what="توضیح عکس" onRetry={retry} />
            {decodeError ? <Text selectable>{seed.draft?.body}</Text> : null}
            <Text variant="tiny" color={state.status === 'failed' || stale ? 'danger' : 'textMuted'}>
              {stale
                ? 'اطلاعات جایگزین شده؛ نوشتهٔ قدیمی فقط قابل مرور است.'
                : state.status === 'failed'
                  ? 'پیش‌نویس ذخیره نشد.'
                  : state.status === 'writing' || state.status === 'pending'
                    ? 'در حال ذخیرهٔ پیش‌نویس…'
                    : state.status === 'saved'
                      ? 'پیش‌نویس ذخیره شد.'
                      : seed.draft
                        ? 'پیش‌نویس بازیابی شد.'
                        : ''}
            </Text>
            {(failure || state.status === 'failed') && !stale && !decodeError ? (
              <>
                <Button
                  label="تلاش دوباره"
                  size="sm"
                  variant="ghost"
                  onPress={() => void perform(completed.current ? refresh : flush)}
                />
                <Button
                  label="بررسی نسخهٔ ذخیره‌شده"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    void perform(async () => {
                      if (completed.current) {
                        await refresh();
                        return;
                      }
                      await writer.saver.flush();
                      setComparison(await inspectCaption(writer.id(), id, generation));
                    })
                  }
                />
              </>
            ) : null}
            {comparison ? (
              <>
                <Text selectable>{comparison.row.attachment.caption}</Text>
                <Text selectable>
                  {stored?.text ?? (comparison.row.draft ? 'پیش‌نویس خوانده نشد.' : 'پیش‌نویس دیگری ثبت نشده.')}
                </Text>
                <Button
                  label="بارگذاری نسخهٔ ذخیره‌شده"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    confirm(
                      async () => {
                        await writer.saver.flush();
                        const next = await inspectCaption(writer.id(), id, generation);
                        if (
                          next.original?.committedAttachmentId ||
                          next.row.draft?.id !== comparison.row.draft?.id ||
                          next.row.draft?.revision !== comparison.row.draft?.revision ||
                          next.row.draft?.body !== comparison.row.draft?.body ||
                          next.row.attachment.caption !== comparison.row.attachment.caption
                        )
                          throw new CaptionConflict();
                        if (next.row.draft) decodeCaption(next.row.draft.body);
                        writer.saver.cancel();
                        if (mounted.current) onReset(next.row);
                      },
                      'بارگذاری توضیح ذخیره‌شده؟',
                      'بارگذاری',
                    )
                  }
                />
                {stored || !comparison.row.draft ? (
                  <Button
                    label="نگه‌داشتن نسخهٔ من"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      confirm(
                        async () => {
                          await writer.saver.flush();
                          const next = await replaceCaptionDraft(
                            writer.id(),
                            id,
                            latest.current,
                            comparison,
                            generation,
                          );
                          writer.adopt(next.id, next.revision);
                          latest.current = next.document;
                          setDocument(next.document);
                          writer.saver.change(next.document);
                          await flush();
                          setComparison(null);
                        },
                        'نسخهٔ این صفحه نگه داشته شود؟',
                        'نگه‌داشتن',
                      )
                    }
                  />
                ) : null}
              </>
            ) : null}
            {!stale && !decodeError && (seed.draft || state.status !== 'idle') ? (
              <Button
                label="حذف پیش‌نویس"
                size="sm"
                variant="ghost"
                onPress={() =>
                  confirm(
                    async () => {
                      await flush();
                      await discardCaptionDraft(writer.id(), id, writer.revision(), generation);
                      completed.current = 'discarded';
                      writer.saver.cancel();
                      setVisible(false);
                      await refresh();
                    },
                    'پیش‌نویس توضیح حذف شود؟',
                    'حذف پیش‌نویس',
                    true,
                  )
                }
              />
            ) : null}
          </Column>
        }
      />
    </>
  );
}
