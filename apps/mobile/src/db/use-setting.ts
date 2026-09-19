import { parseSetting, settingQuery, type SettingDef } from './settings';
import { useLive } from './use-live';

/**
 * A setting's current value, kept live. `loaded` is false until the first read
 * lands — callers that must not act on the default (the app lock) check it.
 */
export function useSetting<T>(def: SettingDef<T>): { value: T; loaded: boolean } {
  const { data } = useLive(settingQuery(def), [def.key]);
  return { value: parseSetting(def, data?.[0]), loaded: data !== undefined };
}
