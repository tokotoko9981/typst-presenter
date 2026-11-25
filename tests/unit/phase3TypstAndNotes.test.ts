import { describe, expect, it, vi } from 'vitest';
import {
  evaluateDirectOverwrite,
  overwriteLinkedMarkdown,
  type LinkedNotesSource,
} from '../../src/core/files/NotesFileSaver.ts';
import {
  buildLogicalSlideGroups,
  hasRepeatedPageLabels,
  isSameLogicalSlide,
  resolveNoteForPage,
} from '../../src/core/notes/logicalSlides.ts';
import {
  createEmptyNotesBundle,
  mergeHotReloadNotesBundle,
  parseMarkdownSidecar,
} from '../../src/core/notes/NotesManager.ts';
import { parseNotesAttachments } from '../../src/core/pdf/extractors.ts';
import {
  checkTypstCli,
  getLaunchFile,
  readCompiledPdf,
  setCloseGuard,
  startTypstWatch,
} from '../../src/core/platform/DesktopBridge.ts';
import {
  aggregateReportByLogicalSlide,
  type RehearsalReport,
} from '../../src/core/timer/RehearsalTracker.ts';
import { computeTimerSnapshot } from '../../src/core/timer/TimerEngine.ts';
import { parseTypstDiagnostics } from '../../src/core/typst/typstDiagnostics.ts';
import {
  mergeEmbeddedWithTypstQuery,
  parseTypstPdfpcQueryJson,
} from '../../src/core/typst/typstPdfpcParser.ts';

const encoder = new TextEncoder();

