import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, jsonList } from './_shared';

/* -------------------------------------------------------------------------- */
/*  Credential vault                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Logins for prescription portals (سامانه نسخه‌نویسی), insurance systems,
 * hospital HIS and similar.
 *
 * This is a tidy place to keep working passwords, not a vault. The owner asked
 * for exactly that: somewhere better organised than a note in Samsung Notes,
 * with no passphrase to remember and no unlock step before every use. So
 * `secretText` holds the password as typed.
 *
 * What still protects it: the database lives in the app's private storage,
 * which no other app can read; the optional app lock (fingerprint) covers the
 * whole app; and every backup file is encrypted, so a password never leaves
 * the phone in the clear. What does not protect it: anyone holding the
 * unlocked phone can open this screen and read it. That is the trade the owner
 * chose, and the screens say so rather than implying more.
 *
 * `secretCipher`/`secretNonce`/`keyVersion` are the earlier encrypted design.
 * Columns are never dropped, so they stay; `features/vault/queries.ts` reads
 * them only to carry an old row forward.
 *
 * `ownerKind` distinguishes the user's own logins from credentials that belong
 * to a colleague, which are shown with a warning — they are someone else's
 * access to a system that prescribes in their name.
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

    /** The password, as typed. See the note above on what this is not. */
    secretText: text('secret_text'),

    /** Left from the encrypted design; only read, never written. */
    secretCipher: text('secret_cipher'),
    /** Left from the encrypted design; only read, never written. */
    secretNonce: text('secret_nonce'),
    /** Left from the encrypted design; only read, never written. */
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
