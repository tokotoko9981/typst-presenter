import { describe, expect, it, vi } from 'vitest';
import {
  ChimeEngine,
  clampChimeVolume,
  createResetChimeLatch,
  createSeededChimeLatch,
  evaluateChimeStage,
} from '../../src/core/audio/ChimeEngine.ts';
import {
  exportNotesToMarkdown,
  parseMarkdownSidecar,
} from '../../src/core/notes/NotesManager.ts';
import { PdfEngine, type PdfJsLike, type PdfPageLike } from '../../src/core/pdf/PdfEngine.ts';
import { computeRenderPlan } from '../../src/core/pdf/viewportMath.ts';
import { generateQrSvg, getQrMatrix } from '../../src/core/qr/qrSvg.ts';
import {
  DEFAULT_ZOOM_STATE,
  clampZoomState,
  computeRelativeZoomTransform,
  isZoomed,
  panByNormalizedDelta,
  zoomAtPoint,
} from '../../src/core/zoom/zoomMath.ts';
import { LASER_COLOR_SWATCHES, parseHexRgb } from '../../src/components/SlideStage.tsx';

describe('Phase 2 Features — Unit Tests', () => {
  describe('ChimeEngine & Conference Bell Latch', () => {
    it('fires 1-bell at warning, 2-bell at 00:00, and 3-bell at +1m overtime without double firing', () => {
      let latch = createResetChimeLatch();

      // Disabled or paused should never ring
      expect(
        evaluateChimeStage({
          enabled: false,
          running: true,
          remainingMs: 60_000,
          warningThresholdMs: 180_000,
          latch,
        }).ringCount,
      ).toBeNull();

      expect(
        evaluateChimeStage({
          enabled: true,
          running: false,
          remainingMs: 60_000,
          warningThresholdMs: 180_000,
          latch,
        }).ringCount,
      ).toBeNull();

      // Warning threshold -> 1 bell
      const warnStep = evaluateChimeStage({
        enabled: true,
        running: true,
        remainingMs: 179_000,
        warningThresholdMs: 180_000,
        latch,
      });
      expect(warnStep.ringCount).toBe(1);
      latch = warnStep.nextLatch;

      // Subsequent tick in warning -> no double fire
      expect(
        evaluateChimeStage({
          enabled: true,
          running: true,
          remainingMs: 120_000,
          warningThresholdMs: 180_000,
          latch,
        }).ringCount,
      ).toBeNull();

      // End 00:00 -> 2 bells
      const endStep = evaluateChimeStage({
        enabled: true,
        running: true,
        remainingMs: 0,
        warningThresholdMs: 180_000,
        latch,
      });
      expect(endStep.ringCount).toBe(2);
      latch = endStep.nextLatch;

      // Overtime < +60s -> no fire
      expect(
        evaluateChimeStage({
          enabled: true,
          running: true,
          remainingMs: -30_000,
          warningThresholdMs: 180_000,
          latch,
        }).ringCount,
      ).toBeNull();

      // Overtime >= +60s -> 3 bells
      const overStep = evaluateChimeStage({
        enabled: true,
        running: true,
        remainingMs: -60_000,
        warningThresholdMs: 180_000,
        latch,
      });
      expect(overStep.ringCount).toBe(3);
      latch = overStep.nextLatch;

      // Further overtime -> no double fire
      expect(
        evaluateChimeStage({
          enabled: true,
          running: true,
          remainingMs: -120_000,
          warningThresholdMs: 180_000,
          latch,
        }).ringCount,
      ).toBeNull();
    });

    it('skips 1-bell when warningThresholdMs is 0 and seeds latch mid-talk', () => {
      const latch = createResetChimeLatch();
      const step = evaluateChimeStage({
        enabled: true,
        running: true,
        remainingMs: 10_000,
        warningThresholdMs: 0,
        latch,
      });
      expect(step.ringCount).toBeNull();

      const seeded = createSeededChimeLatch(-5_000, 180_000);
      expect(seeded).toEqual({ warn1: true, end2: true, overtime3: false });
    });

    it('safely falls back when AudioContext is absent and schedules oscillators when present', () => {
      const engineNoAudio = new ChimeEngine();
      expect(engineNoAudio.ring(1, 0.7)).toBe(false);
      engineNoAudio.dispose();

      const started: number[] = [];
      const mockCtx = {
        state: 'running',
        currentTime: 1.0,
        destination: {},
        createOscillator: () => ({
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: (t: number) => started.push(t),
          stop: vi.fn(),
        }),
        createGain: () => ({
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }),
        close: vi.fn(async () => {}),
      };

      const origAudio = (window as unknown as { AudioContext?: unknown }).AudioContext;
      (window as unknown as { AudioContext?: unknown }).AudioContext = function MockAudioContext() {
        return mockCtx;
      };
      try {
        const engine = new ChimeEngine();
        expect(engine.ring(2, 0.8)).toBe(true);
        // 2 strikes * 4 partials = 8 oscillators
        expect(started.length).toBe(8);
        expect(engine.ring(1, 0)).toBe(false);
        expect(clampChimeVolume(1.5)).toBe(1);
        expect(clampChimeVolume(-0.2)).toBe(0);
        engine.dispose();
      } finally {
        (window as unknown as { AudioContext?: unknown }).AudioContext = origAudio;
      }
    });
  });

  describe('Zoom & Pan Math + High-Res Render Plan', () => {
    it('clamps zoom bounds, anchors cursor point, and clamps pan deltas', () => {
      expect(isZoomed(DEFAULT_ZOOM_STATE)).toBe(false);
      expect(clampZoomState({ scale: 0.5, panX: 1, panY: -1 })).toEqual(DEFAULT_ZOOM_STATE);

      const zoomed = zoomAtPoint(DEFAULT_ZOOM_STATE, 2.0, 0.75, 0.25);
      expect(zoomed.scale).toBe(2);
      expect(isZoomed(zoomed)).toBe(true);
      // Cursor at normX=0.75 (cx=0.25) -> panX = 0.25 - 0.25*2 = -0.25
      expect(zoomed.panX).toBeCloseTo(-0.25, 3);
      expect(zoomed.panY).toBeCloseTo(0.25, 3);

      const panned = panByNormalizedDelta(zoomed, 2.0, -2.0);
      expect(panned.panX).toBe(0.5);
      expect(panned.panY).toBe(-0.5);
    });

    it('scales outputScale by zoomScale without altering cssWidth/cssHeight', () => {
      const basePlan = computeRenderPlan(1280, 720, {
        targetWidth: 640,
        targetHeight: 360,
        dpr: 1,
        cropRegion: 'full',
      });
      const zoomedPlan = computeRenderPlan(1280, 720, {
        targetWidth: 640,
        targetHeight: 360,
        dpr: 1,
        cropRegion: 'full',
        zoomScale: 2.5,
      });
      expect(zoomedPlan.cssWidth).toBe(basePlan.cssWidth);
      expect(zoomedPlan.cssHeight).toBe(basePlan.cssHeight);
      expect(zoomedPlan.canvasWidth).toBe(Math.floor(basePlan.cssWidth * 2.5));
    });

    it('renders zoomView at native stage DPR without hitting MAX_CANVAS_EDGE and aligns center offset', () => {
      const basePlan = computeRenderPlan(1280, 720, {
        targetWidth: 1920,
        targetHeight: 1080,
        dpr: 1.5,
        cropRegion: 'full',
      });
      const detailPlan = computeRenderPlan(1280, 720, {
        targetWidth: 1920,
        targetHeight: 1080,
        dpr: 1.5,
        cropRegion: 'full',
        zoomView: { scale: 4, panX: 0, panY: 0 },
      });

      expect(detailPlan.scale).toBeCloseTo(basePlan.scale * 4, 6);
      expect(detailPlan.cssWidth).toBe(1920);
      expect(detailPlan.cssHeight).toBe(1080);
      expect(detailPlan.canvasWidth).toBe(Math.floor(1920 * 1.5));
      expect(detailPlan.canvasHeight).toBe(Math.floor(1080 * 1.5));
      expect(detailPlan.offsetX).toBeCloseTo(-1920 * 1.5, 4);
      expect(detailPlan.offsetY).toBeCloseTo(-1080 * 1.5, 4);

      const exact = computeRelativeZoomTransform(
        { scale: 3.5, panX: -0.25, panY: 0.15 },
        { scale: 3.5, panX: -0.25, panY: 0.15 },
      );
      expect(exact.isExact).toBe(true);
      expect(exact.relScale).toBeCloseTo(1, 6);

      const shifted = computeRelativeZoomTransform(
        { scale: 3.0, panX: -0.1, panY: 0.2 },
        { scale: 2.0, panX: -0.2, panY: 0.1 },
      );
      expect(shifted.isExact).toBe(false);
      expect(shifted.relScale).toBeCloseTo(1.5, 6);
      expect(shifted.deltaPanX).toBeCloseTo(0.2, 6);
      expect(shifted.deltaPanY).toBeCloseTo(0.05, 6);
    });
  });

  describe('Offline SVG QR Generator & Frontmatter qrUrl', () => {
    it('generates offline SVG QR markup and matrix, returning empty for blank input', () => {
      expect(generateQrSvg('   ')).toBe('');
      expect(getQrMatrix('')).toEqual([]);

      const svg = generateQrSvg('https://typst.app');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('</svg>');

      const matrix = getQrMatrix('https://typst.app');
      expect(matrix.length).toBeGreaterThan(20);
    });

    it('parses and round-trips qrUrl and qrLabel in Markdown frontmatter', () => {
      const md = `---
duration: 10
qrUrl: "https://example.com/qna"
qrLabel: "Slides & Repo"
---

<!-- slide: 1 -->
Hello world
`;
      const parsed = parseMarkdownSidecar(md);
      expect(parsed.qrUrl).toBe('https://example.com/qna');
      expect(parsed.qrLabel).toBe('Slides & Repo');

      const exported = exportNotesToMarkdown(
        {
          version: 1,
          deckId: 'd1',
          fileName: 'deck.pdf',
          globalTargetSeconds: 600,
          lastMinutesWarning: 3,
          noteFontSizePx: 16,
          qrUrl: parsed.qrUrl,
          qrLabel: parsed.qrLabel,
          slides: parsed.slides,
        },
        1,
      );
      expect(exported).toContain('qrUrl: "https://example.com/qna"');
      expect(exported).toContain('qrLabel: "Slides & Repo"');
    });
  });

  describe('Laser Color Helpers & Adjacent Page Prefetch Cache', () => {
    it('parses laser hex colors safely with red fallback', () => {
      expect(LASER_COLOR_SWATCHES.map((s) => s.hex)).toEqual(['#ef4444', '#22c55e', '#3b82f6']);
      expect(parseHexRgb('#22c55e')).toEqual([34, 197, 94]);
      expect(parseHexRgb('#3b82f6')).toEqual([59, 130, 246]);
      expect(parseHexRgb('invalid')).toEqual([239, 68, 68]);
    });

    it('prefetches adjacent pages and hits cache on subsequent renderPageToCanvas', async () => {
      const renderCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      const makePage = (pageNum: number): PdfPageLike => ({
        getViewport: ({ scale }) => ({
          width: 800 * scale,
          height: 450 * scale,
          scale,
          convertToViewportPoint: (x, y) => [x * scale, (450 - y) * scale],
        }),
        render: () => {
          renderCounts[pageNum] = (renderCounts[pageNum] ?? 0) + 1;
          return { promise: Promise.resolve(), cancel: vi.fn() };
        },
        getAnnotations: async () => [],
        cleanup: vi.fn(),
      });

      const mockPdfjs: PdfJsLike = {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 6,
            getPageLabels: async () => null,
            getPage: async (n: number) => makePage(n),
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => 0,
            getAttachments: async () => null,
            getAttachmentContent: async () => null,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        }),
      };

      // Stub 2d context with drawImage in jsdom
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function mockGetContext(
        this: HTMLCanvasElement,
        type: string,
      ) {
        if (type === '2d') {
          return {
            clearRect: vi.fn(),
            drawImage: vi.fn(),
          } as unknown as CanvasRenderingContext2D;
        }
        return origGetContext.call(this, type as '2d');
      } as typeof origGetContext;

      try {
        const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
        await engine.loadDeck(new Uint8Array([37, 80, 68, 70]), 'prefetch.pdf');

        const opts = { targetWidth: 640, targetHeight: 360, dpr: 1, cropRegion: 'full' as const };
        engine.prefetchAdjacentPages(2, opts);

        // Wait for async prefetch of pages 3 and 1
        await vi.waitFor(() => {
          expect(engine.hasPrefetchedPage(3)).toBe(true);
          expect(engine.hasPrefetchedPage(1)).toBe(true);
        });
        expect(renderCounts[3]).toBe(1);
        expect(renderCounts[1]).toBe(1);

        // Rendering page 3 now hits prefetch cache without invoking page.render again
        const visible = document.createElement('canvas');
        const res = await engine.renderPageToCanvas(3, visible, opts);
        expect(res?.pageNumber).toBe(3);
        expect(renderCounts[3]).toBe(1);

        // Rendering page 3 with zoomView bypasses 1x prefetch cache and re-renders crisply
        const zoomDetail = document.createElement('canvas');
        const zoomRes = await engine.renderPageToCanvas(3, zoomDetail, {
          ...opts,
          zoomView: { scale: 3, panX: 0, panY: 0 },
        });
        expect(zoomRes?.pageNumber).toBe(3);
        expect(renderCounts[3]).toBe(2);

        // Fill cache beyond MAX_PREFETCH_ENTRIES (4) to verify LRU bound
        engine.prefetchAdjacentPages(5, opts);
        await vi.waitFor(() => {
          expect(engine.hasPrefetchedPage(6)).toBe(true);
          expect(engine.hasPrefetchedPage(4)).toBe(true);
        });
        expect(engine.getPrefetchCacheSize()).toBeLessThanOrEqual(4);

        await engine.destroy();
        expect(engine.getPrefetchCacheSize()).toBe(0);
      } finally {
        HTMLCanvasElement.prototype.getContext = origGetContext;
      }
    });
  });
});
