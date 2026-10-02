export type ConsultMessageParams = {
  doctorName?: string | null;
  patientName?: string | null;
  location?: string | null;
  specialty?: string | null;
  reason: string;
  urgency: 'routine' | 'urgent' | 'emergency';
};

/**
 * Builds a standardized, courteous clinical referral message for SMS, WhatsApp,
 * or clipboard sharing when requesting a medical consultation in hospital practice.
 */
export function formatConsultMessage(params: ConsultMessageParams): string {
  const urgencyLabel = params.urgency === 'emergency' ? 'اورژانسی' : params.urgency === 'urgent' ? 'فوری' : 'روتین';

  const lines: string[] = [];

  if (params.doctorName?.trim()) {
    lines.push(`سلام و احترام خدمت ${params.doctorName.trim()}`);
  } else {
    lines.push('سلام و احترام');
  }

  lines.push(`درخواست مشاوره پزشکی (${urgencyLabel})`);

  if (params.specialty?.trim()) {
    lines.push(`تخصص: ${params.specialty.trim()}`);
  }

  if (params.patientName?.trim()) {
    lines.push(`بیمار: ${params.patientName.trim()}`);
  }

  if (params.location?.trim()) {
    lines.push(`بخش/محل بستری: ${params.location.trim()}`);
  }

  lines.push('');
  lines.push('علت مشاوره:');
  lines.push(params.reason.trim());

  lines.push('');
  lines.push('با تشکر از همکاری و راهنمایی شما.');

  return lines.join('\n');
}
