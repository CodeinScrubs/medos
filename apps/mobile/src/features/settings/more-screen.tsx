import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Column, Divider, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { useNow } from '@/components/use-now';
import { useSetting } from '@/db/use-setting';
import { backupFreshness, deliveryStrength } from '@/features/backup/logic';
import { backupLastDelivery, backupLastSuccessAt } from '@/features/backup/settings';
import { formatRelativeTime } from '@/lib/jalali';
import { useTheme } from '@/theme';

type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  href: Href;
  tone?: 'danger' | 'warning' | 'success';
};

export function MoreScreen() {
  const { spacing } = useTheme();
  const lastBackup = useSetting(backupLastSuccessAt).value;
  const lastDelivery = useSetting(backupLastDelivery).value;
  const strength = deliveryStrength(lastBackup, lastDelivery);
  const now = useNow();
  const freshness = backupFreshness(lastBackup, now);

  const work: Item[] = [
    {
      icon: 'time-outline',
      title: 'شیفت و راند',
      subtitle: 'بیماران این شیفت، و راند یکی‌یکی',
      href: '/shift',
    },
    {
      icon: 'file-tray-outline',
      title: 'ثبت‌های نشده',
      subtitle: 'هرچه سریع ثبت کرده‌اید و هنوز جایش مشخص نیست',
      href: '/inbox',
    },
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
    {
      icon: 'key-outline',
      title: 'رمزها',
      subtitle: 'یوزرنیم و پسورد سامانه‌ها، یک‌جا و مرتب',
      href: '/vault',
    },
  ];

  const data: Item[] = [
    {
      icon: 'cloud-upload-outline',
      title: 'پشتیبان‌گیری',
      subtitle: lastBackup ? `آخرین بکاپ ${formatRelativeTime(lastBackup, new Date(now))}` : 'هنوز بکاپی گرفته نشده',
      href: '/backup',
      tone:
        freshness === 'never'
          ? 'danger'
          : freshness === 'stale' || strength === 'size' || strength == null
            ? 'warning'
            : 'success',
    },
    { icon: 'trash-outline', title: 'حذف‌شده‌ها', subtitle: 'پرونده، نوت و ثبت سریعِ حذف‌شده', href: '/trash' },
    { icon: 'settings-outline', title: 'تنظیمات', subtitle: 'قفل اپ، حافظه', href: '/settings' },
  ];

  return (
    <Screen scroll tabRoot>
      <Column gap="none" style={{ paddingTop: spacing.md }}>
        <Text variant="display">بیشتر</Text>

        <SectionHeader title="کار" />
        <MenuCard items={work} />

        <SectionHeader title="مرجع" />
        <MenuCard items={reference} />

        <SectionHeader title="داده‌ها و امنیت" />
        <MenuCard items={data} />
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
        return (
          <View key={item.title}>
            {i > 0 && <Divider inset={spacing.lg + 36 + spacing.md} />}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [{ padding: spacing.lg, opacity: pressed ? 0.6 : 1 }]}
            >
              <Row gap="md">
                <View style={[styles.icon, { borderRadius: radii.md, backgroundColor: colors.primarySoft }]}>
                  <Ionicons name={item.icon} size={18} color={toneColor} />
                </View>
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading">{item.title}</Text>
                  {item.subtitle ? (
                    <Text variant="caption" color="textMuted" style={item.tone ? { color: toneColor } : undefined}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </Column>
                <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
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
