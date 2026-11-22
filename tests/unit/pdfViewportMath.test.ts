import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_EDGE,
  MAX_DPR,
  computeRenderPlan,
  computeSuggestedCropMode,
  getCropBounds,
  normalizeAndCropLinkRect,
  resolveSplitCropRegions,
  type ViewportPointConverter,
} from '../../src/core/pdf/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('pdfViewportMath', () => {
  describe('computeSuggestedCropMode', () => {
    it('returns full at or below 2.4 and split-horizontal above 2.4', () => {
      expect(computeSuggestedCropMode(16 / 9)).toBe('full');
      expect(computeSuggestedCropMode(2.39)).toBe('full');
      expect(computeSuggestedCropMode(2.4)).toBe('full');
      expect(computeSuggestedCropMode(2.401)).toBe('split-horizontal');
      expect(computeSuggestedCropMode(32 / 9)).toBe('split-horizontal');
    });
  });

  describe('getCropBounds', () => {
    it('returns exact normalized fractions for all 5 CropRegions', () => {
      expect(getCropBounds('full')).toEqual({ x: 0, y: 0, w: 1, h: 1 });
      expect(getCropBounds('left-half')).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
      expect(getCropBounds('right-half')).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
      expect(getCropBounds('top-half')).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
      expect(getCropBounds('bottom-half')).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
    });
  });

  describe('resolveSplitCropRegions', () => {
    it('maps full, split-horizontal, and split-vertical with and without swapSplitHalves', () => {
      expect(resolveSplitCropRegions('full')).toEqual({
        slideRegion: 'full',
        notesRegion: null,
      });
      expect(resolveSplitCropRegions('full', true)).toEqual({
        slideRegion: 'full',
        notesRegion: null,
      });

      expect(resolveSplitCropRegions('split-horizontal')).toEqual({
        slideRegion: 'left-half',
        notesRegion: 'right-half',
      });
      expect(resolveSplitCropRegions('split-horizontal', true)).toEqual({
        slideRegion: 'right-half',
        notesRegion: 'left-half',
      });

      expect(resolveSplitCropRegions('split-vertical')).toEqual({
        slideRegion: 'top-half',
        notesRegion: 'bottom-half',
      });
      expect(resolveSplitCropRegions('split-vertical', true)).toEqual({
        slideRegion: 'bottom-half',
        notesRegion: 'top-half',
      });
    });
  });

  describe('computeRenderPlan', () => {
    it('fits 16:9 full page into container and caps dpr at 2.5', () => {
      const plan = computeRenderPlan(800, 450, {
        targetWidth: 1600,
        targetHeight: 1200,
        dpr: 4,
        cropRegion: 'full',
      });

      expect(plan.scale).toBeCloseTo(2, 5);
      expect(plan.cssWidth).toBe(1600);
      expect(plan.cssHeight).toBe(900);
      expect(plan.outputScale).toBe(MAX_DPR);
      expect(plan.canvasWidth).toBe(4000);
      expect(plan.canvasHeight).toBe(2250);
      expect(plan.offsetX).toBeCloseTo(0);
      expect(plan.offsetY).toBeCloseTo(0);
      expect(plan.transform).toEqual([MAX_DPR, 0, 0, MAX_DPR, 0, 0]);
    });

    it('clamps canvas dimensions to 4096px max edge on large viewports', () => {
      const plan = computeRenderPlan(800, 450, {
        targetWidth: 3200,
        targetHeight: 1800,
        dpr: 2.5,
        cropRegion: 'full',
      });

      expect(plan.cssWidth).toBe(3200);
      expect(plan.cssHeight).toBe(1800);
      expect(plan.canvasWidth).toBe(MAX_CANVAS_EDGE);
      expect(plan.canvasHeight).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
      expect(plan.outputScale).toBeCloseTo(4096 / 3200, 5);
    });

    it('computes crop offsets for left-half, right-half, top-half, and bottom-half', () => {
      const right = computeRenderPlan(1600, 450, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'right-half',
      });
      expect(right.scale).toBeCloseTo(1, 5);
      expect(right.cssWidth).toBe(800);
      expect(right.cssHeight).toBe(450);
      expect(right.offsetX).toBe(-800);
      expect(right.offsetY).toBeCloseTo(0);

      const bottom = computeRenderPlan(800, 900, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'bottom-half',
      });
      expect(bottom.scale).toBeCloseTo(1, 5);
      expect(bottom.cssWidth).toBe(800);
      expect(bottom.cssHeight).toBe(450);
      expect(bottom.offsetX).toBeCloseTo(0);
      expect(bottom.offsetY).toBe(-450);
    });

    it('guards non-positive or non-finite targetWidth, targetHeight, baseWidth, baseHeight, and dpr without oversized allocation', () => {
      const zeroTarget = computeRenderPlan(1600, 900, {
        targetWidth: 0,
        targetHeight: 0,
        dpr: 2,
        cropRegion: 'full',
      });
      expect(zeroTarget.cssWidth).toBe(1);
      expect(zeroTarget.cssHeight).toBe(1);
      expect(zeroTarget.canvasWidth).toBe(2);
      expect(zeroTarget.canvasHeight).toBe(2);
      expect(Number.isFinite(zeroTarget.scale)).toBe(true);
      expect(zeroTarget.scale).toBeGreaterThan(0);

      const negHeight = computeRenderPlan(800, 450, {
        targetWidth: 800,
        targetHeight: -50,
        dpr: Number.NaN,
        cropRegion: 'right-half',
      });
      expect(negHeight.cssWidth).toBe(1);
      expect(negHeight.cssHeight).toBe(1);
      expect(negHeight.outputScale).toBe(1);
      expect(negHeight.canvasWidth).toBe(1);
      expect(negHeight.canvasHeight).toBe(1);

      const zeroBase = computeRenderPlan(0, -10, {
        targetWidth: 400,
        targetHeight: 300,
        dpr: 0,
        cropRegion: 'full',
      });
      expect(zeroBase.cssWidth).toBe(300);
      expect(zeroBase.cssHeight).toBe(300);
      expect(zeroBase.outputScale).toBe(1);
    });
  });

  describe('normalizeAndCropLinkRect with PDF-to-Viewport math & real PDF.js PageViewport', () => {
    it('normalizes PDF bottom-left coordinates (rotation 0) and crops across halves', () => {
      const viewport: ViewportPointConverter = {
        width: 1000,
        height: 500,
        convertToViewportPoint(x: number, y: number): [number, number] {
          return [x, 500 - y];
        },
      };

      // PDF rect in left-top quadrant: x=[100..300], y=[350..450] (from bottom) => viewport y=[50..150] (from top)
      const leftFull = normalizeAndCropLinkRect([100, 350, 300, 450], viewport, 'full');
      expect(leftFull).toEqual([0.1, 0.1, 0.3, 0.3]);

      const inLeftHalf = normalizeAndCropLinkRect([100, 350, 300, 450], viewport, 'left-half');
      expect(inLeftHalf).toEqual([0.2, 0.1, 0.6, 0.3]);

      // Completely outside right-half
      expect(normalizeAndCropLinkRect([100, 350, 300, 450], viewport, 'right-half')).toBeNull();

      // Straddling center x=500 ([400..600]) cropped to right-half ([500..1000])
      const straddleRight = normalizeAndCropLinkRect([400, 100, 600, 200], viewport, 'right-half');
      expect(straddleRight![0]).toBeCloseTo(0, 6);
      expect(straddleRight![1]).toBeCloseTo(0.6, 6);
      expect(straddleRight![2]).toBeCloseTo(0.2, 6);
      expect(straddleRight![3]).toBeCloseTo(0.8, 6);

      // Top/bottom split checks
      expect(normalizeAndCropLinkRect([100, 350, 300, 450], viewport, 'top-half')).toEqual([
        0.1, 0.2, 0.3, 0.6,
      ]);
      expect(normalizeAndCropLinkRect([100, 350, 300, 450], viewport, 'bottom-half')).toBeNull();
    });

    it('handles real PDF.js PageViewport at rotation 0 and rotation 90 accurately', async () => {
      const pdfBytes = new Uint8Array(
        readFileSync(path.join(projectRoot, 'tests', 'fixtures', 'embedded-notes.pdf')),
      );
      const task = pdfjsLegacy.getDocument({ data: pdfBytes });
      const doc = await task.promise;
      try {
        const page = await doc.getPage(1);
        const vp0 = page.getViewport({ scale: 1, rotation: 0 });
        const vp90 = page.getViewport({ scale: 1, rotation: 90 });

        expect(vp90.width).toBeCloseTo(vp0.height, 4);
        expect(vp90.height).toBeCloseTo(vp0.width, 4);

        const rect0 = normalizeAndCropLinkRect([0, 0, vp0.width / 2, vp0.height / 2], vp0, 'full');
        expect(rect0).not.toBeNull();
        expect(rect0![0]).toBeCloseTo(0, 4);
        expect(rect0![1]).toBeCloseTo(0.5, 4);
        expect(rect0![2]).toBeCloseTo(0.5, 4);
        expect(rect0![3]).toBeCloseTo(1, 4);

        const rect90 = normalizeAndCropLinkRect([0, 0, vp0.width / 2, vp0.height / 2], vp90, 'full');
        expect(rect90).not.toBeNull();
        for (const coord of rect90!) {
          expect(coord).toBeGreaterThanOrEqual(0);
          expect(coord).toBeLessThanOrEqual(1);
        }
      } finally {
        await task.destroy();
      }
    });

    it('returns null when pdfRect or converted viewport coordinates contain NaN or Infinity', () => {
      const finiteViewport: ViewportPointConverter = {
        width: 1000,
        height: 500,
        convertToViewportPoint(x: number, y: number): [number, number] {
          return [x, 500 - y];
        },
      };

      expect(normalizeAndCropLinkRect([NaN, 0, 100, 100], finiteViewport, 'full')).toBeNull();
      expect(normalizeAndCropLinkRect([0, Infinity, 100, 100], finiteViewport, 'full')).toBeNull();
      expect(normalizeAndCropLinkRect([0, 0, -Infinity, 100], finiteViewport, 'full')).toBeNull();
      expect(normalizeAndCropLinkRect([0, 0, 100, Number.NaN], finiteViewport, 'full')).toBeNull();
      expect(normalizeAndCropLinkRect([0, 0, 100], finiteViewport, 'full')).toBeNull();

      const nonFiniteConverter: ViewportPointConverter = {
        width: 1000,
        height: 500,
        convertToViewportPoint: () => [Number.NaN, 100],
      };
      expect(normalizeAndCropLinkRect([10, 10, 100, 100], nonFiniteConverter, 'full')).toBeNull();

      expect(
        normalizeAndCropLinkRect(
          [10, 10, 100, 100],
          { width: 0, height: 500, convertToViewportPoint: (x, y) => [x, y] },
          'full',
        ),
      ).toBeNull();
      expect(
        normalizeAndCropLinkRect(
          [10, 10, 100, 100],
          { width: 500, height: Number.POSITIVE_INFINITY, convertToViewportPoint: (x, y) => [x, y] },
          'full',
        ),
      ).toBeNull();

      // Degenerate sub-1e-6 rect is filtered out
      expect(normalizeAndCropLinkRect([100, 100, 100.0001, 200], finiteViewport, 'full')).toBeNull();
    });
  });
});
