import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { CollapsibleSection } from '@/components/collapsible-section';
import { ErrorNotice } from '@/components/error-notice';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Column,
  DataRow,
  EmptyState,
  IconButton,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { RATING_AXES, type Doctor, type DoctorProfile, type Occasion, type ScheduledMessage } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { topicsByTeacherQuery } from '@/features/knowledge/queries';
import { openInMaps } from '@/features/places/actions';
import { placeQuery } from '@/features/places/queries';
import { formatJalali, formatJalaliLong, daysBetween } from '@/lib/jalali';
import { formatPhone, toPersianDigits } from '@/lib/persian';
import { useTheme } from '@/theme';

import { callNumber, copyText, sendSms, sendTelegram, sendWhatsApp } from './actions';
import { OCCASION_KIND_LABELS, RATING_STEP_LABELS, RELATIONSHIP_LABELS } from './labels';
import {
  DEFAULT_GREETING,
  daysUntilLabel,
  doctorDisplayName,
  greetingText,
  latestRating,
  occasionNextDate,
  ratedAxisCount,
  ratingAverage,
} from './logic';
import { confirmGreetingSent, doctorMessagesQuery, logGreetingPrepared } from './messages-queries';
import { cancelDoctorOccasionReminders, deleteOccasion, doctorOccasionsQuery } from './occasions-queries';
import { deleteDoctor, doctorQuery, setDoctorStarred } from './queries';
import { doctorProfileQuery, doctorRatingsQuery } from './ratings-queries';

/** Everything known about one colleague. Route param: `id`. */
export function DoctorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { spacing } = useTheme();

  const { data, error } = useLive(doctorQuery(id ?? ''), [id]);
  const doctor = data?.[0];

  if (!doctor) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'پزشک' }} />
        <ErrorNotice error={error} what="پرونده‌ی پزشک" />
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
      <Stack.Screen
        options={{
          title: doctorDisplayName(doctor),
          headerRight: () => (
            <Row gap="xxs">
              <IconButton
                icon={doctor.starred ? 'star' : 'star-outline'}
                label={doctor.starred ? 'برداشتن ستاره' : 'ستاره‌دار کردن'}
                onPress={() => void setDoctorStarred(doctor.id, !doctor.starred)}
              />
              <IconButton
                icon="create-outline"
                label="ویرایش"
                onPress={() => router.push({ pathname: '/doctor/edit', params: { doctorId: doctor.id } })}
              />
            </Row>
          ),
        }}
      />

      <Column gap="md" style={{ paddingTop: spacing.md }}>
        <Header doctor={doctor} />
        <QuickActions doctor={doctor} />
        <RatingSection doctor={doctor} />
        <OccasionsSection doctor={doctor} />
        <TaughtSection doctor={doctor} />
        <ProfileSection doctor={doctor} />
        <ContactSection doctor={doctor} />
        <ReferralSection doctor={doctor} />

        {doctor.notes ? (
          <Card>
            <Column gap="xs">
              <Text variant="captionStrong" color="textMuted">
                یادداشت
              </Text>
              <Text variant="body">{doctor.notes}</Text>
            </Column>
          </Card>
        ) : null}

        <Button
          label="حذف پزشک"
          icon="trash-outline"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('حذف این پزشک؟', `${doctorDisplayName(doctor)} از فهرست برداشته می‌شود.`, [
              { text: 'انصراف', style: 'cancel' },
              {
                text: 'حذف',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    await cancelDoctorOccasionReminders(doctor.id);
                    await deleteDoctor(doctor.id);
                    router.back();
                  })();
                },
              },
            ])
          }
        />
      </Column>
    </Screen>
  );
}

