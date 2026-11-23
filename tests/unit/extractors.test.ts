import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  mergePageNote,
  normalizePageLabels,
  parseNotesAttachments,
  resolveDestToPageNumber,
} from '../../src/core/pdf/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const encoder = new TextEncoder();

describe('PDF extractors', () => {
  describe('normalizePageLabels', () => {
    it('returns null for null or empty arrays and fills sparse/empty entries with 1-based page numbers', () => {
      expect(normalizePageLabels(null)).toBeNull();
      expect(normalizePageLabels([])).toBeNull();
      expect(normalizePageLabels(['', null, 'iii', undefined])).toEqual(['1', '2', 'iii', '4']);
    });
  });

  describe('mergePageNote', () => {
    it('ignores invalid page numbers or blank notes, deduplicates exact/block matches, and preserves distinct shorter notes', () => {
      const target: Record<number, string> = {};
      mergePageNote(target, 0, 'Zero page');
      mergePageNote(target, -1, 'Negative page');
      mergePageNote(target, 1.5, 'Fractional page');
      mergePageNote(target, 1, '   \n\t  ');
      expect(target).toEqual({});

      mergePageNote(target, 1, '  Review architecture diagram before Q&A  ');
      mergePageNote(target, 1, 'Review architecture diagram before Q&A');
      expect(target[1]).toBe('Review architecture diagram before Q&A');

      // Shorter distinct note that is a substring must NOT be dropped
      mergePageNote(target, 1, 'Q&A');
      expect(target[1]).toBe('Review architecture diagram before Q&A\n\nQ&A');

      // Exact block match in multi-paragraph note IS deduplicated
      mergePageNote(target, 1, 'Q&A');
      expect(target[1]).toBe('Review architecture diagram before Q&A\n\nQ&A');

      mergePageNote(target, 1, 'Second note');
      expect(target[1]).toBe('Review architecture diagram before Q&A\n\nQ&A\n\nSecond note');
    });
  });

  describe('resolveDestToPageNumber', () => {
    it('handles out-of-bounds indices, invalid refs, and rejecting doc helpers', async () => {
      const doc = {
        numPages: 3,
        getDestination: vi.fn(async (id: string) => {
          if (id === 'boom') throw new Error('dest lookup failed');
          if (id === 'oob') return [5];
          return null;
        }),
        getPageIndex: vi.fn(async (ref: { num: number }) => {
          if (ref.num === 99) throw new Error('bad ref');
          if (ref.num === 50) return 10; // out of bounds
          return 1;
        }),
      };

      await expect(resolveDestToPageNumber(doc, null)).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [])).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [-1])).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [3])).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, 'boom')).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, 'oob')).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [{ num: 99, gen: 0 }])).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [{ num: 50, gen: 0 }])).resolves.toBeNull();
      await expect(resolveDestToPageNumber(doc, [{ num: 1, gen: 0 }])).resolves.toBe(2);
    });
  });

  describe('parseNotesAttachments', () => {
    it('parses CRLF markdown notes with <!-- slide: N --> and strips inter-slide --- separators without corrupting internal rules', async () => {
      const md = [
        '<!-- slide: 1 -->',
        'Intro section',
        '',
        '---',
        '',
        'Internal detail below rule',
        '',
        '---',
        '',
        '<!-- slide: 2 -->',
        'Slide 2 line A',
        'Slide 2 line B',
      ].join('\r\n');

      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([['notes', { filename: 'speaker-notes.md', content: encoder.encode(md) }]]),
      });

      expect(parsed.notes[1]).toBe('Intro section\n\n---\n\nInternal detail below rule');
      expect(parsed.notes[2]).toBe('Slide 2 line A\nSlide 2 line B');
    });

    it('parses --- separated .txt/.markdown attachments and skips non-note files', async () => {
      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            ['img', { filename: 'diagram.png', content: new Uint8Array([137, 80, 78, 71]) }],
            [
              'txt',
              {
                filename: 'notes.txt',
                content: encoder.encode('Slide one\r\n---\r\nSlide two').buffer,
              },
            ],
            [
              'md2',
              {
                filename: 'notes-slide-3.markdown',
                content: encoder.encode('Slide three\r\ncontent'),
              },
            ],
          ]),
      });

      expect(parsed.notes).toEqual({
        1: 'Slide one',
        2: 'Slide two',
        3: 'Slide three\ncontent',
      });
    });

    it('guards array-shaped obj.slides and top-level arrays without falling back to object keys', async () => {
      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'arrSlides',
              {
                filename: 'array-slides.json',
                content: encoder.encode(
                  JSON.stringify({
                    slides: ['First array note', { page: 3, markdown: 'Explicit page 3' }],
                  }),
                ),
              },
            ],
            [
              'emptyArrSlides',
              {
                filename: 'empty-slides.json',
                content: encoder.encode(JSON.stringify({ slides: [] })),
              },
            ],
            [
              'topLevelArr',
              {
                filename: 'raw-array.json',
                content: encoder.encode(JSON.stringify(['Ignored zero-index', 'Should not become page 1'])),
              },
            ],
            [
              'genericMap',
              {
                filename: 'generic.json',
                content: encoder.encode(JSON.stringify({ slides: { '2': { markdown: 'Slide 2 map' } } })),
              },
            ],
            [
              'flatMap',
              {
                filename: 'flat.json',
                content: encoder.encode(JSON.stringify({ '4': 'Slide 4 flat' })),
              },
            ],
          ]),
      });

      expect(parsed.notes).toEqual({
        1: 'First array note',
        2: 'Slide 2 map',
        3: 'Explicit page 3',
        4: 'Slide 4 flat',
      });
    });

    it('falls back to getAttachmentContent() when attachment.content is missing', async () => {
      const getAttachmentContent = vi.fn(async () =>
        encoder.encode(JSON.stringify({ '1': 'Loaded lazily' })),
      );
      const parsed = await parseNotesAttachments({
        getAttachments: async () => ({
          lazy: { filename: 'notes.json' },
        }),
        getAttachmentContent,
      });

      expect(getAttachmentContent).toHaveBeenCalledWith('lazy');
      expect(parsed.notes).toEqual({ 1: 'Loaded lazily' });
    });

    it('skips obj.slides[] items with invalid explicit page/slide/idx instead of falling back to idx + 1', async () => {
      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'mixedSlides',
              {
                filename: 'slides.json',
                content: encoder.encode(
                  JSON.stringify({
                    slides: [
                      { page: 0, markdown: 'Invalid page 0 must be skipped' },
                      { idx: -1, markdown: 'Invalid idx -1 must be skipped' },
                      { slide: 1.5, markdown: 'Non-integer slide must be skipped' },
                      { page: '2', markdown: 'String page must be skipped' },
                      { markdown: 'Fallback to 1-based index 5' },
                    ],
                  }),
                ),
              },
            ],
          ]),
      });

      expect(parsed.notes).toEqual({
        5: 'Fallback to 1-based index 5',
      });
    });

    it('parses single-slide markdown/text attachments without --- or markers as page 1', async () => {
      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'single',
              {
                filename: 'notes.md',
                content: encoder.encode('Only one slide note without separator'),
              },
            ],
            [
              'whitespaceOnly',
              {
                filename: 'blank.txt',
                content: encoder.encode('   \n\t  '),
              },
            ],
          ]),
      });

      expect(parsed.notes).toEqual({
        1: 'Only one slide note without separator',
      });
    });

    it('strips trailing --- on final <!-- slide: N --> block, anchors markers cleanly, skips YAML frontmatter, and ignores --- inside fenced code', async () => {
      const markerMd = [
        '  <!-- slide: 1 -->  ',
        'Slide 1 body',
        '---',
        '<!-- slide: 0 -->',
        'Should be ignored',
        '<!-- slide: 2 -->',
        'Slide 2 internal',
        '',
        '---',
        '',
        'Keep internal rule',
        '<!-- slide: 4 --> <!-- slide: 5 -->',
        '',
        '---',
      ].join('\n');

      const hrWithFrontmatterAndFences = [
        '---',
        'title: My Typst Talk',
        'author: Speaker',
        '---',
        'Slide 1 body',
        '---',
        'Slide 2 body',
        '```yaml',
        '---',
        'key: val',
        '```',
        '~~~md',
        '---',
        '~~~',
      ].join('\n');

      const sampleNotesMd = readFileSync(path.join(projectRoot, 'public', 'sample-notes.md'), 'utf8');

      const parsedMarkers = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([['markers', { filename: 'markers.md', content: encoder.encode(markerMd) }]]),
      });

      expect(parsedMarkers.notes).toEqual({
        1: 'Slide 1 body',
        2: 'Slide 2 internal\n\n---\n\nKeep internal rule\n<!-- slide: 4 --> <!-- slide: 5 -->',
      });

      const parsedHr = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'hr',
              {
                filename: 'hr-fences.md',
                content: encoder.encode(hrWithFrontmatterAndFences),
              },
            ],
          ]),
      });

      expect(parsedHr.notes).toEqual({
        1: 'Slide 1 body',
        2: 'Slide 2 body\n```yaml\n---\nkey: val\n```\n~~~md\n---\n~~~',
      });

      const parsedSample = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([['sample', { filename: 'sample-notes.md', content: encoder.encode(sampleNotesMd) }]]),
      });
      expect(Object.keys(parsedSample.notes).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(parsedSample.notes[1]).toContain('オープニング');
      expect(parsedSample.notes[9]).toContain('まとめ');
    });

    it('rejects non-positive duration/noteFontSize and negative lastMinutes in .pdfpc v2 config', async () => {
      const parsedInvalid = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'badCfg',
              {
                filename: 'deck.pdfpc',
                content: encoder.encode(
                  JSON.stringify({
                    pdfpcFormat: 2,
                    duration: -10,
                    lastMinutes: -1,
                    noteFontSize: 0,
                    pages: [{ idx: 0, note: 'Slide 1' }],
                  }),
                ),
              },
            ],
          ]),
      });

      expect(parsedInvalid.notes).toEqual({ 1: 'Slide 1' });
      expect(parsedInvalid.pdfpcConfig).toBeUndefined();

      const parsedValidZeroLast = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            [
              'validCfg',
              {
                filename: 'deck.pdfpc',
                content: encoder.encode(
                  JSON.stringify({
                    pdfpcFormat: 2,
                    duration: 25,
                    lastMinutes: 0,
                    noteFontSize: 18,
                    pages: [],
                  }),
                ),
              },
            ],
          ]),
      });

      expect(parsedValidZeroLast.pdfpcConfig).toEqual({
        durationMinutes: 25,
        lastMinutes: 0,
        noteFontSize: 18,
      });
    });

    it('does not invoke getAttachmentContent() for binary attachments whose filename contains "note"', async () => {
      const getAttachmentContent = vi.fn(async () => new Uint8Array([1, 2, 3]));
      const parsed = await parseNotesAttachments({
        getAttachments: async () =>
          new Map([
            ['imgWithNote', { filename: 'my-notes-diagram.png' }],
            ['pdfWithNote', { filename: 'keynote.pdf' }],
          ]),
        getAttachmentContent,
      });

      expect(getAttachmentContent).not.toHaveBeenCalled();
      expect(parsed.notes).toEqual({});
    });
  });
});
