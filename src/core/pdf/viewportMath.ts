import type { CropMode, CropRegion, RenderOptions } from './types.ts';

export const MAX_DPR = 2.5;
export const MAX_CANVAS_EDGE = 4096;
export const SPLIT_HORIZONTAL_ASPECT_THRESHOLD = 2.4;

export interface CropBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitCropRegions {
  slideRegion: CropRegion;
  notesRegion: CropRegion | null;
}

export interface RenderPlan {
  scale: number;
  outputScale: number;
  cssWidth: number;
  cssHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: number;
  offsetY: number;
  transform: [number, number, number, number, number, number];
}

export interface ViewportPointConverter {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): [number, number] | number[];
}

export function computeSuggestedCropMode(aspectRatio: number): CropMode {
  return aspectRatio > SPLIT_HORIZONTAL_ASPECT_THRESHOLD ? 'split-horizontal' : 'full';
}

export function resolveSplitCropRegions(
  cropMode: CropMode,
  swapSplitHalves = false,
): SplitCropRegions {
  switch (cropMode) {
    case 'split-horizontal':
      return swapSplitHalves
        ? { slideRegion: 'right-half', notesRegion: 'left-half' }
        : { slideRegion: 'left-half', notesRegion: 'right-half' };
    case 'split-vertical':
      return swapSplitHalves
        ? { slideRegion: 'bottom-half', notesRegion: 'top-half' }
        : { slideRegion: 'top-half', notesRegion: 'bottom-half' };
    case 'full':
    default:
      return { slideRegion: 'full', notesRegion: null };
  }
}

export function getCropBounds(cropRegion: CropRegion): CropBounds {
  switch (cropRegion) {
    case 'left-half':
      return { x: 0, y: 0, w: 0.5, h: 1 };
    case 'right-half':
      return { x: 0.5, y: 0, w: 0.5, h: 1 };
    case 'top-half':
      return { x: 0, y: 0, w: 1, h: 0.5 };
    case 'bottom-half':
      return { x: 0, y: 0.5, w: 1, h: 0.5 };
    case 'full':
    default:
      return { x: 0, y: 0, w: 1, h: 1 };
  }
}

/**
 * Computes CSS/canvas dimensions, DPR-capped output scale, and crop offsets.
 * Non-positive or non-finite target dimensions are clamped to 1px (instead of falling back to scale = 1)
 * so unmeasured 0x0 containers never trigger oversized canvas allocations.
 */
export function computeRenderPlan(
  baseWidth: number,
  baseHeight: number,
  options: Pick<RenderOptions, 'targetWidth' | 'targetHeight' | 'dpr' | 'cropRegion'>,
): RenderPlan {
  const safeBaseW = baseWidth > 0 && Number.isFinite(baseWidth) ? baseWidth : 1;
  const safeBaseH = baseHeight > 0 && Number.isFinite(baseHeight) ? baseHeight : 1;
  const safeTargetW =
    Number.isFinite(options.targetWidth) && options.targetWidth > 0 ? options.targetWidth : 1;
  const safeTargetH =
    Number.isFinite(options.targetHeight) && options.targetHeight > 0 ? options.targetHeight : 1;

  const bounds = getCropBounds(options.cropRegion);
  const regionWidthAt1 = safeBaseW * bounds.w;
  const regionHeightAt1 = safeBaseH * bounds.h;

  const rawScale = Math.min(safeTargetW / regionWidthAt1, safeTargetH / regionHeightAt1);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;

  const cssWidth = Math.max(1, Math.floor(regionWidthAt1 * scale));
  const cssHeight = Math.max(1, Math.floor(regionHeightAt1 * scale));

  const clampedDpr =
    Number.isFinite(options.dpr) && options.dpr > 0 ? Math.min(options.dpr, MAX_DPR) : 1;
  const edgeCapScale = Math.min(MAX_CANVAS_EDGE / cssWidth, MAX_CANVAS_EDGE / cssHeight);
  const outputScale = Math.max(1 / Math.max(cssWidth, cssHeight), Math.min(clampedDpr, edgeCapScale));

  const canvasWidth = Math.min(MAX_CANVAS_EDGE, Math.max(1, Math.floor(cssWidth * outputScale)));
  const canvasHeight = Math.min(MAX_CANVAS_EDGE, Math.max(1, Math.floor(cssHeight * outputScale)));

  const offsetX = -bounds.x * safeBaseW * scale;
  const offsetY = -bounds.y * safeBaseH * scale;
  const transform: [number, number, number, number, number, number] = [
    outputScale,
    0,
    0,
    outputScale,
    0,
    0,
  ];

  return {
    scale,
    outputScale,
    cssWidth,
    cssHeight,
    canvasWidth,
    canvasHeight,
    offsetX,
    offsetY,
    transform,
  };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function normalizeAndCropLinkRect(
  pdfRect: readonly number[],
  viewport: ViewportPointConverter,
  cropRegion: CropRegion,
): [number, number, number, number] | null {
  if (
    pdfRect.length < 4 ||
    ![pdfRect[0], pdfRect[1], pdfRect[2], pdfRect[3]].every(Number.isFinite) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return null;
  }

  const p1 = viewport.convertToViewportPoint(pdfRect[0]!, pdfRect[1]!);
  const p2 = viewport.convertToViewportPoint(pdfRect[2]!, pdfRect[3]!);
  const vx1 = p1[0]!;
  const vy1 = p1[1]!;
  const vx2 = p2[0]!;
  const vy2 = p2[1]!;

  if (![vx1, vy1, vx2, vy2].every(Number.isFinite)) {
    return null;
  }

  const fx1 = Math.min(vx1, vx2) / viewport.width;
  const fy1 = Math.min(vy1, vy2) / viewport.height;
  const fx2 = Math.max(vx1, vx2) / viewport.width;
  const fy2 = Math.max(vy1, vy2) / viewport.height;

  const bounds = getCropBounds(cropRegion);
  const rx1 = bounds.x;
  const ry1 = bounds.y;
  const rx2 = bounds.x + bounds.w;
  const ry2 = bounds.y + bounds.h;

  const ix1 = Math.max(fx1, rx1);
  const iy1 = Math.max(fy1, ry1);
  const ix2 = Math.min(fx2, rx2);
  const iy2 = Math.min(fy2, ry2);

  if (!(ix2 - ix1 > 1e-6 && iy2 - iy1 > 1e-6)) {
    return null;
  }

  return [
    clamp01((ix1 - rx1) / bounds.w),
    clamp01((iy1 - ry1) / bounds.h),
    clamp01((ix2 - rx1) / bounds.w),
    clamp01((iy2 - ry1) / bounds.h),
  ];
}
