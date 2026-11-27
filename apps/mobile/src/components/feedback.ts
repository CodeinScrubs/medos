import { Alert } from 'react-native';

import { safeErrorMessage } from '@/lib/error-diagnostic';
import { logError } from '@/platform/error-log';

/**
 * Tell the user an action failed, and keep a record of it in the on-phone
 * error log so the failure can be diagnosed later. Query values that a
 * database error might carry never enter default diagnostics or error detail.
 */
export function alertError(title: string, error: unknown): void {
  logError(error, { source: 'handled', context: 'feedback.alert' });
  const message = safeErrorMessage(error);
  notify(title, message);
}

/**
 * A message with nothing to decide. Android's own button for it says "OK" in
 * English; this one says «باشه».
 */
export function notify(title: string, message?: string): void {
  Alert.alert(title, message, [{ text: 'باشه' }]);
}
