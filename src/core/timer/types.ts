export type PacingStatus = 'idle' | 'ahead' | 'on-track' | 'warning' | 'overtime';

export interface TimerConfig {
  countdownTargetMs: number;
  lastMinutesWarningMs: number;
  endTimeHHMM?: string;
}

export interface TimerSnapshot {
  running: boolean;
  totalElapsedMs: number;
  countdownTargetMs: number;
  remainingMs: number; // negative when overtime
  lastMinutesWarning: boolean;
  slideElapsedMs: number;
  slideTargetMs: number;
  pacingStatus: PacingStatus;
}
