import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAudienceDisplay,
  getAudienceWindowFullscreen,
  getPlatformInfo,
  isTauriRuntime,
  launchAudienceDisplay,
  listAvailableMonitors,
  selectDefaultAudienceMonitor,
  setAudienceWindowFullscreen,
  supportsWebScreenDetails,
} from '../../src/core/platform/DesktopBridge.ts';
import type { MonitorDescriptor } from '../../src/core/platform/types.ts';

interface MutableDesktopWindow {
  __TAURI_INTERNALS__?: {
    invoke?: unknown;
  };
  getScreenDetails?: unknown;
}

function getMutableWindow(): MutableDesktopWindow {
  return window as unknown as MutableDesktopWindow;
}

describe('DesktopBridge', () => {
  beforeEach(() => {
    const win = getMutableWindow();
    delete win.__TAURI_INTERNALS__;
    delete win.getScreenDetails;
  });

  afterEach(async () => {
    await closeAudienceDisplay();
    const win = getMutableWindow();
    delete win.__TAURI_INTERNALS__;
    delete win.getScreenDetails;
    vi.restoreAllMocks();
  });

  it('detects Tauri runtime and Web Screen Details support accurately', () => {
    expect(isTauriRuntime()).toBe(false);
    expect(supportsWebScreenDetails()).toBe(false);

    const win = getMutableWindow();
    win.__TAURI_INTERNALS__ = {};
    expect(isTauriRuntime()).toBe(false);

    win.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    expect(isTauriRuntime()).toBe(true);

    win.getScreenDetails = vi.fn();
    expect(supportsWebScreenDetails()).toBe(true);
  });

  it('lists monitors via Tauri IPC and handles IPC errors safely', async () => {
    const invokeMock = vi.fn().mockResolvedValue([
      {
        index: 0,
        name: 'Built-in Retina',
        x: 0,
        y: 0,
        width: 2560,
        height: 1600,
        scaleFactor: 2,
        isPrimary: true,
      },
      {
        index: 1,
        name: '',
        x: 2560,
        y: 0,
        width: 1920,
        height: 1080,
        scale_factor: 1,
        is_primary: false,
      },
    ]);
    getMutableWindow().__TAURI_INTERNALS__ = { invoke: invokeMock };

    const monitors = await listAvailableMonitors();
    expect(invokeMock).toHaveBeenCalledWith('list_monitors');
    expect(monitors).toEqual([
      {
        index: 0,
        name: 'Built-in Retina',
        x: 0,
        y: 0,
        width: 2560,
        height: 1600,
        scaleFactor: 2,
        isPrimary: true,
        source: 'tauri',
      },
      {
        index: 1,
        name: 'Display 2',
        x: 2560,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        source: 'tauri',
      },
    ]);

    invokeMock.mockRejectedValueOnce(new Error('IPC error'));
    expect(await listAvailableMonitors()).toEqual([]);
  });

  it('lists monitors via Web getScreenDetails and returns empty array on rejection', async () => {
    const getScreenDetailsMock = vi.fn().mockResolvedValue({
      screens: [
        {
          left: 0,
          top: 0,
          width: 1440,
          height: 900,
          devicePixelRatio: 2,
          isPrimary: true,
          label: 'Primary Laptop',
        },
        {
          left: 1440,
          top: 0,
          width: 1920,
          height: 1080,
          devicePixelRatio: 1,
          isPrimary: false,
          label: 'Projector HDMI',
        },
      ],
    });
    getMutableWindow().getScreenDetails = getScreenDetailsMock;

    const monitors = await listAvailableMonitors();
    expect(monitors).toEqual([
      {
        index: 0,
        name: 'Primary Laptop',
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        scaleFactor: 2,
        isPrimary: true,
        source: 'web-screen-details',
      },
      {
        index: 1,
        name: 'Projector HDMI',
        x: 1440,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        source: 'web-screen-details',
      },
    ]);

    getScreenDetailsMock.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    expect(await listAvailableMonitors()).toEqual([]);
  });

  it('selects first non-primary monitor by default or falls back to primary', () => {
    expect(selectDefaultAudienceMonitor([])).toBeNull();

    const primaryOnly: MonitorDescriptor[] = [
      {
        index: 0,
        name: 'Primary',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: true,
        source: 'tauri',
      },
    ];
    expect(selectDefaultAudienceMonitor(primaryOnly)?.index).toBe(0);

    const multiMonitor: MonitorDescriptor[] = [
      ...primaryOnly,
      {
        index: 1,
        name: 'External 1',
        x: 1920,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        source: 'tauri',
      },
      {
        index: 2,
        name: 'External 2',
        x: 3840,
        y: 0,
        width: 1280,
        height: 720,
        scaleFactor: 1,
        isPrimary: false,
        source: 'tauri',
      },
    ];
    expect(selectDefaultAudienceMonitor(multiMonitor)?.index).toBe(1);
  });

  it('launches, toggles fullscreen, and closes audience window in Tauri mode', async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    getMutableWindow().__TAURI_INTERNALS__ = { invoke: invokeMock };

    const resultDefault = await launchAudienceDisplay({
      sessionId: 'sess-123',
      audienceUrl: 'http://localhost:5173/#/audience?session=sess-123',
    });
    expect(resultDefault).toEqual({ opened: true, mode: 'tauri' });
    expect(invokeMock).toHaveBeenCalledWith('open_audience_window', {
      sessionId: 'sess-123',
      monitorIndex: null,
      fullscreen: true,
    });

    const resultExplicit = await launchAudienceDisplay({
      sessionId: 'sess-123',
      audienceUrl: 'http://localhost:5173/#/audience?session=sess-123',
      monitorIndex: 2,
      fullscreen: false,
    });
    expect(resultExplicit).toEqual({ opened: true, mode: 'tauri' });
    expect(invokeMock).toHaveBeenCalledWith('open_audience_window', {
      sessionId: 'sess-123',
      monitorIndex: 2,
      fullscreen: false,
    });

    expect(await setAudienceWindowFullscreen(true)).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('set_audience_fullscreen', { fullscreen: true });

    expect(await closeAudienceDisplay()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('close_audience_window');

    invokeMock.mockRejectedValueOnce(new Error('Window open failed'));
    expect(
      await launchAudienceDisplay({
        sessionId: 'sess-err',
        audienceUrl: 'http://localhost:5173/#/audience?session=sess-err',
      }),
    ).toEqual({ opened: false, mode: 'tauri' });
  });

  it('opens audience window on secondary monitor via Web getScreenDetails', async () => {
    getMutableWindow().getScreenDetails = vi.fn().mockResolvedValue({
      screens: [
        { left: 0, top: 0, width: 1440, height: 900, isPrimary: true, label: 'Main' },
        { left: 1440, top: 120, width: 1920, height: 1080, isPrimary: false, label: 'Projector' },
      ],
    });

    const mockPopup = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(() => {
        mockPopup.closed = true;
      }),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup as unknown as Window);

    const result = await launchAudienceDisplay({
      sessionId: 'web-multi',
      audienceUrl: 'https://example.test/#/audience?session=web-multi',
    });

    expect(result).toEqual({ opened: true, mode: 'web-multi-screen' });
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.test/#/audience?session=web-multi',
      'typst-audience-web-multi',
      'left=1440,top=120,width=1920,height=1080,popup=yes',
    );
    expect(mockPopup.focus).toHaveBeenCalledTimes(1);

    expect(await closeAudienceDisplay()).toBe(true);
    expect(mockPopup.close).toHaveBeenCalledTimes(1);
    expect(await closeAudienceDisplay()).toBe(false);

    // Explicit monitorIndex selection and popup blocked in multi-screen mode
    openSpy.mockReturnValueOnce(mockPopup as unknown as Window);
    mockPopup.closed = false;
    const explicitResult = await launchAudienceDisplay({
      sessionId: 'web-explicit',
      audienceUrl: 'https://example.test/#/audience?session=web-explicit',
      monitorIndex: 0,
    });
    expect(explicitResult).toEqual({ opened: true, mode: 'web-multi-screen' });
    expect(openSpy).toHaveBeenLastCalledWith(
      'https://example.test/#/audience?session=web-explicit',
      'typst-audience-web-explicit',
      'left=0,top=0,width=1440,height=900,popup=yes',
    );

    openSpy.mockReturnValueOnce(null);
    const blockedMultiResult = await launchAudienceDisplay({
      sessionId: 'web-multi-blocked',
      audienceUrl: 'https://example.test/#/audience?session=web-multi-blocked',
    });
    expect(blockedMultiResult).toEqual({
      opened: false,
      mode: 'web-multi-screen',
      popupBlockedUrl: 'https://example.test/#/audience?session=web-multi-blocked',
    });
  });

  it('falls back to standard popup when getScreenDetails is denied or unsupported, and reports popup block', async () => {
    // Case 1: getScreenDetails throws permission denied -> fallback to standard popup
    getMutableWindow().getScreenDetails = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    const mockPopup = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
    };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockPopup as unknown as Window);

    const fallbackResult = await launchAudienceDisplay({
      sessionId: 'denied-session',
      audienceUrl: 'https://example.test/#/audience?session=denied-session',
    });
    expect(fallbackResult).toEqual({ opened: true, mode: 'web-popup' });
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.test/#/audience?session=denied-session',
      'typst-audience-denied-session',
      'width=1280,height=720',
    );

    // Case 2: getScreenDetails unsupported and window.open blocked (returns null)
    delete getMutableWindow().getScreenDetails;
    openSpy.mockReturnValueOnce(null);

    const blockedResult = await launchAudienceDisplay({
      sessionId: 'blocked-session',
      audienceUrl: 'https://example.test/#/audience?session=blocked-session',
    });
    expect(blockedResult).toEqual({
      opened: false,
      mode: 'web-popup',
      popupBlockedUrl: 'https://example.test/#/audience?session=blocked-session',
    });
  });

  it('handles web fullscreen and platform info gracefully', async () => {
    expect(await getPlatformInfo()).toBeNull();
    expect(await setAudienceWindowFullscreen(true)).toBe(false);

    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const docState: { fullscreenElement: object | null } = { fullscreenElement: null };
    const webPopup = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(() => {
        webPopup.closed = true;
      }),
      document: {
        get fullscreenElement() {
          return docState.fullscreenElement;
        },
        documentElement: {
          requestFullscreen: vi.fn(async () => {
            await requestFullscreen();
            docState.fullscreenElement = {};
          }),
        },
        exitFullscreen: vi.fn(async () => {
          await exitFullscreen();
          docState.fullscreenElement = null;
        }),
      },
    };
    vi.spyOn(window, 'open').mockReturnValueOnce(webPopup as unknown as Window);
    await launchAudienceDisplay({
      sessionId: 'web-fs',
      audienceUrl: 'https://example.test/#/audience?session=web-fs',
    });

    expect(await setAudienceWindowFullscreen(true)).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(await setAudienceWindowFullscreen(false)).toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    const invokeMock = vi.fn().mockResolvedValue({
      runtime: 'tauri',
      os: 'windows',
      arch: 'x86_64',
      version: '0.2.0',
    });
    getMutableWindow().__TAURI_INTERNALS__ = { invoke: invokeMock };

    expect(await getPlatformInfo()).toEqual({
      runtime: 'tauri',
      os: 'windows',
      arch: 'x86_64',
      version: '0.2.0',
    });
    expect(invokeMock).toHaveBeenCalledWith('get_platform_info');

    invokeMock.mockResolvedValueOnce(true);
    expect(await getAudienceWindowFullscreen()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('is_audience_fullscreen');

    invokeMock.mockRejectedValueOnce(new Error('IPC error'));
    expect(await getAudienceWindowFullscreen()).toBeNull();
  });

  it('returns null for getAudienceWindowFullscreen outside Tauri', async () => {
    expect(await getAudienceWindowFullscreen()).toBeNull();
  });
});
