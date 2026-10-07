import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import {
  decodeFollowUpForm,
  FollowUpFormConflict,
  followUpFormValues,
  initialFollowUpFields,
  type FollowUpFormDocument,
  type FollowUpFormFields,
} from './form-draft';
import {
  commitFollowUpFormDraft,
  discardFollowUpFormDraft,
  followUpFormQuery,
  inspectFollowUpForm,
  replaceFollowUpFormDraft,
  saveFollowUpFormDraft,
  type FollowUpFormComparison,
  type FollowUpFormRow,
} from './form-draft-queries';

export function followUpFormSeed(row: FollowUpFormRow, now: Date) {
  const draft = row.draft;
  if (draft && (draft.patientId !== row.patient.id || draft.deletedAt || draft.committedFollowUpId))
    throw new FollowUpFormConflict();
  const fields = initialFollowUpFields(now);
  return {
    row,
    encounterId: draft ? draft.encounterId : (row.encounter?.id ?? null),
    document: draft
      ? decodeFollowUpForm(draft.body)
      : { version: 1 as const, fields: { ...fields, date: { ...fields.date } }, initial: fields },
  };
}
export type FollowUpFormSeed = ReturnType<typeof followUpFormSeed>;

/** Raw input is autosaved; explicit valid publication alone creates a clinical follow-up. */
export function useFollowUpFormDraft(
  seed: FollowUpFormSeed,
  onReset: (seed: FollowUpFormSeed) => void,
  expectedGeneration?: number,
) {
  const { generation } = useDatasetIntent(expectedGeneration);
  const router = useRouter();
  const now = useNow();
  const patientId = seed.row.patient.id;
  const [document, setDocument] = useState(seed.document);
  const latest = useRef(document);
  const acting = useRef(false);
  const published = useRef(false);
  const [busy, setBusy] = useState(false);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [comparison, setComparison] = useState<FollowUpFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.row.draft?.id ?? newId();
    let revision = seed.row.draft?.revision ?? 0;
    return {
      id: () => id,
      revision: () => revision,
      adopt: (nextId: string, nextRevision: number) => {
        id = nextId;
        revision = nextRevision;
      },
      saver: new Autosave<FollowUpFormDocument>({
        generation,
        write: async (value) => {
          revision = await saveFollowUpFormDraft(id, patientId, seed.encounterId, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof FollowUpFormConflict),
      }),
    };
  });
  const saver = persistence.saver;
  useSaveBeforeLeave(async () => {
    if (acting.current || !(await saver.flush())) return false;
    return !acting.current && !saver.unsaved;
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void saver.flush();
    });
    return () => {
      sub.remove();
      void saver.flush();
    };
  }, [saver]);

  function change(patch: Partial<FollowUpFormFields>) {
    if (acting.current || published.current) return;
    const next = { ...latest.current, fields: { ...latest.current.fields, ...patch } };
    latest.current = next;
    setDocument(next);
    saver.change(next);
  }
  function begin() {
    if (acting.current) return false;
    acting.current = true;
    setBusy(true);
    return true;
  }
  function end() {
    acting.current = false;
    setBusy(false);
  }
  async function flushOrFail() {
    if (!(await saver.flush()) || saver.unsaved) throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
  }
  async function perform(action: () => Promise<void>) {
    if (!begin()) return;
    try {
      await withDatasetWrite(generation, action);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      alertError('ثبت نشد', error);
    } finally {
      end();
    }
  }
  async function save() {
    if (!begin()) return;
    if (completedId) {
      try {
        await withDatasetWrite(generation, async () => {
          end();
          router.back();
        });
      } catch (error) {
        end();
        alertError('پیگیری ثبت شد؛ صفحه بسته نشد', error);
      }
      return;
    }
    try {
      followUpFormValues(latest.current.fields, new Date(now));
    } catch (error) {
      end();
      notify('اطلاعات پیگیری کامل نیست', error instanceof Error ? error.message : 'ورودی‌ها را بررسی کنید.');
      return;
    }
    try {
      await withDatasetWrite(generation, async () => {
        await flushOrFail();
        const id = await commitFollowUpFormDraft(persistence.id(), patientId, persistence.revision(), new Date(now));
        published.current = true;
        setCompletedId(id);
        saver.cancel();
        end();
        router.back();
      });
    } catch (error) {
      setFailed(true);
      alertError(published.current ? 'پیگیری ثبت شد؛ صفحه بسته نشد' : 'ثبت نشد', error);
      end();
    }
  }
  async function compare() {
    await perform(async () => {
      await saver.flush();
      setComparison(await inspectFollowUpForm(patientId, persistence.id()));
    });
  }
  async function keepMine() {
    if (!comparison) return;
    await perform(async () => {
      await saver.flush();
      const result = await replaceFollowUpFormDraft(
        persistence.id(),
        patientId,
        seed.encounterId,
        latest.current,
        comparison,
      );
      persistence.adopt(result.id, result.revision);
      latest.current = result.document;
      setDocument(result.document);
      saver.change(result.document);
      await flushOrFail();
      setComparison(null);
    });
  }
  function confirm(title: string, message: string, label: string, action: () => Promise<void>, destructive = false) {
    if (!begin()) return;
    let answered = false;
    Alert.alert(
      title,
      message,
      [
        {
          text: 'انصراف',
          style: 'cancel',
          onPress: () => {
            if (!answered) {
              answered = true;
              end();
            }
          },
        },
        {
          text: label,
          style: destructive ? 'destructive' : 'default',
          onPress: () => {
            if (answered) return;
            answered = true;
            void (async () => {
              try {
                await withDatasetWrite(generation, action);
              } catch (error) {
                setFailed(true);
                alertError('انجام نشد', error);
              } finally {
                end();
              }
            })();
          },
        },
      ],
      { cancelable: false },
    );
  }
  function loadStored() {
    confirm('جایگزینی نوشتهٔ روی صفحه؟', 'نوشتهٔ ذخیره‌نشدهٔ این صفحه کنار گذاشته می‌شود.', 'بارگذاری', async () => {
      await saver.flush();
      const row = (await followUpFormQuery(patientId))[0];
      if (!row) throw new FollowUpFormConflict('پروندهٔ بیمار پیدا نشد؛ نوشته نگه داشته شد.');
      const next = followUpFormSeed(row, new Date(now));
      saver.cancel();
      end();
      onReset(next);
    });
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس؟',
      'فقط پیش‌نویس این پیگیری کنار گذاشته می‌شود.',
      'حذف پیش‌نویس',
      async () => {
        await flushOrFail();
        await discardFollowUpFormDraft(persistence.id(), patientId, persistence.revision());
        published.current = true;
        saver.cancel();
        end();
        router.back();
      },
      true,
    );
  }
  return {
    document,
    form: document.fields,
    change,
    changeDate: (patch: Partial<FollowUpFormFields['date']>) =>
      change({ date: { ...latest.current.fields.date, ...patch } }),
    state,
    busy,
    completedId,
    comparison,
    failedWrite: state.status === 'failed' || failed,
    hasDraft: !!seed.row.draft || state.status !== 'idle',
    save,
    compare,
    keepMine,
    loadStored,
    discard,
    retry: () => perform(flushOrFail),
    close: () => {
      if (!acting.current) router.back();
    },
  };
}
