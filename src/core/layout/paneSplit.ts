export const DEFAULT_PANE_SPLIT_RATIO = 0.58;
export const MIN_PANE_SPLIT_RATIO = 0.35;
export const MAX_PANE_SPLIT_RATIO = 0.68;
export const PANE_SPLIT_STEP = 0.02;
export const MIN_LEFT_PANE_PX = 320;
export const MIN_RIGHT_PANE_PX = 410;
export const PANE_DIVIDER_PX = 10;

/**
 * Clamp a pane split ratio to [MIN_PANE_SPLIT_RATIO, MAX_PANE_SPLIT_RATIO],
 * falling back to DEFAULT_PANE_SPLIT_RATIO when non-finite.
 */
export function clampPaneSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_PANE_SPLIT_RATIO;
  }
  const clamped = Math.max(MIN_PANE_SPLIT_RATIO, Math.min(MAX_PANE_SPLIT_RATIO, ratio));
  return Number(clamped.toFixed(4));
}

/**
 * Compute effective [min, max] split ratio bounds given a container width,
 * guaranteeing MIN_LEFT_PANE_PX and MIN_RIGHT_PANE_PX on narrower viewports.
 */
export function getEffectiveSplitBounds(containerWidth?: number): {
  min: number;
  max: number;
} {
  if (
    containerWidth === undefined ||
    !Number.isFinite(containerWidth) ||
    containerWidth <= PANE_DIVIDER_PX
  ) {
    return { min: MIN_PANE_SPLIT_RATIO, max: MAX_PANE_SPLIT_RATIO };
  }
  const usableWidth = containerWidth - PANE_DIVIDER_PX;
  const minByPx = MIN_LEFT_PANE_PX / usableWidth;
  const maxByPx = (usableWidth - MIN_RIGHT_PANE_PX) / usableWidth;
  const min = clampPaneSplitRatio(Math.max(MIN_PANE_SPLIT_RATIO, minByPx));
  const max = Number(Math.max(min, Math.min(MAX_PANE_SPLIT_RATIO, maxByPx)).toFixed(4));
  return { min, max };
}

/**
 * Compute a clamped split ratio from a pointer's clientX relative to the split container.
 */
export function computeSplitRatioFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number {
  if (
    containerWidth <= 0 ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(containerLeft) ||
    !Number.isFinite(containerWidth)
  ) {
    return DEFAULT_PANE_SPLIT_RATIO;
  }
  const { min, max } = getEffectiveSplitBounds(containerWidth);
  const raw = (clientX - containerLeft) / containerWidth;
  return Number(Math.max(min, Math.min(max, raw)).toFixed(4));
}

/**
 * Adjust the current split ratio by delta and clamp within effective bounds.
 */
export function stepPaneSplitRatio(
  currentRatio: number,
  delta: number,
  containerWidth?: number,
): number {
  const base = Number.isFinite(currentRatio) ? currentRatio : DEFAULT_PANE_SPLIT_RATIO;
  const step = Number.isFinite(delta) ? delta : 0;
  const { min, max } = getEffectiveSplitBounds(containerWidth);
  return Number(Math.max(min, Math.min(max, base + step)).toFixed(4));
}

/**
 * Convert a split ratio into CSS grid track fractions and integer percentage.
 */
export function formatSplitFractions(ratio: number): {
  leftFr: string;
  rightFr: string;
  leftPercent: number;
} {
  const r = clampPaneSplitRatio(ratio);
  return {
    leftFr: `${(r * 100).toFixed(2)}fr`,
    rightFr: `${((1 - r) * 100).toFixed(2)}fr`,
    leftPercent: Math.round(r * 100),
  };
}
