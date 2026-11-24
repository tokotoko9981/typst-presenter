import type { ZoomState } from '../sync/types.ts';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const DEFAULT_ZOOM_STATE: ZoomState = {
  scale: 1,
  panX: 0,
  panY: 0,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function isZoomed(zoom: ZoomState): boolean {
  return Number.isFinite(zoom.scale) && zoom.scale > 1.001;
}

export function clampZoomState(zoom: ZoomState): ZoomState {
  const rawScale = Number.isFinite(zoom.scale) ? clamp(zoom.scale, MIN_ZOOM, MAX_ZOOM) : MIN_ZOOM;
  const scale = rawScale < 1.02 ? 1 : Number(rawScale.toFixed(4));
  if (scale <= 1) {
    return DEFAULT_ZOOM_STATE;
  }
  const maxPan = (scale - 1) / 2;
  const panX = Number(clamp(zoom.panX, -maxPan, maxPan).toFixed(4));
  const panY = Number(clamp(zoom.panY, -maxPan, maxPan).toFixed(4));
  return { scale, panX, panY };
}

/**
 * Computes the next ZoomState while keeping the normalized slide point (normX, normY)
 * anchored under the cursor.
 */
export function zoomAtPoint(
  current: ZoomState,
  targetScale: number,
  normX: number,
  normY: number,
): ZoomState {
  const safeCurrent = clampZoomState(current);
  const clampedTarget = clamp(targetScale, MIN_ZOOM, MAX_ZOOM);
  const nextScale = clampedTarget <= 1.04 ? 1 : Number(clampedTarget.toFixed(4));
  if (nextScale <= 1) {
    return DEFAULT_ZOOM_STATE;
  }

  const cx = clamp01(normX) - 0.5;
  const cy = clamp01(normY) - 0.5;
  const ratio = nextScale / safeCurrent.scale;

  const panX = cx - (cx - safeCurrent.panX) * ratio;
  const panY = cy - (cy - safeCurrent.panY) * ratio;

  return clampZoomState({
    scale: nextScale,
    panX,
    panY,
  });
}

export function panByNormalizedDelta(
  current: ZoomState,
  deltaNormX: number,
  deltaNormY: number,
): ZoomState {
  const safeCurrent = clampZoomState(current);
  if (!isZoomed(safeCurrent)) {
    return DEFAULT_ZOOM_STATE;
  }
  return clampZoomState({
    scale: safeCurrent.scale,
    panX: safeCurrent.panX + deltaNormX,
    panY: safeCurrent.panY + deltaNormY,
  });
}
