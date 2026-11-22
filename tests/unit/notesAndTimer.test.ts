import { describe, expect, it } from 'vitest';
import {
  createEmptyNotesBundle,
  exportNotesToJson,
  exportNotesToMarkdown,
  exportNotesToPdfpc,
  parseSidecarFileContent,
} from '../../src/core/notes/NotesManager.ts';
import {
  computeTimerSnapshot,
  formatCountdownMMSS,
  formatDurationMMSS,
  resolveEndTimeTargetMs,
} from '../../src/core/timer/TimerEngine.ts';

describe('NotesManager & TimerEngine unit tests', () => {
  it('parses and exports Markdown notes with slide markers and target directives', () => {
    const md = `<!-- slide: 1 -->\n<!-- target: 45 -->\n# Intro\nHello\n\n---\n\n<!-- slide: 2 -->\nSecond slide`;
    const parsed = parseSidecarFileContent(md, 'notes.md');
    expect(parsed.slides[1]?.markdown).toContain('# Intro');
    expect(parsed.slides[1]?.targetSeconds).toBe(45);
    expect(parsed.slides[2]?.markdown).toBe('Second slide');

    const mdWithFrontmatter = `---\nduration: 4\nlastMinutes: 1\n---\n\n<!-- slide: 1 -->\n<!-- target: 15 -->\nOpening\n`;
    const parsedFm = parseSidecarFileContent(mdWithFrontmatter, 'talk.md');
    expect(parsedFm.durationMinutes).toBe(4);
    expect(parsedFm.lastMinutesWarning).toBe(1);
    expect(parsedFm.slides[1]?.targetSeconds).toBe(15);
    expect(parsedFm.slides[1]?.markdown).toBe('Opening');

    const bundle = createEmptyNotesBundle('deck-1', 'test.pdf');
    bundle.slides = parsed.slides;
    const exportedMd = exportNotesToMarkdown(bundle, 2);
    expect(exportedMd).toContain('<!-- slide: 1 -->');
    expect(exportedMd).toContain('<!-- target: 45 -->');
    expect(exportedMd).toContain('Second slide');
  });

  it('parses and exports .pdfpc v2 and DeckNotesBundle JSON formats', () => {
    const pdfpcRaw = JSON.stringify({
      pdfpcFormat: 2,
      duration: 20,
      lastMinutes: 4,
      noteFontSize: 20,
      pages: [
        { idx: 0, label: '1', note: 'Slide 1 note' },
        { idx: 2, label: '3', note: 'Slide 3 note' },
      ],
    });
    const parsed = parseSidecarFileContent(pdfpcRaw, 'talk.pdfpc');
    expect(parsed.durationMinutes).toBe(20);
    expect(parsed.lastMinutesWarning).toBe(4);
    expect(parsed.noteFontSizePx).toBe(20);
    expect(parsed.slides[1]?.markdown).toBe('Slide 1 note');
    expect(parsed.slides[3]?.markdown).toBe('Slide 3 note');

    const bundle = createEmptyNotesBundle('deck-2', 'talk.pdf');
    bundle.slides = parsed.slides;
    bundle.globalTargetSeconds = 1200;
    bundle.lastMinutesWarning = 4;
    bundle.noteFontSizePx = 20;

    const jsonOut = exportNotesToJson(bundle);
    const reParsedJson = parseSidecarFileContent(jsonOut, 'talk.json');
    expect(reParsedJson.slides[1]?.markdown).toBe('Slide 1 note');

    const pdfpcOut = exportNotesToPdfpc(bundle, 3, ['i', 'ii', 'iii']);
    const parsedPdfpcOut = JSON.parse(pdfpcOut) as { pdfpcFormat: number; pages: Array<{ label: string; note: string }> };
    expect(parsedPdfpcOut.pdfpcFormat).toBe(2);
    expect(parsedPdfpcOut.pages[0]?.label).toBe('i');
    expect(parsedPdfpcOut.pages[2]?.note).toBe('Slide 3 note');
  });

  it('rejects malformed JSON sidecars with a descriptive error', () => {
    expect(() => parseSidecarFileContent('{bad', 'broken.pdfpc')).toThrow(/Invalid JSON/i);
  });

  it('computes timer snapshots, warning states, overtime, and end_time targets accurately', () => {
    const now = 1_700_000_000_000;
    const snap = computeTimerSnapshot({
      running: true,
      accumulatedElapsedMs: 50_000,
      lastResumeTimestampMs: now - 25_000,
      slideAccumulatedElapsedMs: 10_000,
      slideLastResumeTimestampMs: now - 5_000,
      countdownMinutes: 1,
      lastMinutesWarning: 2,
      slideTargetSeconds: 10,
      nowMs: now,
    });

    expect(snap.totalElapsedMs).toBe(75_000);
    expect(snap.remainingMs).toBe(-15_000);
    expect(snap.slideElapsedMs).toBe(15_000);
    expect(snap.pacingStatus).toBe('overtime');
    expect(formatCountdownMMSS(snap.remainingMs)).toBe('+00:15');
    expect(formatDurationMMSS(snap.totalElapsedMs)).toBe('01:15');

    const targetDate = new Date(now + 5 * 60_000);
    const hh = String(targetDate.getHours()).padStart(2, '0');
    const mm = String(targetDate.getMinutes()).padStart(2, '0');
    const resolved = resolveEndTimeTargetMs(`${hh}:${mm}`, now);
    expect(resolved).not.toBeNull();
    expect(Math.abs(resolved! - (now + 5 * 60_000))).toBeLessThanOrEqual(60_000);
  });
});
