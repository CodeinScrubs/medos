import { describe, expect, it } from '@jest/globals';

import { formatConsultMessage } from './logic';

describe('formatConsultMessage', () => {
  it('formats full consult message with doctor, patient, location, and reason', () => {
    const msg = formatConsultMessage({
      doctorName: 'استاد خانم دکتر رسایی',
      patientName: 'سارا محمودی',
      location: 'بخش جراحی، تخت ۱',
      specialty: 'نفرولوژی',
      reason: 'افزایش ناگهانی کراتینین به ۳.۴ و کاهش برون‌ده ادراری',
      urgency: 'urgent',
    });

    expect(msg).toContain('سلام و احترام خدمت استاد خانم دکتر رسایی');
    expect(msg).toContain('درخواست مشاوره پزشکی (فوری)');
    expect(msg).toContain('تخصص: نفرولوژی');
    expect(msg).toContain('بیمار: سارا محمودی');
    expect(msg).toContain('بخش/محل بستری: بخش جراحی، تخت ۱');
    expect(msg).toContain('افزایش ناگهانی کراتینین به ۳.۴ و کاهش برون‌ده ادراری');
    expect(msg).toContain('با تشکر از همکاری و راهنمایی شما.');
  });

  it('formats emergency consult message without specific doctor', () => {
    const msg = formatConsultMessage({
      patientName: 'علی رضایی',
      specialty: 'قلب و عروق',
      reason: 'افت فشار خون و تغییرات قطعه ST',
      urgency: 'emergency',
    });

    expect(msg).toContain('سلام و احترام\nدرخواست مشاوره پزشکی (اورژانسی)');
    expect(msg).toContain('تخصص: قلب و عروق');
    expect(msg).toContain('بیمار: علی رضایی');
    expect(msg).not.toContain('بخش/محل بستری');
  });

  it('formats routine consult message properly', () => {
    const msg = formatConsultMessage({
      reason: 'تنظیم دوز انسولین قبل از ترخیص',
      urgency: 'routine',
    });

    expect(msg).toContain('درخواست مشاوره پزشکی (روتین)');
    expect(msg).toContain('تنظیم دوز انسولین قبل از ترخیص');
  });
});
