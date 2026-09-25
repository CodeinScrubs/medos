import { Alert } from 'react-native';

import { redactErrorText } from '@/lib/redact';
import { logError } from '@/platform/error-log';

/**
 * Tell the user an action failed, and keep a record of it in the on-phone
 * error log so the failure can be diagnosed later. Query values that a
 * database error might carry are redacted from both.
 */
export function alertError(title: string, error: unknown): void {
  logError(error, { source: 'handled', context: title });
  const message = error instanceof Error ? redactErrorText(error.message) : 'خطای ناشناخته';
  notify(title, message);
}

/**
 * A message with nothing to decide. Android's own button for it says "OK" in
 * English; this one says «باشه».
 */
export function notify(title: string, message?: string): void {
  Alert.alert(title, message, [{ text: 'باشه' }]);
}
