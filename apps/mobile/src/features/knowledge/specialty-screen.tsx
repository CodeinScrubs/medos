import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { ScreenOptions } from '@/components/screen-options';
import { Badge, Button, Card, Column, DataRow, EmptyState, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { deleteSpecialtyProfile, specialtyProfileQuery } from './specialty-profiles-queries';

/** Read one field's research page. Route param: `id`. */
export function SpecialtyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data, error } = useLive(specialtyProfileQuery(id ?? ''), [id]);
  const row = data?.[0];
  const profile = row?.profile;
  const name = row?.specialty?.nameFa ?? profile?.nameText ?? 'رشته';

  if (!profile) {
    return (
      <Screen>
        <ScreenOptions options={{ title: 'رشته' }} />
        <ErrorNotice error={error} what="پرونده‌ی رشته" />
        {data && !error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="پیدا نشد"
            description="ممکن است حذف شده باشد."
            action={<Button label="بازگشت" variant="ghost" onPress={() => router.back()} />}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenOptions
        options={{
          title: name,
          headerRight: () => (
            <IconButton
              icon="create-outline"
              label="ویرایش"
              onPress={() => router.push({ pathname: '/knowledge/specialty/edit', params: { profileId: profile.id } })}
            />
          ),
        }}
      />

      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Row gap="xs" wrap>
          {profile.personalFit != null ? (
            <Badge label={`${toPersianDigits(profile.personalFit)} از ۵ به من می‌خورد`} tone="accent" />
          ) : null}
          {profile.residencyYears ? <Badge label={`رزیدنتی ${profile.residencyYears}`} tone="info" /> : null}
          {(profile.tags ?? []).map((tag) => (
            <Badge key={tag} label={tag} />
          ))}
        </Row>

        <Block title="در یک نگاه" body={profile.overview} />
        <Block title="یک روز کاری" body={profile.dailyWork} />

        <Card>
          <Column gap="xs">
            <DataRow label="سختی ورود" value={profile.entranceDifficulty} />
            <DataRow label="سبک زندگی" value={profile.lifestyle} />
            <DataRow label="درآمد" value={profile.incomeNotes} />
            <DataRow label="بازار کار" value={profile.jobMarket} />
            <DataRow label="مسیرهای فوق تخصص" value={profile.subspecialtyPaths} />
          </Column>
        </Card>

        <Block title="مزایا" body={profile.prosText} />
        <Block title="معایب" body={profile.consText} />
        <Block title="نظر شخصی" body={profile.myThoughts} strong />
        <Block title="از چه کسی شنیدم" body={profile.sourcesText} />

        <Button
          label="حذف این رشته"
          icon="trash-outline"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('حذف این صفحه؟', name, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  void deleteSpecialtyProfile(profile.id).then(() => router.back());
                },
              },
            ])
          }
        />
      </Column>
    </Screen>
  );
}

function Block({ title, body, strong = false }: { title: string; body: string | null; strong?: boolean }) {
  if (!body?.trim()) return null;
  return (
    <Card>
      <Column gap="xxs">
        <Text variant="captionStrong" color="textMuted">
          {title}
        </Text>
        <Text variant={strong ? 'bodyStrong' : 'body'}>{body}</Text>
      </Column>
    </Card>
  );
}
