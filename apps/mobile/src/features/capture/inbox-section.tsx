import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { alertError } from '@/components/feedback';
import { PickerModal, type PickerItem } from '@/components/picker-modal';
import { Button, Column, Row, SectionHeader, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { patientListQuery } from '@/features/patients/queries';
import { fullName, toPersianDigits } from '@/lib/persian';

import { CaptureCard, groupMedia, NO_MEDIA, type PatientAsk } from './capture-card';
import { captureMediaQuery, fileCaptureAsNote, inboxQuery, updateCapture } from './queries';

const SHOWN = 3;

/**
 * The inbox on Today: the few oldest unfiled captures, and how many more.
 *
 * It is on Today rather than behind a menu because an inbox nobody sees is a
 * place things go to be lost.
 */
export function InboxSection() {
  const router = useRouter();
  const { data } = useLive(inboxQuery());
  const { data: media } = useLive(captureMediaQuery());
  const [ask, setAsk] = useState<PatientAsk | null>(null);

  const rows = data ?? [];
  const byCapture = useMemo(() => groupMedia(media), [media]);

  const { data: patientRows } = useLive(patientListQuery());
  const patientItems: PickerItem[] = useMemo(
    () =>
      (patientRows ?? []).map((p) => ({
        id: p.id,
        label: fullName(p.firstName, p.lastName),
        sublabel: p.summary,
        keywords: p.searchText,
      })),
    [patientRows],
  );

  async function answerAsk(patientId: string) {
    const pending = ask;
    setAsk(null);
    if (!pending) return;
    try {
      if (pending.purpose === 'note') {
        const noteId = await fileCaptureAsNote(pending.captureId, { patientId });
        router.push({ pathname: '/patient/[id]/note', params: { id: patientId, noteId } });
      } else {
        await updateCapture(pending.captureId, { patientId });
      }
    } catch (e) {
      alertError('انجام نشد', e);
    }
  }

  if (rows.length === 0) return null;

  return (
    <>
      <SectionHeader title="ثبت‌های نشده" count={rows.length} />
      <Column gap="sm">
        {rows.slice(0, SHOWN).map(({ capture, patient }) => (
          <CaptureCard
            key={capture.id}
            capture={capture}
            patient={patient}
            media={byCapture.get(capture.id) ?? NO_MEDIA}
            onAskPatient={setAsk}
          />
        ))}

        {rows.length > SHOWN ? (
          <Row justify="space-between" align="center">
            <Text variant="tiny" color="textFaint">
              {toPersianDigits(rows.length - SHOWN)} مورد دیگر
            </Text>
            <Button label="همه" variant="ghost" size="sm" haptic={false} onPress={() => router.push('/inbox')} />
          </Row>
        ) : null}
      </Column>

      <PickerModal
        visible={ask != null}
        title={ask?.purpose === 'note' ? 'نوت برای کدام بیمار؟' : 'این برای کیست؟'}
        items={patientItems}
        selectedId={ask?.selectedId ?? null}
        onClose={() => setAsk(null)}
        onSelect={(item) => void answerAsk(item.id)}
      />
    </>
  );
}
