import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { alertError } from '@/components/feedback';
import { FileWorkBusyError, reserveFileMaintenance } from '@/lib/file-work';
import { SaveGroup } from '@/lib/save-before-leave';

import { VoiceRecorder, type Recording } from './voice-recorder';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
let mockScope: { group: SaveGroup };
const mockPermission = jest.fn<() => Promise<{ granted: boolean }>>();
const mockPlayback = jest.fn<() => Promise<void>>();
let mockDurationMs = 1000;
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
  useAudioRecorderState: () => ({ isRecording: mockRecorder.isRecording, durationMillis: mockDurationMs }),
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
let deferredCleanups: (() => void)[];
function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  deferredCleanups.push(() => resolve(fallback));
  return { promise, resolve };
}
function expectMaintenanceBlocked() {
  // A red witness must not leave maintenance locked and poison later tests.
  expect(() => reserveFileMaintenance()()).toThrow(FileWorkBusyError);
}
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
  deferredCleanups = [];
  mockDurationMs = 1000;
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
    deferredCleanups.forEach((finish) => finish());
    await settle();
    stored.mockResolvedValue(undefined);
    mockRecorder.uri = 'file:///synthetic.m4a';
    await mockScope.group.flush();
    tree.unmount();
    await settle();
  });
});

describe('recorder acknowledgement and screen exit', () => {
  it('excludes maintenance before permission returns and through active recording', async () => {
    const permission = deferred({ granted: false });
    mockPermission.mockReturnValue(permission.promise);
    await press('ضبط وویس');
    expectMaintenanceBlocked();
    await act(async () => {
      permission.resolve({ granted: true });
      await settle();
    });
    await act(async () => {
      tree.update(<VoiceRecorder onRecorded={stored} onSaved={saved} />);
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expectMaintenanceBlocked();
    await press('پایان ضبط');
    reserveFileMaintenance()();
  });

  it('does not ask permission or start native recording during maintenance', async () => {
    const release = reserveFileMaintenance();
    try {
      await press('ضبط وویس');
      expect(mockPermission).not.toHaveBeenCalled();
      expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
      expect(mockRecorder.record).not.toHaveBeenCalled();
      expect(mockScope.group.unsaved).toBe(false);
      expect(alertError).toHaveBeenCalledWith('ضبط شروع نشد', expect.any(FileWorkBusyError));
    } finally {
      release();
    }
    await press('ضبط وویس');
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });

  it.each(['permission denied', 'preparation failed'])('releases a %s attempt for maintenance', async (reason) => {
    if (reason === 'permission denied') mockPermission.mockResolvedValue({ granted: false });
    else mockRecorder.prepareToRecordAsync.mockRejectedValue(new Error('Synthetic prepare failure'));
    await press('ضبط وویس');
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockScope.group.unsaved).toBe(false);
    reserveFileMaintenance()();
  });

  it('holds ownership through native stop and pending metadata acknowledgement', async () => {
    const stopped = deferred(undefined);
    mockRecorder.stop.mockImplementation(async () => {
      await stopped.promise;
      mockRecorder.isRecording = false;
    });
    const acknowledge = deferred(undefined);
    stored.mockReturnValue(acknowledge.promise);
    await press('ضبط وویس');
    await press('پایان ضبط');
    expect(stored).not.toHaveBeenCalled();
    expectMaintenanceBlocked();
    await act(async () => {
      stopped.resolve(undefined);
      await settle();
    });
    expect(stored).toHaveBeenCalledTimes(1);
    expectMaintenanceBlocked();
    await act(async () => {
      acknowledge.resolve(undefined);
      await settle();
    });
    reserveFileMaintenance()();
  });

  it('retains the lease after acknowledgement failure until the same recording succeeds', async () => {
    stored.mockRejectedValueOnce(new Error('Synthetic metadata failure'));
    await press('ضبط وویس');
    await press('پایان ضبط');
    expectMaintenanceBlocked();
    await press('تلاش دوباره برای ذخیرهٔ وویس');
    expect(stored.mock.calls[1]?.[0]).toBe(stored.mock.calls[0]?.[0]);
    reserveFileMaintenance()();
  });

  it('does not release ownership on failed stop; a successful retry releases it', async () => {
    mockRecorder.stop.mockRejectedValueOnce(new Error('Synthetic stop failure'));
    await press('ضبط وویس');
    await press('پایان ضبط');
    expectMaintenanceBlocked();
    await act(async () => {
      expect(await mockScope.group.flush()).toBe(true);
    });
    reserveFileMaintenance()();
  });

  it.each(['discarded', 'too short'])('releases a %s recording without publishing it', async (reason) => {
    mockDurationMs = 100;
    mockRecorder.currentTime = 0.12;
    await press('ضبط وویس');
    expectMaintenanceBlocked();
    await press(reason === 'discarded' ? 'دور انداختن' : 'پایان ضبط');
    expect(stored).not.toHaveBeenCalled();
    reserveFileMaintenance()();
  });

  it.each(['permission', 'preparation'])('does not start after unmount during %s', async (phase) => {
    const wait = deferred(undefined);
    if (phase === 'permission')
      mockPermission.mockImplementation(async () => {
        await wait.promise;
        return { granted: true };
      });
    else mockRecorder.prepareToRecordAsync.mockReturnValue(wait.promise);
    await press('ضبط وویس');
    await act(async () => {
      tree.unmount();
    });
    expectMaintenanceBlocked();
    await act(async () => {
      wait.resolve(undefined);
      await settle();
    });
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
    reserveFileMaintenance()();
  });

  it.each(['success', 'failure'])(
    'keeps in-flight acknowledgement excluded after unmount until %s',
    async (outcome) => {
      const acknowledge = deferred(undefined);
      stored.mockImplementation(async () => {
        await acknowledge.promise;
        if (outcome === 'failure') throw new Error('Synthetic unmounted metadata failure');
      });
      await press('ضبط وویس');
      await press('پایان ضبط');
      await act(async () => {
        tree.unmount();
      });
      expectMaintenanceBlocked();
      await act(async () => {
        acknowledge.resolve(undefined);
        await settle();
      });
      expect(saved).not.toHaveBeenCalled();
      reserveFileMaintenance()();
    },
  );

  it.each(['start', 'retry'])('ignores a retained %s handler after unmount', async (action) => {
    let retained = button('ضبط وویس').props.onPress as () => void;
    if (action === 'retry') {
      stored.mockRejectedValueOnce(new Error('Synthetic acknowledgement failure'));
      await press('ضبط وویس');
      await press('پایان ضبط');
      retained = button('تلاش دوباره برای ذخیرهٔ وویس').props.onPress;
    }
    const writesBefore = stored.mock.calls.length;
    const permissionsBefore = mockPermission.mock.calls.length;
    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      retained();
      await settle();
    });
    expect(stored).toHaveBeenCalledTimes(writesBefore);
    expect(mockPermission).toHaveBeenCalledTimes(permissionsBefore);
    reserveFileMaintenance()();
  });

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
