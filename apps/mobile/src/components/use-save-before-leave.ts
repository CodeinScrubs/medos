import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { saveBeforeLeave } from '@/lib/save-before-leave';

import { alertError } from './feedback';

/**
 * Covers system/header back and route replacement, not just a screen's save button.
 *
 * Every way out is held until `flush` says the words are stored; with nothing
 * waiting it resolves at once and the screen leaves without a prompt.
 *
 * The guard is on for the screen's whole life on purpose. Whether a route is
 * guarded is part of its native header, so a guard that switched off as a save
 * finished changed that header in the same moment `router.back()` took the
 * screen away — and Android stopped the app ("ScreenStackFragment added into a
 * non-stack container", react-native-screens #4429).
 */
export function useSaveBeforeLeave(flush: () => Promise<boolean>): void {
  const navigation = useNavigation();
  const checking = useRef(false);
  usePreventRemove(true, ({ data }) => {
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
