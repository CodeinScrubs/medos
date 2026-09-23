import { db } from '@/db/client';
import { settings } from '@/db/schema';

import { backupLastDelivery, backupLastSuccessAt } from './settings';

/** Keep the legacy scheduling timestamp and its evidence in the same transaction. */
export function recordBackupDelivery(strength: 'bytes' | 'size' | 'confirmed', at: number): void {
  const delivery = backupLastDelivery.schema.parse({ at, strength });
  const rows = [
    { key: backupLastDelivery.key, value: JSON.stringify(delivery), updatedAt: new Date(at) },
    { key: backupLastSuccessAt.key, value: JSON.stringify(at), updatedAt: new Date(at) },
  ];
  db.transaction((tx) => {
    for (const row of rows) {
      tx.insert(settings).values(row).onConflictDoUpdate({ target: settings.key, set: row }).run();
    }
  });
}
