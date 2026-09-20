import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PromptModal } from '@/components/prompt-modal';
import { Column, IconButton, Row, Text } from '@/components/ui';
import { ZoomableImage } from '@/components/zoomable-image';
import { useLive } from '@/db/use-live';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaExists, mediaUri } from '@/platform/media';
import { mediaViewerColors } from '@/theme';

import { ATTACHMENT_KIND_LABELS } from './labels';
import { attachmentQuery, deleteAttachment, updateAttachment } from './queries';

/** Full-screen photo viewer. Param: `attachmentId`. */
export function MediaViewerScreen() {
  const { attachmentId } = useLocalSearchParams<{ attachmentId: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const { data } = useLive(attachmentQuery(attachmentId), [attachmentId]);
  const item = data?.[0];
  // Zoom against the original when one was kept: this screen is where the
  // difference between the sensor's pixels and a 2400px re-encode is the whole
  // point. Sharing follows suit — what leaves is what arrived.
  const shown = item && item.originalPath && mediaExists(item.originalPath) ? item.originalPath : item?.relativePath;
  const uri = shown ? mediaUri(shown) : null;
  const missing = shown ? !mediaExists(shown) : false;

  async function share() {
    if (!uri) return;
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('اشتراک‌گذاری روی این گوشی در دسترس نیست');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: item?.mimeType ?? 'image/jpeg' });
  }

  function remove() {
    if (!item) return;
    Alert.alert('حذف عکس؟', 'عکس از پرونده برداشته می‌شود.', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          void deleteAttachment(item.id).then(() => router.back());
        },
      },
    ]);
  }

  return (
    <View style={[styles.flex, styles.black]}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <StatusBar style="light" />

      {uri && !missing ? (
        <ZoomableImage uri={uri} />
      ) : (
        <View style={[styles.flex, styles.center]}>
          <Text variant="body" style={styles.white}>
            {item ? 'فایل این عکس روی گوشی پیدا نشد.' : ''}
          </Text>
        </View>
      )}

      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <Row justify="space-between" style={styles.barRow}>
          <IconButton icon="close" label="بستن" color={mediaViewerColors.text} onPress={() => router.back()} />
          <Row gap="xs">
            <IconButton
              icon="create-outline"
              label="ویرایش توضیح"
              color={mediaViewerColors.text}
              onPress={() => setEditing(true)}
            />
            <IconButton
              icon="share-outline"
              label="اشتراک‌گذاری"
              color={mediaViewerColors.text}
              onPress={() => void share()}
            />
            <IconButton icon="trash-outline" label="حذف" color={mediaViewerColors.text} onPress={remove} />
          </Row>
        </Row>
      </SafeAreaView>

      {item ? (
        <SafeAreaView style={styles.bottomBar} edges={['bottom']} pointerEvents="none">
          <Column gap="xxs" style={styles.caption}>
            {item.caption ? (
              <Text variant="body" style={styles.white}>
                {item.caption}
              </Text>
            ) : null}
            <Text variant="tiny" style={styles.dim}>
              {ATTACHMENT_KIND_LABELS[item.kind]}
              {item.bodySite ? ` • ${item.bodySite}` : ''} • {formatJalaliDateTime(item.capturedAt)}
            </Text>
          </Column>
        </SafeAreaView>
      ) : null}

      <PromptModal
        visible={editing}
        title="توضیح عکس"
        initialValue={item?.caption ?? ''}
        placeholder="مثلاً ضایعه‌ی ساق پای چپ، روز سوم درمان"
        onCancel={() => setEditing(false)}
        onSubmit={(text) => {
          setEditing(false);
          if (item) void updateAttachment(item.id, { caption: text || null });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  black: { backgroundColor: mediaViewerColors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: mediaViewerColors.barTop },
  barRow: { paddingHorizontal: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: mediaViewerColors.barBottom },
  caption: { paddingHorizontal: 16, paddingVertical: 12 },
  white: { color: mediaViewerColors.text },
  dim: { color: mediaViewerColors.textDim },
});
