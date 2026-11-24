export interface ChimeLatchState {
  warn1: boolean;
  end2: boolean;
  overtime3: boolean;
}

export function createResetChimeLatch(): ChimeLatchState {
  return { warn1: false, end2: false, overtime3: false };
}

export function createSeededChimeLatch(
  remainingMs: number,
  warningThresholdMs: number,
): ChimeLatchState {
  const overtime3 = remainingMs <= -60_000;
  const end2 = overtime3 || remainingMs <= 0;
  const warn1 = end2 || (warningThresholdMs > 0 && remainingMs <= warningThresholdMs);
  return { warn1, end2, overtime3 };
}

export function evaluateChimeStage(params: {
  enabled: boolean;
  running: boolean;
  remainingMs: number;
  warningThresholdMs: number;
  latch: ChimeLatchState;
}): { ringCount: 1 | 2 | 3 | null; nextLatch: ChimeLatchState } {
  const { enabled, running, remainingMs, warningThresholdMs, latch } = params;
  if (!enabled || !running) {
    return { ringCount: null, nextLatch: latch };
  }

  if (remainingMs <= -60_000 && !latch.overtime3) {
    return {
      ringCount: 3,
      nextLatch: { warn1: true, end2: true, overtime3: true },
    };
  }

  if (remainingMs <= 0 && !latch.end2) {
    return {
      ringCount: 2,
      nextLatch: { warn1: true, end2: true, overtime3: latch.overtime3 },
    };
  }

  if (warningThresholdMs > 0 && remainingMs <= warningThresholdMs && !latch.warn1) {
    return {
      ringCount: 1,
      nextLatch: { warn1: true, end2: latch.end2, overtime3: latch.overtime3 },
    };
  }

  return { ringCount: null, nextLatch: latch };
}

export function clampChimeVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0.7;
  return Math.max(0, Math.min(1, Number(volume.toFixed(2))));
}

interface AudioContextLike {
  state?: string;
  currentTime: number;
  destination: AudioNode;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createOscillator: () => OscillatorNode;
  createGain: () => GainNode;
}

const BELL_PARTIALS: ReadonlyArray<{ freq: number; gain: number; decaySec: number }> = [
  { freq: 1046.5, gain: 0.55, decaySec: 1.15 },
  { freq: 2093.0, gain: 0.25, decaySec: 0.85 },
  { freq: 3136.0, gain: 0.14, decaySec: 0.55 },
  { freq: 4186.0, gain: 0.08, decaySec: 0.35 },
];

/**
 * Offline Web Audio API conference desk-bell synthesizer.
 * Safe no-op in headless/jsdom environments lacking AudioContext.
 */
export class ChimeEngine {
  private ctx: AudioContextLike | null = null;

  private ensureContext(): AudioContextLike | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        void this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    if (typeof window === 'undefined') {
      return null;
    }
    const win = window as unknown as {
      AudioContext?: new () => AudioContextLike;
      webkitAudioContext?: new () => AudioContextLike;
    };
    const Ctor = win.AudioContext ?? win.webkitAudioContext;
    if (typeof Ctor !== 'function') {
      return null;
    }

    try {
      const ctx = new Ctor();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        void ctx.resume().catch(() => {});
      }
      this.ctx = ctx;
      return ctx;
    } catch {
      return null;
    }
  }

  ring(bellCount: 1 | 2 | 3, volume = 0.7): boolean {
    const safeVolume = clampChimeVolume(volume);
    if (safeVolume <= 0) {
      return false;
    }

    const ctx = this.ensureContext();
    if (!ctx) {
      return false;
    }

    const baseTime = ctx.currentTime + 0.01;
    const strikeIntervalSec = 0.42;

    for (let strike = 0; strike < bellCount; strike += 1) {
      const strikeStart = baseTime + strike * strikeIntervalSec;
      for (const partial of BELL_PARTIALS) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(partial.freq, strikeStart);

        const peak = Math.max(0.0002, safeVolume * partial.gain);
        gain.gain.setValueAtTime(0.0001, strikeStart);
        gain.gain.linearRampToValueAtTime(peak, strikeStart + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, strikeStart + partial.decaySec);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(strikeStart);
        osc.stop(strikeStart + partial.decaySec + 0.02);
      }
    }

    return true;
  }

  dispose(): void {
    if (this.ctx && typeof this.ctx.close === 'function') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