function Header({ doctor }: { doctor: Doctor }) {
  const { colors } = useTheme();
  return (
    <Row gap="md">
      <Avatar first={doctor.firstName} last={doctor.lastName} size={56} />
      <Column gap="xxs" style={styles.grow}>
        <Row gap="xs">
          <Text variant="title" numberOfLines={2} style={styles.grow}>
            {doctorDisplayName(doctor)}
          </Text>
          {doctor.starred && <Ionicons name="star" size={16} color={colors.warning} />}
        </Row>
        {doctor.specialtyText ? (
          <Text variant="caption" color="textMuted">
            {doctor.specialtyText}
          </Text>
        ) : null}
        <Row gap="xs">
          <Badge label={RELATIONSHIP_LABELS[doctor.relationship]} />
          {doctor.academicRank ? <Badge label={doctor.academicRank} tone="info" /> : null}
          {doctor.acceptsReferrals ? <Badge label="ارجاع می‌پذیرد" tone="success" /> : null}
        </Row>
      </Column>
    </Row>
  );
}

function QuickActions({ doctor }: { doctor: Doctor }) {
  const { data: places } = useLive(placeQuery(doctor.primaryPlaceId ?? ''), [doctor.primaryPlaceId]);
  const place = places?.[0];
  const phone = doctor.phone || doctor.phoneAlt || doctor.officePhone;

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [];
  if (phone) {
    actions.push({ icon: 'call', label: 'تماس', onPress: () => void callNumber(phone) });
    actions.push({ icon: 'chatbubble-outline', label: 'پیامک', onPress: () => void sendSms(phone, '') });
  }
  if (doctor.whatsapp || phone) {
    actions.push({
      icon: 'logo-whatsapp',
      label: 'واتس‌اپ',
      onPress: () => void sendWhatsApp(doctor.whatsapp || phone, ''),
    });
  }
  if (doctor.telegram) {
    actions.push({
      icon: 'paper-plane-outline',
      label: 'تلگرام',
      onPress: () => void sendTelegram(doctor.telegram, ''),
    });
  }
  if (phone) actions.push({ icon: 'copy-outline', label: 'کپی شماره', onPress: () => void copyText(phone) });
  if (place) actions.push({ icon: 'map-outline', label: 'نقشه', onPress: () => void openInMaps(place) });

  if (actions.length === 0) return null;

  return (
    <Row gap="sm" wrap>
      {actions.map((a) => (
        <ActionButton key={a.label} {...a} />
      ))}
    </Row>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        pressed && styles.pressed,
      ]}
    >
      <Row gap="xs">
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text variant="caption">{label}</Text>
      </Row>
    </Pressable>
  );
}

