import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';

/** The ref closes the gap between a native text event and the next React render. */
export function useDateValidation() {
  const valid = useRef(true);
  const setValid = useCallback((next: boolean) => {
    valid.current = next;
  }, []);
  const check = useCallback(() => {
    if (valid.current) return true;
    Alert.alert('تاریخ یا ساعت معتبر نیست', 'مقدار نوشته‌شده را اصلاح کنید.');
    return false;
  }, []);
  return { setValid, check };
}
