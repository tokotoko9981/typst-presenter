import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { PdfEngine, type PdfJsLike } from '../../src/core/pdf/PdfEngine.ts';
import { parseTypstDiagnostics } from '../../src/core/typst/typstDiagnostics.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function hasTypstCli(): boolean {
  try {
    execFileSync('typst', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasTypstCli())('Typst 0.15+ helper integration (typst/presenter-notes.typ)', () => {
  it('compiles single-file .typ with embedded notes/targets/QR and extracts via PdfEngine, plus parses syntax errors', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'tp-helper-int-'));
    const helperDest = path.join(tmpDir, 'presenter-notes.typ');
    const typPath = path.join(tmpDir, 'deck.typ');
    const pdfPath = path.join(tmpDir, 'deck.pdf');

    try {
      copyFileSync(path.join(projectRoot, 'typst', 'presenter-notes.typ'), helperDest);
      const validTyp = [
        '#import "presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note',
        '#show: enable-presenter-notes',
        '#presenter-config(duration: 15, last-minutes: 3, end-time: "16:45", qr-url: "https://example.com/qa", qr-label: "Q&A")',
        '= Slide 1',
        '#speaker-note(target: 40)[Opening *point*]',
        '#pagebreak()',
        '= Slide 2',
        '#speaker-note(target: 80, "Plain note two")',
      ].join('\n');

      writeFileSync(typPath, validTyp, 'utf8');
      execFileSync(
        'typst',
        ['compile', '--diagnostic-format', 'short', typPath, pdfPath],
        { stdio: 'pipe' },
      );

      const pdfBytes = readFileSync(pdfPath);
      const ab = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      );
      const engine = new PdfEngine({
        pdfjs: pdfjsLegacy as unknown as PdfJsLike,
        disableWorker: true,
      });
      const meta = await engine.loadDeck(ab, 'deck.pdf');
      await engine.destroy();

      expect(meta.numPages).toBe(2);
      expect(meta.extractedNotes[1]).toBe('Opening point');
      expect(meta.extractedNotes[2]).toBe('Plain note two');
      expect(meta.extractedSlideTargets).toEqual({ 1: 40, 2: 80 });
      expect(meta.extractedPdfpcConfig).toMatchObject({
        durationMinutes: 15,
        lastMinutes: 3,
        endTimeHHMM: '16:45',
        qrUrl: 'https://example.com/qa',
        qrLabel: 'Q&A',
      });

      // Verify intentional syntax error produces short diagnostics while previous PDF remains intact
      const brokenTyp = `${validTyp}\n#let broken = (1 +`;
      writeFileSync(typPath, brokenTyp, 'utf8');
      let capturedStderr = '';
      try {
        execFileSync(
          'typst',
          ['compile', '--diagnostic-format', 'short', typPath, path.join(tmpDir, 'broken.pdf')],
          { stdio: 'pipe' },
        );
      } catch (err) {
        const stderrBuf = (err as { stderr?: Buffer }).stderr;
        capturedStderr = stderrBuf ? stderrBuf.toString('utf8') : '';
      }
      const diags = parseTypstDiagnostics(capturedStderr);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags[0]?.severity).toBe('error');
      expect(diags[0]?.line).toBeGreaterThan(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
