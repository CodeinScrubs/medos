import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, jsonList } from './_shared';

/* -------------------------------------------------------------------------- */
/*  Credential vault                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Logins for prescription portals (سامانه نسخه‌نویسی), insurance systems,
 * hospital HIS and similar.
 *
 * Storage rules enforced by `src/lib/vault.ts`:
 *
 * 1. `secretCipher` holds AES-256-GCM ciphertext. The plaintext password is
 *    never written to a column, a log, or a backup in readable form.
 * 2. The key is derived from a vault passphrase and held in the Android
 *    Keystore via expo-secure-store, not in this database.
 * 3. `ownerKind` distinguishes the user's own logins from credentials that
 *    belong to a colleague. Colleague entries are excluded from ordinary
 *    exports and require an explicit confirmation to reveal, because they are
 *    someone else's access to a system that prescribes in their name.
 */
export const credentials = sqliteTable(
  'credentials',
  {
    ...baseColumns,
    /** The system this logs into, e.g. "سامانه نسخه الکترونیک تأمین اجتماعی". */
    systemName: text('system_name').notNull(),
    category: text('category', {
      enum: ['prescription', 'insurance', 'hospital', 'university', 'lab', 'personal', 'other'],
    })
      .notNull()
      .$default(() => 'other' as const),
    url: text('url'),
    username: text('username'),

    /** AES-256-GCM ciphertext, base64. Never plaintext. */
    secretCipher: text('secret_cipher'),
    /** Per-record nonce, base64. */
    secretNonce: text('secret_nonce'),
    /** Which key generation encrypted this, so the passphrase can be rotated. */
    keyVersion: integer('key_version')
      .notNull()
      .$default(() => 1),

    /** Second factor hints: recovery phone, security questions, token app. */
    secondFactorNotes: text('second_factor_notes'),

    ownerKind: text('owner_kind', { enum: ['self', 'colleague', 'shared'] })
      .notNull()
      .$default(() => 'self' as const),
    /** Whose credential this is, when not the user's own. */
    ownerName: text('owner_name'),
    /** Why the user legitimately holds it: "covers my shifts", "gave me access". */
    ownerConsentNote: text('owner_consent_note'),

    notes: text('notes'),
    tags: jsonList('tags'),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    searchText: text('search_text'),
  },
  (t) => [
    index('credentials_category_idx').on(t.category, t.deletedAt),
    index('credentials_owner_idx').on(t.ownerKind),
    index('credentials_search_idx').on(t.searchText),
  ],
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
