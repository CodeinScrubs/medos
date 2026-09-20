import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Column, Divider, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useSetting } from '@/db/use-setting';
import { backupFreshness } from '@/features/backup/logic';
import { backupLastSuccessAt } from '@/features/backup/settings';
import { formatRelativeTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  href?: Href;
  tone?: 'danger' | 'warning' | 'success';
};

export function MoreScreen() {
  const { spacing } = useTheme();
  const lastBackup = useSetting(backupLastSuccessAt).value;
  const now = useNow();
  const freshness = backupFreshness(lastBackup, now);

  const ready: Item[] = [
    {
      icon: 'cloud-upload-outline',
      title: 'پشتیبان‌گیری',
      subtitle: lastBackup ? `آخرین بکاپ ${formatRelativeTime(lastBackup, new Date(now))}` : 'هنوز بکاپی گرفته نشده',
      href: '/backup',
      tone: freshness === 'never' ? 'danger' : freshness === 'stale' ? 'warning' : 'success',
    },
    { icon: 'trash-outline', title: 'حذف‌شده‌ها', subtitle: 'برگرداندن پرونده‌های حذف‌شده', href: '/trash' },
    {
      icon: 'key-outline',
      title: 'رمزها',
      subtitle: 'یوزرنیم و پسورد سامانه‌ها، یک‌جا و مرتب',
      href: '/vault',
    },
    { icon: 'settings-outline', title: 'تنظیمات', subtitle: 'قفل اپ، حافظه', href: '/settings' },
  ];

  const reference: Item[] = [
    {
      icon: 'call-outline',
      title: 'شماره‌های داخلی',
      subtitle: 'داخلی بخش‌ها، قابل جستجو بین همه‌ی بیمارستان‌ها',
      href: '/extensions',
    },
    {
      icon: 'location-outline',
      title: 'مکان‌ها',
      subtitle: 'بیمارستان، مطب، آزمایشگاه — با آدرس و مسیریابی',
      href: '/places',
    },
  ];

  return (
    <Screen scroll>
      <Column gap="none" style={{ paddingTop: spacing.md }}>
        <Text variant="display">بیشتر</Text>

        <SectionHeader title="مرجع" />
        <MenuCard items={reference} />

        <SectionHeader title="داده‌ها و امنیت" />
        <MenuCard items={ready} />
      </Column>
    </Screen>
  );
}

function MenuCard({ items }: { items: Item[] }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  return (
    <Card padded={false}>
      {items.map((item, i) => {
        const toneColor =
          item.tone === 'danger'
            ? colors.danger
            : item.tone === 'warning'
              ? colors.warning
              : item.tone === 'success'
                ? colors.success
                : colors.primary;
        const enabled = Boolean(item.href);
        return (
          <View key={item.title}>
            {i > 0 && <Divider inset={spacing.lg + 36 + spacing.md} />}
            <Pressable
              disabled={!enabled}
              onPress={() => item.href && router.push(item.href)}
              style={({ pressed }) => [{ padding: spacing.lg, opacity: enabled ? (pressed ? 0.6 : 1) : 0.55 }]}
            >
              <Row gap="md">
                <View
                  style={[
                    styles.icon,
                    { borderRadius: radii.md, backgroundColor: enabled ? colors.primarySoft : colors.neutralSoft },
                  ]}
                >
                  <Ionicons name={item.icon} size={18} color={enabled ? toneColor : colors.textFaint} />
                </View>
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading">{item.title}</Text>
                  {item.subtitle ? (
                    <Text
                      variant="caption"
                      color={item.tone && enabled ? undefined : 'textMuted'}
                      style={item.tone ? { color: toneColor } : undefined}
                    >
                      {item.subtitle}
                    </Text>
                  ) : null}
                </Column>
                {enabled && <Ionicons name="chevron-back" size={18} color={colors.textFaint} />}
              </Row>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
