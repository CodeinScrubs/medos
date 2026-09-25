import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import { alertError } from '@/components/feedback';
import { Badge, Button, Card, Column, EmptyState, Row, Segmented, Text } from '@/components/ui';
import type { LabPanel, LabValue } from '@/db/schema';
import { useLive } from '@/db/use-live';
import { askPhotoSource, pickPhotos, storeAndAttach } from '@/features/attachments/capture';
import { patientMediaQuery } from '@/features/attachments/queries';
import { formatJalali, formatJalaliDateTime, formatTime, toJalali } from '@/lib/jalali';
import { hasPersianLetters, ltrIsolate, toPersianDigits } from '@/lib/persian';
import { mediaUri } from '@/platform/media';
import { useTheme } from '@/theme';

import { FLAG_LABEL, flagTone } from './flags';
import { ANALYTE_ORDER } from './presets';
import { createLabPanel, deleteLabPanel, patientLabPanelsQuery, patientLabValuesQuery } from './queries';

const ROW_H = 38;
const NAME_W = 92;
const COL_W = 70;

type LabsView = 'flowsheet' | 'panels';

export function LabsTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { spacing } = useTheme();
  const [view, setView] = useState<LabsView>('flowsheet');
  const [capturing, setCapturing] = useState(false);

  const { data: values, error } = useLive(patientLabValuesQuery(patientId), [patientId]);
  const { data: panels } = useLive(patientLabPanelsQuery(patientId), [patientId]);
  const { data: sheets } = useLive(patientMediaQuery(patientId, ['lab_sheet']), [patientId]);

  const hasAnything = (panels?.length ?? 0) > 0;

  /**
   * Snap the lab sheet now, type the values later. The panel is only created
   * once a photo actually exists, so cancelling the camera leaves nothing behind.
   */
  function photoPanel() {
    askPhotoSource(async (source) => {
      const assets = await pickPhotos(source, { crop: true });
      if (!assets) return;
      setCapturing(true);
      try {
        const panelId = await createLabPanel({
          patientId,
          collectedAt: new Date(),
          name: 'عکس برگه',
          source: 'photo',
          values: [],
        });
        await storeAndAttach(assets, { entityType: 'lab_panel', entityId: panelId, patientId, kind: 'lab_sheet' });
      } catch (e) {
        alertError('ذخیره نشد', e);
      } finally {
        setCapturing(false);
      }
    });
  }

  return (
    <Column gap="sm" style={{ marginTop: spacing.lg }}>
      <ErrorNotice error={error} what="آزمایش‌ها" />
      <Row gap="sm">
        <View style={styles.grow}>
          <Button
            label="ثبت آزمایش"
            icon="add"
            variant="secondary"
            full
            onPress={() => router.push({ pathname: '/patient/[id]/lab', params: { id: patientId } })}
          />
        </View>
        <View style={styles.grow}>
          <Button
            label="عکس برگه"
            icon="camera-outline"
            variant="ghost"
            full
            loading={capturing}
            onPress={photoPanel}
          />
        </View>
      </Row>

      {!hasAnything ? (
        <EmptyState
          icon="flask-outline"
          title="آزمایشی ثبت نشده"
          description="مقادیر را دستی یا با چسباندن از اکسل وارد کنید، یا از برگه عکس بگیرید و بعداً مقادیر را از روی عکس بنویسید."
        />
      ) : (
        <>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'flowsheet', label: 'جدول روند' },
              { value: 'panels', label: 'نوبت‌ها' },
            ]}
          />
          {view === 'flowsheet' ? (
            values == null ? (
              <ActivityIndicator />
            ) : (
              <Flowsheet patientId={patientId} rows={values} />
            )
          ) : (
            <PanelList patientId={patientId} panels={panels ?? []} values={values ?? []} sheets={sheets ?? []} />
          )}
        </>
      )}
    </Column>
  );
}

/* -------------------------------------------------------------------------- */
/*  Flowsheet: analytes down, draws across, newest first                        */
/* -------------------------------------------------------------------------- */

type ValueRow = { value: LabValue; collectedAt: Date; panelId: string };

