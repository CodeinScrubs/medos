import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';

import { notify } from '@/components/feedback';

import { sendSms, sendWhatsApp } from './actions';

jest.mock('@/components/feedback', () => ({ notify: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Synthetic missing external app'));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('external messenger preparation failures', () => {
  it.each([sendSms, sendWhatsApp])('does not claim a clipboard copy that never occurred (%p)', async (prepare) => {
    expect(await prepare('+15550100000', 'Synthetic message')).toBe(false);
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
    expect(jest.mocked(notify).mock.calls.at(-1)?.[1]).not.toContain('کپی شده');
    expect(jest.mocked(notify).mock.calls.at(-1)?.[1]).toContain('متن را کپی کنید');
  });
});
