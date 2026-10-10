import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { baseColumns } from './_shared';

/** Raw input survives a removed target; the feature validates it only at publication. */
export const workspaceFormDrafts = sqliteTable(
  'workspace_form_drafts',
  {
    ...baseColumns,
    kind: text('kind', { enum: ['idea', 'topic', 'order'] }).notNull(),
    parentId: text('parent_id'),
    recordId: text('record_id'),
    scope: text('scope').notNull(),
    body: text('body').notNull(),
    revision: integer('revision').notNull().default(0),
    committedId: text('committed_id'),
  },
  (t) => [
    uniqueIndex('workspace_form_open_scope_idx')
      .on(t.kind, t.scope)
      .where(sql`${t.deletedAt} is null`),
    index('workspace_form_recent_idx').on(t.kind, t.deletedAt, t.updatedAt, t.id),
  ],
);
export type WorkspaceFormDraft = typeof workspaceFormDrafts.$inferSelect;
