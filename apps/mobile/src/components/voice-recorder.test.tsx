import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { SaveGroup } from '@/lib/save-before-leave';

import { VoiceRecorder, type Recording } from './voice-recorder';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
let mockScope: { group: SaveGroup };
const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
const mockPlayback = jest.fn<() => Promise<void>>();
const mockRecorder = {
  isRecording: false,
  uri: 'file:///synthetic.m4a',
  currentTime: 1.2,
  prepareToRecordAsync: jest.fn<() => Promise<void>>(),
  record: jest.fn<() => void>(),
  stop: jest.fn<() => Promise<void>>(),
};
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: () => mockPermission(),
  setAudioModeAsync: async () => {},
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ isRecording: mockRecorder.isRecording, durationMillis: 1000 }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: async () => {},
  notificationAsync: async () => {},
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/platform/audio', () => ({ prepareAudioForPlayback: () => mockPlayback() }));
jest.mock('@/components/autosave-scope', () => ({ useAutosaveScope: () => mockScope }));
jest.mock('@/components/feedback', () => ({ alertError: jest.fn(), notify: jest.fn() }));
jest.mock('@/components/ui', () => ({ Row: 'Row', Text: 'Text' }));
jest.mock('@/theme', () => ({ MIN_TOUCH: 48, useTheme: () => ({ colors: {}, spacing: {}, radii: {} }) }));

let tree: ReactTestRenderer;
const stored = jest.fn<(recording: Recording) => Promise<void>>();
const saved = jest.fn<() => void>();
const button = (label: string) => {
  const found = tree.root.findAll(
    (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  )[0];
  if (!found) throw new Error(`Missing ${label}: ${JSON.stringify(tree.toJSON())}`);
  return found;
};
async function settle() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
    await settle();
  });
  // The native hook polls outside React's batched button handler.
  await act(async () => {
    tree.update(<VoiceRecorder onRecorded={stored} onSaved={saved} />);
  });
}
beforeEach(async () => {
  mockScope = { group: new SaveGroup() };
  mockPermission.mockReset().mockResolvedValue({ granted: true });
  mockPlayback.mockReset().mockResolvedValue(undefined);
  mockRecorder.isRecording = false;
  mockRecorder.uri = 'file:///synthetic.m4a';
  mockRecorder.currentTime = 1.2;
  mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockRecorder.record.mockReset().mockImplementation(() => {
    mockRecorder.isRecording = true;
  });
  mockRecorder.stop.mockReset().mockImplementation(async () => {
    mockRecorder.isRecording = false;
  });
  stored.mockReset().mockResolvedValue(undefined);
  saved.mockClear();
  jest.mocked(alertError).mockClear();
  await act(async () => {
    tree = create(<VoiceRecorder onRecorded={stored} onSaved={saved} />);
  });
});
afterEach(async () => {
  await act(async () => {
    tree.unmount();
    await settle();
  });
});

