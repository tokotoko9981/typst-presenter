import type {
  LaunchAudienceOptions,
  LaunchAudienceResult,
  MonitorDescriptor,
  PlatformInfo,
} from './types.ts';

export type {
  LaunchAudienceOptions,
  LaunchAudienceResult,
  MonitorDescriptor,
  PlatformInfo,
} from './types.ts';

type TauriInvokeFn = <T = unknown>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

interface TauriMonitorPayload {
  index?: number;
  name?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scaleFactor?: number;
  scale_factor?: number;
  isPrimary?: boolean;
  is_primary?: boolean;
}

interface ScreenDetailedLike {
  left?: number;
  top?: number;
  availLeft?: number;
  availTop?: number;
  width?: number;
  height?: number;
  availWidth?: number;
  availHeight?: number;
  devicePixelRatio?: number;
  isPrimary?: boolean;
  label?: string;
}

interface ScreenDetailsLike {
  screens?: readonly ScreenDetailedLike[];
}

interface DesktopWindowGlobals {
  __TAURI_INTERNALS__?: {
    invoke?: TauriInvokeFn;
  };
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
}

let activeWebAudienceWindow: Window | null = null;

function getDesktopGlobals(): DesktopWindowGlobals | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window as unknown as DesktopWindowGlobals;
}

function getTauriInvoke(): TauriInvokeFn | null {
  const invoke = getDesktopGlobals()?.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

function normalizeTauriMonitor(raw: TauriMonitorPayload, fallbackIndex: number): MonitorDescriptor {
  const index = typeof raw.index === 'number' && Number.isFinite(raw.index) ? raw.index : fallbackIndex;
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const scaleCandidate = raw.scaleFactor ?? raw.scale_factor;
  const scaleFactor =
    typeof scaleCandidate === 'number' && Number.isFinite(scaleCandidate) && scaleCandidate > 0
      ? scaleCandidate
      : 1;

  return {
    index,
    name: rawName.length > 0 ? rawName : `Display ${index + 1}`,
    x: typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : 0,
    y: typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : 0,
    width: typeof raw.width === 'number' && Number.isFinite(raw.width) ? raw.width : 0,
    height: typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : 0,
    scaleFactor,
    isPrimary: Boolean(raw.isPrimary ?? raw.is_primary),
    source: 'tauri',
  };
}

function normalizeWebScreen(raw: ScreenDetailedLike, index: number): MonitorDescriptor {
  const rawLabel = typeof raw.label === 'string' ? raw.label.trim() : '';
  const x = Number.isFinite(raw.left)
    ? Number(raw.left)
    : Number.isFinite(raw.availLeft)
      ? Number(raw.availLeft)
      : 0;
  const y = Number.isFinite(raw.top)
    ? Number(raw.top)
    : Number.isFinite(raw.availTop)
      ? Number(raw.availTop)
      : 0;
  const width = Number.isFinite(raw.width)
    ? Number(raw.width)
    : Number.isFinite(raw.availWidth)
      ? Number(raw.availWidth)
      : 1280;
  const height = Number.isFinite(raw.height)
    ? Number(raw.height)
    : Number.isFinite(raw.availHeight)
      ? Number(raw.availHeight)
      : 720;
  const scaleFactor =
    typeof raw.devicePixelRatio === 'number' &&
    Number.isFinite(raw.devicePixelRatio) &&
    raw.devicePixelRatio > 0
      ? raw.devicePixelRatio
      : 1;

  return {
    index,
    name: rawLabel.length > 0 ? rawLabel : `Display ${index + 1}`,
    x,
    y,
    width,
    height,
    scaleFactor,
    isPrimary: Boolean(raw.isPrimary),
    source: 'web-screen-details',
  };
}

export function isTauriRuntime(): boolean {
  return getTauriInvoke() !== null;
}

export function supportsWebScreenDetails(): boolean {
  return typeof getDesktopGlobals()?.getScreenDetails === 'function';
}

export async function listAvailableMonitors(): Promise<MonitorDescriptor[]> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const monitors = await invoke<unknown>('list_monitors');
      if (!Array.isArray(monitors)) {
        return [];
      }
      return monitors.map((item, idx) =>
        normalizeTauriMonitor((item ?? {}) as TauriMonitorPayload, idx),
      );
    } catch {
      return [];
    }
  }

  const getScreenDetails = getDesktopGlobals()?.getScreenDetails;
  if (typeof getScreenDetails !== 'function') {
    return [];
  }

  try {
    const details = await getScreenDetails();
    if (!details || !Array.isArray(details.screens)) {
      return [];
    }
    return details.screens.map((screen, idx) => normalizeWebScreen(screen ?? {}, idx));
  } catch {
    return [];
  }
}

