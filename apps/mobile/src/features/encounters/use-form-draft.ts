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
  EncounterFormConflict,
  encounterFormDate,
  type EncounterFormDocument,
  type EncounterFormFields,
  type DischargeFormFields,
} from './form-draft';
import {
  commitEncounterFormDraft,
  discardEncounterFormDraft,
  encounterFormQuery,
  encounterFormSeed,
  type EncounterFormSeed,
  inspectEncounterForm,
  replaceEncounterFormDraft,
  saveEncounterFormDraft,
  type EncounterFormComparison,
} from './form-draft-queries';
import { ENCOUNTER_KIND_LABELS } from './labels';
import { deleteEncounter, encounterRecordCount } from './queries';

export type { EncounterFormSeed } from './form-draft-queries';

/** Shared by admission/edit and discharge; autosave changes no clinical state. */
export function useEncounterFormDraft(
  seed: EncounterFormSeed,
  onReset: (seed: EncounterFormSeed) => void,
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
  const [finishedMessage, setFinishedMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [comparison, setComparison] = useState<EncounterFormComparison | null>(null);
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
      saver: new Autosave<EncounterFormDocument>({
        generation,
        write: async (value) => {
          revision = await saveEncounterFormDraft(id, seed.mode, patientId, seed.encounterId, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof EncounterFormConflict),
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

  function change(next: EncounterFormDocument) {
    if (acting.current || published.current) return;
    if (next.mode !== latest.current.mode) return;
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
  function close(title = 'صفحه بسته نشد') {
    if (acting.current) return;
    try {
      router.back();
    } catch (error) {
      alertError(title, error);
    }
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
        alertError('ثبت شد؛ صفحه بسته نشد', error);
      }
      return;
    }
    try {
      encounterFormDate(latest.current, new Date(now));
    } catch (error) {
      end();
      notify('اطلاعات کامل نیست', error instanceof Error ? error.message : 'ورودی‌ها را بررسی کنید.');
      return;
    }
    try {
      await withDatasetWrite(generation, async () => {
        await flushOrFail();
        const id = await commitEncounterFormDraft(
          persistence.id(),
          seed.mode,
          patientId,
          seed.encounterId,
          persistence.revision(),
          latest.current,
          new Date(now),
        );
        published.current = true;
        setCompletedId(id);
        setFinishedMessage('ثبت شد.');
        saver.cancel();
        end();
        router.back();
      });
    } catch (error) {
      setFailed(true);
      alertError(published.current ? 'ثبت شد؛ صفحه بسته نشد' : 'ثبت نشد', error);
      end();
    }
  }
  async function compare() {
    await perform(async () => {
      await saver.flush();
      setComparison(
        await inspectEncounterForm(seed.mode, patientId, seed.encounterId, persistence.id(), new Date(now)),
      );
    });
  }
  async function keepMine() {
    if (!comparison) return;
    await perform(async () => {
      await saver.flush();
      const result = await replaceEncounterFormDraft(
        persistence.id(),
        seed.mode,
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
      const rows = await encounterFormQuery(seed.mode, patientId, seed.encounterId);
      const next = encounterFormSeed(rows, seed.mode, seed.encounterId, new Date(now));
      saver.cancel();
      end();
      onReset(next);
    });
  }
  function discard() {
    confirm(
      'حذف پیش‌نویس؟',
      'فقط پیش‌نویس این فرم کنار گذاشته می‌شود.',
      'حذف پیش‌نویس',
      async () => {
        await flushOrFail();
        await discardEncounterFormDraft(
          persistence.id(),
          seed.mode,
          patientId,
          seed.encounterId,
          persistence.revision(),
        );
        published.current = true;
        setFinishedMessage('پیش‌نویس حذف شد.');
        saver.cancel();
        end();
        close('پیش‌نویس حذف شد؛ صفحه بسته نشد');
      },
      true,
    );
  }
  function deleteMistake() {
    const target = seed.row.target;
    if (acting.current || seed.mode !== 'edit' || !target) return;
    let records: number;
    try {
      records = encounterRecordCount(target.id);
    } catch (error) {
      alertError('بررسی نوبت انجام نشد', error);
      return;
    }
    const label = ENCOUNTER_KIND_LABELS[target.kind];
    if (records > 0) {
      notify(`این ${label} حذف نمی‌شود`, 'زیر این نوبت سابقه ثبت شده است؛ جزئیات را اصلاح کنید یا ترخیص را ثبت کنید.');
      return;
    }
    confirm(
      `حذف این ${label}؟`,
      'فقط برای نوبتی است که اشتباهی ثبت شده است.',
      'حذف',
      async () => {
        await flushOrFail();
        await deleteEncounter(target.id);
        published.current = true;
        setFinishedMessage('نوبت حذف شد.');
        saver.cancel();
        end();
        close('نوبت حذف شد؛ صفحه بسته نشد');
      },
      true,
    );
  }
  return {
    document,
    form: document.fields,
    changeEncounter: (patch: Partial<EncounterFormFields>) => {
      const next = latest.current;
      if (next.mode !== 'discharge') change({ ...next, fields: { ...next.fields, ...patch } });
    },
    changeDischarge: (patch: Partial<DischargeFormFields>) => {
      const next = latest.current;
      if (next.mode === 'discharge') change({ ...next, fields: { ...next.fields, ...patch } });
    },
    changeDate: (patch: Partial<EncounterFormDocument['fields']['date']>) => {
      const next = latest.current;
      change({ ...next, fields: { ...next.fields, date: { ...next.fields.date, ...patch } } } as EncounterFormDocument);
    },
    state,
    busy,
    completedId,
    finishedMessage,
    comparison,
    failedWrite: state.status === 'failed' || failed,
    hasDraft: !!seed.row.draft || state.status !== 'idle',
    save,
    compare,
    keepMine,
    loadStored,
    discard,
    deleteMistake,
    retry: () => perform(flushOrFail),
    close: () => close(),
  };
}
