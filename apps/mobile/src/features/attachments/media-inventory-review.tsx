import { useState } from 'react';

import { alertError } from '@/components/feedback';
import { Button, Column, Text } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { toPersianDigits } from '@/lib/persian';

import { inspectMediaInventory, type MediaInventory } from './media-inventory-queries';

/** Explicit accounting on an existing maintenance screen; no deletion controls. */
export function MediaInventoryReview() {
  const [inventory, setInventory] = useState<MediaInventory | null>(null);
  function inspect() {
    try {
      setInventory(inspectMediaInventory());
    } catch (e) {
      setInventory(null);
      alertError('بررسی فایل‌ها انجام نشد', e);
    }
  }
  return (
    <Column gap="xs">
      <Button label="بررسی فایل‌های رسانه" variant="ghost" size="sm" onPress={inspect} />
      {inventory ? (
        <>
          <Text variant="caption">
            {toPersianDigits(inventory.protectedCount)} فایل مرتبط با رکوردها، پیش‌نویس‌ها یا ورود فایل
          </Text>
          <Text variant="caption">
            {toPersianDigits(inventory.unreferencedCount)} فایل بدون ارجاع شناخته‌شده ·{' '}
            {formatBytes(inventory.unreferencedBytes)}
          </Text>
          <Text variant="caption" color="textMuted">
            {toPersianDigits(inventory.missing.length)} مسیر موجود نیست · {toPersianDigits(inventory.unknownSizeCount)}{' '}
            اندازه نامشخص
          </Text>
          <Text variant="tiny" color="textMuted">
            این بررسی هیچ فایلی را حذف نمی‌کند. فایل‌های سطل زباله و ورود ناتمام حفظ می‌شوند.
          </Text>
        </>
      ) : null}
    </Column>
  );
}