export function selectDefaultAudienceMonitor(
  monitors: MonitorDescriptor[],
): MonitorDescriptor | null {
  if (monitors.length === 0) {
    return null;
  }
  const firstNonPrimary = monitors.find((monitor) => !monitor.isPrimary);
  if (firstNonPrimary) {
    return firstNonPrimary;
  }
  return monitors.find((monitor) => monitor.isPrimary) ?? monitors[0] ?? null;
}

export async function launchAudienceDisplay(
  options: LaunchAudienceOptions,
): Promise<LaunchAudienceResult> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('open_audience_window', {
        sessionId: options.sessionId,
        monitorIndex: options.monitorIndex ?? null,
        fullscreen: options.fullscreen ?? true,
      });
      activeWebAudienceWindow = null;
      return { opened: true, mode: 'tauri' };
    } catch {
      return { opened: false, mode: 'tauri' };
    }
  }

  if (typeof window === 'undefined') {
    return {
      opened: false,
      mode: 'web-popup',
      popupBlockedUrl: options.audienceUrl,
    };
  }

  const windowName = `typst-audience-${options.sessionId}`;

  if (supportsWebScreenDetails()) {
    const monitors = await listAvailableMonitors();
    if (monitors.length > 0) {
      const targetMonitor =
        options.monitorIndex !== undefined
          ? monitors.find((monitor) => monitor.index === options.monitorIndex) ??
            selectDefaultAudienceMonitor(monitors)
          : selectDefaultAudienceMonitor(monitors);

      if (targetMonitor) {
        const features = [
          `left=${Math.round(targetMonitor.x)}`,
          `top=${Math.round(targetMonitor.y)}`,
          `width=${Math.round(targetMonitor.width)}`,
          `height=${Math.round(targetMonitor.height)}`,
          'popup=yes',
        ].join(',');
        const popup = window.open(options.audienceUrl, windowName, features);
        if (!popup || popup.closed) {
          activeWebAudienceWindow = null;
          return {
            opened: false,
            mode: 'web-multi-screen',
            popupBlockedUrl: options.audienceUrl,
          };
        }
        activeWebAudienceWindow = popup;
        try {
          popup.focus?.();
        } catch {
          // Ignore focus restrictions across browser contexts
        }
        return { opened: true, mode: 'web-multi-screen' };
      }
    }
  }

  const popup = window.open(options.audienceUrl, windowName, 'width=1280,height=720');
  if (!popup || popup.closed) {
    activeWebAudienceWindow = null;
    return {
      opened: false,
      mode: 'web-popup',
      popupBlockedUrl: options.audienceUrl,
    };
  }

  activeWebAudienceWindow = popup;
  try {
    popup.focus?.();
  } catch {
    // Ignore focus restrictions across browser contexts
  }
  return { opened: true, mode: 'web-popup' };
}

export async function closeAudienceDisplay(): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('close_audience_window');
      activeWebAudienceWindow = null;
      return true;
    } catch {
      return false;
    }
  }

  if (activeWebAudienceWindow && !activeWebAudienceWindow.closed) {
    try {
      activeWebAudienceWindow.close();
      activeWebAudienceWindow = null;
      return true;
    } catch {
      activeWebAudienceWindow = null;
      return false;
    }
  }

  activeWebAudienceWindow = null;
  return false;
}

export async function setAudienceWindowFullscreen(fullscreen: boolean): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('set_audience_fullscreen', { fullscreen });
      return true;
    } catch {
      return false;
    }
  }

  if (activeWebAudienceWindow && !activeWebAudienceWindow.closed) {
    try {
      const doc = activeWebAudienceWindow.document;
      if (!doc) {
        return false;
      }
      if (fullscreen) {
        if (typeof doc.documentElement?.requestFullscreen === 'function') {
          await doc.documentElement.requestFullscreen();
          return true;
        }
        return false;
      }
      if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
        await doc.exitFullscreen();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  return false;
}

export async function getAudienceWindowFullscreen(): Promise<boolean | null> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    return null;
  }
  try {
    const result = await invoke<boolean>('is_audience_fullscreen');
    return Boolean(result);
  } catch {
    return null;
  }
}

export async function getPlatformInfo(): Promise<PlatformInfo | null> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    return null;
  }
  try {
    return await invoke<PlatformInfo>('get_platform_info');
  } catch {
    return null;
  }
}
