import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';

import { useDatasetIntent } from '@/components/dataset-intent';
import { alertError, notify } from '@/components/feedback';
import { useNow } from '@/components/use-now';
import { useSaveBeforeLeave } from '@/components/use-save-before-leave';
import type { Patient, PatientFormDraft } from '@/db/schema';
import { Autosave, type AutosaveState } from '@/lib/autosave';
import { withDatasetWrite } from '@/lib/dataset-write';
import { newId } from '@/lib/ids';

import {
  decodePatientForm,
  initialPatientFields,
  patientFormErrors,
  PatientFormConflict,
  rebasePatientForm,
  type PatientFormDocument,
  type PatientFormFields,
} from './form-draft';
import {
  commitPatientFormDraft,
  discardPatientFormDraft,
  inspectPatientForm,
  PatientDuplicateWarning,
  replacePatientFormDraft,
  savePatientFormDraft,
  type PatientFormComparison,
} from './form-draft-queries';
import { patientIdentity } from './logic';

export type PatientFormSeed = { patient?: Patient; draft: PatientFormDraft | null; document: PatientFormDocument };
export function patientFormSeed(patient: Patient | undefined, draft: PatientFormDraft | null): PatientFormSeed {
  if (
    draft &&
    (draft.patientId !== (patient?.id ?? null) ||
      draft.scopeKey !== (patient ? `patient:${patient.id}` : 'new') ||
      draft.deletedAt ||
      draft.committedPatientId)
  )
    throw new PatientFormConflict();
  if (draft && Boolean(decodePatientForm(draft.body).base) !== Boolean(patient)) throw new PatientFormConflict();
  return {
    patient,
    draft,
    document: draft
      ? decodePatientForm(draft.body)
      : { version: 1, fields: initialPatientFields(patient), base: patient ? initialPatientFields(patient) : null },
  };
}

