import { useCallback, useRef } from 'react';

import { notify } from './feedback';

/** The ref closes the gap between a native text event and the next React render. */
export function useDateValidation() {
  const valid = useRef(true);
  const setValid = useCallback((next: boolean) => {
    valid.current = next;
  }, []);
  const check = useCallback(() => {
    if (valid.current) return true;
    notify('تاریخ یا ساعت معتبر نیست', 'مقدار نوشته‌شده را اصلاح کنید.');
    return false;
  }, []);
  return { setValid, check };
}
