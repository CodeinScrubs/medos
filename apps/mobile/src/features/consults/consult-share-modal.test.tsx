import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { notify } from '@/components/feedback';
import { Button } from '@/components/ui';
import type { Consultation, Doctor } from '@/db/schema';
import * as doctorActions from '@/features/doctors/actions';

import { ConsultShareModal, type ConsultShareTarget } from './consult-share-modal';
import * as queries from './queries';

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicon');
jest.mock('@/components/feedback', () => ({
  notify: jest.fn(),
  alertError: jest.fn(),
}));
jest.mock('@/features/doctors/actions', () => ({
  callNumber: jest.fn(),
  copyText: jest.fn(),
  sendSms: jest.fn(),
  sendWhatsApp: jest.fn(),
}));
jest.mock('./queries', () => ({
  markConsultRequested: jest.fn(),
}));
jest.mock('@/components/ui', () => ({
  Badge: 'Badge',
  Button: 'Button',
  Card: 'Card',
  Column: 'Column',
  IconButton: 'IconButton',
  Row: 'Row',
  Text: 'Text',
}));

const mockConsult: Consultation = {
  id: 'c1',
  patientId: 'p1',
  encounterId: 'e1',
  doctorId: 'd1',
  specialty: 'نفرولوژی',
  reason: 'افزایش کراتینین به ۳.۴',
  urgency: 'urgent',
  status: 'pending',
  requestedAt: null,
  respondedAt: null,
  response: null,
  followUpInstruction: null,
  draftResponse: '',
  draftInstruction: '',
  draftRevision: 0,
  noteId: null,
  searchText: 'نفرولوژی',
  createdAt: new Date('2026-10-02T10:00:00Z'),
  updatedAt: new Date('2026-10-02T10:00:00Z'),
  deletedAt: null,
};

const mockDoctor: Doctor = {
  id: 'd1',
  firstName: 'زهرا',
  lastName: 'رسایی',
  title: 'استاد',
  academicRank: 'دانشیار',
  specialtyId: null,
  subspecialtyId: null,
  specialtyText: 'فوق تخصص کلیه و فشار خون',
  relationship: 'professor',
  phone: '09171112233',
  phoneAlt: null,
  whatsapp: '09171112233',
  telegram: null,
  email: null,
  extension: '5546',
  primaryPlaceId: null,
  officeAddress: 'شیراز، خیابان زند',
  officeLat: null,
  officeLng: null,
  officeHours: null,
  officePhone: null,
  acceptsReferrals: true,
  referralNotes: null,
  visitFee: null,
  insurances: [],
  notes: null,
  tags: null,
  starred: false,
  photoUri: null,
  searchText: 'زهرا رسایی',
  createdAt: new Date('2026-10-02T10:00:00Z'),
  updatedAt: new Date('2026-10-02T10:00:00Z'),
  deletedAt: null,
};

let tree: ReactTestRenderer | undefined;

function render(target: ConsultShareTarget | null, onClose = jest.fn()) {
  act(() => {
    tree = create(<ConsultShareModal visible={Boolean(target)} target={target} onClose={onClose} />);
  });
}

describe('ConsultShareModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doctorActions.sendSms as jest.Mock).mockResolvedValue(true as never);
    (doctorActions.callNumber as jest.Mock).mockResolvedValue(true as never);
    (doctorActions.sendWhatsApp as jest.Mock).mockResolvedValue(true as never);
    (doctorActions.copyText as jest.Mock).mockResolvedValue(undefined as never);
    (queries.markConsultRequested as jest.Mock).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
  });

  it('renders modal with doctor, message preview, and contact buttons', () => {
    const onClose = jest.fn();
    render(
      {
        consult: mockConsult,
        doctor: mockDoctor,
        patientName: 'سارا محمودی',
        location: 'بخش جراحی، تخت ۱',
      },
      onClose,
    );

    const buttons = tree!.root.findAllByType(Button);
    const labels = buttons.map((b) => b.props.label);
    expect(labels).toContain('ارسال پیامک');
    expect(labels).toContain('تماس تلفنی');
    expect(labels).toContain('واتس‌اپ');
    expect(labels).toContain('کپی متن');
  });

  it('sends SMS and advances pending consult to requested', async () => {
    const onClose = jest.fn();
    render(
      {
        consult: mockConsult,
        doctor: mockDoctor,
        patientName: 'سارا محمودی',
        location: 'بخش جراحی، تخت ۱',
      },
      onClose,
    );

    const smsBtn = tree!.root.findAllByType(Button).find((b) => b.props.label === 'ارسال پیامک')!;
    await act(async () => {
      smsBtn.props.onPress();
    });

    expect(doctorActions.sendSms).toHaveBeenCalledWith(
      '09171112233',
      expect.stringContaining('سلام و احترام خدمت استاد زهرا رسایی'),
    );
    expect(queries.markConsultRequested).toHaveBeenCalledWith('c1');
    expect(notify).toHaveBeenCalledWith('کانسالت ارسال شد', expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it('copies message text to clipboard and notifies user', async () => {
    const onClose = jest.fn();
    render(
      {
        consult: mockConsult,
        doctor: mockDoctor,
        patientName: 'سارا محمودی',
      },
      onClose,
    );

    const copyBtn = tree!.root.findAllByType(Button).find((b) => b.props.label === 'کپی متن')!;
    await act(async () => {
      copyBtn.props.onPress();
    });

    expect(doctorActions.copyText).toHaveBeenCalledWith(expect.stringContaining('سارا محمودی'));
    expect(queries.markConsultRequested).toHaveBeenCalledWith('c1');
    expect(notify).toHaveBeenCalledWith('کپی شد و ارسال ثبت شد', expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });
});
