import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import defaultWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
  PdfEngine,
  parseNotesAttachments,
  resolveOutlineTree,
  resolvePdfAssetUrl,
  type PdfJsLike,
  type PdfPageLike,
  type PdfRenderTaskLike,
} from '../../src/core/pdf/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const encoder = new TextEncoder();

function createMockViewport(width: number, height: number) {
  return {
    width,
    height,
    scale: 1,
    convertToViewportPoint(x: number, y: number): [number, number] {
      return [x, height - y];
    },
  };
}

describe('PdfEngine (Mocked Unit Suite)', () => {
  it('clones caller bytes, extracts outline/labels/notes (Presio, .pdfpc, .md, sticky notes), and cleans up pages', async () => {
    const attachments = new Map<string, { filename: string }>([
      ['a1', { filename: 'presio.pdfpc' }],
      ['a2', { filename: 'notes-slide-2.json' }],
      ['a3', { filename: 'extra.md' }],
      ['a4', { filename: 'broken.json' }],
    ]);

    const attachmentContents: Record<string, Uint8Array> = {
      a1: encoder.encode(
        JSON.stringify({
          pdfpcFormat: 2,
          duration: 20,
          lastMinutes: 5,
          noteFontSize: 22,
          pages: [{ idx: 0, note: 'PDFPC slide 1 note' }],
        }),
      ),
      a2: encoder.encode(JSON.stringify(['Presio block A', { text: 'Presio block B' }])),
      a3: encoder.encode('<!-- slide: 3 -->\nMarkdown attachment slide 3'),
      a4: encoder.encode('{invalid-json'),
    };

    const page1Cleanup = vi.fn();
    const page2Cleanup = vi.fn();
    const page3Cleanup = vi.fn();

    const makePage = (
      cleanupFn: () => void,
      annotations: Array<Record<string, unknown>>,
    ): PdfPageLike => ({
      getViewport: () => createMockViewport(1600, 450), // aspect 3.555 -> split-horizontal
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => annotations,
      cleanup: cleanupFn,
    });

    const pages: Record<number, PdfPageLike> = {
      1: makePage(page1Cleanup, [
        { subtype: 'Text', annotationType: 1, contentsObj: { str: 'Sticky note 1' } },
      ]),
      2: makePage(page2Cleanup, [
        { subtype: 'Text', annotationType: 1, contents: 'Sticky note 2' },
      ]),
      3: makePage(page3Cleanup, []),
    };

    let receivedDataRef: Uint8Array | null = null;
    const mockPdfjs: PdfJsLike = {
      AnnotationType: { TEXT: 1, LINK: 2 },
      RenderingCancelledException: pdfjsLegacy.RenderingCancelledException,
      getDocument(params) {
        receivedDataRef = params.data as Uint8Array;
        // Simulate worker buffer transfer detaching/mutating PDF.js input array
        const clonedCopy = receivedDataRef.slice();
        receivedDataRef.fill(0);
        expect(clonedCopy.length).toBeGreaterThan(0);

        return {
          promise: Promise.resolve({
            numPages: 3,
            getPageLabels: async () => ['i', 'ii', 'iii'],
            getPage: async (n: number) => pages[n]!,
            getOutline: async () => [
              {
                title: 'Intro',
                dest: 'named-intro',
                items: [{ title: 'Sub', dest: [{ num: 10, gen: 0 }, { name: 'Fit' }] }],
              },
              { title: 'Direct', dest: [2, { name: 'Fit' }], items: [] },
              { title: 'Broken', dest: 'missing-dest', items: [] },
            ],
            getDestination: async (id: string) =>
              id === 'named-intro' ? [0, { name: 'Fit' }] : null,
            getPageIndex: async (ref: { num: number }) => (ref.num === 10 ? 1 : -1),
            getAttachments: async () => attachments,
            getAttachmentContent: async (id: string) => attachmentContents[id] ?? null,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        };
      },
    };

    const callerBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // "%PDF-1.7"
    const snapshotBefore = callerBytes.slice();

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    const meta = await engine.loadDeck(callerBytes, 'talk.pdf');

    // Caller buffer must remain untouched even though mock zeroed its own data buffer
    expect(callerBytes).toEqual(snapshotBefore);
    expect(meta.fileName).toBe('talk.pdf');
    expect(meta.byteLength).toBe(snapshotBefore.byteLength);
    expect(meta.numPages).toBe(3);
    expect(meta.pageLabels).toEqual(['i', 'ii', 'iii']);
    expect(meta.firstPageAspectRatio).toBeCloseTo(1600 / 450, 5);
    expect(meta.suggestedCropMode).toBe('split-horizontal');
    expect(meta.extractedPdfpcConfig).toEqual({
      durationMinutes: 20,
      lastMinutes: 5,
      noteFontSize: 22,
    });
    expect(meta.outline).toEqual([
      {
        title: 'Intro',
        pageNumber: 1,
        items: [{ title: 'Sub', pageNumber: 2, items: [] }],
      },
      { title: 'Direct', pageNumber: 3, items: [] },
      { title: 'Broken', pageNumber: null, items: [] },
    ]);
    expect(meta.extractedNotes[1]).toBe('PDFPC slide 1 note\n\nSticky note 1');
    expect(meta.extractedNotes[2]).toBe('Presio block A\n\nPresio block B\n\nSticky note 2');
    expect(meta.extractedNotes[3]).toBe('Markdown attachment slide 3');

    expect(page1Cleanup).toHaveBeenCalledTimes(1);
    expect(page2Cleanup).toHaveBeenCalledTimes(1);
    expect(page3Cleanup).toHaveBeenCalledTimes(1);

    await engine.destroy();
  });

  it('cancels superseded concurrent renderPageToCanvas calls and swallows RenderingCancelledException', async () => {
    let rejectFirstRender!: (err: unknown) => void;
    let firstCanceled = false;
    const renderCalls: Array<{ canvas: HTMLCanvasElement | null; transform?: number[] }> = [];

    const mockPage: PdfPageLike = {
      getViewport: ({ scale, offsetX = 0, offsetY = 0 }) => ({
        width: 800 * scale,
        height: 450 * scale,
        scale,
        offsetX,
        offsetY,
        convertToViewportPoint: (x: number, y: number) => [x * scale + offsetX, (450 - y) * scale + offsetY],
      }),
      render(params): PdfRenderTaskLike {
        renderCalls.push({ canvas: params.canvas, transform: params.transform });
        if (renderCalls.length === 1) {
          return {
            promise: new Promise<void>((_, reject) => {
              rejectFirstRender = reject;
            }),
            cancel() {
              firstCanceled = true;
              rejectFirstRender(new pdfjsLegacy.RenderingCancelledException('Rendering cancelled'));
            },
          };
        }
        return {
          promise: Promise.resolve(),
          cancel: vi.fn(),
        };
      },
      getAnnotations: async () => [],
      cleanup: vi.fn(),
    };

    const mockPdfjs: PdfJsLike = {
      RenderingCancelledException: pdfjsLegacy.RenderingCancelledException,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPageLabels: async () => null,
          getPage: async () => mockPage,
          getOutline: async () => null,
          getDestination: async () => null,
          getPageIndex: async () => -1,
          cleanup: async () => {},
          destroy: async () => {},
        }),
        destroy: async () => {},
      }),
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'race.pdf');

    const canvas = document.createElement('canvas');

    const p1 = engine.renderPageToCanvas(1, canvas, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 2,
      cropRegion: 'full',
    });

    // Yield microtask so first render reaches page.render()
    await Promise.resolve();
    await Promise.resolve();

    const p2 = engine.renderPageToCanvas(2, canvas, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 2,
      cropRegion: 'full',
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(firstCanceled).toBe(true);
    expect(res1).toBeNull();
    expect(res2).toEqual({ cssWidth: 800, cssHeight: 450, pageNumber: 2 });
    expect(renderCalls).toHaveLength(2);
    expect(renderCalls[0]!.canvas).toBe(canvas);
    expect(renderCalls[1]!.transform).toEqual([2, 0, 0, 2, 0, 0]);

    engine.releaseCanvas(canvas);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);

    await engine.destroy();
  });

  it('aborts render via AbortSignal and propagates unexpected non-cancel errors', async () => {
    let abortableCanceled = false;
    let rejectAbortable!: (err: unknown) => void;
    let mode: 'abort' | 'boom' = 'abort';

    const mockPage: PdfPageLike = {
      getViewport: ({ scale }) => createMockViewport(800 * scale, 450 * scale),
      render() {
        if (mode === 'boom') {
          return {
            promise: Promise.reject(new Error('Corrupt stream')),
            cancel: vi.fn(),
          };
        }
        return {
          promise: new Promise<void>((_, reject) => {
            rejectAbortable = reject;
          }),
          cancel() {
            abortableCanceled = true;
            rejectAbortable(new pdfjsLegacy.RenderingCancelledException('Aborted'));
          },
        };
      },
      getAnnotations: async () => [],
      cleanup: vi.fn(),
    };

    const mockPdfjs: PdfJsLike = {
      RenderingCancelledException: pdfjsLegacy.RenderingCancelledException,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPageLabels: async () => null,
          getPage: async () => mockPage,
          getOutline: async () => null,
          getDestination: async () => null,
          getPageIndex: async () => -1,
          cleanup: async () => {},
          destroy: async () => {},
        }),
        destroy: async () => {},
      }),
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'abort.pdf');
    const canvas = document.createElement('canvas');

    const controller = new AbortController();
    const renderPromise = engine.renderPageToCanvas(1, canvas, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
      signal: controller.signal,
    });

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(renderPromise).resolves.toBeNull();
    expect(abortableCanceled).toBe(true);

    mode = 'boom';
    await expect(
      engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'full',
      }),
    ).rejects.toThrow('Corrupt stream');

    await engine.destroy();
    await expect(engine.extractPageLinks(1, 'full')).rejects.toThrow(/no PDF document loaded/);
  });

  it('extracts and crops internal and external Link annotations', async () => {
    const pageCleanup = vi.fn();
    const mockPage: PdfPageLike = {
      getViewport: () => createMockViewport(1000, 500),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => [
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'https://left.test' },
        { subtype: 'Link', annotationType: 2, rect: [600, 100, 800, 200], dest: [0, { name: 'Fit' }] },
        { subtype: 'Text', annotationType: 1, rect: [0, 0, 10, 10], contents: 'Ignore sticky' },
      ],
      cleanup: pageCleanup,
    };

    const mockPdfjs: PdfJsLike = {
      AnnotationType: { TEXT: 1, LINK: 2 },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          getPageLabels: async () => null,
          getPage: async () => mockPage,
          getOutline: async () => null,
          getDestination: async () => null,
          getPageIndex: async () => -1,
          cleanup: async () => {},
          destroy: async () => {},
        }),
        destroy: async () => {},
      }),
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'links.pdf');

    const fullLinks = await engine.extractPageLinks(1, 'full');
    expect(fullLinks).toEqual([
      { rect: [0.1, 0.1, 0.3, 0.3], url: 'https://left.test' },
      { rect: [0.6, 0.6, 0.8, 0.8], destPage: 1 },
    ]);

    const leftLinks = await engine.extractPageLinks(1, 'left-half');
    expect(leftLinks).toEqual([{ rect: [0.2, 0.1, 0.6, 0.3], url: 'https://left.test' }]);

    const rightLinks = await engine.extractPageLinks(1, 'right-half');
    expect(rightLinks).toHaveLength(1);
    expect(rightLinks[0]!.destPage).toBe(1);
    expect(rightLinks[0]!.rect[0]).toBeCloseTo(0.2, 6);
    expect(rightLinks[0]!.rect[1]).toBeCloseTo(0.6, 6);
    expect(rightLinks[0]!.rect[2]).toBeCloseTo(0.6, 6);
    expect(rightLinks[0]!.rect[3]).toBeCloseTo(0.8, 6);
    // 2 calls during loadDeck (pages 1 & 2) + 3 calls during extractPageLinks
    expect(pageCleanup).toHaveBeenCalledTimes(5);

    await engine.destroy();
  });

  it('serializes 3-way overlapping renderPageToCanvas bursts and immediate post-releaseCanvas reuse without canvas-in-use errors', async () => {
    const activeCanvases = new Set<HTMLCanvasElement>();
    let overlapDetected = false;
    let renderedCount = 0;

    const makeRenderTask = (canvas: HTMLCanvasElement, pageNum: number): PdfRenderTaskLike => {
      if (activeCanvases.has(canvas)) {
        overlapDetected = true;
        return {
          promise: Promise.reject(new Error('Canvas is already in use by 1 active render(s)!')),
          cancel: vi.fn(),
        };
      }
      activeCanvases.add(canvas);
      renderedCount += 1;
      const callIndex = renderedCount;

      let settled = false;
      let resolveTask!: () => void;
      let rejectTask!: (err: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });

      const timer =
        callIndex === 1
          ? setTimeout(() => {
              if (!settled) {
                settled = true;
                activeCanvases.delete(canvas);
                resolveTask();
              }
            }, 50)
          : setTimeout(() => {
              if (!settled) {
                settled = true;
                activeCanvases.delete(canvas);
                resolveTask();
              }
            }, 5);

      return {
        promise,
        cancel() {
          clearTimeout(timer);
          if (settled) return;
          // Async cancel settlement delay (simulating PDF.js worker cancel roundtrip)
          setTimeout(() => {
            if (settled) return;
            settled = true;
            activeCanvases.delete(canvas);
            rejectTask(
              new pdfjsLegacy.RenderingCancelledException(`Rendering cancelled page ${pageNum}`),
            );
          }, 12);
        },
      };
    };

    const createPage = (pageNum: number): PdfPageLike => ({
      getViewport: ({ scale, offsetX = 0, offsetY = 0 }) => ({
        width: 800 * scale,
        height: 450 * scale,
        scale,
        offsetX,
        offsetY,
        convertToViewportPoint: (x: number, y: number) => [
          x * scale + offsetX,
          (450 - y) * scale + offsetY,
        ],
      }),
      render: (params) => makeRenderTask(params.canvas!, pageNum),
      getAnnotations: async () => [],
      cleanup: vi.fn(),
    });

    const mockPdfjs: PdfJsLike = {
      RenderingCancelledException: pdfjsLegacy.RenderingCancelledException,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 4,
          getPageLabels: async () => null,
          getPage: async (n: number) => createPage(n),
          getOutline: async () => null,
          getDestination: async () => null,
          getPageIndex: async () => -1,
          cleanup: async () => {},
          destroy: async () => {},
        }),
        destroy: async () => {},
      }),
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'burst.pdf');
    const canvas = document.createElement('canvas');

    const opts = { targetWidth: 800, targetHeight: 600, dpr: 1, cropRegion: 'full' as const };
    const p1 = engine.renderPageToCanvas(1, canvas, opts);

    // Let p1 enter page.render()
    await Promise.resolve();
    await Promise.resolve();

    // Synchronous 2nd + 3rd burst while p1's cancel() settles asynchronously
    const p2 = engine.renderPageToCanvas(2, canvas, opts);
    const p3 = engine.renderPageToCanvas(3, canvas, opts);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(overlapDetected).toBe(false);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(r3).toEqual({ cssWidth: 800, cssHeight: 450, pageNumber: 3 });

    // Also test immediate canvas reuse after releaseCanvas() while async cancel is settling
    const p4 = engine.renderPageToCanvas(1, canvas, opts);
    await Promise.resolve();
    await Promise.resolve();
    engine.releaseCanvas(canvas);
    const p5 = engine.renderPageToCanvas(4, canvas, opts);

    const [r4, r5] = await Promise.all([p4, p5]);
    expect(overlapDetected).toBe(false);
    expect(r4).toBeNull();
    expect(r5).toEqual({ cssWidth: 800, cssHeight: 450, pageNumber: 4 });

    await engine.destroy();
  });

  it('guards loadDeck() against destroy() during computeDeckId(), mid-getOutline(), superseding loadDeck(), and getPage(1) failure', async () => {
    // 1. destroy() during computeDeckId()
    let resolveDigest!: (buf: ArrayBuffer) => void;
    const digestSpy = vi
      .spyOn(globalThis.crypto.subtle, 'digest')
      .mockImplementationOnce(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveDigest = resolve;
          }),
      );

    try {
      const getDocSpy = vi.fn();
      const engine1 = new PdfEngine({
        pdfjs: {
          getDocument: (params) => {
            getDocSpy(params);
            return {
              promise: Promise.reject(new Error('Should not be called')),
              destroy: async () => {},
            };
          },
        },
        disableWorker: true,
      });

      const pDestroyDuringHash = engine1.loadDeck(new Uint8Array([1, 2, 3]), 'hash-race.pdf');
      await Promise.resolve();
      await engine1.destroy();
      resolveDigest(new Uint8Array(32).buffer);

      await expect(pDestroyDuringHash).rejects.toThrow(/aborted or superseded/i);
      expect(getDocSpy).not.toHaveBeenCalled();
      expect(engine1.isLoaded()).toBe(false);
      expect(engine1.getDocumentMeta()).toBeNull();
    } finally {
      digestSpy.mockRestore();
    }

    // 2. destroy() during getOutline()
    let resolveOutline1!: (v: null) => void;
    const doc1Destroy = vi.fn(async () => {});
    const task1Destroy = vi.fn(async () => {});
    const engine2 = new PdfEngine({
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => null,
            getPage: async () => ({
              getViewport: () => createMockViewport(800, 450),
              render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
              getAnnotations: async () => [],
              cleanup: vi.fn(),
            }),
            getOutline: () =>
              new Promise<null>((resolve) => {
                resolveOutline1 = resolve;
              }),
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: doc1Destroy,
          }),
          destroy: task1Destroy,
        }),
      },
      disableWorker: true,
    });

    const pOutlineRace = engine2.loadDeck(new Uint8Array([4, 5, 6]), 'zombie.pdf');
    await vi.waitFor(() => {
      expect(resolveOutline1).toBeTypeOf('function');
    });
    await engine2.destroy();
    expect(engine2.isLoaded()).toBe(false);
    expect(engine2.getDocumentMeta()).toBeNull();

    resolveOutline1(null);
    await expect(pOutlineRace).rejects.toThrow(/aborted or superseded/i);
    expect(engine2.isLoaded()).toBe(false);
    expect(engine2.getDocumentMeta()).toBeNull();
    expect(doc1Destroy).toHaveBeenCalledTimes(1);
    expect(task1Destroy).toHaveBeenCalledTimes(1);

    // 3. Superseding loadDeck() #2 interrupting loadDeck() #1 mid-getOutline()
    let resolveStaleOutline!: (v: null) => void;
    const staleDocDestroy = vi.fn(async () => {});
    const staleTaskDestroy = vi.fn(async () => {});
    let callNum = 0;

    const engine3 = new PdfEngine({
      pdfjs: {
        getDocument: () => {
          callNum += 1;
          const isFirst = callNum === 1;
          return {
            promise: Promise.resolve({
              numPages: 1,
              getPageLabels: async () => null,
              getPage: async () => ({
                getViewport: () => createMockViewport(800, 450),
                render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
                getAnnotations: async () => [],
                cleanup: vi.fn(),
              }),
              getOutline: () =>
                isFirst
                  ? new Promise<null>((resolve) => {
                      resolveStaleOutline = resolve;
                    })
                  : Promise.resolve(null),
              getDestination: async () => null,
              getPageIndex: async () => -1,
              cleanup: async () => {},
              destroy: isFirst ? staleDocDestroy : async () => {},
            }),
            destroy: isFirst ? staleTaskDestroy : async () => {},
          };
        },
      },
      disableWorker: true,
    });

    const pFirst = engine3.loadDeck(new Uint8Array([1, 1, 1]), 'first-stale.pdf');
    await vi.waitFor(() => {
      expect(resolveStaleOutline).toBeTypeOf('function');
    });

    const pSecond = engine3.loadDeck(new Uint8Array([2, 2, 2]), 'second-current.pdf');
    const secondMeta = await pSecond;
    expect(secondMeta.fileName).toBe('second-current.pdf');
    expect(engine3.isLoaded()).toBe(true);
    expect(engine3.getDocumentMeta()?.fileName).toBe('second-current.pdf');

    resolveStaleOutline(null);
    await expect(pFirst).rejects.toThrow(/aborted or superseded/i);
    expect(engine3.isLoaded()).toBe(true);
    expect(engine3.getDocumentMeta()?.fileName).toBe('second-current.pdf');
    expect(staleDocDestroy).toHaveBeenCalledTimes(1);
    expect(staleTaskDestroy).toHaveBeenCalledTimes(1);
    await engine3.destroy();

    // 4. Failure in getPage(1) leaves isLoaded() === false and getDocumentMeta() === null
    const failedDocDestroy = vi.fn(async () => {});
    const failedTaskDestroy = vi.fn(async () => {});
    const engine4 = new PdfEngine({
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => null,
            getPage: async () => {
              throw new Error('Corrupt page 1');
            },
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: failedDocDestroy,
          }),
          destroy: failedTaskDestroy,
        }),
      },
      disableWorker: true,
    });

    await expect(engine4.loadDeck(new Uint8Array([9, 9, 9]), 'corrupt-p1.pdf')).rejects.toThrow(
      'Corrupt page 1',
    );
    expect(engine4.isLoaded()).toBe(false);
    expect(engine4.getDocumentMeta()).toBeNull();
    expect(failedDocDestroy).toHaveBeenCalledTimes(1);
    expect(failedTaskDestroy).toHaveBeenCalledTimes(1);
  });

  it('safely skips null entries and circular item.items in resolveOutlineTree, and handles cross-realm Uint8Array in parseNotesAttachments', async () => {
    const cyclicNode: { title: string; dest: number[]; items: unknown[] } = {
      title: 'Cyclic Root',
      dest: [0],
      items: [],
    };
    cyclicNode.items.push(null, cyclicNode, { title: 'Valid Child', dest: [1], items: [] });

    const outline = await resolveOutlineTree(
      {
        numPages: 2,
        getDestination: async () => null,
        getPageIndex: async () => -1,
      },
      [
        null as never,
        { title: '   ', dest: [0], items: [] } as never,
        cyclicNode as never,
      ],
    );

    expect(outline).toEqual([
      {
        title: 'Cyclic Root',
        pageNumber: 1,
        items: [{ title: 'Valid Child', pageNumber: 2, items: [] }],
      },
    ]);

    // Cross-realm Uint8Array created via node:vm (instanceof Uint8Array === false)
    const crossRealmPayload = JSON.stringify({
      pdfpcFormat: 2,
      duration: 15,
      pages: [{ idx: 0, note: 'Cross-realm note' }],
    });
    const crossRealmBytes = vm.runInNewContext(
      'Uint8Array.from(bytes)',
      { bytes: Array.from(encoder.encode(crossRealmPayload)) },
    ) as Uint8Array;
    expect(crossRealmBytes instanceof Uint8Array).toBe(false);
    expect(ArrayBuffer.isView(crossRealmBytes)).toBe(true);

    const parsed = await parseNotesAttachments({
      getAttachments: async () =>
        new Map([['cross', { filename: 'deck.pdfpc', content: crossRealmBytes }]]),
    });

    expect(parsed.notes).toEqual({ 1: 'Cross-realm note' });
    expect(parsed.pdfpcConfig).toEqual({ durationMinutes: 15 });
  });

  it('resolves diamond-shared non-cyclic outline subtrees in every branch while terminating cycles, and decodes cross-realm Map attachments', async () => {
    const sharedAppendix = {
      title: 'Shared Appendix',
      dest: [2],
      items: [{ title: 'Nested Shared', dest: [3], items: [] }],
    };

    const cycleA: { title: string; dest: number[]; items: unknown[] } = {
      title: 'Cycle A',
      dest: [0],
      items: [],
    };
    const cycleB: { title: string; dest: number[]; items: unknown[] } = {
      title: 'Cycle B',
      dest: [1],
      items: [cycleA],
    };
    cycleA.items.push(cycleB);

    const outline = await resolveOutlineTree(
      {
        numPages: 4,
        getDestination: async () => null,
        getPageIndex: async () => -1,
      },
      [
        { title: 'Chapter 1', dest: [0], items: [sharedAppendix] },
        { title: 'Chapter 2', dest: [1], items: [sharedAppendix] },
        cycleA as never,
      ],
    );

    expect(outline).toEqual([
      {
        title: 'Chapter 1',
        pageNumber: 1,
        items: [
          {
            title: 'Shared Appendix',
            pageNumber: 3,
            items: [{ title: 'Nested Shared', pageNumber: 4, items: [] }],
          },
        ],
      },
      {
        title: 'Chapter 2',
        pageNumber: 2,
        items: [
          {
            title: 'Shared Appendix',
            pageNumber: 3,
            items: [{ title: 'Nested Shared', pageNumber: 4, items: [] }],
          },
        ],
      },
      {
        title: 'Cycle A',
        pageNumber: 1,
        items: [{ title: 'Cycle B', pageNumber: 2, items: [] }],
      },
    ]);

    const crossRealmMapPayload = JSON.stringify({
      pdfpcFormat: 2,
      duration: 25,
      pages: [{ idx: 1, note: 'Cross-realm Map note' }],
    });
    const crossRealmMap = vm.runInNewContext(
      "new Map([['cross-map', { filename: 'deck.pdfpc', content: new Uint8Array(bytes) }]])",
      { bytes: Array.from(encoder.encode(crossRealmMapPayload)) },
    ) as Map<string, { filename: string; content: Uint8Array }>;

    expect(crossRealmMap instanceof Map).toBe(false);
    expect(Object.prototype.toString.call(crossRealmMap)).toBe('[object Map]');

    const parsed = await parseNotesAttachments({
      getAttachments: async () => crossRealmMap,
    });

    expect(parsed.notes).toEqual({ 2: 'Cross-realm Map note' });
    expect(parsed.pdfpcConfig).toEqual({ durationMinutes: 25 });
  });

  it('loads decks via loadDeckFromUrl, infers filename from URL, rejects HTTP errors, and aborts if destroyed during fetch', async () => {
    let capturedFileBytes: Uint8Array | null = null;
    const mockPdfjs: PdfJsLike = {
      getDocument(params) {
        capturedFileBytes = (params.data as Uint8Array).slice();
        return {
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => ['1'],
            getPage: async () => ({
              getViewport: () => createMockViewport(800, 450),
              render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
              getAnnotations: async () => [],
              cleanup: vi.fn(),
            }),
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        };
      },
    };

    const payload = encoder.encode('%PDF-1.7-url');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('missing.pdf')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => payload.slice().buffer,
      } as Response;
    });

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    try {
      const meta1 = await engine.loadDeckFromUrl('https://example.com/slides/my%20talk.pdf?v=2#page=1');
      expect(meta1.fileName).toBe('my talk.pdf');
      expect(meta1.byteLength).toBe(payload.byteLength);
      expect(Array.from(capturedFileBytes!)).toEqual(Array.from(payload));

      const meta2 = await engine.loadDeckFromUrl(new URL('https://example.com/'), 'explicit.pdf');
      expect(meta2.fileName).toBe('explicit.pdf');

      const meta3 = await engine.loadDeckFromUrl(new URL('https://example.com/'));
      expect(meta3.fileName).toBe('deck.pdf');

      await expect(engine.loadDeckFromUrl('/missing.pdf')).rejects.toThrow(/404 Not Found/);

      // Destroy during pending fetch must abort cleanly
      let resolveFetch!: (res: Response) => void;
      fetchSpy.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
      const pendingUrlLoad = engine.loadDeckFromUrl('/slow.pdf');
      await vi.waitFor(() => {
        expect(resolveFetch).toBeTypeOf('function');
      });
      await engine.destroy();
      resolveFetch({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => payload.slice().buffer,
      } as Response);
      await expect(pendingUrlLoad).rejects.toThrow(/aborted or superseded/i);
      expect(engine.isLoaded()).toBe(false);
    } finally {
      fetchSpy.mockRestore();
      await engine.destroy();
    }
  });

  it('guards cleanup() against active and settling renders and verifies doc identity before doc.cleanup()', async () => {
    const docCleanup = vi.fn(async () => {});
    let rejectRender!: (err: unknown) => void;
    let settleDelayResolve!: () => void;

    const mockPage: PdfPageLike = {
      getViewport: () => createMockViewport(800, 450),
      render() {
        return {
          promise: new Promise<void>((_, reject) => {
            rejectRender = reject;
          }),
          cancel() {
            void new Promise<void>((resolve) => {
              settleDelayResolve = resolve;
            }).then(() => {
              rejectRender(new pdfjsLegacy.RenderingCancelledException('Cancelled'));
            });
          },
        };
      },
      getAnnotations: async () => [],
      cleanup: vi.fn(),
    };

    const mockPdfjs: PdfJsLike = {
      RenderingCancelledException: pdfjsLegacy.RenderingCancelledException,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPageLabels: async () => null,
          getPage: async () => mockPage,
          getOutline: async () => null,
          getDestination: async () => null,
          getPageIndex: async () => -1,
          cleanup: docCleanup,
          destroy: async () => {},
        }),
        destroy: async () => {},
      }),
    };

    const engine = new PdfEngine({ pdfjs: mockPdfjs, disableWorker: true });
    // Idle cleanup when unloaded is a safe no-op
    await engine.cleanup();

    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'cleanup.pdf');
    await engine.cleanup();
    expect(docCleanup).toHaveBeenCalledTimes(1);

    const canvas = document.createElement('canvas');
    const renderPromise = engine.renderPageToCanvas(1, canvas, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
    });

    await vi.waitFor(() => {
      expect(rejectRender).toBeTypeOf('function');
    });

    // While render is active, cleanup() must NOT call doc.cleanup()
    await engine.cleanup();
    expect(docCleanup).toHaveBeenCalledTimes(1);

    // Release canvas (active task removed, settling promise still pending)
    engine.releaseCanvas(canvas);
    await vi.waitFor(() => {
      expect(settleDelayResolve).toBeTypeOf('function');
    });

    const cleanupAfterRelease = engine.cleanup();
    await Promise.resolve();
    expect(docCleanup).toHaveBeenCalledTimes(1);

    // Once settling finishes, cleanup() proceeds to call doc.cleanup()
    settleDelayResolve();
    await Promise.all([renderPromise, cleanupAfterRelease]);
    expect(docCleanup).toHaveBeenCalledTimes(2);

    // If destroy() occurs while cleanup() awaits settling, old doc.cleanup() must NOT be called
    const canvas2 = document.createElement('canvas');
    let rejectRender2!: (err: unknown) => void;
    let settleDelayResolve2!: () => void;
    mockPage.render = () => ({
      promise: new Promise<void>((_, reject) => {
        rejectRender2 = reject;
      }),
      cancel() {
        void new Promise<void>((resolve) => {
          settleDelayResolve2 = resolve;
        }).then(() => {
          rejectRender2(new pdfjsLegacy.RenderingCancelledException('Cancelled 2'));
        });
      },
    });

    const renderPromise2 = engine.renderPageToCanvas(1, canvas2, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
    });
    await vi.waitFor(() => {
      expect(rejectRender2).toBeTypeOf('function');
    });
    engine.releaseCanvas(canvas2);
    await vi.waitFor(() => {
      expect(settleDelayResolve2).toBeTypeOf('function');
    });
    const cleanupDuringDestroy = engine.cleanup();
    await engine.destroy();
    settleDelayResolve2();
    await Promise.all([renderPromise2, cleanupDuringDestroy]);
    expect(docCleanup).toHaveBeenCalledTimes(2);
  });

  it('cleans up page on aborted/superseded early exits in renderPageToCanvas without breaking concurrent reads', async () => {
    const page1Cleanup = vi.fn();
    let resolveGetPage1!: (p: PdfPageLike) => void;
    let getPage1CallCount = 0;

    const page1: PdfPageLike = {
      getViewport: () => createMockViewport(800, 450),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => [],
      cleanup: page1Cleanup,
    };

    const engine = new PdfEngine({
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => null,
            getPage: (n: number) => {
              if (n === 1) {
                getPage1CallCount += 1;
                // Call 1 = loadDeck, Call 2 = first renderPageToCanvas
                if (getPage1CallCount === 2) {
                  return new Promise<PdfPageLike>((resolve) => {
                    resolveGetPage1 = resolve;
                  });
                }
              }
              return Promise.resolve(page1);
            },
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        }),
      },
      disableWorker: true,
    });

    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'early-exit.pdf');
    expect(page1Cleanup).toHaveBeenCalledTimes(1);

    const canvas = document.createElement('canvas');
    const controller = new AbortController();
    const abortedWhileFetchingPage = engine.renderPageToCanvas(1, canvas, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
      signal: controller.signal,
    });

    await vi.waitFor(() => {
      expect(resolveGetPage1).toBeTypeOf('function');
    });
    controller.abort();
    resolveGetPage1(page1);

    await expect(abortedWhileFetchingPage).resolves.toBeNull();
    // Early exit with no other concurrent user cleans up the page
    expect(page1Cleanup).toHaveBeenCalledTimes(2);

    // Concurrent render holding page 1 prevents premature cleanup from a second aborted render
    let resolveConcurrentRender!: () => void;
    page1.render = () => ({
      promise: new Promise<void>((resolve) => {
        resolveConcurrentRender = resolve;
      }),
      cancel: vi.fn(),
    });

    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');
    const pA = engine.renderPageToCanvas(1, canvasA, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
    });
    await vi.waitFor(() => {
      expect(resolveConcurrentRender).toBeTypeOf('function');
    });

    const ctrlB = new AbortController();
    const pB = engine.renderPageToCanvas(1, canvasB, {
      targetWidth: 800,
      targetHeight: 600,
      dpr: 1,
      cropRegion: 'full',
      signal: ctrlB.signal,
    });
    ctrlB.abort();
    await expect(pB).resolves.toBeNull();
    // canvasA is still rendering page 1 -> page1Cleanup must NOT have been called again
    expect(page1Cleanup).toHaveBeenCalledTimes(2);

    resolveConcurrentRender();
    await expect(pA).resolves.toEqual({ cssWidth: 800, cssHeight: 450, pageNumber: 1 });
    await engine.destroy();
  });

  it('validates pageNumber ranges on getPage, renderPageToCanvas, extractPageLinks, cleanupPage, and filters unsafe link schemes', async () => {
    const pageCleanup = vi.fn();
    const mockPage: PdfPageLike = {
      getViewport: () => createMockViewport(1000, 500),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => [
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'https://safe.example/doc' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'http://plain.example/' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'mailto:speaker@example.com' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'javascript:alert(1)' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'data:text/html,<script>' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: 'vbscript:msgbox(1)' },
        { subtype: 'Link', annotationType: 2, rect: [100, 350, 300, 450], url: '/relative/path' },
        { subtype: 'Link', annotationType: 2, rect: [100, 50, 300, 150], dest: 'missing' },
      ],
      cleanup: pageCleanup,
    };

    const engine = new PdfEngine({
      pdfjs: {
        AnnotationType: { TEXT: 1, LINK: 2 },
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPageLabels: async () => null,
            getPage: async () => mockPage,
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: async () => {},
          }),
          destroy: async () => {},
        }),
      },
      disableWorker: true,
    });

    const canvas = document.createElement('canvas');
    await expect(engine.getPage(1)).rejects.toThrow(/no PDF document loaded/);
    await expect(
      engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'full',
      }),
    ).rejects.toThrow(/no PDF document loaded/);
    await expect(engine.cleanupPage(1)).resolves.toBeUndefined();

    await engine.loadDeck(new Uint8Array([1, 2, 3]), 'bounds.pdf');

    for (const badPage of [0, -1, 1.5, 3, Number.NaN]) {
      await expect(engine.getPage(badPage)).rejects.toThrow(RangeError);
      await expect(
        engine.renderPageToCanvas(badPage, canvas, {
          targetWidth: 800,
          targetHeight: 600,
          dpr: 1,
          cropRegion: 'full',
        }),
      ).rejects.toThrow(RangeError);
      await expect(engine.extractPageLinks(badPage)).rejects.toThrow(RangeError);
      await expect(engine.cleanupPage(badPage)).resolves.toBeUndefined();
    }

    await expect(engine.getPage(2)).resolves.toBe(mockPage);
    await engine.cleanupPage(2);
    // 2 from loadDeck + 1 from cleanupPage(2)
    expect(pageCleanup).toHaveBeenCalledTimes(3);

    // Pre-aborted signal returns null immediately
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'full',
        signal: preAborted.signal,
      }),
    ).resolves.toBeNull();

    // Scheme allowlist + default cropRegion ('full') + top-half / bottom-half
    const links = await engine.extractPageLinks(1);
    expect(links.map((l) => l.url)).toEqual([
      'https://safe.example/doc',
      'http://plain.example/',
      'mailto:speaker@example.com',
    ]);
    const topLinks = await engine.extractPageLinks(1, 'top-half');
    expect(topLinks).toHaveLength(3);
    const bottomLinks = await engine.extractPageLinks(1, 'bottom-half');
    expect(bottomLinks).toEqual([]);

    await engine.destroy();
  });

  it('resolves offline PDF.js asset URLs, configures defaultWorkerUrl, and handles getDocument rejection & multi-page destroy race', async () => {
    expect(typeof defaultWorkerUrl).toBe('string');
    expect(defaultWorkerUrl.length).toBeGreaterThan(0);
    expect(defaultWorkerUrl).toMatch(/pdf\.worker\.mjs/);

    expect(resolvePdfAssetUrl('pdfjs/cmaps', 'https://cdn.local/base')).toBe(
      'https://cdn.local/base/pdfjs/cmaps/',
    );
    expect(resolvePdfAssetUrl('/pdfjs/wasm/')).toBe('http://localhost:3000/pdfjs/wasm/');

    const originalLocation = window.location;
    vi.stubGlobal('location', { origin: 'null', href: 'about:blank' });
    try {
      expect(resolvePdfAssetUrl('pdfjs/cmaps/')).toBeNull();
    } finally {
      vi.stubGlobal('location', originalLocation);
    }

    let capturedDocParams: Record<string, unknown> | null = null;
    const workerOpts = { workerSrc: '' };
    const failedTaskDestroy = vi.fn(async () => {});

    const failingEngine = new PdfEngine({
      pdfjs: {
        GlobalWorkerOptions: workerOpts,
        getDocument(params) {
          capturedDocParams = params;
          return {
            promise: Promise.reject(new Error('Invalid stream')),
            destroy: failedTaskDestroy,
          };
        },
      },
      assetBaseUrl: 'https://assets.local',
    });

    expect(workerOpts.workerSrc).toBe(defaultWorkerUrl);
    await expect(failingEngine.loadDeck(new Uint8Array([1, 2, 3]), 'fail.pdf')).rejects.toThrow(
      'Invalid stream',
    );
    expect(failedTaskDestroy).toHaveBeenCalledTimes(1);
    expect(failingEngine.isLoaded()).toBe(false);
    expect(capturedDocParams).toMatchObject({
      cMapUrl: 'https://assets.local/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://assets.local/pdfjs/standard_fonts/',
      wasmUrl: 'https://assets.local/pdfjs/wasm/',
      iccUrl: 'https://assets.local/pdfjs/iccs/',
    });

    // destroy() mid-sticky-note loop (page 2)
    let resolvePage2!: (p: PdfPageLike) => void;
    const p1: PdfPageLike = {
      getViewport: () => createMockViewport(800, 450),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => [],
      cleanup: vi.fn(),
    };
    const loopDestroyDoc = vi.fn(async () => {});
    const loopEngine = new PdfEngine({
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 2,
            getPageLabels: async () => null,
            getPage: (n: number) =>
              n === 1
                ? Promise.resolve(p1)
                : new Promise<PdfPageLike>((resolve) => {
                    resolvePage2 = resolve;
                  }),
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: async () => {},
            destroy: loopDestroyDoc,
          }),
          destroy: async () => {},
        }),
      },
      disableWorker: true,
    });

    const loadP = loopEngine.loadDeck(new Uint8Array([4, 5, 6]), 'loop-race.pdf');
    await vi.waitFor(() => {
      expect(resolvePage2).toBeTypeOf('function');
    });
    await loopEngine.destroy();
    resolvePage2(p1);
    await expect(loadP).rejects.toThrow(/aborted or superseded/i);
    expect(loopDestroyDoc).toHaveBeenCalledTimes(1);
    expect(loopEngine.isLoaded()).toBe(false);
  });

  it('smoke-renders real single-page-deck.pdf via pdfjs-dist/legacy onto a mocked 2D canvas', async () => {
    const pdfBytes = new Uint8Array(
      readFileSync(path.join(projectRoot, 'tests', 'fixtures', 'single-page-deck.pdf')),
    );
    const engine = new PdfEngine({
      pdfjs: pdfjsLegacy as unknown as PdfJsLike,
      disableWorker: true,
    });

    const canvas = document.createElement('canvas');
    const transformSpy = vi.fn();
    const fillRectSpy = vi.fn();
    const fillTextSpy = vi.fn();
    const mockCtx = {
      canvas,
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      transform: transformSpy,
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      getTransform: vi.fn(() => new DOMMatrix()),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      fillRect: fillRectSpy,
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: fillTextSpy,
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      drawImage: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => ({})),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) =>
      contextId === '2d' ? mockCtx : null,
    );

    try {
      await engine.loadDeck(pdfBytes, 'single-page-deck.pdf');
      const result = await engine.renderPageToCanvas(1, canvas, {
        targetWidth: 960,
        targetHeight: 540,
        dpr: 2,
        cropRegion: 'full',
      });

      expect(result).not.toBeNull();
      expect(result!.pageNumber).toBe(1);
      expect(result!.cssWidth).toBe(960);
      expect(result!.cssHeight).toBeGreaterThanOrEqual(539);
      expect(result!.cssHeight).toBeLessThanOrEqual(540);
      expect(canvas.width).toBe(result!.cssWidth * 2);
      expect(canvas.height).toBe(result!.cssHeight * 2);
      expect(transformSpy).toHaveBeenCalled();
    } finally {
      await engine.destroy();
    }
  });

  it('enforces last-caller-wins when overlapping loadDeckFromUrl calls resolve out of order', async () => {
    let callIdx = 0;
    const capturedSignals: Array<AbortSignal | null | undefined> = [];
    let resolveFirst!: (res: Response) => void;
    let resolveSecond!: (res: Response) => void;

    const firstPayload = encoder.encode('%PDF-1.7-first');
    const secondPayload = encoder.encode('%PDF-1.7-second');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      callIdx += 1;
      capturedSignals.push(init?.signal);
      if (callIdx === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return new Promise<Response>((resolve) => {
        resolveSecond = resolve;
      });
    });

    const loadedContents: string[] = [];
    const engine = new PdfEngine({
      pdfjs: {
        getDocument(params) {
          const decoded = new TextDecoder().decode((params.data as Uint8Array).slice());
          loadedContents.push(decoded);
          return {
            promise: Promise.resolve({
              numPages: 1,
              getPageLabels: async () => ['1'],
              getPage: async () => ({
                getViewport: () => createMockViewport(800, 450),
                render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
                getAnnotations: async () => [],
                cleanup: vi.fn(),
              }),
              getOutline: async () => null,
              getDestination: async () => null,
              getPageIndex: async () => -1,
              cleanup: async () => {},
              destroy: async () => {},
            }),
            destroy: async () => {},
          };
        },
      },
      disableWorker: true,
    });

    try {
      const pFirst = engine.loadDeckFromUrl('/first.pdf');
      const pSecond = engine.loadDeckFromUrl('/second.pdf');

      await vi.waitFor(() => {
        expect(resolveFirst).toBeTypeOf('function');
        expect(resolveSecond).toBeTypeOf('function');
      });

      // Second call aborted the first fetch's AbortController
      expect(capturedSignals[0]?.aborted).toBe(true);
      expect(capturedSignals[1]?.aborted).toBe(false);

      // Even if first fetch resolves BEFORE second fetch (ignoring signal), first MUST lose
      resolveFirst({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => firstPayload.slice().buffer,
      } as Response);

      await expect(pFirst).rejects.toThrow(/aborted or superseded/i);

      resolveSecond({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => secondPayload.slice().buffer,
      } as Response);

      const secondMeta = await pSecond;
      expect(secondMeta.fileName).toBe('second.pdf');
      expect(engine.isLoaded()).toBe(true);
      expect(engine.getDocumentMeta()?.fileName).toBe('second.pdf');
      expect(loadedContents).toEqual(['%PDF-1.7-second']);
    } finally {
      fetchSpy.mockRestore();
      await engine.destroy();
    }
  });

  it('prevents real pdfjs-dist/legacy startCleanup crash when cleanup() runs immediately after renderPageToCanvas() starts', async () => {
    const pdfBytes = new Uint8Array(
      readFileSync(path.join(projectRoot, 'tests', 'fixtures', 'single-page-deck.pdf')),
    );
    const engine = new PdfEngine({
      pdfjs: pdfjsLegacy as unknown as PdfJsLike,
      disableWorker: true,
    });

    const canvas = document.createElement('canvas');
    const mockCtx = {
      canvas,
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      getTransform: vi.fn(() => new DOMMatrix()),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      drawImage: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => ({})),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(canvas, 'getContext').mockImplementation((contextId: string) =>
      contextId === '2d' ? mockCtx : null,
    );

    try {
      await engine.loadDeck(pdfBytes, 'single-page-deck.pdf');
      const renderPromise = engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 450,
        dpr: 1,
        cropRegion: 'full',
      });
      // Immediately invoke cleanup() while renderPageToCanvas is pre-renderTask / in-flight
      await expect(engine.cleanup()).resolves.toBeUndefined();
      const renderResult = await renderPromise;
      expect(renderResult).not.toBeNull();
      expect(renderResult!.pageNumber).toBe(1);

      // Once idle, cleanup() runs cleanly
      await expect(engine.cleanup()).resolves.toBeUndefined();
    } finally {
      await engine.destroy();
    }
  });

  it('guards cleanup() and cleanupPage() against pre-renderTask getPage(), extractPageLinks(), and overlapping in-flight doc.cleanup()', async () => {
    const docCleanup = vi.fn(async () => {});
    const page1Cleanup = vi.fn();
    let resolveDeferredGetPage: ((page: PdfPageLike) => void) | null = null;
    let deferNextGetPage = false;

    const mockPage: PdfPageLike = {
      getViewport: () => createMockViewport(800, 450),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getAnnotations: async () => [],
      cleanup: page1Cleanup,
    };

    const getPageSpy = vi.fn(() => {
      if (deferNextGetPage) {
        deferNextGetPage = false;
        return new Promise<PdfPageLike>((resolve) => {
          resolveDeferredGetPage = resolve;
        });
      }
      return Promise.resolve(mockPage);
    });

    const engine = new PdfEngine({
      pdfjs: {
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPageLabels: async () => null,
            getPage: getPageSpy,
            getOutline: async () => null,
            getDestination: async () => null,
            getPageIndex: async () => -1,
            cleanup: docCleanup,
            destroy: async () => {},
          }),
          destroy: async () => {},
        }),
      },
      disableWorker: true,
    });

    try {
      await engine.loadDeck(new Uint8Array([1, 2, 3]), 'pre-render-guard.pdf');
      expect(page1Cleanup).toHaveBeenCalledTimes(1);

      // 1. Pre-renderTask doc.getPage() blocks both cleanup() and cleanupPage(1)
      deferNextGetPage = true;
      const canvas = document.createElement('canvas');
      const renderP = engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'full',
      });
      await vi.waitFor(() => {
        expect(resolveDeferredGetPage).toBeTypeOf('function');
      });

      await engine.cleanup();
      expect(docCleanup).not.toHaveBeenCalled();

      await engine.cleanupPage(1);
      expect(page1Cleanup).toHaveBeenCalledTimes(1);

      resolveDeferredGetPage!(mockPage);
      resolveDeferredGetPage = null;
      await expect(renderP).resolves.toEqual({ cssWidth: 800, cssHeight: 450, pageNumber: 1 });

      // 2. Active extractPageLinks() blocks both cleanup() and cleanupPage(1)
      deferNextGetPage = true;
      const linksP = engine.extractPageLinks(1, 'full');
      await vi.waitFor(() => {
        expect(resolveDeferredGetPage).toBeTypeOf('function');
      });

      await engine.cleanup();
      expect(docCleanup).not.toHaveBeenCalled();

      await engine.cleanupPage(1);
      expect(page1Cleanup).toHaveBeenCalledTimes(1);

      resolveDeferredGetPage!(mockPage);
      resolveDeferredGetPage = null;
      await expect(linksP).resolves.toEqual([]);
      // extractPageLinks cleaned up page 1 on completion
      expect(page1Cleanup).toHaveBeenCalledTimes(2);

      // 3. cleanupPage(1) works when page 1 has no active users
      await engine.cleanupPage(1);
      expect(page1Cleanup).toHaveBeenCalledTimes(3);

      // 4. Opposite direction: in-flight doc.cleanup() delays renderPageToCanvas / extractPageLinks getPage()
      let resolveDocCleanup!: () => void;
      docCleanup.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveDocCleanup = resolve;
          }),
      );

      const getPageCountBeforeCleanup = getPageSpy.mock.calls.length;
      const cleanupP = engine.cleanup();
      await vi.waitFor(() => {
        expect(resolveDocCleanup).toBeTypeOf('function');
      });

      const renderDuringCleanup = engine.renderPageToCanvas(1, canvas, {
        targetWidth: 800,
        targetHeight: 600,
        dpr: 1,
        cropRegion: 'full',
      });
      const linksDuringCleanup = engine.extractPageLinks(1, 'full');
      await Promise.resolve();
      await Promise.resolve();

      // Neither renderPageToCanvas nor extractPageLinks may invoke doc.getPage() while doc.cleanup() is active
      expect(getPageSpy.mock.calls.length).toBe(getPageCountBeforeCleanup);

      resolveDocCleanup();
      await Promise.all([cleanupP, renderDuringCleanup, linksDuringCleanup]);
      expect(docCleanup).toHaveBeenCalledTimes(1);
      expect(getPageSpy.mock.calls.length).toBe(getPageCountBeforeCleanup + 2);
    } finally {
      await engine.destroy();
    }
  });
});
