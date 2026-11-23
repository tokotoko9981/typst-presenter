import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { PdfEngine, sha256HexFallback, type PdfJsLike } from '../../src/core/pdf/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function createLegacyEngine(): PdfEngine {
  return new PdfEngine({
    pdfjs: pdfjsLegacy as unknown as PdfJsLike,
    disableWorker: true,
  });
}

describe('Real Typst PDF Fixtures Integration (pdfjs-dist/legacy)', () => {
  it('loads public/sample-deck.pdf and verifies outline, aspect ratio, crop mode, and sample-notes.md parity', async () => {
    const pdfPath = path.join(projectRoot, 'public', 'sample-deck.pdf');
    const notesPath = path.join(projectRoot, 'public', 'sample-notes.md');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));
    const expectedHash = sha256HexFallback(rawBytes);

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'sample-deck.pdf');

      expect(meta.deckId).toBe(expectedHash);
      expect(meta.byteLength).toBe(rawBytes.byteLength);
      expect(meta.numPages).toBe(9);
      if (meta.pageLabels !== null) {
        expect(meta.pageLabels).toHaveLength(9);
      }
      expect(meta.firstPageAspectRatio).toBeCloseTo(16 / 9, 2);
      expect(meta.suggestedCropMode).toBe('full');

      // Outline should contain sections for slides 2..9 with resolved 1-based pages
      expect(meta.outline.length).toBeGreaterThanOrEqual(8);
      const flattenedTitles: Array<{ title: string; pageNumber: number | null }> = [];
      const walk = (nodes: typeof meta.outline) => {
        for (const node of nodes) {
          flattenedTitles.push({ title: node.title, pageNumber: node.pageNumber });
          walk(node.items);
        }
      };
      walk(meta.outline);

      expect(flattenedTitles.some((n) => n.title.includes('課題') && n.pageNumber === 2)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('解決策') && n.pageNumber === 3)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('機能 1') && n.pageNumber === 4)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('機能 2') && n.pageNumber === 5)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('機能 3') && n.pageNumber === 6)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('機能 4') && n.pageNumber === 7)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('機能 5') && n.pageNumber === 8)).toBe(true);
      expect(flattenedTitles.some((n) => n.title.includes('まとめ') && n.pageNumber === 9)).toBe(true);

      // Verify sample-notes.md covers all 9 slides
      const notesMd = readFileSync(notesPath, 'utf8');
      for (let slide = 1; slide <= meta.numPages; slide += 1) {
        expect(notesMd).toContain(`<!-- slide: ${slide} -->`);
      }
    } finally {
      await engine.destroy();
    }
  });

  it('detects split-horizontal (> 2.4) on split-note-horizontal.pdf and crops links by half', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'split-note-horizontal.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'split-note-horizontal.pdf');
      expect(meta.numPages).toBe(2);
      expect(meta.firstPageAspectRatio).toBeGreaterThan(2.4);
      expect(meta.suggestedCropMode).toBe('split-horizontal');

      const leftLinks = await engine.extractPageLinks(1, 'left-half');
      expect(leftLinks.map((l) => l.url)).toEqual(['https://left.example.com/']);

      const rightLinks = await engine.extractPageLinks(1, 'right-half');
      expect(rightLinks.map((l) => l.url)).toEqual(['https://right.example.com/']);
    } finally {
      await engine.destroy();
    }
  });

  it('crops top-half / bottom-half links cleanly on split-note-vertical.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'split-note-vertical.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'split-note-vertical.pdf');
      expect(meta.numPages).toBe(2);
      expect(meta.firstPageAspectRatio).toBeLessThan(2.4);
      expect(meta.suggestedCropMode).toBe('full');

      const topLinks = await engine.extractPageLinks(1, 'top-half');
      expect(topLinks.map((l) => l.url)).toEqual(['https://top.example.com/']);

      const bottomLinks = await engine.extractPageLinks(1, 'bottom-half');
      expect(bottomLinks.map((l) => l.url)).toEqual(['https://bottom.example.com/']);
    } finally {
      await engine.destroy();
    }
  });

  it('extracts #pdf.attach JSON notes and internal/external links from embedded-notes.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'embedded-notes.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'embedded-notes.pdf');
      expect(meta.numPages).toBe(2);
      expect(meta.extractedNotes[1]).toBe('Page 1 embedded note');
      expect(meta.extractedNotes[2]).toBe('Page 2 embedded note');

      const links = await engine.extractPageLinks(1, 'full');
      expect(links.some((l) => l.url === 'https://example.com/')).toBe(true);
      expect(links.some((l) => l.destPage === 2)).toBe(true);
    } finally {
      await engine.destroy();
    }
  });

  it('extracts DeckNotesBundle v1 attachment from presio-attached-deck.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'presio-attached-deck.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'presio-attached-deck.pdf');
      expect(meta.numPages).toBe(3);
      expect(meta.pageLabels).toEqual(['1', '2', '3']);
      expect(meta.suggestedCropMode).toBe('full');
      expect(meta.outline).toHaveLength(3);
      expect(meta.extractedNotes[1]).toContain('Embedded Slide 1 Note');
      expect(meta.extractedNotes[1]).toContain('埋め込みノート1');
      expect(meta.extractedNotes[2]).toContain('Embedded Slide 2 Note');
      expect(meta.extractedNotes[3]).toContain('Embedded Slide 3 Note');
    } finally {
      await engine.destroy();
    }
  });

  it('detects split-horizontal (> 2.4) on touying-split-deck.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'touying-split-deck.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'touying-split-deck.pdf');
      expect(meta.numPages).toBe(4);
      expect(meta.firstPageAspectRatio).toBeCloseTo(32 / 9, 2);
      expect(meta.firstPageAspectRatio).toBeGreaterThan(2.4);
      expect(meta.suggestedCropMode).toBe('split-horizontal');
      expect(meta.pageLabels).toBeNull();
      expect(meta.outline).toEqual([]);
    } finally {
      await engine.destroy();
    }
  });

  it('resolves nested 2-level outline and page 2 links on standard-deck.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'standard-deck.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'standard-deck.pdf');
      expect(meta.numPages).toBe(6);
      expect(meta.pageLabels).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(meta.firstPageAspectRatio).toBeCloseTo(16 / 9, 2);
      expect(meta.suggestedCropMode).toBe('full');
      expect(meta.outline).toHaveLength(6);

      const mathSection = meta.outline[2]!;
      expect(mathSection.title).toContain('数式と日本語組版');
      expect(mathSection.pageNumber).toBe(3);
      expect(mathSection.items.length).toBeGreaterThanOrEqual(1);

      const evalSection = meta.outline[4]!;
      expect(evalSection.title).toContain('性能評価と回復性');
      expect(evalSection.pageNumber).toBe(5);
      expect(evalSection.items.length).toBeGreaterThanOrEqual(1);

      const page2Links = await engine.extractPageLinks(2, 'full');
      expect(page2Links.some((l) => l.url === 'https://example.com/')).toBe(true);
      expect(page2Links.some((l) => typeof l.destPage === 'number' && l.destPage >= 1)).toBe(true);
    } finally {
      await engine.destroy();
    }
  });

  it('handles 1-page boundary deck single-page-deck.pdf', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'single-page-deck.pdf');
    const rawBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      const meta = await engine.loadDeck(rawBytes, 'single-page-deck.pdf');
      expect(meta.numPages).toBe(1);
      expect(meta.pageLabels).toEqual(['1']);
      expect(meta.suggestedCropMode).toBe('full');
      expect(meta.outline).toHaveLength(1);
      expect(meta.outline[0]!.pageNumber).toBe(1);
    } finally {
      await engine.destroy();
    }
  });

  it('rejects cleanly on corrupt.pdf and leaves engine unloaded', async () => {
    const pdfPath = path.join(projectRoot, 'tests', 'fixtures', 'corrupt.pdf');
    const corruptBytes = new Uint8Array(readFileSync(pdfPath));

    const engine = createLegacyEngine();
    try {
      await expect(engine.loadDeck(corruptBytes, 'corrupt.pdf')).rejects.toThrow();
      expect(engine.isLoaded()).toBe(false);
      expect(engine.getDocumentMeta()).toBeNull();
    } finally {
      await engine.destroy();
    }
  });
});