describe('Phase 3: Typst Single-File, Hot-Reload Provenance, Logical Slides & Direct Save', () => {
  describe('extractors.ts targetSeconds & frontmatter retention', () => {
    it('extracts targetSeconds, globalTargetSeconds, endTimeHHMM, and qrUrl from JSON attachments', async () => {
      const jsonPayload = JSON.stringify({
        version: 1,
        globalTargetSeconds: 600,
        lastMinutesWarning: 2,
        endTimeHHMM: '15:30',
        qrUrl: 'https://example.com/qa',
        qrLabel: 'Q&A Repo',
        slides: {
          '1': { markdown: 'Opening', targetSeconds: 30 },
          '2': { markdown: 'Architecture', targetSeconds: 90 },
        },
      });
      const parsed = await parseNotesAttachments({
        async getAttachments() {
          return {
            'typst-presenter-notes.json': {
              filename: 'typst-presenter-notes.json',
              content: encoder.encode(jsonPayload),
            },
          };
        },
      });

      expect(parsed.notes).toEqual({ 1: 'Opening', 2: 'Architecture' });
      expect(parsed.targets).toEqual({ 1: 30, 2: 90 });
      expect(parsed.pdfpcConfig).toEqual({
        durationMinutes: 10,
        lastMinutes: 2,
        endTimeHHMM: '15:30',
        qrUrl: 'https://example.com/qa',
        qrLabel: 'Q&A Repo',
      });
    });

    it('retains leading YAML frontmatter and <!-- target: N --> from attached Markdown', async () => {
      const md = [
        '---',
        'duration: 12',
        'lastMinutes: 3',
        'qrUrl: https://example.com/slides',
        '---',
        '<!-- target: 45 -->',
        'Slide 1 body',
        '---',
        '<!-- target: 75 -->',
        'Slide 2 body',
      ].join('\n');

      const parsed = await parseNotesAttachments({
        async getAttachments() {
          return {
            'notes.md': {
              filename: 'notes.md',
              content: encoder.encode(md),
            },
          };
        },
      });

      expect(parsed.targets).toEqual({ 1: 45, 2: 75 });
      expect(parsed.pdfpcConfig).toEqual({
        durationMinutes: 12,
        lastMinutes: 3,
        qrUrl: 'https://example.com/slides',
      });
      const bundle = createEmptyNotesBundle(
        'deck-1',
        'deck.pdf',
        parsed.notes,
        parsed.pdfpcConfig,
        parsed.targets,
      );
      expect(bundle.slides[1]?.source).toBe('embedded');
      expect(bundle.slides[1]?.targetSeconds).toBe(45);
      expect(bundle.slides[1]?.markdown).toBe('Slide 1 body');
      expect(bundle.qrUrl).toBe('https://example.com/slides');
    });
  });

  describe('mergeHotReloadNotesBundle provenance sync', () => {
    it('updates embedded slides, removes deleted embedded slides, and preserves manual/sidecar slides', () => {
      const prev = {
        version: 1 as const,
        deckId: 'old',
        fileName: 'slides.pdf',
        globalTargetSeconds: 900,
        lastMinutesWarning: 3,
        noteFontSizePx: 16,
        slides: {
          1: { markdown: 'Old embedded 1', targetSeconds: 20, updatedAt: 100, source: 'embedded' as const },
          2: { markdown: 'Manual edit 2', targetSeconds: 60, updatedAt: 200, source: 'manual' as const },
          3: { markdown: 'Sidecar 3', targetSeconds: 40, updatedAt: 300, source: 'sidecar' as const },
          4: { markdown: 'Removed embedded 4', updatedAt: 400, source: 'embedded' as const },
        },
      };

      const next = mergeHotReloadNotesBundle(prev, {
        deckId: 'new-hash',
        fileName: 'slides.pdf',
        numPages: 4,
        extractedNotes: {
          1: 'Updated embedded 1',
          2: 'New embedded 2 should not overwrite manual',
          3: 'New embedded 3 should not overwrite sidecar',
        },
        extractedTargets: { 1: 35, 2: 10 },
        extractedPdfpcConfig: { qrUrl: 'https://example.com/updated' },
      });

      expect(next.deckId).toBe('new-hash');
      expect(next.slides[1]?.markdown).toBe('Updated embedded 1');
      expect(next.slides[1]?.targetSeconds).toBe(35);
      expect(next.slides[1]?.source).toBe('embedded');
      expect(next.slides[2]?.markdown).toBe('Manual edit 2');
      expect(next.slides[2]?.source).toBe('manual');
      expect(next.slides[3]?.markdown).toBe('Sidecar 3');
      expect(next.slides[3]?.source).toBe('sidecar');
      expect(next.slides[4]).toBeUndefined();
      // Since sidecar slide exists, top-level qrUrl is protected unless unset
      expect(next.qrUrl).toBeUndefined();
    });
  });

  describe('typstPdfpcParser & typstDiagnostics', () => {
    it('parses Polylux/Touying <pdfpc> JSON and fills only missing embedded slides', () => {
      const rawJson = JSON.stringify([
        { t: 'Duration', v: 15 },
        { t: 'LastMinutes', v: 2 },
        { t: 'Note', v: '<!-- target: 25 -->\nPolylux S1' },
        { t: 'NewSlide' },
        { t: 'Note', v: 'Polylux S2' },
      ]);
      const queryRes = parseTypstPdfpcQueryJson(rawJson);
      expect(queryRes.notes).toEqual({ 1: 'Polylux S1', 2: 'Polylux S2' });
      expect(queryRes.targets).toEqual({ 1: 25 });
      expect(queryRes.pdfpcConfig).toEqual({ durationMinutes: 15, lastMinutes: 2 });

      const merged = mergeEmbeddedWithTypstQuery(
        { 1: 'Attached S1' },
        { 1: 50 },
        { durationMinutes: 10 },
        queryRes,
      );
      expect(merged.notes).toEqual({ 1: 'Attached S1', 2: 'Polylux S2' });
      expect(merged.targets).toEqual({ 1: 50 });
      expect(merged.pdfpcConfig).toEqual({ durationMinutes: 10, lastMinutes: 2 });
    });

    it('parses Typst short diagnostic output and strips Windows UNC prefix', () => {
      const stderr = String.raw`\\?\C:\deck\slides.typ:12:5: error: unclosed delimiter
\\?\C:\deck\slides.typ:15:1: warning: unused variable`;
      const diags = parseTypstDiagnostics(stderr);
      expect(diags).toHaveLength(2);
      expect(diags[0]).toMatchObject({
        file: String.raw`C:\deck\slides.typ`,
        line: 12,
        column: 5,
        severity: 'error',
        message: 'unclosed delimiter',
      });
      expect(diags[1]?.severity).toBe('warning');

      const fallback = parseTypstDiagnostics('error: generic failure');
      expect(fallback).toHaveLength(1);
      expect(fallback[0]?.message).toBe('generic failure');
    });
  });

  describe('logicalSlides & RehearsalTracker aggregation', () => {
    it('ignores standard sequential pageLabels and shares notes only for repeated labels', () => {
      expect(hasRepeatedPageLabels(null, 3)).toBe(false);
      expect(hasRepeatedPageLabels(['1', '2', '3'], 3)).toBe(false);

      const labels = ['1', '2', '2', '2', '3'];
      expect(hasRepeatedPageLabels(labels, 5)).toBe(true);
      const groups = buildLogicalSlideGroups(labels, 5);
      expect(groups.map((g) => g.pages)).toEqual([[1], [2, 3, 4], [5]]);

      const slides = {
        2: { markdown: 'Explain step by step', targetSeconds: 60, updatedAt: 100 },
      };
      const resolvedP3 = resolveNoteForPage(slides, 3, labels, 5, true);
      expect(resolvedP3.entry?.markdown).toBe('Explain step by step');
      expect(resolvedP3.ownerPage).toBe(2);
      expect(resolvedP3.inheritedFromPage).toBe(2);

      const resolvedOff = resolveNoteForPage(slides, 3, labels, 5, false);
      expect(resolvedOff.entry).toBeUndefined();
      expect(resolvedOff.ownerPage).toBe(3);

      const report: RehearsalReport = {
        totalActualSeconds: 95,
        totalTargetSeconds: 60,
        slidesVisited: 5,
        totalPages: 5,
        slides: [
          { page: 1, actualSeconds: 10, visits: 1, status: 'no-target' },
          { page: 2, actualSeconds: 20, targetSeconds: 60, deltaSeconds: -40, visits: 1, status: 'ahead' },
          { page: 3, actualSeconds: 25, visits: 1, status: 'no-target' },
          { page: 4, actualSeconds: 20, visits: 1, status: 'no-target' },
          { page: 5, actualSeconds: 20, visits: 1, status: 'no-target' },
        ],
      };
      const agg = aggregateReportByLogicalSlide(report, labels);
      expect(agg.logicalSlides).toHaveLength(3);
      expect(agg.logicalSlides[1]).toMatchObject({
        label: '2',
        pages: [2, 3, 4],
        actualSeconds: 65,
        targetSeconds: 60,
        deltaSeconds: 5,
        status: 'overtime',
      });
    });

    it('detects same logical slide for Option C subslide timer continuity', () => {
      const labels = ['1', '2', '2', '2', '3'];
      expect(isSameLogicalSlide(2, 3, labels, 5, true)).toBe(true);
      expect(isSameLogicalSlide(3, 4, labels, 5, true)).toBe(true);
      expect(isSameLogicalSlide(4, 2, labels, 5, true)).toBe(true);

      // Crossing logical boundaries or disabling sharing resets slide timer
      expect(isSameLogicalSlide(1, 2, labels, 5, true)).toBe(false);
      expect(isSameLogicalSlide(4, 5, labels, 5, true)).toBe(false);
      expect(isSameLogicalSlide(2, 3, labels, 5, false)).toBe(false);
      expect(isSameLogicalSlide(2, 3, ['1', '2', '3', '4', '5'], 5, true)).toBe(false);
      expect(isSameLogicalSlide(2, 3, null, 5, true)).toBe(false);
    });

    it('computes countdown directly from countdownMinutes without end-time override', () => {
      const now = 1_700_000_000_000;
      const snap = computeTimerSnapshot({
        running: true,
        accumulatedElapsedMs: 30_000,
        lastResumeTimestampMs: now - 15_000,
        slideAccumulatedElapsedMs: 5_000,
        slideLastResumeTimestampMs: now - 5_000,
        countdownMinutes: 5,
        lastMinutesWarning: 1,
        nowMs: now,
      });
      expect(snap.totalElapsedMs).toBe(45_000);
      expect(snap.countdownTargetMs).toBe(300_000);
      expect(snap.remainingMs).toBe(255_000);
      expect(snap.slideElapsedMs).toBe(10_000);
    });
  });

  describe('NotesFileSaver direct overwrite & Marp/Slidev guard', () => {
    it('blocks Marp/Slidev sources and allows pure Markdown overwrite via FileSystemFileHandle', async () => {
      const marpParsed = parseMarkdownSidecar('---\nmarp: true\n---\n# Slide\n<!-- note -->');
      expect(marpParsed.isMarpOrSlidev).toBe(true);

      const marpSource: LinkedNotesSource = {
        kind: 'fs-handle',
        fileName: 'deck.md',
        format: 'md',
        isMarpOrSlidev: true,
        handle: {
          name: 'deck.md',
          getFile: async () => new File([], 'deck.md'),
          createWritable: async () => ({ write: async () => {}, close: async () => {} }),
        },
      };
      expect(evaluateDirectOverwrite(marpSource)).toEqual({
        allowed: false,
        reason: 'marp-slidev-protected',
      });
      await expect(overwriteLinkedMarkdown(marpSource, '# overwritten')).rejects.toThrow(
        /marp-slidev-protected/,
      );

      const writeSpy = vi.fn(async () => {});
      const closeSpy = vi.fn(async () => {});
      const pureMdSource: LinkedNotesSource = {
        kind: 'fs-handle',
        fileName: 'notes.md',
        format: 'md',
        isMarpOrSlidev: false,
        handle: {
          name: 'notes.md',
          getFile: async () => new File([], 'notes.md'),
          queryPermission: async () => 'granted',
          createWritable: async () => ({ write: writeSpy, close: closeSpy }),
        },
      };
      expect(evaluateDirectOverwrite(pureMdSource)).toEqual({ allowed: true });
      await overwriteLinkedMarkdown(pureMdSource, '<!-- slide: 1 -->\nHello');
      expect(writeSpy).toHaveBeenCalledWith('<!-- slide: 1 -->\nHello');
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('DesktopBridge Phase 3 IPC wrappers', () => {
    it('invokes new Tauri commands cleanly when __TAURI_INTERNALS__ is mocked', async () => {
      const invokeMock = vi.fn(async (cmd: string) => {
        if (cmd === 'check_typst_cli') {
          return { available: true, version: 'typst 0.15.1', path: 'typst.exe', error: null };
        }
        if (cmd === 'get_launch_file') {
          return { path: 'C:\\slides.typ', kind: 'typ' };
        }
        if (cmd === 'read_compiled_pdf') {
          return new Uint8Array([37, 80, 68, 70]).buffer;
        }
        return null;
      });
      (window as unknown as { __TAURI_INTERNALS__?: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      try {
        expect(await checkTypstCli()).toMatchObject({ available: true, version: 'typst 0.15.1' });
        expect(await getLaunchFile()).toEqual({ path: 'C:\\slides.typ', kind: 'typ' });
        await startTypstWatch('C:\\slides.typ', { root: 'C:\\' });
        await setCloseGuard(true);
        const bytes = await readCompiledPdf();
        expect(new Uint8Array(bytes)).toEqual(new Uint8Array([37, 80, 68, 70]));
      } finally {
        delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      }
    });
  });
});