function Flowsheet({ patientId, rows }: { patientId: string; rows: ValueRow[] }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const { columns, analytes, cell } = useMemo(() => {
    const colMap = new Map<string, Date>();
    const nameMap = new Map<string, string>();
    const cells = new Map<string, LabValue>();

    for (const r of rows) {
      colMap.set(r.panelId, r.collectedAt);
      const key = r.value.analyte.toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, r.value.analyte);
      cells.set(`${key}|${r.panelId}`, r.value);
    }

    // Newest draw first: on a phone, the latest value belongs next to the name.
    const cols = [...colMap.entries()]
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([panelId, at]) => ({ panelId, at }));

    const names = [...nameMap.entries()]
      .sort((a, b) => {
        const oa = ANALYTE_ORDER.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
        const ob = ANALYTE_ORDER.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
        return oa - ob || a[0].localeCompare(b[0]);
      })
      .map(([key, label]) => ({ key, label }));

    return { columns: cols, analytes: names, cell: (k: string, p: string) => cells.get(`${k}|${p}`) };
  }, [rows]);

  if (analytes.length === 0) {
    return (
      <Card tone="alt">
        <Text variant="caption" color="textFaint">
          هنوز مقداری وارد نشده؛ فقط عکس برگه ثبت شده است. از «نوبت‌ها» وارد برگه شوید و مقادیر را بنویسید.
        </Text>
      </Card>
    );
  }

  const colorFor = (flag: LabValue['flag']) => {
    const tone = flagTone(flag);
    return tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'info'
          ? colors.info
          : colors.text;
  };

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {/* The flowsheet is an LTR table regardless of the app's direction. */}
      <View style={styles.ltr}>
        <View style={{ width: NAME_W, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
          <View style={[styles.headerCell, { height: ROW_H + 8, backgroundColor: colors.surfaceAlt }]} />
          {analytes.map((a, i) => (
            <Pressable
              key={a.key}
              onPress={() =>
                router.push({ pathname: '/patient/[id]/trend', params: { id: patientId, analyte: a.label } })
              }
              style={({ pressed }) => [
                styles.nameCell,
                {
                  height: ROW_H,
                  paddingHorizontal: spacing.sm,
                  backgroundColor: pressed ? colors.primarySoft : i % 2 ? colors.surfaceAlt : colors.surface,
                },
              ]}
            >
              <Text variant="captionStrong" ltr numberOfLines={1} color="primary">
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.row}>
              {columns.map((c) => (
                <View
                  key={c.panelId}
                  style={[styles.headerCell, { width: COL_W, height: ROW_H + 8, backgroundColor: colors.surfaceAlt }]}
                >
                  <Text variant="tiny" color="textMuted" align="center">
                    {(() => {
                      const { jm, jd } = toJalali(c.at);
                      return toPersianDigits(`${jm}/${jd}`);
                    })()}
                  </Text>
                  <Text variant="tiny" color="textFaint" align="center">
                    {formatTime(c.at)}
                  </Text>
                </View>
              ))}
            </View>
            {analytes.map((a, i) => (
              <View key={a.key} style={styles.row}>
                {columns.map((c) => {
                  const v = cell(a.key, c.panelId);
                  const color = colorFor(v?.flag ?? null);
                  return (
                    <View
                      key={c.panelId}
                      style={[
                        styles.valueCell,
                        { width: COL_W, height: ROW_H, backgroundColor: i % 2 ? colors.surfaceAlt : colors.surface },
                      ]}
                    >
                      {v ? (
                        <Text numeric numberOfLines={1} align="center" style={{ color, fontSize: 13 }}>
                          {ltrIsolate(v.value + (v.flag && v.flag !== 'normal' ? ` ${FLAG_LABEL[v.flag]}` : ''))}
                        </Text>
                      ) : (
                        <Text variant="tiny" color="textFaint" align="center">
                          ·
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panel list                                                                  */
/* -------------------------------------------------------------------------- */

function PanelList({
  patientId,
  panels,
  values,
  sheets,
}: {
  patientId: string;
  panels: LabPanel[];
  values: ValueRow[];
  sheets: { id: string; entityId: string; thumbnailPath: string | null; relativePath: string }[];
}) {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  const countByPanel = useMemo(() => {
    const m = new Map<string, { total: number; flagged: number }>();
    for (const v of values) {
      const c = m.get(v.panelId) ?? { total: 0, flagged: 0 };
      c.total += 1;
      if (v.value.flag && v.value.flag !== 'normal') c.flagged += 1;
      m.set(v.panelId, c);
    }
    return m;
  }, [values]);

  const sheetByPanel = useMemo(() => {
    const m = new Map<string, (typeof sheets)[number]>();
    for (const s of sheets) if (!m.has(s.entityId)) m.set(s.entityId, s);
    return m;
  }, [sheets]);

  return (
    <Column gap="sm">
      {panels.map((p) => {
        const counts = countByPanel.get(p.id);
        const sheet = sheetByPanel.get(p.id);
        return (
          <Pressable
            key={p.id}
            onPress={() => router.push({ pathname: '/patient/[id]/lab', params: { id: patientId, panelId: p.id } })}
            onLongPress={() =>
              Alert.alert('حذف این نوبت آزمایش؟', formatJalaliDateTime(p.collectedAt), [
                { text: 'انصراف', style: 'cancel' },
                {
                  text: 'حذف',
                  style: 'destructive',
                  onPress: () => void deleteLabPanel(p.id).catch((e) => alertError('حذف نشد', e)),
                },
              ])
            }
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Card>
              <Row gap="md" align="flex-start">
                {sheet ? (
                  <Image
                    source={{ uri: mediaUri(sheet.thumbnailPath ?? sheet.relativePath) ?? undefined }}
                    style={{ width: 56, height: 72, borderRadius: radii.sm, backgroundColor: colors.surfaceAlt }}
                    contentFit="cover"
                  />
                ) : null}
                <Column gap="xxs" style={styles.grow}>
                  <Text variant="subheading" ltr={!hasPersianLetters(p.name)}>
                    {p.name || 'آزمایش'}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {formatJalali(p.collectedAt)} • {formatTime(p.collectedAt)}
                    {p.labName ? ` • ${p.labName}` : ''}
                  </Text>
                  <Row gap="xs" wrap style={{ marginTop: spacing.xxs }}>
                    {counts ? (
                      <Badge label={`${toPersianDigits(counts.total)} مقدار`} tone="neutral" />
                    ) : (
                      <Badge label="مقادیر هنوز وارد نشده" tone="warning" icon="create-outline" />
                    )}
                    {counts && counts.flagged > 0 ? (
                      <Badge label={`${toPersianDigits(counts.flagged)} خارج از محدوده`} tone="warning" />
                    ) : null}
                    {p.source === 'photo' ? <Badge label="از عکس" tone="info" icon="camera-outline" /> : null}
                  </Row>
                </Column>
              </Row>
            </Card>
          </Pressable>
        );
      })}
    </Column>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  ltr: { flexDirection: 'row', direction: 'ltr' },
  row: { flexDirection: 'row' },
  headerCell: { alignItems: 'center', justifyContent: 'center' },
  nameCell: { justifyContent: 'center' },
  valueCell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
