import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnnotatedImage } from '@/components/annotated-image';
import { AutosaveScope, useAutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { ErrorNotice } from '@/components/error-notice';
import { notify, alertError } from '@/components/feedback';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, IconButton, Row, Text } from '@/components/ui';
import { ZoomableImage } from '@/components/zoomable-image';
import { useLive } from '@/db/use-live';
import { datasetGeneration, withDatasetWrite } from '@/lib/dataset-write';
import { imageDisplaySize, imageMimeFromPath, type ImageDocument } from '@/lib/image-edit';
import { formatJalaliDateTime } from '@/lib/jalali';
import { mediaExists, mediaUri } from '@/platform/media';
import { mediaViewerColors } from '@/theme';

import { CaptionEditor } from './caption-editor';
import { attachmentImageDocument } from './image-edit-queries';
import { useImageExport } from './image-export';
import { ATTACHMENT_KIND_LABELS } from './labels';
import { attachmentQuery, deleteAttachment } from './queries';

/** Full-screen photo viewer. Param: `attachmentId`. */
export function MediaViewerScreen() {
  const scope = useAutosaveScope();
  return scope ? (
    <MediaViewer />
  ) : (
    <AutosaveScope>
      <MediaViewer />
    </AutosaveScope>
  );
}
function MediaViewer() {
  const scope = useAutosaveScope()!;
  const { attachmentId } = useLocalSearchParams<{ attachmentId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { generation } = useDatasetIntent();
  const shareBusy = useRef(false);
  const [sharing, setSharing] = useState(false);
  const closeDialog = useRef<symbol | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      closeDialog.current = null;
    };
  }, []);
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

  function close() {
    if (closeDialog.current || !mounted.current || !navigation.isFocused()) return;
    if (generation === datasetGeneration()) {
      router.back();
      return;
    }
    const token = Symbol();
    closeDialog.current = token;
    const consume = (accepted: boolean) => {
      if (!mounted.current || closeDialog.current !== token) return;
      closeDialog.current = null;
      if (!accepted || !navigation.isFocused() || generation === datasetGeneration()) return;
      try {
        scope.abandonStale();
        router.back();
      } catch (e) {
        alertError('بسته نشد', e);
      }
    };
    Alert.alert(
      'بستن عکس قدیمی؟',
      'پیش از بستن، توضیح نوشته‌شده را مرور یا کپی کنید.',
      [
        { text: 'ادامهٔ مرور', style: 'cancel', onPress: () => consume(false) },
        { text: 'بستن', onPress: () => consume(true) },
      ],
      { cancelable: true, onDismiss: () => consume(false) },
    );
  }

  async function share() {
    if (shareBusy.current) return;
    shareBusy.current = true;
    setSharing(true);
    try {
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
    } finally {
      shareBusy.current = false;
      setSharing(false);
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
          <IconButton icon="close" label="بستن" color={mediaViewerColors.text} onPress={close} />
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
            <CaptionEditor key={attachmentId} attachmentId={attachmentId} />
            <IconButton
              icon="share-outline"
              label="اشتراک‌گذاری"
              color={mediaViewerColors.text}
              disabled={sharing || exporter.busy || missing || !!documentError}
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
