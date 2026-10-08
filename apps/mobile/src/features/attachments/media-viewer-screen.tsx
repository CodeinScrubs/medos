import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnotatedImage } from '@/components/annotated-image';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { notify, alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, IconButton, Row, Text } from '@/components/ui';
import { ZoomableImage } from '@/components/zoomable-image';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { imageDisplaySize, imageMimeFromPath, type ImageDocument } from '@/lib/image-edit';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaExists, mediaUri } from '@/platform/media';
import { mediaViewerColors } from '@/theme';

import { attachmentImageDocument } from './image-edit-queries';
import { useImageExport } from './image-export';
import { ATTACHMENT_KIND_LABELS } from './labels';
import { attachmentQuery, deleteAttachment, updateAttachment } from './queries';

/** Full-screen photo viewer. Param: `attachmentId`. */
export function MediaViewerScreen() {
  const { attachmentId } = useLocalSearchParams<{ attachmentId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [editing, setEditing] = useState(false);
  const { generation } = useDatasetIntent();
  const captionBusy = useRef(false);
  const [savingCaption, setSavingCaption] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const exporter = useImageExport();

  const { data, error, retry } = useLive(attachmentQuery(attachmentId), [attachmentId]);
  const item = data?.[0];
  let document: ImageDocument | null = null;
  let documentError: Error | undefined;
  if (item?.imageEditBody && !showOriginal) {
    try {
      document = attachmentImageDocument(item);
    } catch {
      documentError = new Error('سند ویرایش عکس خوانده نشد؛ اصل عکس را می‌توانید جداگانه ببینید.');
    }
  }
  const originalMissing = !!item?.originalPath && !mediaExists(item.originalPath);
  const originalShown = !document && !documentError && !!item?.originalPath && !originalMissing;
  const shown = originalShown ? item!.originalPath : item?.relativePath;
  const uri = shown ? mediaUri(shown) : null;
  const missing = shown ? !mediaExists(shown) : false;

  async function share() {
    await withDatasetWrite(generation, async () => {
      if (!item || !uri || missing || documentError) throw new Error('عکس برای اشتراک‌گذاری در دسترس نیست.');
      if (!(await Sharing.isAvailableAsync())) {
        notify('اشتراک‌گذاری روی این گوشی در دسترس نیست');
        return;
      }
      if (showOriginal && originalMissing) throw new Error('اصل عکس پیدا نشد؛ نسخهٔ فشرده به جای آن فرستاده نشد.');
      const shareUri = document ? await exporter.render(document) : uri;
      const mimeType = document
        ? 'image/png'
        : originalShown
          ? (item.originalMimeType ?? imageMimeFromPath(shown!))
          : (item.mimeType ?? imageMimeFromPath(shown!));
      await Sharing.shareAsync(shareUri, mimeType ? { mimeType } : {});
    });
  }

  async function saveCaption(text: string) {
    if (captionBusy.current) return;
    captionBusy.current = true;
    setSavingCaption(true);
    try {
      await withDatasetWrite(generation, async () => {
        if (!item) return;
        await updateAttachment(item.id, { caption: text || null });
        setEditing(false);
      });
    } catch (e) {
      alertError('توضیح ذخیره نشد', e);
    } finally {
      captionBusy.current = false;
      setSavingCaption(false);
    }
  }

  function remove() {
    if (!item) return;
    Alert.alert('حذف عکس؟', 'عکس از پرونده برداشته می‌شود.', [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          void withDatasetWrite(generation, async () => {
            await deleteAttachment(item.id);
            if (navigation.isFocused()) router.back();
          }).catch((e) => alertError('عکس حذف نشد', e));
        },
      },
    ]);
  }

  return (
    <View style={[styles.flex, styles.black]}>
      <ScreenOptions options={{ headerShown: false, animation: 'fade' }} />
      <StatusBar style="light" />

      {uri && !missing && !documentError ? (
        <ZoomableImage
          key={`${shown}-${item?.imageEditRevision}-${showOriginal}`}
          uri={uri}
          imageSize={document ? imageDisplaySize(document) : undefined}
          renderImage={
            document
              ? (viewport) => (
                  <AnnotatedImage document={document!} uri={uri} width={viewport.width} height={viewport.height} />
                )
              : undefined
          }
        />
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
              icon="color-palette-outline"
              label="ویرایش عکس"
              color={mediaViewerColors.text}
              disabled={!item || missing || !!documentError}
              onPress={() => {
                void withDatasetWrite(generation, async () => {
                  router.push({ pathname: '/media/edit/[attachmentId]', params: { attachmentId } });
                }).catch((e) => alertError('ویرایش باز نشد', e));
              }}
            />
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
              disabled={exporter.busy || missing || !!documentError}
              onPress={() => void share().catch((e) => alertError('اشتراک‌گذاری انجام نشد', e))}
            />
            <IconButton icon="trash-outline" label="حذف" color={mediaViewerColors.text} onPress={remove} />
          </Row>
        </Row>
        <ErrorNotice error={error ?? documentError} what="عکس" onRetry={retry} />
      </SafeAreaView>

      {item ? (
        <SafeAreaView style={styles.bottomBar} edges={['bottom']}>
          <Column gap="xxs" style={styles.caption}>
            {item.imageEditBody ? (
              <Button
                label={showOriginal ? 'نمایش ویرایش' : item.originalPath ? 'نمایش اصل عکس' : 'عکس بدون ویرایش'}
                variant="ghost"
                size="sm"
                onPress={() => setShowOriginal(!showOriginal)}
              />
            ) : null}
            {originalMissing ? (
              <Text variant="tiny" style={styles.dim}>
                اصل عکس پیدا نشد؛ نسخهٔ فشرده نمایش داده می‌شود.
              </Text>
            ) : null}
            {item.caption ? (
              <Text variant="body" style={styles.white}>
                {item.caption}
              </Text>
            ) : null}
            <Text variant="tiny" style={styles.dim}>
              {ATTACHMENT_KIND_LABELS[item.kind]}
              {item.bodySite ? `، ${item.bodySite}` : ''}، {formatJalaliDateTime(item.capturedAt)}
            </Text>
          </Column>
        </SafeAreaView>
      ) : null}

      <PromptModal
        visible={editing}
        busy={savingCaption}
        title="توضیح عکس"
        initialValue={item?.caption ?? ''}
        placeholder="مثلاً ضایعه‌ی ساق پای چپ، روز سوم درمان"
        onCancel={() => {
          if (!captionBusy.current) setEditing(false);
        }}
        onSubmit={(text) => void saveCaption(text)}
      />
      {exporter.scene}
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
