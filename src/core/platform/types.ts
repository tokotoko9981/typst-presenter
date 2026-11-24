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

export interface TypstCliStatus {
  available: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

export interface TypstCompileOptions {
  root?: string;
  inputs?: string[];
  fontPaths?: string[];
}

export interface TypstCompileResultEvent {
  buildId: number;
  filePath: string;
  fileName: string;
  ok: boolean;
  durationMs: number;
  byteLength: number | null;
  stderr: string;
  exitCode: number | null;
  pdfpcQueryJson: string | null;
}

export interface LaunchFileRequest {
  path: string;
  kind: 'typ' | 'pdf';
}
