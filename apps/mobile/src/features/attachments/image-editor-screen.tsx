import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { AnnotatedImage } from '@/components/annotated-image';
import { AutosaveScope } from '@/components/autosave-scope';
import { useDatasetIntent } from '@/components/dataset-intent';
import { EditGate } from '@/components/edit-gate';
import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { PromptModal } from '@/components/prompt-modal';
import { ScreenOptions } from '@/components/screen-options';
import { Button, Column, IconButton, Row, Screen, Text } from '@/components/ui';
import { useLive } from '@/db/use-live';
import { withDatasetWrite } from '@/lib/dataset-write';
import { decodeImageDocument, decodeImageDraft, IMAGE_COLORS, type ImageColor } from '@/lib/image-edit';
import { formatJalaliDateTime } from '@/lib/jalali';
import { toPersianDigits } from '@/lib/persian';
import { mediaExists, mediaUri } from '@/platform/media';
import { imageInk, mediaViewerColors, useTheme } from '@/theme';

import { ImageEditCanvas, type ImageTool } from './image-edit-canvas';
import {
  imageEditQuery,
  imageEditSeed,
  imageShelvedDraftsQuery,
  imageVersionsQuery,
  type ImageEditRow,
  type ImageEditSeed,
} from './image-edit-queries';
import { useImageEdit } from './use-image-edit';

const tools: { tool: ImageTool; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { tool: 'view', icon: 'hand-left-outline', label: 'زوم و جابه‌جایی' },
  { tool: 'pen', icon: 'pencil-outline', label: 'قلم' },
  { tool: 'highlight', icon: 'brush-outline', label: 'هایلایت' },
  { tool: 'arrow', icon: 'arrow-up-outline', label: 'فلش' },
  { tool: 'text', icon: 'text-outline', label: 'متن روی عکس' },
  { tool: 'crop', icon: 'crop-outline', label: 'برش' },
  { tool: 'erase', icon: 'backspace-outline', label: 'پاک کردن علامت' },
];
const colorLabels: Record<ImageColor, string> = {
  yellow: 'زرد',
  red: 'قرمز',
  blue: 'آبی',
  white: 'سفید',
  black: 'سیاه',
};

