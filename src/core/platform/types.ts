export interface MonitorDescriptor {
  index: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
  source: 'tauri' | 'web-screen-details';
}

export interface LaunchAudienceOptions {
  sessionId: string;
  audienceUrl: string;
  monitorIndex?: number;
  fullscreen?: boolean;
}

export interface LaunchAudienceResult {
  opened: boolean;
  mode: 'tauri' | 'web-multi-screen' | 'web-popup';
  popupBlockedUrl?: string;
}

export interface PlatformInfo {
  runtime: string;
  os: string;
  arch: string;
  version: string;
}
