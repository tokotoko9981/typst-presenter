import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileWatchService,
  isFileSystemAccessSupported,
  pickNotesFileHandle,
  pickPdfFileHandle,
  type FileHandleLike,
  type WatchStatus,
} from '../../src/core/files/FileWatchService.ts';
import {
  createEmptyNotesBundle,
  exportNotesToMarkdown,
  extractMarpOrSlidevNotesFromSlides,
  parseMarkdownSidecar,
  parseSidecarFileContent,
} from '../../src/core/notes/NotesManager.ts';
import {
  extractStickyNotesFromPage,
  type PdfAnnotationLike,
} from '../../src/core/pdf/extractors.ts';

describe('NotesManager advanced parsing and export', () => {
  it('extracts Marp/Slidev notes per slide while excluding directives and respecting target comments', () => {
    const parts = [
      [
        '<!-- _class: lead -->',
        '<!-- paginate: false -->',
        '<!-- theme: default -->',
        '<!-- style: |\n  section h1 { color: #38bdf8; }\n-->',
        '# Title Slide',
        '<!-- target: 30 -->',
        '<!--\n  Welcome to the presentation.\n  Remember to introduce the team.\n-->',
      ].join('\n'),
      [
        '<!--',
        '_backgroundColor: #0f172a',
        'header: "Tech Talk"',
        'footer: "© 2026"',
        '-->',
        '## Architecture',
        '<!--fit-->',
        '<!-- layout: two-cols -->',
        '<!-- clicks: 3 -->',
        '<!-- hide: true -->',
        '<!-- disabled: true -->',
        '<!-- transition: slide-left -->',
        '<!-- headingDivider: 2 -->',
        '<!-- size: 16:9 -->',
        '<!-- color: white -->',
        '<!-- backgroundImage: url(bg.png) -->',
        '<!-- marp: true -->',
        'No speaker note on this slide',
      ].join('\n'),
      [
        '## Code Example',
        '```html',
        '<!-- This is inside a code fence and must NOT be extracted -->',
        '```',
        '<!-- First note paragraph -->',
        '<!-- note: Second note paragraph -->',
      ].join('\n'),
    ];

    const notes = extractMarpOrSlidevNotesFromSlides(parts);

    expect(notes[1]?.markdown).toBe(
      'Welcome to the presentation.\nRemember to introduce the team.',
    );
    expect(notes[1]?.targetSeconds).toBe(30);
    expect(notes[2]).toBeUndefined();
    expect(notes[3]?.markdown).toBe('First note paragraph\n\nSecond note paragraph');
  });

  it('auto-detects Marp frontmatter and Slidev per-slide frontmatter without shifting slide indices', () => {
    const marpSource = [
      '---',
      'marp: true',
      'theme: gaia',
      'paginate: true',
      'duration: 20',
      'lastMinutes: 5',
      '---',
      '',
      '# Opening',
      '<!-- target: 45 -->',
      '<!-- Hook the audience early -->',
      '',
      '---',
      '',
      '<!-- _class: invert -->',
      '# Deep Dive',
      '<!-- Explain core pipeline -->',
    ].join('\n');

    const parsedMarp = parseMarkdownSidecar(marpSource);
    expect(parsedMarp.durationMinutes).toBe(20);
    expect(parsedMarp.lastMinutesWarning).toBe(5);
    expect(parsedMarp.slides[1]?.targetSeconds).toBe(45);
    expect(parsedMarp.slides[1]?.markdown).toBe('Hook the audience early');
    expect(parsedMarp.slides[2]?.markdown).toBe('Explain core pipeline');

    const slidevSource = [
      '---',
      'theme: seriph',
      'transition: slide-left',
      '---',
      '',
      '# Slide 1',
      '<!-- Slidev intro note -->',
      '',
      '---',
      'layout: two-cols',
      'clicks: 2',
      '---',
      '',
      '# Slide 2',
      '::left::',
      'Left column',
      '<!-- Slidev second slide note -->',
    ].join('\n');

    const parsedSlidev = parseMarkdownSidecar(slidevSource);
    expect(parsedSlidev.slides[1]?.markdown).toBe('Slidev intro note');
    expect(parsedSlidev.slides[2]?.markdown).toBe('Slidev second slide note');
    expect(parsedSlidev.slides[3]).toBeUndefined();
  });

  it('auto-detects frontmatter-less Marp/Slidev sources and honors explicit marp-slidev mode', () => {
    const noFrontmatterDeck = [
      '# Slide One',
      '- Bullet A',
      '<!-- Note for slide one -->',
      '',
      '---',
      '',
      '# Slide Two',
      '- Bullet B',
      '<!-- Note for slide two -->',
    ].join('\n');

    const parsedAuto = parseMarkdownSidecar(noFrontmatterDeck);
    expect(parsedAuto.slides[1]?.markdown).toBe('Note for slide one');
    expect(parsedAuto.slides[2]?.markdown).toBe('Note for slide two');

    const singleSlideSource = ['# Only Slide', 'Body', '<!-- Single slide comment note -->'].join(
      '\n',
    );
    const parsedForced = parseMarkdownSidecar(singleSlideSource, { mode: 'marp-slidev' });
    expect(parsedForced.slides[1]?.markdown).toBe('Single slide comment note');
  });

  it('preserves backward compatibility for plain --- separated notes and <!-- slide: N --> markers', () => {
    const plainHrNotes = [
      '---',
      'title: Regular Talk',
      'author: Presenter',
      '---',
      '<!-- target: 40 -->',
      '# Slide 1 Notes',
      '- Mention benchmark',
      '',
      '---',
      '',
      '# Slide 2 Notes',
      '```html',
      '<!-- example inside fence -->',
      '```',
      '- Wrap up',
    ].join('\n');

    const parsedPlain = parseMarkdownSidecar(plainHrNotes);
    expect(parsedPlain.slides[1]?.targetSeconds).toBe(40);
    expect(parsedPlain.slides[1]?.markdown).toBe('# Slide 1 Notes\n- Mention benchmark');
    expect(parsedPlain.slides[2]?.markdown).toContain('# Slide 2 Notes');
    expect(parsedPlain.slides[2]?.markdown).toContain('<!-- example inside fence -->');

    const markerPriority = [
      '<!-- slide: 1 -->',
      '# Heading kept because marker takes precedence',
      '<!-- note: Unwrapped single-line note -->',
      '',
      '---',
      '',
      '<!-- slide: 3 -->',
      '<!-- note: Slide 3 Beamer note -->',
    ].join('\n');

    const parsedMarkers = parseMarkdownSidecar(markerPriority, { mode: 'marp-slidev' });
    expect(parsedMarkers.slides[1]?.markdown).toBe(
      '# Heading kept because marker takes precedence\nUnwrapped single-line note',
    );
    expect(parsedMarkers.slides[3]?.markdown).toBe('Slide 3 Beamer note');
  });

  it('unwraps <!-- note: ... --> in slide markers, plain notes, and fenced-safe contexts', () => {
    const md = [
      '<!-- slide: 1 -->',
      '<!-- target: 25 -->',
      '<!-- note: Beamer style note -->',
      '',
      '```md',
      '<!-- note: literal example inside code block -->',
      '```',
    ].join('\n');

    const parsed = parseSidecarFileContent(md, 'notes.markdown');
    expect(parsed.slides[1]?.targetSeconds).toBe(25);
    expect(parsed.slides[1]?.markdown).toBe(
      'Beamer style note\n\n```md\n<!-- note: literal example inside code block -->\n```',
    );
  });

  it('omits frontmatter for default bundle settings and round-trips custom metadata via YAML frontmatter', () => {
    const defaultBundle = createEmptyNotesBundle('deck-default', 'deck.pdf');
    defaultBundle.slides[1] = { markdown: 'First note', targetSeconds: 30, updatedAt: 1 };
    const defaultMd = exportNotesToMarkdown(defaultBundle, 1);
    expect(defaultMd.startsWith('<!-- slide: 1 -->')).toBe(true);
    expect(defaultMd).not.toContain('duration:');

    const customBundle = createEmptyNotesBundle('deck-custom', 'deck.pdf');
    customBundle.globalTargetSeconds = 1500; // 25 min
    customBundle.lastMinutesWarning = 0;
    customBundle.noteFontSizePx = 22;
    customBundle.endTimeHHMM = '17:30';
    customBundle.slides[1] = { markdown: 'Opening remarks', targetSeconds: 60, updatedAt: 1 };
    customBundle.slides[2] = { markdown: 'Closing remarks', updatedAt: 1 };

    const customMd = exportNotesToMarkdown(customBundle, 2);
    expect(customMd.startsWith('---\n')).toBe(true);
    expect(customMd).toContain('duration: 25');
    expect(customMd).toContain('lastMinutes: 0');
    expect(customMd).toContain('noteFontSize: 22');
    expect(customMd).toContain('endTime: "17:30"');

    const roundTripped = parseMarkdownSidecar(customMd);
    expect(roundTripped.durationMinutes).toBe(25);
    expect(roundTripped.lastMinutesWarning).toBe(0);
    expect(roundTripped.noteFontSizePx).toBe(22);
    expect(roundTripped.endTimeHHMM).toBe('17:30');
    expect(roundTripped.slides[1]?.targetSeconds).toBe(60);
    expect(roundTripped.slides[1]?.markdown).toBe('Opening remarks');
    expect(roundTripped.slides[2]?.markdown).toBe('Closing remarks');
  });
});

