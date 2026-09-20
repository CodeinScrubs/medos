/**
 * expo-secure-store, in memory.
 *
 * On the phone these items live in the Android Keystore. Tests only need the
 * contract: a string per key, and a way to look at what was actually written
 * so a half-finished write can be simulated.
 */
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test helpers — not part of expo-secure-store's own API. */
export function resetSecureStore(): void {
  store.clear();
}

export function secureStoreKeys(): string[] {
  return [...store.keys()].sort();
}

export function seedSecureStore(items: Record<string, string>): void {
  for (const [key, value] of Object.entries(items)) store.set(key, value);
}