/** One document, one serialized autosave; neither field rendering nor navigation owns its only copy. */
export function usePatientFormDraft(
  seed: PatientFormSeed,
  onReset: (seed: PatientFormSeed) => void,
  expectedGeneration?: number,
) {
  const { generation } = useDatasetIntent(expectedGeneration);
  const router = useRouter();
  const now = useNow();
  const patientId = seed.patient?.id ?? null;
  const [document, setDocument] = useState(seed.document);
  const latest = useRef(document);
  const acting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReturnType<typeof patientFormErrors>>({});
  const [failed, setFailed] = useState(false);
  const [comparison, setComparison] = useState<PatientFormComparison | null>(null);
  const [state, setState] = useState<AutosaveState>({ status: 'idle' });
  const [persistence] = useState(() => {
    let id = seed.draft?.id ?? newId();
    let revision = seed.draft?.revision ?? 0;
    return {
      id: () => id,
      revision: () => revision,
      adopt: (nextId: string, nextRevision: number) => {
        id = nextId;
        revision = nextRevision;
      },
      saver: new Autosave<PatientFormDocument>({
        generation,
        write: async (value) => {
          revision = await savePatientFormDraft(id, patientId, value, revision);
        },
        onState: setState,
        shouldRetry: (error) => !(error instanceof PatientFormConflict),
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

  function change<K extends keyof PatientFormFields>(key: K, value: PatientFormFields[K]) {
    if (acting.current || completedId) return;
    const next = { ...latest.current, fields: { ...latest.current.fields, [key]: value } };
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
  async function flushOrFail() {
    if (!(await saver.flush()) || saver.unsaved) {
      throw new Error('پیش‌نویس ذخیره نشد؛ نوشته روی صفحه باقی مانده است.');
    }
  }
  function navigate(id: string) {
    if (patientId) router.back();
    else router.replace({ pathname: '/patient/[id]', params: { id } });
  }
  async function publish(allowDuplicate = false) {
    let savedId: string | null = null;
    try {
      await withDatasetWrite(generation, async () => {
        const id = await commitPatientFormDraft(
          persistence.id(),
          patientId,
          persistence.revision(),
          new Date(now),
          allowDuplicate,
        );
        savedId = id;
        setCompletedId(id);
        saver.cancel();
        end(); // The always-on removal guard may now flush and dispatch navigation.
        navigate(id);
      });
    } catch (error) {
      if (error instanceof PatientDuplicateWarning) {
        let answered = false;
        const answer = (action: () => void) => {
          if (answered) return;
          answered = true;
          action();
        };
        const names = error.patients
          .map((p) => `• ${p.firstName} ${p.lastName}${patientIdentity(p) ? ` (${patientIdentity(p)})` : ''}`)
          .join('\n');
        Alert.alert(
          'بیمار مشابه پیدا شد',
          `این بیماران از قبل ثبت شده‌اند:\n${names}\n\nباز هم بیمار جدید ثبت شود؟`,
          [
            { text: 'انصراف', style: 'cancel', onPress: () => answer(end) },
            {
              text: 'ثبت کن',
              onPress: () => {
                answer(() => {
                  void publish(true);
                });
              },
            },
          ],
          { cancelable: false },
        );
        return;
      }
      setFailed(true);
      alertError(savedId ? 'پرونده ثبت شد؛ باز نشد' : 'ثبت نشد', error);
      end();
    }
  }
  async function save() {
    if (!begin()) return;
    if (completedId) {
      try {
        await withDatasetWrite(generation, async () => {
          end();
          navigate(completedId);
        });
      } catch (error) {
        end();
        alertError('پرونده ثبت شد؛ باز نشد', error);
      }
      return;
    }
    const nextErrors = patientFormErrors(latest.current.fields, new Date(now));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      end();
      return;
    }
    try {
      await withDatasetWrite(generation, async () => {
        await flushOrFail();
        if (patientId && persistence.revision() === 0) {
          await inspectPatientForm(patientId);
          end();
          router.back();
          return;
        }
        await publish();
      });
    } catch (error) {
      setFailed(true);
      alertError('ثبت نشد', error);
      end();
    }
  }
  async function compare() {
    await perform(async () => {
      await saver.flush(); // Wait for writes already started; a conflict remains available for explicit resolution.
      setComparison(await inspectPatientForm(patientId));
    });
  }
  async function keepMine() {
    if (!comparison) return;
    await perform(async () => {
      await saver.flush();
      const next = rebasePatientForm(latest.current, comparison.patient);
      const id = comparison.draft?.id ?? newId();
      const revision = await replacePatientFormDraft(id, patientId, next, comparison);
      persistence.adopt(id, revision);
      latest.current = next;
      setDocument(next);
      // Replace the previous failed pending value with the resolved document.
      saver.change(next);
      await flushOrFail();
      setComparison(null);
    });
  }
  function loadStored() {
    if (!begin()) return;
    let answered = false;
    Alert.alert(
      'جایگزینی نوشتهٔ روی صفحه؟',
      'نوشتهٔ ذخیره‌نشدهٔ این صفحه کنار گذاشته می‌شود.',
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
          text: 'بارگذاری',
          onPress: () => {
            if (answered) return;
            answered = true;
            void (async () => {
              try {
                await withDatasetWrite(generation, async () => {
                  await saver.flush();
                  const current = await inspectPatientForm(patientId);
                  const next = patientFormSeed(current.patient ?? undefined, current.draft);
                  saver.cancel();
                  end();
                  onReset(next);
                });
              } catch (error) {
                alertError('بارگذاری نشد', error);
                end();
              }
            })();
          },
        },
      ],
      { cancelable: false },
    );
  }
  function discard() {
    if (!begin()) return;
    let answered = false;
    Alert.alert(
      'حذف پیش‌نویس؟',
      'فقط تغییرات این فرم کنار گذاشته می‌شود؛ پروندهٔ ثبت‌شده تغییر نمی‌کند.',
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
          text: 'حذف پیش‌نویس',
          style: 'destructive',
          onPress: () => {
            if (answered) return;
            answered = true;
            void (async () => {
              try {
                await withDatasetWrite(generation, async () => {
                  await flushOrFail();
                  await discardPatientFormDraft(persistence.id(), patientId, persistence.revision());
                  saver.cancel();
                  end();
                  router.back();
                });
              } catch (error) {
                alertError('حذف نشد', error);
                end();
              }
            })();
          },
        },
      ],
      { cancelable: false },
    );
  }
  const failedWrite = state.status === 'failed' || failed;
  return {
    form: document.fields,
    set: change,
    errors,
    busy,
    state,
    comparison,
    completedId,
    failedWrite,
    hasDraft: !!seed.draft || state.status !== 'idle',
    save,
    discard,
    compare,
    keepMine,
    loadStored,
    retry: () => perform(flushOrFail),
    close: () => {
      if (!acting.current) router.back();
      else notify('هنوز ثبت تمام نشده', 'تا پایان ثبت، این صفحه را باز نگه دارید.');
    },
  };
}
