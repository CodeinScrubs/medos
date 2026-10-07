import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { Button } from '@/components/ui';
import { scheduledMessages } from '@/db/schema';
import { datasetGeneration } from '@/lib/dataset-write';
import { databaseRows, replacementFailure, snapshotDataset } from '@/test/dataset-snapshot';
import { useTestDatabase } from '@/test/db-client';
import { createTestDatabase, type TestDatabase } from '@/test/sqljs';

import { copyText, sendSms, sendTelegram, sendWhatsApp } from './actions';
import { GreetingComposer, type GreetingTarget } from './greeting-composer';
import { createOccasion, deleteOccasion, occasionQuery } from './occasions-queries';
import { createDoctor, doctorQuery, updateDoctor } from './queries';

jest.mock('@/components/ui', () => ({ Button: 'Button', Column: 'Column', Screen: 'Screen', Text: 'Text' }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn() }));
jest.mock('@/db/client', () => jest.requireActual('@/test/db-client'));
jest.mock('@/platform/notifications', () => jest.requireActual('@/test/mocks/notifications'));
jest.mock('./actions', () => ({
  copyText: jest.fn(async () => {}),
  sendSms: jest.fn(async () => true),
  sendWhatsApp: jest.fn(async () => true),
  sendTelegram: jest.fn(async () => true),
}));

let t: TestDatabase;
let tree: ReactTestRenderer | undefined;
let target: GreetingTarget;
let generation: number;
const onClose = jest.fn();
const button = (label: string) => tree!.root.findAllByType(Button).find((n) => n.props.label === label)!;
const messages = () => t.db.select().from(scheduledMessages).all();
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount() {
  await act(async () => {
    tree = create(<GreetingComposer target={target} generation={generation} stale={false} onClose={onClose} />);
    await settle();
  });
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
}
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(sendSms).mockResolvedValue(true);
  jest.mocked(sendWhatsApp).mockResolvedValue(true);
  jest.mocked(sendTelegram).mockResolvedValue(true);
  t = useTestDatabase(await createTestDatabase());
  const doctorId = await createDoctor({
    firstName: 'Synthetic',
    lastName: 'Colleague',
    relationship: 'colleague',
    phoneAlt: '+12025550123',
    whatsapp: '+12025550124',
    telegram: 'example',
  });
  const occasionId = await createOccasion({
    doctorId,
    kind: 'birthday',
    title: 'Synthetic birthday',
    jalaliMonth: 1,
    jalaliDay: 1,
  });
  target = {
    doctor: doctorQuery(doctorId).get()!,
    occasion: occasionQuery(occasionId).get()!,
    body: '  Happy birthday\n',
  };
  generation = datasetGeneration();
  onClose.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
    await settle();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('greeting handover with real record validation and SQLite', () => {
  it.each([
    { label: 'بازکردن پیامک', send: sendSms, channel: 'sms', contact: '+12025550123' },
    { label: 'بازکردن واتس‌اپ', send: sendWhatsApp, channel: 'whatsapp', contact: '+12025550124' },
    { label: 'بازکردن تلگرام', send: sendTelegram, channel: 'telegram', contact: 'example' },
  ])(
    'makes every available channel accessible and records only preparation: $label',
    async ({ label, send, channel, contact }) => {
      await mount();
      for (const available of ['بازکردن پیامک', 'بازکردن واتس‌اپ', 'بازکردن تلگرام', 'کپی متن'])
        expect(button(available)).toBeDefined();
      await press(label);
      expect(send).toHaveBeenCalledWith(contact, target.body);
      expect(messages()).toHaveLength(1);
      expect(messages()[0]).toMatchObject({ channel, status: 'ready', sentAt: null, body: target.body });
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );
  it('does not invent a history entry when the messenger could not open or when text was only copied', async () => {
    jest.mocked(sendSms).mockResolvedValue(false);
    await mount();
    await press('بازکردن پیامک');
    await press('کپی متن');
    expect(copyText).toHaveBeenCalledWith(target.body);
    expect(messages()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('opens once, refuses restore during handover, and retries failed SQL without reopening the messenger', async () => {
    let release!: (opened: boolean) => void;
    jest.mocked(sendSms).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    await mount();
    t.conn.execSync(
      "CREATE TRIGGER fail_message BEFORE INSERT ON scheduled_messages BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await act(async () => {
      const send = button('بازکردن پیامک');
      send.props.onPress();
      send.props.onPress();
      await settle();
    });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(replacementFailure()).not.toBeNull();
    await act(async () => {
      release(true);
      await settle();
    });
    expect(messages()).toEqual([]);
    expect(button('بستن').props.disabled).toBe(false);
    expect(button('ثبت سابقه؛ تلاش دوباره')).toBeDefined();
    t.conn.execSync('DROP TRIGGER fail_message');
    await press('ثبت سابقه؛ تلاش دوباره');
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(messages()).toHaveLength(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(replacementFailure()).toBeNull();
  });
  it('allows copying and confirmed closure when recording failed and the occasion no longer exists', async () => {
    await mount();
    t.conn.execSync(
      "CREATE TRIGGER fail_message BEFORE INSERT ON scheduled_messages BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    await press('بازکردن پیامک');
    await deleteOccasion(target.occasion.id);
    await press('ثبت سابقه؛ تلاش دوباره');
    expect(sendSms).toHaveBeenCalledTimes(1);
    await press('کپی متن');
    await press('بستن');
    const cancelled = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
    await act(async () => {
      cancelled[0]!.onPress!();
      cancelled[1]!.onPress!();
      await settle();
    });
    expect(onClose).not.toHaveBeenCalled();
    await press('بستن');
    const accepted = jest.mocked(Alert.alert).mock.calls.at(-1)![2]![1]!;
    await act(async () => {
      accepted.onPress!();
      accepted.onPress!();
      await settle();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(messages()).toEqual([]);
    expect(copyText).toHaveBeenCalledWith(target.body);
  });
  it.each([{ phoneAlt: '+12025550125' }, { title: 'Professor' }])(
    'does not block unrelated note edits, but refuses a changed contact/name snapshot (%p)',
    async (patch) => {
      await mount();
      await updateDoctor(target.doctor.id, { notes: 'Unrelated private note' });
      await press('بازکردن پیامک');
      expect(messages()).toHaveLength(1);
      await updateDoctor(target.doctor.id, patch);
      // Use a fresh sheet with the original contact snapshot, as a delayed action.
      await act(async () => {
        tree!.unmount();
      });
      await mount();
      await press('بازکردن پیامک');
      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(messages()).toHaveLength(1);
      expect(alertError).toHaveBeenCalled();
    },
  );
  it('refuses the original sheet callback after real restore before opening any messenger', async () => {
    await mount();
    await act(async () => {
      snapshotDataset(t)();
      await settle();
    });
    const restored = databaseRows(t);
    await press('بازکردن پیامک');
    expect(sendSms).not.toHaveBeenCalled();
    expect(databaseRows(t)).toEqual(restored);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('does not duplicate a prepared entry when the close callback failed after recording', async () => {
    onClose.mockImplementationOnce(() => {
      throw new Error('synthetic acknowledgement failure');
    });
    await mount();
    await press('بازکردن پیامک');
    const saved = databaseRows(t);
    await press('بازکردن پیامک');
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(messages()).toHaveLength(1);
    expect(databaseRows(t)).toEqual(saved);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