describe('extractors.ts sticky and FreeText note extraction', () => {
  it('extracts Text, FreeText, and richText notes, normalizes CRLF/CR, deduplicates, and ignores links/widgets/popups', async () => {
    const annotations: PdfAnnotationLike[] = [
      {
        subtype: 'Text',
        annotationType: 1,
        contentsObj: { str: 'Sticky line 1\r\nSticky line 2\rSticky line 3' },
      },
      {
        subtype: 'FreeText',
        annotationType: 3,
        contents: 'PowerPoint FreeText note\r\nSecond line',
      },
      {
        // Duplicate of FreeText above -> must be deduplicated
        subtype: 'FreeText',
        annotationType: 3,
        contentsObj: { str: 'PowerPoint FreeText note\nSecond line' },
      },
      {
        // richText fallback when contents/contentsObj are empty
        subtype: 'FreeText',
        annotationType: 3,
        contentsObj: { str: '   ' },
        richText: { str: 'RichText fallback note\rLine B' },
      },
      {
        // richText XFA html tree fallback
        annotationType: 3,
        richText: {
          html: {
            name: 'body',
            children: [
              { name: 'p', children: ['XFA line 1'] },
              { name: 'p', children: ['XFA line 2'] },
            ],
          },
        },
      },
      {
        // Empty FreeText must be ignored
        subtype: 'FreeText',
        annotationType: 3,
        contentsObj: { str: '' },
      },
      {
        // Links, widgets, popups must never be extracted even if contents is populated
        subtype: 'Link',
        annotationType: 2,
        url: 'https://example.com',
        contentsObj: { str: 'Ignore link' },
      },
      {
        subtype: 'Widget',
        annotationType: 20,
        contentsObj: { str: 'Ignore form widget' },
      },
      {
        subtype: 'Popup',
        annotationType: 16,
        contentsObj: { str: 'Ignore popup mirror' },
      },
      {
        // Malformed FreeText carrying url/dest must be ignored
        subtype: 'FreeText',
        annotationType: 3,
        url: 'https://malformed.example.com',
        contentsObj: { str: 'Ignore link-like FreeText' },
      },
    ];

    const extracted = await extractStickyNotesFromPage({
      getAnnotations: async () => annotations,
    });

    expect(extracted).toBe(
      [
        'Sticky line 1\nSticky line 2\nSticky line 3',
        'PowerPoint FreeText note\nSecond line',
        'RichText fallback note\nLine B',
        'XFA line 1\nXFA line 2',
      ].join('\n\n'),
    );
  });
});

