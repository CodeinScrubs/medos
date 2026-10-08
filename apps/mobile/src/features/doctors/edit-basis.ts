/** Exact stored values, including nulls and array order, define an edit's basis. */
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export class DoctorFormConflict extends Error {
  constructor() {
    super('همین بخش در صفحهٔ دیگری تغییر کرده است؛ نوشتهٔ شما حفظ شد. صفحه را پیش از ادامه مرور یا کپی کنید.');
    this.name = 'DoctorFormConflict';
  }
}

/** Untouched fields never enter a manual form's write, even if its display folds nulls. */
export function changedFormPatch<F extends object, V extends { [K in keyof F]: unknown }>(
  initial: F,
  latest: F,
  values: V,
): Partial<V> {
  const patch: Partial<V> = {};
  for (const key of Object.keys(initial) as (keyof F)[]) {
    if (!equal(initial[key], latest[key])) Object.assign(patch, { [key]: values[key] });
  }
  return patch;
}

/** An intervening unrelated edit survives; a conflicting locally changed field is refused. */
export function checkedEditPatch<T extends object>(
  current: T,
  basis: T,
  input: Partial<T>,
  groups: readonly (readonly (keyof T)[])[] = [],
): Partial<T> {
  for (const group of groups) {
    const initial = group.map((key) => basis[key]);
    const desired = group.map((key) => (input[key] === undefined ? basis[key] : input[key]));
    if (equal(initial, desired)) continue;
    const live = group.map((key) => current[key]);
    if (!equal(live, initial) && !equal(live, desired)) throw new DoctorFormConflict();
  }
  const patch: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    const desired = input[key];
    if (equal(desired, basis[key])) continue;
    if (!equal(current[key], basis[key]) && !equal(current[key], desired)) throw new DoctorFormConflict();
    if (!equal(current[key], desired)) Object.assign(patch, { [key]: desired });
  }
  return patch;
}
