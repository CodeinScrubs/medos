import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { alertError, notify } from '@/components/feedback';
import { Badge, Button, Card, Column, IconButton, Row, Text } from '@/components/ui';
import type { Consultation, Doctor } from '@/db/schema';
import { callNumber, copyText, sendSms, sendWhatsApp } from '@/features/doctors/actions';
import { doctorDisplayName } from '@/features/doctors/logic';
import { useTheme } from '@/theme';

import { formatConsultMessage } from './logic';
import { markConsultRequested } from './queries';

export type ConsultShareTarget = {
  consult: Consultation;
  doctor: Doctor | null;
  patientName?: string | null;
  location?: string | null;
};

export function ConsultShareModal({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: ConsultShareTarget | null;
  onClose: () => void;
}) {
  const { colors, radii, spacing, shadows } = useTheme();

  if (!visible || !target) return null;

  const { consult, doctor, patientName, location } = target;
  const doctorName = doctor ? doctorDisplayName(doctor) : null;
  const phone = doctor?.phone || doctor?.phoneAlt || null;
  const whatsapp = doctor?.whatsapp || phone;

  const message = formatConsultMessage({
    doctorName,
    patientName,
    location,
    specialty: consult.specialty,
    reason: consult.reason,
    urgency: consult.urgency,
  });

  async function handleAdvanceOnContact() {
    if (consult.status === 'pending') {
      try {
        await markConsultRequested(consult.id);
        notify('کانسالت ارسال شد', 'وضعیت به «منتظر پاسخ» به‌روزرسانی شد.');
      } catch (e) {
        alertError('تغییر وضعیت ثبت نشد', e);
      }
    }
    onClose();
  }

  async function handleCall() {
    if (!phone) return;
    const ok = await callNumber(phone);
    if (ok) {
      await handleAdvanceOnContact();
    }
  }

  async function handleSms() {
    if (!phone) return;
    const ok = await sendSms(phone, message);
    if (ok) {
      await handleAdvanceOnContact();
    }
  }

  async function handleWhatsApp() {
    if (!whatsapp) return;
    const ok = await sendWhatsApp(whatsapp, message);
    if (ok) {
      await handleAdvanceOnContact();
    }
  }

  async function handleCopy() {
    await copyText(message);
    notify('کپی شد', 'متن درخواست مشاوره در کلیپ‌بورد کپی شد.');
    await handleAdvanceOnContact();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[styles.card, shadows.lg, { backgroundColor: colors.surface, borderRadius: radii.xl }]}
        >
          <Column gap="md" style={{ padding: spacing.lg }}>
            <Row justify="space-between" align="center">
              <Row gap="xs" align="center">
                <Text variant="heading">ارسال و ارجاع مشاوره</Text>
                {consult.urgency !== 'routine' ? (
                  <Badge
                    label={consult.urgency === 'emergency' ? 'اورژانسی' : 'فوری'}
                    tone={consult.urgency === 'emergency' ? 'danger' : 'warning'}
                  />
                ) : null}
              </Row>
              <IconButton icon="close" label="بستن" onPress={onClose} />
            </Row>

            {doctor ? (
              <Card tone="alt">
                <Column gap="xxs">
                  <Text variant="bodyStrong">{doctorName}</Text>
                  {doctor.specialtyText || consult.specialty ? (
                    <Text variant="caption" color="textMuted">
                      {doctor.specialtyText || consult.specialty}
                    </Text>
                  ) : null}
                  {phone ? (
                    <Text numeric variant="tiny" color="textMuted">
                      {phone}
                    </Text>
                  ) : null}
                </Column>
              </Card>
            ) : null}

            <Column gap="xs">
              <Text variant="captionStrong" color="textMuted">
                پیش‌نمایش پیام بالینی:
              </Text>
              <Card tone="alt" style={styles.previewBox}>
                <ScrollView style={styles.scrollArea}>
                  <Text variant="caption" style={styles.messageText}>
                    {message}
                  </Text>
                </ScrollView>
              </Card>
            </Column>

            <Column gap="sm">
              <Row gap="sm" wrap>
                {phone ? (
                  <>
                    <View style={styles.flex}>
                      <Button
                        label="ارسال پیامک"
                        icon="chatbubble-outline"
                        variant="primary"
                        size="md"
                        onPress={() => void handleSms()}
                        full
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        label="تماس تلفنی"
                        icon="call-outline"
                        variant="secondary"
                        size="md"
                        onPress={() => void handleCall()}
                        full
                      />
                    </View>
                  </>
                ) : null}
              </Row>

              <Row gap="sm" wrap>
                {whatsapp ? (
                  <View style={styles.flex}>
                    <Button
                      label="واتس‌اپ"
                      icon="logo-whatsapp"
                      variant="secondary"
                      size="md"
                      onPress={() => void handleWhatsApp()}
                      full
                    />
                  </View>
                ) : null}
                <View style={styles.flex}>
                  <Button
                    label="کپی متن"
                    icon="copy-outline"
                    variant="ghost"
                    size="md"
                    onPress={() => void handleCopy()}
                    full
                  />
                </View>
              </Row>
            </Column>
          </Column>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 120 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 500, alignSelf: 'center', maxHeight: '90%' },
  previewBox: { maxHeight: 180, padding: 12 },
  scrollArea: { maxHeight: 156 },
  messageText: { lineHeight: 20 },
});
