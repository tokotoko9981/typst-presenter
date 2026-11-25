import { describe, expect, it } from 'vitest';
import {
  clampPaneSplitRatio,
  computeSplitRatioFromPointer,
  DEFAULT_PANE_SPLIT_RATIO,
  formatSplitFractions,
  getEffectiveSplitBounds,
  MAX_PANE_SPLIT_RATIO,
  MIN_PANE_SPLIT_RATIO,
  stepPaneSplitRatio,
} from '../../src/core/layout/paneSplit.ts';
import { StorageService } from '../../src/core/storage/StorageService.ts';

describe('paneSplit layout helpers', () => {
  it('clamps out-of-range and non-finite ratios', () => {
    expect(clampPaneSplitRatio(Number.NaN)).toBe(DEFAULT_PANE_SPLIT_RATIO);
    expect(clampPaneSplitRatio(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PANE_SPLIT_RATIO);
    expect(clampPaneSplitRatio(0.1)).toBe(MIN_PANE_SPLIT_RATIO);
    expect(clampPaneSplitRatio(0.9)).toBe(MAX_PANE_SPLIT_RATIO);
    expect(clampPaneSplitRatio(0.51234)).toBe(0.5123);
  });

  it('computes effective split bounds protecting minimum right pane width', () => {
    expect(getEffectiveSplitBounds(undefined)).toEqual({
      min: MIN_PANE_SPLIT_RATIO,
      max: MAX_PANE_SPLIT_RATIO,
    });
    expect(getEffectiveSplitBounds(1416)).toEqual({
      min: MIN_PANE_SPLIT_RATIO,
      max: MAX_PANE_SPLIT_RATIO,
    });
    // At 1000px container (1024px viewport), right pane >= 410px caps max at ~0.5859
    const narrow = getEffectiveSplitBounds(1000);
    expect(narrow.min).toBe(MIN_PANE_SPLIT_RATIO);
    expect(narrow.max).toBeCloseTo(0.5859, 4);
  });

  it('computes split ratio from pointer X within container bounds', () => {
    expect(computeSplitRatioFromPointer(708, 0, 1416)).toBe(0.5);
    expect(computeSplitRatioFromPointer(100, 0, 1416)).toBe(MIN_PANE_SPLIT_RATIO);
    expect(computeSplitRatioFromPointer(1350, 0, 1416)).toBe(MAX_PANE_SPLIT_RATIO);
    // Narrow container enforces right-pane minimum width
    expect(computeSplitRatioFromPointer(900, 0, 1000)).toBeCloseTo(0.5859, 4);
    expect(computeSplitRatioFromPointer(650, 100, 1100)).toBe(0.5);
    expect(computeSplitRatioFromPointer(400, 0, 0)).toBe(DEFAULT_PANE_SPLIT_RATIO);
  });

  it('steps split ratio and clamps at boundaries', () => {
    expect(stepPaneSplitRatio(0.58, 0.02)).toBe(0.6);
    expect(stepPaneSplitRatio(0.58, -0.02)).toBe(0.56);
    expect(stepPaneSplitRatio(MAX_PANE_SPLIT_RATIO, 0.05)).toBe(MAX_PANE_SPLIT_RATIO);
    expect(stepPaneSplitRatio(MIN_PANE_SPLIT_RATIO, -0.05)).toBe(MIN_PANE_SPLIT_RATIO);
    expect(stepPaneSplitRatio(0.58, 0.05, 1000)).toBeCloseTo(0.5859, 4);
  });

  it('formats grid track fractions and percentage', () => {
    expect(formatSplitFractions(0.58)).toEqual({
      leftFr: '58.00fr',
      rightFr: '42.00fr',
      leftPercent: 58,
    });
    expect(formatSplitFractions(0.1)).toEqual({
      leftFr: '35.00fr',
      rightFr: '65.00fr',
      leftPercent: 35,
    });
  });

  it('persists and clamps paneSplitRatio in StorageService prefs', async () => {
    const storage = new StorageService();
    const initial = await storage.getPrefs();
    expect(initial.paneSplitRatio).toBe(DEFAULT_PANE_SPLIT_RATIO);

    const saved = await storage.savePrefs({ paneSplitRatio: 0.44 });
    expect(saved.paneSplitRatio).toBe(0.44);
    expect((await storage.getPrefs()).paneSplitRatio).toBe(0.44);

    const clamped = await storage.savePrefs({ paneSplitRatio: 0.99 });
    expect(clamped.paneSplitRatio).toBe(MAX_PANE_SPLIT_RATIO);
  });
});
