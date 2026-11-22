import type { PacingStatus, TimerSnapshot } from './types.ts';

export function parseValidHHMM(raw: string | undefined): { hh: number; mm: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1]!, 10);
  const mm = Number.parseInt(m[2]!, 10);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return { hh, mm };
}

export function resolveEndTimeTargetMs(
  hhmm: string | undefined,
  nowMs: number = Date.now(),
): number | null {
  const parsed = parseValidHHMM(hhmm);
  if (!parsed) return null;

  let bestCandidateMs = 0;
  let bestAbsDiff = Number.POSITIVE_INFINITY;

  for (const dayOffset of [-1, 0, 1]) {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(parsed.hh, parsed.mm, 0, 0);
    const candidateMs = d.getTime();
    const diff = Math.abs(candidateMs - nowMs);
    if (diff < bestAbsDiff) {
      bestAbsDiff = diff;
      bestCandidateMs = candidateMs;
    }
  }

  return bestCandidateMs;
}

export function formatDurationMMSS(ms: number, showPlusOnNegative = false): string {
  const safeMs = Number.isFinite(ms) ? ms : 0;
  if (safeMs < 0) {
    const absSeconds = Math.ceil(Math.abs(safeMs) / 1000);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    const prefix = showPlusOnNegative ? '+' : '-';
    return `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  const totalSeconds = Math.floor(safeMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatCountdownMMSS(remainingMs: number): string {
  const safeMs = Number.isFinite(remainingMs) ? remainingMs : 0;
  if (safeMs < 0) {
    const overSeconds = Math.max(1, Math.floor(Math.abs(safeMs) / 1000));
    const mins = Math.floor(overSeconds / 60);
    const secs = overSeconds % 60;
    return `+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const remSeconds = Math.ceil(safeMs / 1000);
  const mins = Math.floor(remSeconds / 60);
  const secs = remSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computeTimerSnapshot(params: {
  running: boolean;
  accumulatedElapsedMs: number;
  lastResumeTimestampMs: number | null;
  slideAccumulatedElapsedMs: number;
  slideLastResumeTimestampMs: number | null;
  countdownMinutes: number;
  lastMinutesWarning: number;
  endTimeHHMM?: string;
  slideTargetSeconds?: number;
  nowMs?: number;
}): TimerSnapshot {
  const now = params.nowMs ?? Date.now();
  const safeAccum = Number.isFinite(params.accumulatedElapsedMs)
    ? Math.max(0, params.accumulatedElapsedMs)
    : 0;
  const activeDelta =
    params.running && params.lastResumeTimestampMs !== null
      ? Math.max(0, now - params.lastResumeTimestampMs)
      : 0;
  const totalElapsedMs = safeAccum + activeDelta;

  const safeSlideAccum = Number.isFinite(params.slideAccumulatedElapsedMs)
    ? Math.max(0, params.slideAccumulatedElapsedMs)
    : 0;
  const slideDelta =
    params.running && params.slideLastResumeTimestampMs !== null
      ? Math.max(0, now - params.slideLastResumeTimestampMs)
      : 0;
  const slideElapsedMs = safeSlideAccum + slideDelta;

  const safeMinutes =
    Number.isFinite(params.countdownMinutes) && params.countdownMinutes > 0
      ? params.countdownMinutes
      : 15;
  const countdownTargetMs = safeMinutes * 60_000;

  const endTimeTarget = resolveEndTimeTargetMs(params.endTimeHHMM, now);
  const remainingMs =
    endTimeTarget !== null ? endTimeTarget - now : countdownTargetMs - totalElapsedMs;

  const safeWarningMin =
    Number.isFinite(params.lastMinutesWarning) && params.lastMinutesWarning >= 0
      ? params.lastMinutesWarning
      : 0;
  const warningThresholdMs = safeWarningMin * 60_000;
  const isLastMinutesWarning =
    remainingMs >= 0 && warningThresholdMs > 0 && remainingMs <= warningThresholdMs;

  const slideTargetMs =
    typeof params.slideTargetSeconds === 'number' &&
    Number.isFinite(params.slideTargetSeconds) &&
    params.slideTargetSeconds > 0
      ? params.slideTargetSeconds * 1000
      : 0;

  let pacingStatus: PacingStatus = 'on-track';
  if (!params.running && totalElapsedMs === 0) {
    pacingStatus = 'idle';
  } else if (slideTargetMs > 0) {
    if (slideElapsedMs > slideTargetMs) {
      pacingStatus = 'overtime';
    } else if (slideElapsedMs >= slideTargetMs * 0.8) {
      pacingStatus = 'warning';
    } else if (slideElapsedMs <= slideTargetMs * 0.4) {
      pacingStatus = 'ahead';
    } else {
      pacingStatus = 'on-track';
    }
  } else if (remainingMs < 0) {
    pacingStatus = 'overtime';
  } else if (isLastMinutesWarning) {
    pacingStatus = 'warning';
  } else {
    pacingStatus = 'on-track';
  }

  return {
    running: params.running,
    totalElapsedMs,
    countdownTargetMs,
    remainingMs,
    lastMinutesWarning: isLastMinutesWarning,
    slideElapsedMs,
    slideTargetMs,
    pacingStatus,
  };
}
