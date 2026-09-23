import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { saveBeforeLeave } from '@/lib/save-before-leave';

import { alertError } from './feedback';

/** Covers system/header back and route replacement, not just a screen's save button. */
export function useSaveBeforeLeave(unsaved: boolean, flush: () => Promise<boolean>): void {
  const navigation = useNavigation();
  const checking = useRef(false);
  usePreventRemove(unsaved, ({ data }) => {
    if (checking.current) return;
    checking.current = true;
    void saveBeforeLeave(flush, () => navigation.dispatch(data.action))
      .then((saved) => {
        if (!saved) Alert.alert('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
      })
      .catch((e) => alertError('ذخیره نشد', e))
      .finally(() => {
        checking.current = false;
      });
  });
}