describe('recorder acknowledgement and screen exit', () => {
  it('retains the same stopped recording through failed handoff and blocks exit until retry succeeds', async () => {
    stored.mockRejectedValue(new Error('Synthetic SQL failure'));
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(button('تلاش دوباره برای ذخیرهٔ وویس')).toBeDefined();
    const leave = jest.fn<() => void>();
    await act(async () => {
      expect(await mockScope.group.perform(leave)).toBe('unsaved');
    });
    expect(leave).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    stored.mockResolvedValue(undefined);
    await press('تلاش دوباره برای ذخیرهٔ وویس');
    expect(stored).toHaveBeenCalledTimes(3);
    expect(stored.mock.calls[1]?.[0]).toBe(stored.mock.calls[0]?.[0]);
    expect(stored.mock.calls[2]?.[0]).toBe(stored.mock.calls[0]?.[0]);
    expect(stored.mock.calls[0]?.[0]).toMatchObject({ uri: mockRecorder.uri, durationMs: 1200 });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockScope.group.unsaved).toBe(false);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge or close while the parent metadata write is unresolved', async () => {
    let acknowledge!: () => void;
    stored.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(saved).not.toHaveBeenCalled();
    expect(mockScope.group.unsaved).toBe(true);
    const leave = jest.fn<() => void>();
    let exiting!: Promise<unknown>;
    await act(async () => {
      exiting = mockScope.group.perform(leave);
      await settle();
    });
    expect(leave).not.toHaveBeenCalled();
    await act(async () => {
      acknowledge();
      expect(await exiting).toBe('done');
    });
    expect(leave).toHaveBeenCalledTimes(1);
    // The original back action owns navigation; no second automatic back.
    expect(saved).not.toHaveBeenCalled();
  });

  it('stops and acknowledges an active recording before the screen changes', async () => {
    await press('ضبط وویس');
    const leave = jest.fn<() => void>();
    await act(async () => {
      expect(await mockScope.group.perform(leave)).toBe('done');
    });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
  });

  it('saves the stopped file even if switching audio back to playback fails', async () => {
    mockPlayback.mockRejectedValue(new Error('Synthetic audio mode failure'));
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(stored).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(mockScope.group.unsaved).toBe(false);
  });

  it('serializes permission requests before the React disabled state catches up', async () => {
    let permitted!: (permission: { granted: boolean }) => void;
    mockPermission.mockImplementation(
      () =>
        new Promise((resolve) => {
          permitted = resolve;
        }),
    );
    await act(async () => {
      const start = button('ضبط وویس').props.onPress;
      start();
      start();
      await settle();
    });
    expect(mockPermission).toHaveBeenCalledTimes(1);
    await act(async () => {
      permitted({ granted: true });
      await settle();
    });
    await act(async () => {
      tree.update(<VoiceRecorder onRecorded={stored} onSaved={saved} />);
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await press('دور انداختن');
    expect(stored).not.toHaveBeenCalled();
  });

  it('retains native ownership on failed stop and retries without starting another recording', async () => {
    mockRecorder.stop.mockRejectedValueOnce(new Error('Synthetic stop failure'));
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(stored).not.toHaveBeenCalled();
    expect(mockScope.group.unsaved).toBe(true);
    await act(async () => {
      expect(await mockScope.group.flush()).toBe(true);
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(stored).toHaveBeenCalledTimes(1);
  });

  it('still blocks departure for another failed field after audio is acknowledged', async () => {
    const text = { unsaved: true, flush: async () => false };
    mockScope.group.register(text);
    await press('ضبط وویس');
    const leave = jest.fn<() => void>();
    await act(async () => {
      expect(await mockScope.group.perform(leave)).toBe('unsaved');
    });
    expect(leave).not.toHaveBeenCalled();
    expect(stored).toHaveBeenCalledTimes(1);
    text.unsaved = false;
    text.flush = async () => true;
    await act(async () => {
      expect(await mockScope.group.perform(leave)).toBe('done');
    });
    expect(stored).toHaveBeenCalledTimes(1);
  });

  it('retains stopped timing and blocks exit if the native file URI is temporarily missing', async () => {
    await press('ضبط وویس');
    mockRecorder.uri = '';
    await press('پایان ضبط');
    expect(stored).not.toHaveBeenCalled();
    expect(mockScope.group.unsaved).toBe(true);
    mockRecorder.currentTime = 0;
    mockRecorder.uri = 'file:///synthetic.m4a';
    await press('تلاش دوباره برای ذخیرهٔ وویس');
    expect(stored.mock.calls[0]?.[0].durationMs).toBe(1200);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  });

  it('does not turn a navigation exception after acknowledgement into another attachment handoff', async () => {
    saved.mockImplementationOnce(() => {
      throw new Error('Synthetic navigation failure');
    });
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(mockScope.group.unsaved).toBe(false);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(alertError).toHaveBeenCalledWith('وویس ذخیره شد؛ بازگشت انجام نشد', expect.any(Error));
    await act(async () => {
      expect(await mockScope.group.flush()).toBe(true);
    });
    expect(stored).toHaveBeenCalledTimes(1);
  });
});
