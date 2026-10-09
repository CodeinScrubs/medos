import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
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
  const checking = useRef<symbol | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      checking.current = null;
    };
  }, []);
  usePreventRemove(true, ({ data }) => {
    if (checking.current || !mounted.current) return;
    const intent = Symbol();
    checking.current = intent;
    const state = navigation.getState();
    if (!state) {
      checking.current = null;
      return;
    }
    const routeKeys = state.routes.map((route) => route.key);
    const focused = navigation.isFocused();
    // Root/system GO_BACK can be targetless. Adding source on redispatch does
    // not pin its destination: StackRouter otherwise pops the new top route.
    // Retain background reset/removal when the originating stack is unchanged.
    const ownsRemoval = () => {
      if (!mounted.current || checking.current !== intent || (focused && !navigation.isFocused())) return false;
      const current = navigation.getState();
      return (
        current !== undefined &&
        current.key === state.key &&
        current.index === state.index &&
        current.routes.length === routeKeys.length &&
        current.routes.every((route, index) => route.key === routeKeys[index])
      );
    };
    const finish = () => {
      if (checking.current === intent) checking.current = null;
    };
    if (generation !== datasetGeneration() && !abandoned()) {
      const shownGeneration = datasetGeneration();
      Alert.alert(
        'بستن فرم قبلی',
        'اطلاعات از بکاپ جایگزین شده است. نوشتهٔ این صفحه را پیش از بستن مرور یا کپی کنید؛ بستن آن اطلاعات بازگردانی‌شده را تغییر نمی‌دهد.',
        [
          {
            text: 'ادامهٔ مرور',
            style: 'cancel',
            onPress: finish,
          },
          {
            text: 'بستن فرم',
            style: 'destructive',
            onPress: () => {
              try {
                if (ownsRemoval() && shownGeneration === datasetGeneration()) navigation.dispatch(data.action);
              } finally {
                finish();
              }
            },
          },
        ],
        { cancelable: true, onDismiss: finish },
      );
      return;
    }
    void saveBeforeLeave(flush, () => {
      if (!ownsRemoval()) return;
      if (generation !== datasetGeneration() && !abandoned()) throw new DatasetChangedError();
      navigation.dispatch(data.action);
    })
      .then((saved) => {
        if (!saved && ownsRemoval()) notify('هنوز ذخیره نشد', 'نوشته روی صفحه باقی مانده است. دوباره تلاش کنید.');
      })
      .catch((e) => {
        if (ownsRemoval()) alertError('ذخیره نشد', e);
      })
      .finally(finish);
  });
}
