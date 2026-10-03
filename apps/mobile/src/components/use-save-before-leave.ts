import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { datasetGeneration, DatasetChangedError } from '@/lib/dataset-write';
import { saveBeforeLeave } from '@/lib/save-before-leave';

import { alertError, notify } from './feedback';

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
export function useSaveBeforeLeave(flush: () => Promise<boolean>, abandoned: () => boolean = () => false): void {
  const navigation = useNavigation();
  const [generation] = useState(datasetGeneration);
  const checking = useRef(false);
  usePreventRemove(true, ({ data }) => {
    if (checking.current) return;
    if (generation !== datasetGeneration() && !abandoned()) {
      checking.current = true;
      Alert.alert(
        'بستن فرم قبلی',
        'اطلاعات از بکاپ جایگزین شده است. نوشتهٔ این صفحه را پیش از بستن مرور یا کپی کنید؛ بستن آن اطلاعات بازگردانی‌شده را تغییر نمی‌دهد.',
        [
          {
            text: 'ادامهٔ مرور',
            style: 'cancel',
            onPress: () => {
              checking.current = false;
            },
          },
          {
            text: 'بستن فرم',
            style: 'destructive',
            onPress: () => {
              try {
                navigation.dispatch(data.action);
              } finally {
                checking.current = false;
              }
            },
          },
        ],
      );
      return;
    }
    checking.current = true;
    void saveBeforeLeave(flush, () => {
      if (generation !== datasetGeneration() && !abandoned()) throw new DatasetChangedError();
      navigation.dispatch(data.action);
    })
      .then((saved) => {
        if (!saved) notify('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
      })
      .catch((e) => alertError('ذخیره نشد', e))
      .finally(() => {
        checking.current = false;
      });
  });
}