describe('FileWatchService and File System Access helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });

  it('detects File System Access support, handles picker filters without .txt, and returns null on AbortError', async () => {
    expect(isFileSystemAccessSupported()).toBe(false);
    await expect(pickPdfFileHandle()).resolves.toBeNull();
    await expect(pickNotesFileHandle()).resolves.toBeNull();

    const mockPdfHandle: FileHandleLike = {
      name: 'slides.pdf',
      getFile: async () => ({
        lastModified: 1,
        size: 10,
        arrayBuffer: async () => new ArrayBuffer(10),
        text: async () => '',
      }),
    };

    const pickerMock = vi.fn(async (_options?: unknown) => [mockPdfHandle]);
    (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker = pickerMock;

    expect(isFileSystemAccessSupported()).toBe(true);
    await expect(pickPdfFileHandle()).resolves.toBe(mockPdfHandle);

    await pickNotesFileHandle();
    const notesPickerArgs = pickerMock.mock.calls[1]?.[0] as
      | { types?: Array<{ accept: Record<string, string[]> }> }
      | undefined;
    const acceptedExtensions = Object.values(notesPickerArgs?.types?.[0]?.accept ?? {}).flat();
    expect(acceptedExtensions).toEqual(
      expect.arrayContaining(['.md', '.markdown', '.json', '.pdfpc']),
    );
    expect(acceptedExtensions).not.toContain('.txt');

    pickerMock.mockRejectedValueOnce(new DOMException('User cancelled', 'AbortError'));
    await expect(pickPdfFileHandle()).resolves.toBeNull();

    pickerMock.mockRejectedValueOnce(new Error('Permission failure'));
    await expect(pickNotesFileHandle()).rejects.toThrow('Permission failure');
  });

  it('performs initial load, detects mtime/size changes, skips 0-byte writes, guards overlapping polls, recovers from errors, and stops cleanly', async () => {
    vi.useFakeTimers();

    let currentMtime = 1000;
    let currentContent = 'Initial PDF bytes';
    let currentSize = currentContent.length;
    let shouldFailNextGetFile = false;

    const pdfHandle: FileHandleLike = {
      name: 'talk.pdf',
      getFile: vi.fn(async () => {
        if (shouldFailNextGetFile) {
          throw new Error('Transient lock error');
        }
        const encoded = new TextEncoder().encode(currentContent);
        return {
          lastModified: currentMtime,
          size: currentSize,
          arrayBuffer: async () => encoded.buffer.slice(0),
          text: async () => currentContent,
        };
      }),
    };

    const updates: string[] = [];
    const statuses: WatchStatus[] = [];
    const service = new FileWatchService(1000);

    await service.watchPdf(
      pdfHandle,
      (bytes) => {
        updates.push(new TextDecoder().decode(bytes));
      },
      (status) => statuses.push(status),
    );

    expect(updates).toEqual(['Initial PDF bytes']);
    expect(service.getPdfStatus().active).toBe(true);
    expect(service.getPdfStatus().fileName).toBe('talk.pdf');
    expect(service.getPdfStatus().reloadCount).toBe(0);
    expect(service.getPdfStatus().lastUpdatedAt).not.toBeNull();

    // Unchanged poll -> no reload
    await vi.advanceTimersByTimeAsync(1000);
    expect(updates).toHaveLength(1);
    expect(service.getPdfStatus().reloadCount).toBe(0);

    // 0-byte intermediate write -> skipped without resetting reload count
    currentMtime = 2000;
    currentSize = 0;
    currentContent = '';
    await vi.advanceTimersByTimeAsync(1000);
    expect(updates).toHaveLength(1);

    // Compiler finishes writing new bytes -> reload #1
    currentMtime = 2005;
    currentContent = 'Updated PDF v2';
    currentSize = currentContent.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(updates).toEqual(['Initial PDF bytes', 'Updated PDF v2']);
    expect(service.getPdfStatus().reloadCount).toBe(1);

    // Transient error -> sets status.error, stays active, recovers on next poll
    shouldFailNextGetFile = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getPdfStatus().active).toBe(true);
    expect(service.getPdfStatus().error).toContain('Transient lock error');

    shouldFailNextGetFile = false;
    currentMtime = 3000;
    currentContent = 'Recovered PDF v3';
    currentSize = currentContent.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getPdfStatus().error).toBeNull();
    expect(service.getPdfStatus().reloadCount).toBe(2);
    expect(updates).toEqual(['Initial PDF bytes', 'Updated PDF v2', 'Recovered PDF v3']);

    // Notes watch + stopAll
    let notesMtime = 500;
    let notesText = '<!-- slide: 1 -->\nNote v1';
    const notesHandle: FileHandleLike = {
      name: 'notes.md',
      getFile: async () => ({
        lastModified: notesMtime,
        size: notesText.length,
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => notesText,
      }),
    };

    const noteUpdates: string[] = [];
    await service.watchNotes(notesHandle, (text) => {
      noteUpdates.push(text);
    });
    expect(noteUpdates).toEqual(['<!-- slide: 1 -->\nNote v1']);

    notesMtime = 600;
    notesText = '<!-- slide: 1 -->\nNote v2';
    await vi.advanceTimersByTimeAsync(1000);
    expect(noteUpdates).toEqual(['<!-- slide: 1 -->\nNote v1', '<!-- slide: 1 -->\nNote v2']);
    expect(service.getNotesStatus().reloadCount).toBe(1);

    service.stopAll();
    expect(service.getPdfStatus().active).toBe(false);
    expect(service.getNotesStatus().active).toBe(false);
    expect(statuses.at(-1)?.active).toBe(false);

    // Further modifications after stopAll must not trigger callbacks
    currentMtime = 9999;
    notesMtime = 9999;
    await vi.advanceTimersByTimeAsync(3000);
    expect(updates).toHaveLength(3);
    expect(noteUpdates).toHaveLength(2);
  });

  it('skips 0-byte initial file until non-empty and prevents overlapping in-flight polls', async () => {
    vi.useFakeTimers();

    let triggerSlowRead = () => {};
    let getFileCalls = 0;
    let size = 0;
    let mtime = 100;
    let text = '';

    const handle: FileHandleLike = {
      name: 'notes.md',
      getFile: vi.fn(async () => {
        getFileCalls += 1;
        if (getFileCalls === 3) {
          await new Promise<void>((resolve) => {
            triggerSlowRead = resolve;
          });
        }
        return {
          lastModified: mtime,
          size,
          arrayBuffer: async () => new ArrayBuffer(size),
          text: async () => text,
        };
      }),
    };

    const received: string[] = [];
    const service = new FileWatchService(500);

    // Poll 1 (initial): 0 bytes -> skipped
    await service.watchNotes(handle, (t) => {
      received.push(t);
    });
    expect(received).toEqual([]);
    expect(service.getNotesStatus().lastUpdatedAt).toBeNull();

    // Poll 2: file becomes non-empty -> initial delivery (reloadCount stays 0)
    mtime = 200;
    text = 'First real content';
    size = text.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(received).toEqual(['First real content']);
    expect(service.getNotesStatus().reloadCount).toBe(0);
    expect(service.getNotesStatus().lastUpdatedAt).not.toBeNull();

    // Poll 3: slow getFile in flight across multiple timer ticks -> in-flight guard blocks duplicate calls
    mtime = 300;
    text = 'Slow update';
    size = text.length;
    await vi.advanceTimersByTimeAsync(500); // triggers getFileCalls === 3
    expect(getFileCalls).toBe(3);

    await vi.advanceTimersByTimeAsync(1500); // 3 ticks while in-flight
    expect(getFileCalls).toBe(3);

    triggerSlowRead();
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual(['First real content', 'Slow update']);
    expect(service.getNotesStatus().reloadCount).toBe(1);

    service.stopAll();
  });
});
