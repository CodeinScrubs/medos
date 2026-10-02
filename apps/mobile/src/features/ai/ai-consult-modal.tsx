import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Share, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Button, Card, Column, Divider, IconButton, Input, Row, Segmented, Text, Toggle } from '@/components/ui';
import { useTheme } from '@/theme';

import { buildPatientDossier, type DossierData } from './dossier';
import { parseAiPlan, type ParsedAiPlan } from './parser';
import { PlanStagingModal } from './plan-staging-modal';
import { fetchDossierData } from './queries';

export function AiConsultModal({
  visible,
  patientId,
  onClose,
  onRefresh,
}: {
  visible: boolean;
  patientId: string;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const { colors, radii, spacing } = useTheme();

  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [deidentify, setDeidentify] = useState(true);
  const [dossierData, setDossierData] = useState<DossierData | null>(null);
  const [inputText, setInputText] = useState('');
  const [stagedPlan, setStagedPlan] = useState<ParsedAiPlan | null>(null);
  const [stagingOpen, setStagingOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let current = true;
    void fetchDossierData(patientId)
      .then((data) => {
        if (current) setDossierData(data);
      })
      .catch((e) => {
        if (current) alertError('بارگذاری پرونده ناموفق بود', e);
      });
    return () => {
      current = false;
    };
  }, [visible, patientId]);

  const loading = visible && !dossierData;

  const dossierText = dossierData ? buildPatientDossier(dossierData, { deidentify }) : '';

  const handleCopyDossier = async () => {
    if (!dossierText) return;
    await Clipboard.setStringAsync(dossierText);
    notify('پرونده بالینی کپی شد', 'متن پرونده را در چت‌بات هوش مصنوعی (ChatGPT / Claude / Gemini) Paste کنید.');
  };

  const handleShareDossier = async () => {
    if (!dossierText) return;
    try {
      await Share.share({ message: dossierText, title: 'خلاصه پرونده بالینی جهت مشاوره هوش مصنوعی' });
    } catch {
      // Ignored
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setInputText(text);
    } catch {
      // Ignored
    }
  };

  const handleProcessInput = () => {
    if (!inputText.trim()) {
      notify('متنی وارد نشده است', 'پاسخ هوش مصنوعی را در کادر وارد یا پیست کنید.');
      return;
    }
    const parsed = parseAiPlan(inputText);
    setStagedPlan(parsed);
    setStagingOpen(true);
  };

  return (
    <>
      <Modal
        visible={visible && !stagingOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <Row align="center" justify="space-between" style={[styles.header, { borderBottomColor: colors.border }]}>
            <Column gap="none">
              <Row gap="xs" align="center">
                <Ionicons name="sparkles" size={20} color={colors.primary} />
                <Text variant="heading">مشاوره بالینی با هوش مصنوعی</Text>
              </Row>
              <Text variant="tiny" color="textMuted">
                دستیار هوشمند تصمیم‌گیری بالینی (Clinical AI Co-Pilot)
              </Text>
            </Column>
            <IconButton icon="close" label="بستن" onPress={onClose} />
          </Row>

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <Segmented
              value={tab}
              onChange={(t) => setTab(t as 'export' | 'import')}
              options={[
                { value: 'export', label: 'صدور پرونده (Export)' },
                { value: 'import', label: 'ورود برنامه (Import)' },
              ]}
            />
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
                در حال تنظیم پرونده جامع بالینی…
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge * 2 }}>
              {tab === 'export' ? (
                <Column gap="md">
                  <Card tone="alt">
                    <Row align="center" justify="space-between">
                      <Column gap="none" style={{ flex: 1 }}>
                        <Text variant="captionStrong">نام‌زدایی و حفظ رازداری (De-identification)</Text>
                        <Text variant="tiny" color="textMuted">
                          جایگزینی نام، کدملی و آدرس با شناسه بالینی جهت ارسال امن به مدل‌های ابری
                        </Text>
                      </Column>
                      <Toggle value={deidentify} onChange={setDeidentify} label="حفظ رازداری" />
                    </Row>
                  </Card>

                  <Card>
                    <Column gap="xs">
                      <Row justify="space-between" align="center">
                        <Text variant="captionStrong">پیش‌نمایش دوسیه بالینی (SBAR Format)</Text>
                        <Text variant="tiny" color="textFaint">
                          {dossierText.length} کاراکتر
                        </Text>
                      </Row>
                      <Divider />
                      <Text
                        selectable
                        variant="caption"
                        style={[
                          styles.previewText,
                          {
                            backgroundColor: colors.surfaceAlt,
                            borderRadius: radii.md,
                            padding: spacing.sm,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {dossierText}
                      </Text>
                    </Column>
                  </Card>

                  <Row gap="sm">
                    <View style={{ flex: 1 }}>
                      <Button label="کپی در کلیپ‌بورد" icon="copy-outline" onPress={handleCopyDossier} full />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="اشتراک‌گذاری"
                        icon="share-social-outline"
                        variant="secondary"
                        onPress={handleShareDossier}
                        full
                      />
                    </View>
                  </Row>

                  <Card tone="alt">
                    <Row gap="sm" align="flex-start">
                      <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
                      <Column gap="none" style={{ flex: 1 }}>
                        <Text variant="captionStrong">راهنمای استفاده:</Text>
                        <Text variant="tiny" color="textMuted">
                          ۱. دکمه «کپی در کلیپ‌بورد» را بزنید.
                        </Text>
                        <Text variant="tiny" color="textMuted">
                          ۲. در ChatGPT یا Claude پیست کنید و سؤالات درمانی‌تان را بپرسید.
                        </Text>
                        <Text variant="tiny" color="textMuted">
                          ۳. پاسخ مدل را کپی کرده و در تب «ورود برنامه» ثبت کنید.
                        </Text>
                      </Column>
                    </Row>
                  </Card>
                </Column>
              ) : (
                <Column gap="md">
                  <Card>
                    <Column gap="sm">
                      <Row justify="space-between" align="center">
                        <Text variant="captionStrong">چسباندن پاسخ دریافتی از هوش مصنوعی</Text>
                        <Button
                          label="خواندن از کلیپ‌بورد"
                          icon="clipboard-outline"
                          size="sm"
                          variant="ghost"
                          onPress={handlePasteClipboard}
                        />
                      </Row>
                      <Divider />
                      <Input
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        placeholder="متن کامل پاسخ یا بلوک ```medos-plan را اینجا Paste کنید..."
                        containerStyle={{ minHeight: 180 }}
                      />
                    </Column>
                  </Card>

                  <Button
                    label="بررسی و خطایابی برنامه (Review & Stage)"
                    icon="arrow-forward-circle-outline"
                    onPress={handleProcessInput}
                    full
                  />

                  <Card tone="alt">
                    <Row gap="sm" align="flex-start">
                      <Ionicons name="shield-outline" size={20} color={colors.primary} />
                      <Column gap="none" style={{ flex: 1 }}>
                        <Text variant="captionStrong">گیت بازبینی بالینی پزشک (Human-in-the-Loop):</Text>
                        <Text variant="tiny" color="textMuted">
                          هیچ برنامه‌ای مستقیماً وارد پرونده نمی‌شود. در مرحله بعد می‌توانید داروها، دوزها، آزمایش‌ها و
                          تایپوها را اصلاح و تأیید کنید.
                        </Text>
                      </Column>
                    </Row>
                  </Card>
                </Column>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Physician Staging Gate */}
      <PlanStagingModal
        visible={stagingOpen}
        patientId={patientId}
        plan={stagedPlan}
        onClose={() => setStagingOpen(false)}
        onCommitted={() => {
          setStagingOpen(false);
          setInputText('');
          onClose();
          onRefresh?.();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  previewText: { maxHeight: 320, fontFamily: 'monospace', fontSize: 11, borderWidth: StyleSheet.hairlineWidth },
});
