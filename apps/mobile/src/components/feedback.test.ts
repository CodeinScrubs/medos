import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';

import { logError } from '@/platform/error-log';

import { alertError } from './feedback';

jest.mock('@/platform/error-log', () => ({ logError: jest.fn() }));
afterEach(() => {
  jest.restoreAllMocks();
});
describe('default error feedback', () => {
  it('shows an exact reviewed notice while logging a fixed technical context', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const error = new Error('پروندهٔ بیمار در دسترس نیست؛ نوت تغییر نکرد.');
    alertError('ثبت نشد', error);
    expect(alert).toHaveBeenCalledWith('ثبت نشد', error.message, [{ text: 'باشه' }]);
    expect(logError).toHaveBeenCalledWith(error, { source: 'handled', context: 'feedback.alert' });
  });
  it('withholds message canaries including prefixes and known-notice suffixes', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    alertError('ثبت نشد', new Error('پروندهٔ بیمار در دسترس نیست؛ نوت تغییر نکرد. SYNTHETIC_PRIVATE_CANARY'));
    expect(alert.mock.calls[0]?.[1]).not.toContain('SYNTHETIC_PRIVATE_CANARY');
    expect(alert.mock.calls[0]?.[1]).toContain('دوباره تلاش');
  });
});
