import type { Credential } from '@/db/schema';
import { buildSearchText } from '@/lib/persian';

/**
 * The search index of a credential.
 *
 * The secret is deliberately absent. Everything that helps find the entry —
 * the system, the username, the URL, the notes — is indexed; the password is
 * not, so the search box can never be used to confirm a guess.
 */
export function credentialSearchText(
  c: Partial<
    Pick<Credential, 'systemName' | 'url' | 'username' | 'notes' | 'ownerName' | 'secondFactorNotes' | 'tags'>
  >,
): string {
  return buildSearchText(
    c.systemName,
    c.url,
    c.username,
    c.notes,
    c.ownerName,
    c.secondFactorNotes,
    c.tags ?? undefined,
  );
}

/** A password's shape, for the strength hint under the field. */
export function secretShape(secret: string): { length: number; kinds: number } {
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(secret)).length;
  return { length: secret.length, kinds };
}

/**
 * A rough hint, not a verdict: a short password is short whatever else it
 * contains, and MedOS is not going to lecture about entropy it cannot measure.
 */
export function secretHint(secret: string): string | null {
  if (!secret) return null;
  const { length, kinds } = secretShape(secret);
  if (length < 8) return 'کوتاه است';
  if (length >= 16 || kinds >= 3) return null;
  return 'می‌شود قوی‌ترش کرد';
}

/** Days until a credential expires, when it has an expiry at all. */
export function daysUntilExpiry(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
}
