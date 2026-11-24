import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChimeEngine,
  createResetChimeLatch,
  createSeededChimeLatch,
  evaluateChimeStage,
  type ChimeLatchState,
} from '../../../core/audio/ChimeEngine.ts';

export interface UseChimeAlertsOptions {
  enabled: boolean;
  volume: number;
  running: boolean;
  remainingMs: number;
  lastMinutesWarning: number;
  countdownMinutes: number;
  endTimeHHMM: string;
  resetToken: number;
}

export interface UseChimeAlertsResult {
  ringManual: (count: 1 | 2 | 3) => boolean;
  lastBell: { count: 1 | 2 | 3; ts: number } | null;
}

export function useChimeAlerts({
  enabled,
  volume,
  running,
  remainingMs,
  lastMinutesWarning,
  countdownMinutes,
  endTimeHHMM,
  resetToken,
}: UseChimeAlertsOptions): UseChimeAlertsResult {
  const engineRef = useRef<ChimeEngine | null>(null);
  const latchRef = useRef<ChimeLatchState>(createResetChimeLatch());
  const prevEnabledRef = useRef<boolean>(enabled);
  const [lastBell, setLastBell] = useState<{ count: 1 | 2 | 3; ts: number } | null>(null);

  if (!engineRef.current) {
    engineRef.current = new ChimeEngine();
  }

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Reset double-fire latch on timer reset or target config change
  useEffect(() => {
    latchRef.current = createResetChimeLatch();
  }, [resetToken, countdownMinutes, lastMinutesWarning, endTimeHHMM]);

  // Seed latch if user turns chime ON mid-talk so already-passed thresholds don't blast immediately
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    if (!wasEnabled && enabled && running) {
      const warningThresholdMs = Math.max(0, lastMinutesWarning) * 60_000;
      latchRef.current = createSeededChimeLatch(remainingMs, warningThresholdMs);
    }
  }, [enabled, running, remainingMs, lastMinutesWarning]);

  // Evaluate conference bell thresholds (1: warning, 2: 00:00, 3: +1 min overtime)
  useEffect(() => {
    const warningThresholdMs = Math.max(0, lastMinutesWarning) * 60_000;
    const { ringCount, nextLatch } = evaluateChimeStage({
      enabled,
      running,
      remainingMs,
      warningThresholdMs,
      latch: latchRef.current,
    });
    latchRef.current = nextLatch;
    if (ringCount !== null) {
      engineRef.current?.ring(ringCount, volume);
      setLastBell({ count: ringCount, ts: Date.now() });
    }
  }, [enabled, running, remainingMs, lastMinutesWarning, volume]);

  const ringManual = useCallback(
    (count: 1 | 2 | 3): boolean => {
      const played = engineRef.current?.ring(count, volume) ?? false;
      setLastBell({ count, ts: Date.now() });
      return played;
    },
    [volume],
  );

  return { ringManual, lastBell };
}
