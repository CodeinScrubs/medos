import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAutoBackup } from '@/features/backup/use-auto-backup';
import { parseOccasionReminder } from '@/features/doctors/logic';
import { parseReminderPayload } from '@/features/followups/logic';
import { LockGate } from '@/features/lock/lock-gate';
import { useReminderUpkeep } from '@/features/reminders/use-reminder-upkeep';
import { StartupGate } from '@/features/startup/startup-gate';
import { parseTaskReminder } from '@/features/tasks/schedule-logic';
import { installGlobalErrorLogging, logError } from '@/platform/error-log';
import { setupNotifications } from '@/platform/notifications';
import { ThemeProvider, useTheme } from '@/theme';

/** A screen that throws renders this instead of taking the whole app down. */
export { RouteErrorBoundary as ErrorBoundary } from '@/features/diagnostics/error-boundary';

installGlobalErrorLogging();
void SplashScreen.preventAutoHideAsync();

/**
 * RTL is forced at build time by the expo-localization config plugin
 * (`forcesRTL: true`), so `I18nManager.isRTL` is already true here and no
 * runtime reload is needed. This check catches running the app without a
 * fresh native build, which silently produces a mirrored-wrong layout.
 */
if (__DEV__ && !I18nManager.isRTL) {
  console.warn(
    '[MedOS] RTL is not active. Run `npx expo prebuild --clean` and rebuild, ' +
      'otherwise the whole layout will be mirrored the wrong way.',
  );
}

/**
 * Provider order matters: the database must be up before the lock gate can
 * read its setting, and the lock gate must wrap every screen.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <StartupGate>
              <LockGate>
                <AppStack />
              </LockGate>
            </StartupGate>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Tapping a reminder opens its task, patient's record, or doctor. */
function useNotificationNavigation() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const data = response?.notification.request.content.data;
    const task = parseTaskReminder(data);
    if (task) {
      router.push({ pathname: '/task', params: { taskId: task.taskId } });
      return;
    }
    const followUp = parseReminderPayload(data);
    if (followUp) {
      router.push({ pathname: '/patient/[id]', params: { id: followUp.patientId } });
      return;
    }
    const occasion = parseOccasionReminder(data);
    if (occasion?.doctorId) router.push({ pathname: '/doctor/[id]', params: { id: occasion.doctorId } });
  }, [response, router]);
}

function AppStack() {
  const { colors, isDark, typography } = useTheme();

  useEffect(() => {
    // The splash screen is taken down by StartupGate, which also covers the
    // case where startup fails and this never renders.
    void setupNotifications().catch((error: unknown) =>
      logError(error, { source: 'handled', context: 'notification setup' }),
    );
  }, []);

  useNotificationNavigation();
  useAutoBackup();
  useReminderUpkeep();

  const modal = (title: string) => ({ title, presentation: 'modal', animation: 'slide_from_bottom' }) as const;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontFamily: typography.heading.fontFamily,
            fontSize: typography.heading.fontSize,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_left',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen name="patient/new" options={modal('بیمار جدید')} />
        <Stack.Screen name="shift" options={{ title: 'شیفت' }} />
        <Stack.Screen name="round" options={{ title: 'راند' }} />
        <Stack.Screen name="capture" options={modal('ثبت سریع')} />
        <Stack.Screen name="inbox" options={{ title: 'ثبت‌های نشده' }} />
        <Stack.Screen name="patient/[id]/index" options={{ title: 'پرونده بیمار' }} />
        <Stack.Screen name="patient/[id]/edit" options={modal('ویرایش بیمار')} />
        <Stack.Screen name="patient/[id]/note" options={modal('نوت')} />
        <Stack.Screen name="patient/[id]/note-history" options={modal('تاریخچه‌ی نوت')} />
        <Stack.Screen name="patient/[id]/encounter" options={modal('بستری / ویزیت')} />
        <Stack.Screen name="patient/[id]/discharge" options={modal('ترخیص')} />
        <Stack.Screen name="patient/[id]/contact" options={modal('شماره‌ی همراه')} />
        <Stack.Screen name="patient/[id]/order" options={modal('کاردکس')} />
        <Stack.Screen name="patient/[id]/followup" options={modal('پیگیری جدید')} />
        <Stack.Screen name="patient/[id]/lab" options={modal('آزمایش')} />
        <Stack.Screen name="patient/[id]/imaging" options={modal('تصویربرداری')} />
        <Stack.Screen name="patient/[id]/trend" options={{ title: 'روند' }} />

        <Stack.Screen name="doctor/[id]" options={{ title: 'پزشک' }} />
        <Stack.Screen name="doctor/edit" options={modal('پزشک')} />
        <Stack.Screen name="doctor/rate" options={modal('امتیاز')} />
        <Stack.Screen name="doctor/profile" options={modal('پروفایل شخصی')} />
        <Stack.Screen name="doctor/occasion" options={modal('مناسبت')} />

        <Stack.Screen name="knowledge/topic/[id]" options={{ title: 'مبحث' }} />
        <Stack.Screen name="knowledge/topic/edit" options={modal('مبحث')} />
        <Stack.Screen name="knowledge/rx/[id]" options={{ title: 'نسخه' }} />
        <Stack.Screen name="knowledge/rx/edit" options={modal('نسخه')} />
        <Stack.Screen name="knowledge/specialty/[id]" options={{ title: 'رشته' }} />
        <Stack.Screen name="knowledge/specialty/edit" options={modal('رشته')} />
        <Stack.Screen name="knowledge/idea" options={modal('ایده')} />

        <Stack.Screen name="vault/index" options={{ title: 'رمزها' }} />
        <Stack.Screen name="vault/[id]" options={{ title: 'رمز' }} />
        <Stack.Screen name="vault/edit" options={modal('رمز')} />

        <Stack.Screen name="media/[attachmentId]" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="backup" options={{ title: 'پشتیبان‌گیری' }} />
        <Stack.Screen name="trash" options={{ title: 'حذف‌شده‌ها' }} />
        <Stack.Screen name="settings" options={{ title: 'تنظیمات' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'گزارش خطاها' }} />
        <Stack.Screen name="extensions/index" options={{ title: 'شماره‌های داخلی' }} />
        <Stack.Screen name="extensions/edit" options={modal('داخلی')} />
        <Stack.Screen name="consult-answer" options={modal('پاسخ کانسالت')} />
        <Stack.Screen name="shift-history" options={{ title: 'شیفت‌های قبلی' }} />
        <Stack.Screen name="task" options={{ title: 'کار' }} />
        <Stack.Screen name="tasks" options={{ title: 'کارها' }} />
        <Stack.Screen name="places/index" options={{ title: 'مکان‌ها' }} />
        <Stack.Screen name="places/edit" options={modal('مکان')} />
      </Stack>
    </>
  );
}