export function ImageEditorScreen() {
  return (
    <AutosaveScope>
      <ImageEditorGate />
    </AutosaveScope>
  );
}
function ImageEditorGate() {
  const { attachmentId } = useLocalSearchParams<{ attachmentId: string }>();
  useDatasetIntent(); // Capture before the first read, including late-mounted children.
  const { data, error, retry } = useLive(imageEditQuery(attachmentId), [attachmentId]);
  return (
    <EditGate editing rows={data} error={error} onRetry={retry} what="عکس و پیش‌نویس" fenceDataset>
      {(row, notice, generation) => row && <SeededImageEditor row={row} readNotice={notice} generation={generation} />}
    </EditGate>
  );
}
function SeededImageEditor({
  row,
  readNotice,
  generation,
}: {
  row: ImageEditRow;
  readNotice: ReactNode;
  generation: number;
}) {
  const [result] = useState(() => {
    try {
      return { seed: imageEditSeed(row), error: undefined };
    } catch (error) {
      return { seed: undefined, error: error instanceof Error ? error : new Error('سند عکس خوانده نشد.') };
    }
  });
  if (!result.seed)
    return (
      <Screen>
        <ErrorNotice error={result.error} what="سند ویرایش عکس" />
      </Screen>
    );
  return <ImageEditor seed={result.seed} readNotice={readNotice} generation={generation} />;
}
function ImageEditor({
  seed,
  readNotice,
  generation,
}: {
  seed: ImageEditSeed;
  readNotice: ReactNode;
  generation: number;
}) {
  const edit = useImageEdit(seed, generation);
  const { colors, spacing } = useTheme();
  const [tool, setTool] = useState<ImageTool>('view');
  const [color, setColor] = useState<ImageColor>('red');
  const [thick, setThick] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const versions = useLive(imageVersionsQuery(seed.basis.attachmentId), [seed.basis.attachmentId]);
  const shelved = useLive(imageShelvedDraftsQuery(seed.basis.attachmentId), [seed.basis.attachmentId]);
  const [comparisonSize, setComparisonSize] = useState({ width: 1, height: 1 });
  const pending = edit.document.pendingText;
  const missing = !mediaExists(edit.document.image.sourcePath);
  const canvasDisabled = edit.busy || edit.completed || edit.stale || missing;
  const disabled = canvasDisabled || edit.drawing;
  const selected = (value: ImageTool) => (tool === value ? colors.primarySoft : undefined);
  return (
    <Screen padded={false} edges={[]}>
      <ScreenOptions
        options={{
          title: 'ویرایش عکس',
          headerRight: () => (
            <Button
              label={edit.completed ? 'بستن' : 'ذخیره'}
              size="sm"
              variant="ghost"
              icon={edit.completed ? 'close' : 'checkmark'}
              disabled={!edit.completed && (disabled || !loaded)}
              loading={edit.busy}
              onPress={() => (edit.completed ? edit.close() : void edit.save())}
            />
          ),
        }}
      />
      <Column collapsable={false} gap="none" style={styles.fill}>
        <View style={{ paddingHorizontal: spacing.md }}>
          {readNotice}
          {edit.stale ? (
            <Column>
              <Text color="danger">فرم قبلی فقط برای مرور است؛ اطلاعات از بکاپ جایگزین شد.</Text>
              {pending ? <Text selectable>{pending.text}</Text> : null}
              <Button label="بستن فرم قبلی" variant="ghost" size="sm" onPress={edit.closeStale} />
            </Column>
          ) : null}
          {missing ? <Text color="danger">فایل پایهٔ عکس پیدا نشد؛ ویرایش ثبت نمی‌شود.</Text> : null}
          {edit.state.status === 'failed' ? (
            <Button label="پیش‌نویس ذخیره نشد؛ تلاش دوباره" variant="ghost" size="sm" onPress={edit.retry} />
          ) : null}
          {edit.state.status === 'failed' && !edit.stale ? (
            <Button label="مقایسه با نسخهٔ ذخیره‌شده" variant="ghost" size="sm" onPress={() => void edit.compare()} />
          ) : null}
          {edit.state.status === 'pending' || edit.state.status === 'writing' ? (
            <Text variant="tiny" color="textMuted">
              در حال ذخیرهٔ پیش‌نویس…
            </Text>
          ) : null}
          {edit.state.status === 'saved' ? (
            <Text variant="tiny" color="textMuted">
              پیش‌نویس ذخیره شد
            </Text>
          ) : null}
        </View>
        <View style={[styles.fill, { backgroundColor: mediaViewerColors.background }]}>
          <ImageEditCanvas
            document={edit.document.image}
            tool={tool}
            color={color}
            thick={thick}
            disabled={canvasDisabled}
            onChange={edit.drawImage}
            onText={edit.text}
            onLoad={() => setLoaded(true)}
            onActivity={edit.setDrawing}
          />
        </View>
        <Column gap="none" style={{ paddingHorizontal: spacing.xs, paddingBottom: spacing.xs }}>
          <Row gap="none" justify="space-around" wrap>
            {tools.map((t) => (
              <IconButton
                key={t.tool}
                icon={t.icon}
                label={t.label}
                disabled={disabled}
                background={selected(t.tool)}
                color={tool === t.tool ? colors.primary : colors.textMuted}
                onPress={() => {
                  setTool(t.tool);
                  if (t.tool === 'highlight') setColor('yellow');
                }}
              />
            ))}
            <IconButton
              icon="refresh-outline"
              label="چرخش ۹۰ درجه"
              disabled={disabled}
              onPress={() =>
                edit.changeImage({
                  ...edit.latest.current.image,
                  rotation: ((edit.latest.current.image.rotation + 1) % 4) as 0 | 1 | 2 | 3,
                })
              }
            />
          </Row>
          <Row gap="none" justify="space-around" wrap>
            {IMAGE_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`رنگ ${colorLabels[c]}`}
                accessibilityState={{ selected: color === c }}
                disabled={disabled}
                onPress={() => setColor(c)}
                style={styles.colorTouch}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: imageInk[c],
                    borderWidth: color === c ? 3 : 1,
                    borderColor: color === c ? colors.primary : colors.borderStrong,
                  }}
                />
              </Pressable>
            ))}
            <IconButton
              icon={thick ? 'remove' : 'remove-outline'}
              label={thick ? 'ضخامت زیاد؛ تغییر به کم' : 'ضخامت کم؛ تغییر به زیاد'}
              disabled={disabled}
              onPress={() => setThick(!thick)}
            />
            <IconButton
              icon="arrow-undo-outline"
              label="واگرد"
              disabled={disabled || !edit.history.undo}
              onPress={edit.undo}
            />
            <IconButton
              icon="arrow-redo-outline"
              label="ازنو"
              disabled={disabled || !edit.history.redo}
              onPress={edit.redo}
            />
          </Row>
          {tool === 'crop' ? (
            <Row justify="space-between">
              <Text variant="tiny">کادر برش را روی عکس بکشید</Text>
              <Button
                label="تمام عکس"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onPress={() =>
                  edit.changeImage({
                    ...edit.latest.current.image,
                    crop: { x: 0, y: 0, width: seed.basis.width, height: seed.basis.height },
                  })
                }
              />
            </Row>
          ) : null}
          {tool === 'text' ? (
            <Text variant="tiny" color="textMuted" style={{ paddingHorizontal: spacing.sm }}>
              روی عکس یا نوشتهٔ قبلی بزنید
            </Text>
          ) : null}
          {tool === 'erase' ? (
            <Text variant="tiny" color="textMuted" style={{ paddingHorizontal: spacing.sm }}>
              روی علامت بزنید؛ اصل عکس پاک نمی‌شود
            </Text>
          ) : null}
          <Row justify="space-between">
            <Button
              label="نسخه‌های قبلی"
              variant="ghost"
              size="sm"
              icon="time-outline"
              disabled={disabled}
              onPress={() => setHistoryOpen(true)}
            />
            <Button label="کنار گذاشتن ویرایش" variant="ghost" size="sm" disabled={disabled} onPress={edit.discard} />
          </Row>
        </Column>
      </Column>
      <PromptModal
        visible={!!pending && !edit.stale}
        title="متن روی عکس"
        value={pending?.text ?? ''}
        multiline
        maxLength={2000}
        optional={false}
        busy={disabled}
        submitLabel="ثبت روی عکس"
        onChangeText={(text) => {
          const current = edit.latest.current.pendingText;
          if (current && text.length <= 2000) edit.text({ ...current, text });
        }}
        onSubmit={() => {
          try {
            edit.applyText();
          } catch (error) {
            alertError('نوشته ثبت نشد', error);
          }
        }}
        onCancel={() => edit.text(null)}
      />
      <Modal visible={historyOpen} animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <Screen>
          <Row justify="space-between">
            <Text variant="heading">نسخه‌های عکس</Text>
            <IconButton icon="close" label="بستن نسخه‌ها" onPress={() => setHistoryOpen(false)} />
          </Row>
          <ErrorNotice
            error={versions.error ?? shelved.error}
            what="نسخه‌ها"
            onRetry={() => {
              versions.retry();
              shelved.retry();
            }}
          />
          <FlatList
            data={[
              ...(versions.data ?? []).map((row) => ({ ...row, draft: false })),
              ...(shelved.data ?? []).map((row) => ({ ...row, draft: true })),
            ]}
            keyExtractor={(row) => row.id}
            ListEmptyComponent={
              versions.data && shelved.data && !versions.error && !shelved.error ? (
                <Text>هنوز نسخه‌ای ثبت نشده است.</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Button
                label={`${item.draft ? 'پیش‌نویس قبلی' : item.revision === 0 ? 'عکس بدون ویرایش' : `نسخهٔ ${toPersianDigits(String(item.revision))}`} · ${formatJalaliDateTime(item.createdAt)}`}
                variant="ghost"
                disabled={disabled}
                onPress={() => {
                  void withDatasetWrite(generation, async () => {
                    const draft = item.draft ? decodeImageDraft(item.body) : null;
                    edit.changeImage(draft ? draft.image : decodeImageDocument(item.body));
                    if (draft?.pendingText) edit.text(draft.pendingText);
                    setHistoryOpen(false);
                  }).catch((error) => alertError('نسخه بارگذاری نشد', error));
                }}
              />
            )}
          />
        </Screen>
      </Modal>
      <Modal visible={!!edit.comparison} animationType="slide" onRequestClose={edit.closeComparison}>
        <Screen padded={false}>
          <Row justify="space-between" style={{ paddingHorizontal: spacing.md }}>
            <Text variant="heading">نسخهٔ ذخیره‌شده</Text>
            <IconButton icon="close" label="بستن مقایسه" disabled={edit.busy} onPress={edit.closeComparison} />
          </Row>
          <View
            style={[styles.fill, { backgroundColor: mediaViewerColors.background }]}
            onLayout={(e) =>
              setComparisonSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
            }
          >
            {edit.comparison ? (
              <AnnotatedImage
                document={edit.comparison.document.image}
                uri={mediaUri(edit.comparison.document.image.sourcePath)!}
                width={comparisonSize.width}
                height={comparisonSize.height}
              />
            ) : null}
          </View>
          {edit.comparison?.document.pendingText ? (
            <Text selectable>{edit.comparison.document.pendingText.text}</Text>
          ) : null}
          <Text variant="caption" style={{ paddingHorizontal: spacing.md }}>
            هر دو پیش‌نویس نگهداری می‌شوند؛ انتخاب شما تا زدن ذخیره منتشر نمی‌شود.
          </Text>
          <Row wrap justify="center">
            <Button label="حفظ ویرایش من" disabled={edit.busy} onPress={() => void edit.resolve('local')} />
            <Button
              label="بارگذاری ذخیره‌شده"
              variant="ghost"
              disabled={edit.busy}
              onPress={() => void edit.resolve('stored')}
            />
          </Row>
        </Screen>
      </Modal>
    </Screen>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  colorTouch: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});
