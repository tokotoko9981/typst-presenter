import { describe, expect, it, vi } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  TRANSLATIONS,
  detectInitialLocale,
} from '../../src/core/i18n/translations.ts';
import { THEME_STORAGE_KEY, detectInitialTheme } from '../../src/core/theme/ThemeContext.tsx';
import {
  exportNotesToMarkdown,
  parseJsonOrPdfpcSidecar,
  parseMarkdownSidecar,
} from '../../src/core/notes/NotesManager.ts';
import {
  MAX_CANVAS_EDGE,
  computeRenderPlan,
  normalizeAndCropLinkRect,
  type ViewportPointConverter,
} from '../../src/core/pdf/index.ts';

describe('Edge Cases: mixed/portrait viewports, malformed sidecars, and i18n parity', () => {
  describe('computeRenderPlan aspect-ratio & bounds', () => {
    it('preserves portrait, square, and ultra-wide aspect ratios across stage and thumbnail bounds', () => {
      const cases = [
        { baseW: 595, baseH: 842, targetW: 260, targetH: 120 }, // A4 portrait -> Next Slide slot
        { baseW: 900, baseH: 1600, targetW: 280, targetH: 136 }, // 9:16 portrait -> Grid slot
        { baseW: 900, baseH: 1600, targetW: 960, targetH: 720 }, // 9:16 portrait -> Stage
        { baseW: 1000, baseH: 1000, targetW: 260, targetH: 120 }, // 1:1 square
        { baseW: 3200, baseH: 800, targetW: 960, targetH: 720 }, // 4:1 ultra-wide
        { baseW: 10, baseH: 10, targetW: 320, targetH: 180 }, // tiny page
      ];

      for (const c of cases) {
        const plan = computeRenderPlan(c.baseW, c.baseH, {
          targetWidth: c.targetW,
          targetHeight: c.targetH,
          dpr: 2,
          cropRegion: 'full',
        });

        expect(plan.cssWidth).toBeLessThanOrEqual(c.targetW);
        expect(plan.cssHeight).toBeLessThanOrEqual(c.targetH);
        expect(plan.canvasWidth).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
        expect(plan.canvasHeight).toBeLessThanOrEqual(MAX_CANVAS_EDGE);

        const expectedRatio = c.baseW / c.baseH;
        const actualRatio = plan.cssWidth / plan.cssHeight;
        expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.03);
      }
    });

    it('clamps oversized viewports strictly within MAX_CANVAS_EDGE without NaN', () => {
      const plan = computeRenderPlan(2400, 3200, {
        targetWidth: 5000,
        targetHeight: 6000,
        dpr: 3,
        cropRegion: 'full',
      });
      expect(plan.canvasWidth).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
      expect(plan.canvasHeight).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
      expect(Number.isFinite(plan.scale)).toBe(true);
      expect(Number.isFinite(plan.outputScale)).toBe(true);
    });
  });

  describe('normalizeAndCropLinkRect on portrait and rotated viewports', () => {
    it('maps PDF link rects accurately onto portrait & rotated viewports', () => {
      const portraitVp: ViewportPointConverter = {
        width: 595,
        height: 842,
        convertToViewportPoint: (x, y) => [x, 842 - y],
      };

      const rect = normalizeAndCropLinkRect([59.5, 421, 297.5, 631.5], portraitVp, 'full');
      expect(rect).not.toBeNull();
      expect(rect![0]).toBeCloseTo(0.1, 3);
      expect(rect![1]).toBeCloseTo(0.25, 3);
      expect(rect![2]).toBeCloseTo(0.5, 3);
      expect(rect![3]).toBeCloseTo(0.5, 3);

      // Rotated viewport mapping (axes swapped cleanly)
      const rotatedVp: ViewportPointConverter = {
        width: 842,
        height: 595,
        convertToViewportPoint: (x, y) => [842 - y, x],
      };
      const rotRect = normalizeAndCropLinkRect([100, 200, 300, 500], rotatedVp, 'full');
      expect(rotRect).not.toBeNull();
      expect(rotRect![0]).toBeGreaterThanOrEqual(0);
      expect(rotRect![2]).toBeLessThanOrEqual(1);
      expect(rotRect![2]).toBeGreaterThan(rotRect![0]);
      expect(rotRect![3]).toBeGreaterThan(rotRect![1]);
    });
  });

  describe('NotesManager edge-case inputs', () => {
    it('handles empty, whitespace-only, BOM+CRLF, and valid/invalid endTime values', () => {
      expect(Object.keys(parseMarkdownSidecar('').slides)).toHaveLength(0);
      expect(Object.keys(parseMarkdownSidecar('   \n\r\n  ').slides)).toHaveLength(0);

      const invalidTimes = `---\nendTime: "99:99"\n---\n<!-- slide: 1 -->\nNote A`;
      const resInvalid1 = parseMarkdownSidecar(invalidTimes);
      expect(resInvalid1.endTimeHHMM).toBeUndefined();
      expect(resInvalid1.slides[1]?.markdown).toBe('Note A');

      const resInvalid2 = parseMarkdownSidecar(`---\nendTime: "24:00"\n---\n<!-- slide: 1 -->\nB`);
      expect(resInvalid2.endTimeHHMM).toBeUndefined();

      const resInvalid3 = parseMarkdownSidecar(`---\nendTime: "12:60"\n---\n<!-- slide: 1 -->\nC`);
      expect(resInvalid3.endTimeHHMM).toBeUndefined();

      const validBomCrlf =
        '\uFEFF---\r\nduration: 12\r\nendTime: "23:59"\r\n---\r\n\r\n<!-- slide: 1 -->\r\nHello\r\n---\r\n<!-- slide: 99 -->\r\nExtra page note';
      const resValid = parseMarkdownSidecar(validBomCrlf);
      expect(resValid.durationMinutes).toBe(12);
      expect(resValid.endTimeHHMM).toBe('23:59');
      expect(resValid.slides[1]?.markdown).toBe('Hello');
      expect(resValid.slides[99]?.markdown).toBe('Extra page note');

      const exported = exportNotesToMarkdown(
        {
          version: 1,
          deckId: 'd1',
          fileName: 'd.pdf',
          globalTargetSeconds: 720,
          lastMinutesWarning: 3,
          endTimeHHMM: '99:99',
          noteFontSizePx: 16,
          slides: resValid.slides,
        },
        2,
      );
      expect(exported).not.toContain('endTime');
    });

    it('rejects malformed JSON/.pdfpc and strips invalid endTime in JSON sidecars', () => {
      expect(() => parseJsonOrPdfpcSidecar('{broken json', 'broken.json')).toThrow();
      expect(() => parseJsonOrPdfpcSidecar('[]', 'array.pdfpc')).toThrow();

      const pdfpcInvalidTime = JSON.stringify({
        pdfpcFormat: 2,
        endTime: '25:00',
        pages: [{ idx: 0, note: 'Slide 1' }],
      });
      const parsed = parseJsonOrPdfpcSidecar(pdfpcInvalidTime, 'talk.pdfpc');
      expect(parsed.endTimeHHMM).toBeUndefined();
      expect(parsed.slides[1]?.markdown).toBe('Slide 1');
    });
  });

  describe('i18n translation parity', () => {
    it('has identical keys and non-empty strings in both EN and JA dictionaries', () => {
      const enKeys = Object.keys(TRANSLATIONS.en).sort();
      const jaKeys = Object.keys(TRANSLATIONS.ja).sort();
      expect(enKeys).toEqual(jaKeys);

      for (const key of enKeys as Array<keyof typeof TRANSLATIONS.en>) {
        expect(TRANSLATIONS.en[key].trim().length).toBeGreaterThan(0);
        expect(TRANSLATIONS.ja[key].trim().length).toBeGreaterThan(0);
      }
    });

    it('respects saved locale in localStorage and defaults cleanly', () => {
      localStorage.removeItem(LOCALE_STORAGE_KEY);
      expect(['en', 'ja']).toContain(detectInitialLocale());

      localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');
      expect(detectInitialLocale()).toBe('ja');

      localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
      expect(detectInitialLocale()).toBe('en');

      localStorage.removeItem(LOCALE_STORAGE_KEY);
    });

    it('detectInitialTheme respects saved theme and follows OS prefers-color-scheme', () => {
      const originalMatchMedia = window.matchMedia;
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);

        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: vi.fn().mockImplementation((query: string) => ({
            matches: query.includes('prefers-color-scheme: light'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        });
        expect(detectInitialTheme()).toBe('light');

        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        });
        expect(detectInitialTheme()).toBe('dark');

        localStorage.setItem(THEME_STORAGE_KEY, 'light');
        expect(detectInitialTheme()).toBe('light');

        localStorage.setItem(THEME_STORAGE_KEY, 'dark');
        expect(detectInitialTheme()).toBe('dark');
      } finally {
        localStorage.removeItem(THEME_STORAGE_KEY);
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: originalMatchMedia,
        });
      }
    });
  });
});
