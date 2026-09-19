import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { baseColumns, bool, jsonList } from './_shared';

/* -------------------------------------------------------------------------- */
/*  Places: hospitals, clinics, offices, labs, imaging centres                  */
/* -------------------------------------------------------------------------- */

export const places = sqliteTable(
  'places',
  {
    ...baseColumns,
    name: text('name').notNull(),
    kind: text('kind', {
      enum: ['hospital', 'clinic', 'office', 'lab', 'imaging', 'pharmacy', 'university', 'other'],
    })
      .notNull()
      .$default(() => 'hospital' as const),
    city: text('city'),
    address: text('address'),
    /** Stored as text so a pasted "35.7000, 51.4000" survives without parsing. */
    lat: text('lat'),
    lng: text('lng'),
    /** Any map deep link the user already has: Neshan, Balad, Google Maps. */
    mapUrl: text('map_url'),
    phone: text('phone'),
    /** The main switchboard, from which extensions are dialled. */
    switchboard: text('switchboard'),
    website: text('website'),
    notes: text('notes'),
    tags: jsonList('tags'),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    searchText: text('search_text'),
  },
  (t) => [index('places_kind_idx').on(t.kind, t.deletedAt), index('places_search_idx').on(t.searchText)],
);

/* -------------------------------------------------------------------------- */
/*  Internal extensions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The single most-used reference on a ward: "what is the extension for the
 * ultrasound room?". Kept as its own table so it stays searchable across every
 * hospital at once.
 */
export const extensions = sqliteTable(
  'extensions',
  {
    ...baseColumns,
    placeId: text('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    department: text('department').notNull(),
    extension: text('extension').notNull(),
    /** Some departments publish a direct line as well as an extension. */
    directLine: text('direct_line'),
    floor: text('floor'),
    availableHours: text('available_hours'),
    contactPerson: text('contact_person'),
    notes: text('notes'),
    usageCount: integer('usage_count')
      .notNull()
      .$default(() => 0),
    starred: bool('starred')
      .notNull()
      .$default(() => false),
    searchText: text('search_text'),
  },
  (t) => [
    index('extensions_place_idx').on(t.placeId),
    index('extensions_search_idx').on(t.searchText),
    index('extensions_usage_idx').on(t.usageCount),
  ],
);

export const placesRelations = relations(places, ({ many }) => ({
  extensions: many(extensions),
}));

export const extensionsRelations = relations(extensions, ({ one }) => ({
  place: one(places, { fields: [extensions.placeId], references: [places.id] }),
}));

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Extension = typeof extensions.$inferSelect;