function RatingSection({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();
  const { data } = useLive(doctorRatingsQuery(doctor.id), [doctor.id]);
  const ratings = data ?? [];
  const current = latestRating(ratings);
  const average = ratingAverage(current ?? undefined);

  return (
    <CollapsibleSection
      title="امتیاز شخصی"
      icon="star-outline"
      subtitle={average == null ? 'هنوز امتیازی ثبت نشده' : `${toPersianDigits(average)} از ۵`}
      defaultOpen={Boolean(current)}
      filledCount={ratings.length}
    >
      <Column gap="md">
        <Text variant="tiny" color="textFaint">
          یادداشت خصوصی خودتان درباره‌ی یک همکار واقعی. هیچ‌وقت نمایش داده، به اشتراک گذاشته یا خروجی گرفته نمی‌شود.
        </Text>

        {current ? (
          <Column gap="sm">
            {RATING_AXES.map((axis) => {
              const value = current[axis.key];
              return (
                <Row key={axis.key} gap="sm" justify="space-between">
                  <Text variant="caption" color="textMuted" style={styles.grow}>
                    {axis.labelFa}
                  </Text>
                  {value == null ? (
                    <Text variant="caption" color="textFaint">
                      —
                    </Text>
                  ) : (
                    <Row gap="xxs">
                      {[1, 2, 3, 4, 5].map((step) => (
                        <View
                          key={step}
                          style={{
                            width: 14,
                            height: 6,
                            borderRadius: radii.xs,
                            backgroundColor: step <= value ? colors.primary : colors.borderStrong,
                          }}
                        />
                      ))}
                      <Text variant="tiny" color="textMuted" style={{ marginStart: spacing.xs }}>
                        {RATING_STEP_LABELS[value]}
                      </Text>
                    </Row>
                  )}
                </Row>
              );
            })}
            {current.reasoning ? <Text variant="body">{current.reasoning}</Text> : null}
            <Text variant="tiny" color="textFaint">
              ثبت {formatJalali(current.ratedAt)} — {toPersianDigits(ratedAxisCount(current))} معیار از{' '}
              {toPersianDigits(RATING_AXES.length)}
            </Text>
          </Column>
        ) : null}

        {ratings.length > 1 ? (
          <Column gap="xs">
            <Text variant="captionStrong" color="textMuted">
              امتیازهای قبلی
            </Text>
            {ratings.slice(1).map((r) => (
              <Row key={r.id} gap="sm" justify="space-between">
                <Text variant="caption" color="textMuted">
                  {formatJalali(r.ratedAt)}
                </Text>
                <Text variant="caption">{ratingAverage(r) == null ? '—' : toPersianDigits(ratingAverage(r)!)}</Text>
              </Row>
            ))}
          </Column>
        ) : null}

        <Button
          label="امتیاز جدید"
          icon="add"
          variant="secondary"
          full
          onPress={() => router.push({ pathname: '/doctor/rate', params: { doctorId: doctor.id } })}
        />
      </Column>
    </CollapsibleSection>
  );
}

function OccasionsSection({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const { data } = useLive(doctorOccasionsQuery(doctor.id), [doctor.id]);
  const { data: messages } = useLive(doctorMessagesQuery(doctor.id), [doctor.id]);
  const rows = useMemo(() => {
    const withDate = (data ?? []).map((o) => ({ occasion: o, at: occasionNextDate(o) }));
    return withDate.sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
  }, [data]);

  return (
    <CollapsibleSection
      title="مناسبت‌ها"
      icon="gift-outline"
      subtitle={rows.length === 0 ? 'تولد و مناسبت‌ها را اینجا اضافه کنید' : undefined}
      defaultOpen={rows.length > 0}
      filledCount={rows.length}
    >
      <Column gap="sm">
        {rows.map(({ occasion, at }) => (
          <OccasionRow
            key={occasion.id}
            doctor={doctor}
            occasion={occasion}
            at={at}
            lastMessage={(messages ?? []).find((m) => m.occasionId === occasion.id) ?? null}
          />
        ))}
        <Button
          label="افزودن مناسبت"
          icon="add"
          variant="secondary"
          full
          onPress={() => router.push({ pathname: '/doctor/occasion', params: { doctorId: doctor.id } })}
        />
      </Column>
    </CollapsibleSection>
  );
}

function OccasionRow({
  doctor,
  occasion,
  at,
  lastMessage,
}: {
  doctor: Doctor;
  occasion: Occasion;
  at: Date | null;
  lastMessage: ScheduledMessage | null;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const days = at ? (daysBetween(at, new Date()) ?? 0) : null;

  /** Build the text and hand it to a messenger — MedOS never sends it itself. */
  function greet() {
    const text = greetingText(occasion.messageTemplate || DEFAULT_GREETING[occasion.kind], {
      name: doctorDisplayName(doctor),
      occasion: occasion.title,
    });
    const phone = doctor.whatsapp || doctor.phone || doctor.phoneAlt;

    /*
     * The send button is in the messenger, not here, so "sent" is recorded
     * when the text is handed over. Knowing months later that this person was
     * already congratulated this year is the point of keeping the log.
     */
    const hand = (channel: ScheduledMessage['channel'], go: () => Promise<boolean>) => () => {
      void (async () => {
        // A messenger that opened is all this can know. Whether the message
        // was actually sent is the user's to say, on the row afterwards.
        if (await go()) {
          await logGreetingPrepared({ doctorId: doctor.id, occasionId: occasion.id, channel, body: text });
        }
      })();
    };

    const options: { text: string; onPress?: () => void; style?: 'cancel' }[] = [];
    if (phone) options.push({ text: 'پیامک', onPress: hand('sms', () => sendSms(phone, text)) });
    if (phone) options.push({ text: 'واتس‌اپ', onPress: hand('whatsapp', () => sendWhatsApp(phone, text)) });
    if (doctor.telegram) {
      options.push({ text: 'تلگرام', onPress: hand('telegram', () => sendTelegram(doctor.telegram, text)) });
    }
    options.push({ text: 'کپی متن', onPress: () => void copyText(text) });
    options.push({ text: 'بستن', style: 'cancel' });
    Alert.alert('متن تبریک', text, options);
  }

  return (
    <Card tone="alt">
      <Row gap="sm" justify="space-between">
        <Column gap="xxs" style={styles.grow}>
          <Row gap="xs">
            <Text variant="bodyStrong">{occasion.title}</Text>
            <Badge label={OCCASION_KIND_LABELS[occasion.kind]} />
            {!occasion.isEnabled && <Badge label="یادآور خاموش" tone="neutral" />}
          </Row>
          <Text variant="caption" color="textMuted">
            {at ? formatJalaliLong(at) : 'بدون تاریخ'}
            {days != null ? ` — ${daysUntilLabel(days)}` : ''}
          </Text>
          {lastMessage?.status === 'sent' && lastMessage.sentAt ? (
            <Text variant="tiny" color="textFaint">
              آخرین تبریک: {formatJalali(lastMessage.sentAt)}
            </Text>
          ) : null}
          {lastMessage?.status === 'ready' ? (
            <Row gap="xs">
              <Text variant="tiny" color="textFaint">
                متن {formatJalali(lastMessage.createdAt)} آماده شد
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ثبت اینکه فرستاده شد"
                hitSlop={8}
                onPress={() => void confirmGreetingSent(lastMessage.id)}
              >
                <Text variant="tiny" color="primary">
                  فرستادم
                </Text>
              </Pressable>
            </Row>
          ) : null}
        </Column>
        <Row gap="xxs">
          <IconButton icon="send-outline" label="متن تبریک" onPress={greet} />
          <IconButton
            icon="create-outline"
            label="ویرایش مناسبت"
            onPress={() =>
              router.push({
                pathname: '/doctor/occasion',
                params: { doctorId: doctor.id, occasionId: occasion.id },
              })
            }
          />
          <IconButton
            icon="trash-outline"
            label="حذف مناسبت"
            color={colors.danger}
            onPress={() =>
              Alert.alert('حذف مناسبت؟', occasion.title, [
                { text: 'انصراف', style: 'cancel' },
                { text: 'حذف', style: 'destructive', onPress: () => void deleteOccasion(occasion.id) },
              ])
            }
          />
        </Row>
      </Row>
    </Card>
  );
}

/** What this person taught me — the other half of the link the topics carry. */
function TaughtSection({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const { data } = useLive(topicsByTeacherQuery(doctor.id), [doctor.id]);
  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <CollapsibleSection title="از ایشان یاد گرفته‌ام" icon="book-outline" filledCount={rows.length} defaultOpen>
      <Column gap="xs">
        {rows.slice(0, 10).map((topic) => (
          <Pressable
            key={topic.id}
            onPress={() => router.push({ pathname: '/knowledge/topic/[id]', params: { id: topic.id } })}
          >
            <Row gap="sm" justify="space-between">
              <Text variant="body" numberOfLines={1} style={styles.grow}>
                {topic.title}
              </Text>
              {topic.taughtAt ? (
                <Text variant="tiny" color="textFaint">
                  {formatJalali(topic.taughtAt)}
                </Text>
              ) : null}
            </Row>
          </Pressable>
        ))}
      </Column>
    </CollapsibleSection>
  );
}

function ProfileSection({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const { data } = useLive(doctorProfileQuery(doctor.id), [doctor.id]);
  const profile = data?.[0];
  const filled = profile ? countFilled(profile) : 0;

  return (
    <CollapsibleSection
      title="پروفایل شخصی"
      icon="heart-outline"
      subtitle={filled === 0 ? 'زادگاه، دانشگاه، علایق، سبک ارتباط' : undefined}
      defaultOpen={filled > 0}
      filledCount={filled}
    >
      <Column gap="xs">
        {profile ? (
          <>
            <DataRow label="تاریخ تولد" value={profile.birthDate ? formatJalaliLong(profile.birthDate) : null} />
            <DataRow label="زادگاه" value={profile.hometown} />
            <DataRow label="دانشگاه" value={profile.almaMater} />
            <DataRow label="سال فارغ‌التحصیلی" value={profile.graduationYear} />
            <DataRow label="علایق" value={(profile.interests ?? []).join('، ') || null} />
            <DataRow label="موضوع‌های مورد علاقه" value={profile.favoriteTopics} />
            <DataRow label="خوشش نمی‌آید از" value={profile.dislikes} />
            <DataRow label="خانواده" value={profile.familyNotes} />
            <DataRow label="چطور آشنا شدیم" value={profile.howWeMet} />
            <DataRow label="خاطره‌ها" value={profile.memorableMoments} />
            <DataRow label="سبک ارتباط" value={profile.communicationStyle} />
            <DataRow label="یادداشت" value={profile.personalNotes} />
          </>
        ) : null}
        <Button
          label={profile ? 'ویرایش پروفایل' : 'تکمیل پروفایل'}
          icon="create-outline"
          variant="secondary"
          full
          onPress={() => router.push({ pathname: '/doctor/profile', params: { doctorId: doctor.id } })}
        />
      </Column>
    </CollapsibleSection>
  );
}

function ContactSection({ doctor }: { doctor: Doctor }) {
  const fields = [doctor.phone, doctor.phoneAlt, doctor.extension, doctor.email, doctor.whatsapp, doctor.telegram];
  if (fields.every((f) => !f)) return null;
  return (
    <CollapsibleSection title="تماس" icon="call-outline" filledCount={fields.filter(Boolean).length}>
      <Column gap="xs">
        <DataRow label="موبایل" value={doctor.phone ? formatPhone(doctor.phone) : null} ltr />
        <DataRow label="شماره‌ی دوم" value={doctor.phoneAlt ? formatPhone(doctor.phoneAlt) : null} ltr />
        <DataRow label="داخلی" value={doctor.extension} ltr />
        <DataRow label="واتس‌اپ" value={doctor.whatsapp} ltr />
        <DataRow label="تلگرام" value={doctor.telegram} ltr />
        <DataRow label="ایمیل" value={doctor.email} ltr />
      </Column>
    </CollapsibleSection>
  );
}

function ReferralSection({ doctor }: { doctor: Doctor }) {
  const { data: places } = useLive(placeQuery(doctor.primaryPlaceId ?? ''), [doctor.primaryPlaceId]);
  const place = places?.[0];
  const fields = [
    place?.name,
    doctor.officeAddress,
    doctor.officeHours,
    doctor.officePhone,
    doctor.visitFee,
    (doctor.insurances ?? []).join('، '),
    doctor.referralNotes,
  ];
  if (fields.every((f) => !f) && !doctor.acceptsReferrals) return null;

  return (
    <CollapsibleSection title="مطب و ارجاع" icon="business-outline" filledCount={fields.filter(Boolean).length}>
      <Column gap="xs">
        <DataRow label="مرکز اصلی" value={place?.name ?? null} />
        <DataRow label="آدرس مطب" value={doctor.officeAddress} />
        <DataRow label="ساعات مطب" value={doctor.officeHours} />
        <DataRow label="تلفن مطب" value={doctor.officePhone ? formatPhone(doctor.officePhone) : null} ltr />
        <DataRow label="تعرفه" value={doctor.visitFee} />
        <DataRow label="بیمه‌ها" value={(doctor.insurances ?? []).join('، ') || null} />
        <DataRow label="یادداشت ارجاع" value={doctor.referralNotes} />
      </Column>
    </CollapsibleSection>
  );
}

function countFilled(profile: DoctorProfile): number {
  const values = [
    profile.birthDate,
    profile.hometown,
    profile.almaMater,
    profile.graduationYear,
    profile.familyNotes,
    (profile.interests ?? []).join(''),
    profile.favoriteTopics,
    profile.dislikes,
    profile.howWeMet,
    profile.memorableMoments,
    profile.communicationStyle,
    profile.personalNotes,
  ];
  return values.filter(Boolean).length;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
