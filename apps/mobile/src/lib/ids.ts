import * as Crypto from 'expo-crypto';

/**
 * UUIDv4 primary keys.
 *
 * Rows have to be creatable while offline on more than one device and merged
 * later without renumbering, which rules out autoincrement integers.
 */
export function newId(): string {
  return Crypto.randomUUID();
}

/** `createdAt`/`updatedAt` for a fresh row. */
export function stamps(now: Date = new Date()) {
  return { createdAt: now, updatedAt: now };
}

/** `updatedAt` for an edit. */
export function touch(now: Date = new Date()) {
  return { updatedAt: now };
}

/** Soft delete: the row stays, but every query filtering on `deletedAt` skips it. */
export function softDelete(now: Date = new Date()) {
  return { deletedAt: now, updatedAt: now };
}
