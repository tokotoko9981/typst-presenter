import * as defaultPdfjs from 'pdfjs-dist';
import defaultWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  extractStickyNotesFromPage,
  mergePageNote,
  normalizePageLabels,
  parseNotesAttachments,
  resolveDestToPageNumber,
  resolveOutlineTree,
  type PdfAnnotationLike,
  type PdfDocumentExtractLike,
} from './extractors.ts';
import { computeDeckId, toByteView } from './hash.ts';
import type {
  CropRegion,
  LoadedDeckMeta,
  PdfLinkAnnotation,
  RenderOptions,
  RenderResult,
} from './types.ts';
import {
  computeRenderPlan,
  computeSuggestedCropMode,
  normalizeAndCropLinkRect,
  type ViewportPointConverter,
} from './viewportMath.ts';

export interface PdfViewportLike extends ViewportPointConverter {
  scale: number;
  offsetX?: number;
  offsetY?: number;
}

export interface PdfRenderTaskLike {
  promise: Promise<void>;
  cancel(): void;
}

export interface PdfPageLike {
  getViewport(params: {
    scale: number;
    offsetX?: number;
    offsetY?: number;
    dontFlip?: boolean;
  }): PdfViewportLike;
  render(params: {
    canvas: HTMLCanvasElement | null;
    viewport: PdfViewportLike;
    transform?: number[];
  }): PdfRenderTaskLike;
  getAnnotations(params?: unknown): Promise<PdfAnnotationLike[]>;
  cleanup(resetStats?: boolean): boolean | void;
}

export interface PdfDocumentLike extends PdfDocumentExtractLike {
  getPage(pageNumber: number): Promise<PdfPageLike>;
  cleanup(keepLoadedFonts?: boolean): Promise<void>;
  destroy?(): Promise<void>;
  loadingTask?: PdfLoadingTaskLike;
}

export interface PdfLoadingTaskLike {
  promise: Promise<PdfDocumentLike>;
  destroy(): Promise<void>;
}

export interface PdfJsLike {
  GlobalWorkerOptions?: {
    workerSrc: string;
  };
  AnnotationType?: {
    TEXT?: number;
    LINK?: number;
  };
  RenderingCancelledException?: abstract new (...args: never[]) => unknown;
  getDocument(params: Record<string, unknown>): PdfLoadingTaskLike;
}

export interface PdfEngineOptions {
  pdfjs?: PdfJsLike;
  disableWorker?: boolean;
  assetBaseUrl?: string;
}

const PDF_TEXT_ANNOTATION_TYPE = 1;
const PDF_LINK_ANNOTATION_TYPE = 2;
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MAX_PREFETCH_ENTRIES = 4;

interface PrefetchEntry {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
  pageNumber: number;
}

function sanitizeLinkUrl(rawUrl: unknown): string | undefined {
  if (typeof rawUrl !== 'string') {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    // Reject invalid or relative URLs lacking an allowlisted scheme
  }
  return undefined;
}

function inferFileNameFromUrl(url: string | URL): string {
  try {
    const base =
      typeof window !== 'undefined' && window.location?.href
        ? window.location.href
        : 'http://localhost/';
    const parsed = url instanceof URL ? url : new URL(url, base);
    const segment = parsed.pathname.split('/').filter(Boolean).pop();
    if (segment) {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    }
  } catch {
    if (typeof url === 'string') {
      const segment = url.split('?')[0]?.split('#')[0]?.split('/').filter(Boolean).pop();
      if (segment) {
        return segment;
      }
    }
  }
  return 'deck.pdf';
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function resolvePdfAssetUrl(subpath: string, baseOverride?: string): string | null {
  const cleanSubpath = ensureTrailingSlash(subpath.replace(/^\/+/, ''));

  if (typeof baseOverride === 'string' && baseOverride.length > 0) {
    return `${ensureTrailingSlash(baseOverride)}${cleanSubpath}`;
  }

  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin !== 'null'
  ) {
    const base = ensureTrailingSlash(import.meta.env?.BASE_URL ?? '/');
    return new URL(`${base}${cleanSubpath}`, window.location.href).href;
  }

  return null;
}

function isCancellationError(
  err: unknown,
  RenderingCancelledCtor?: abstract new (...args: never[]) => unknown,
): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (RenderingCancelledCtor && err instanceof RenderingCancelledCtor) {
    return true;
  }
  const named = err as { name?: unknown; message?: unknown };
  return (
    named.name === 'RenderingCancelledException' ||
    named.name === 'AbortError' ||
    (typeof named.message === 'string' && named.message.includes('Rendering cancelled'))
  );
}

export class PdfEngine {
  private readonly pdfjs: PdfJsLike;
  private readonly disableWorker: boolean;
  private readonly assetBaseUrl?: string;

  private doc: PdfDocumentLike | null = null;
  private activeTask: PdfLoadingTaskLike | null = null;
  private inFlightLoadingTask: PdfLoadingTaskLike | null = null;
  private inFlightFetchController: AbortController | null = null;
  private meta: LoadedDeckMeta | null = null;
  private loadGeneration = 0;

  private readonly activeRenderTasks = new WeakMap<HTMLCanvasElement, PdfRenderTaskLike>();
  private readonly activeRenderTaskSet = new Set<PdfRenderTaskLike>();
  private readonly settlingRenderTasks = new WeakMap<HTMLCanvasElement, Promise<void>>();
  private readonly allSettlingRenderTasks = new Set<Promise<void>>();
  private readonly canvasRenderGeneration = new WeakMap<HTMLCanvasElement, number>();
  private readonly trackedCanvases = new Set<HTMLCanvasElement>();
  private readonly activePageUsers = new WeakMap<PdfDocumentLike, Map<number, number>>();
  private activePageUseCount = 0;
  private inFlightRenderCount = 0;
  private preRenderTaskCount = 0;
  private inFlightLinkExtractCount = 0;
  private inFlightCleanupPromise: Promise<void> | null = null;
  private readonly prefetchCache = new Map<string, PrefetchEntry>();
  private readonly prefetchControllers = new Map<string, AbortController>();

  constructor(options: PdfEngineOptions = {}) {
    this.pdfjs = options.pdfjs ?? (defaultPdfjs as unknown as PdfJsLike);
    this.disableWorker = options.disableWorker ?? false;
    this.assetBaseUrl = options.assetBaseUrl;
    this.ensureWorkerConfigured();
  }

  private ensureWorkerConfigured(): void {
    if (this.disableWorker) {
      return;
    }
    const opts = this.pdfjs.GlobalWorkerOptions;
    if (opts && !opts.workerSrc && typeof defaultWorkerUrl === 'string' && defaultWorkerUrl.length > 0) {
      opts.workerSrc = defaultWorkerUrl;
    }
  }

  getDocumentMeta(): LoadedDeckMeta | null {
    return this.meta;
  }

  isLoaded(): boolean {
    return this.doc !== null;
  }

  private abortInFlightFetch(): void {
    if (this.inFlightFetchController) {
      try {
        this.inFlightFetchController.abort();
      } catch {
        // Ignore abort errors
      }
      this.inFlightFetchController = null;
    }
  }

  private async waitForCleanupSettlement(): Promise<void> {
    while (this.inFlightCleanupPromise) {
      await this.inFlightCleanupPromise.catch(() => {});
    }
  }

  private hasActivePageUsers(doc: PdfDocumentLike, pageNumber: number): boolean {
    return (this.activePageUsers.get(doc)?.get(pageNumber) ?? 0) > 0;
  }

  private acquirePageUse(doc: PdfDocumentLike, pageNumber: number): void {
    let map = this.activePageUsers.get(doc);
    if (!map) {
      map = new Map<number, number>();
      this.activePageUsers.set(doc, map);
    }
    map.set(pageNumber, (map.get(pageNumber) ?? 0) + 1);
    this.activePageUseCount += 1;
  }

  private releasePageUse(doc: PdfDocumentLike, pageNumber: number): number {
    const map = this.activePageUsers.get(doc);
    if (!map) {
      return 0;
    }
    const prev = map.get(pageNumber) ?? 0;
    if (prev <= 0) {
      return 0;
    }
    const next = prev - 1;
    if (next === 0) {
      map.delete(pageNumber);
    } else {
      map.set(pageNumber, next);
    }
    this.activePageUseCount = Math.max(0, this.activePageUseCount - 1);
    return next;
  }

  async loadDeckFromUrl(url: string | URL, fileName?: string): Promise<LoadedDeckMeta> {
    const fetchGen = (this.loadGeneration += 1);
    this.abortInFlightFetch();

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.inFlightFetchController = controller;

    const targetUrl = url instanceof URL ? url.href : url;
    let buffer: ArrayBuffer;
    try {
      const res = await fetch(
        targetUrl,
        controller ? { signal: controller.signal } : undefined,
      );
      if (fetchGen !== this.loadGeneration) {
        throw new Error('PdfEngine: loadDeck aborted or superseded.');
      }
      if (!res.ok) {
        throw new Error(
          `PdfEngine: failed to fetch PDF from "${targetUrl}" (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}).`,
        );
      }
      buffer = await res.arrayBuffer();
      if (fetchGen !== this.loadGeneration) {
        throw new Error('PdfEngine: loadDeck aborted or superseded.');
      }
    } catch (err) {
      if (fetchGen !== this.loadGeneration) {
        throw new Error('PdfEngine: loadDeck aborted or superseded.');
      }
      throw err;
    } finally {
      if (this.inFlightFetchController === controller) {
        this.inFlightFetchController = null;
      }
    }

    const resolvedName =
      typeof fileName === 'string' && fileName.length > 0 ? fileName : inferFileNameFromUrl(url);
    return this.loadDeckWithGeneration(buffer, resolvedName, fetchGen);
  }

  async loadDeck(bytes: ArrayBuffer | ArrayBufferView, fileName: string): Promise<LoadedDeckMeta> {
    const myGen = (this.loadGeneration += 1);
    this.abortInFlightFetch();
    return this.loadDeckWithGeneration(bytes, fileName, myGen);
  }

  private async loadDeckWithGeneration(
    bytes: ArrayBuffer | ArrayBufferView,
    fileName: string,
    myGen: number,
  ): Promise<LoadedDeckMeta> {
    const rawView = toByteView(bytes);
    const byteLength = rawView.byteLength;

    // Clone caller buffer so PDF.js worker transfer cannot detach caller-owned ArrayBuffers
    const workerData = rawView.slice();

    const deckId = await computeDeckId(rawView);
    if (myGen !== this.loadGeneration) {
      throw new Error('PdfEngine: loadDeck aborted or superseded.');
    }

    await this.teardownResources();
    if (myGen !== this.loadGeneration) {
      throw new Error('PdfEngine: loadDeck aborted or superseded.');
    }

    const docParams: Record<string, unknown> = {
      data: workerData,
    };

    if (this.disableWorker) {
      docParams.disableWorkerRendering = true;
    }

    const cMapUrl = resolvePdfAssetUrl('pdfjs/cmaps/', this.assetBaseUrl);
    const standardFontDataUrl = resolvePdfAssetUrl('pdfjs/standard_fonts/', this.assetBaseUrl);
    const wasmUrl = resolvePdfAssetUrl('pdfjs/wasm/', this.assetBaseUrl);
    const iccUrl = resolvePdfAssetUrl('pdfjs/iccs/', this.assetBaseUrl);

    if (cMapUrl) {
      docParams.cMapUrl = cMapUrl;
      docParams.cMapPacked = true;
    }
    if (standardFontDataUrl) {
      docParams.standardFontDataUrl = standardFontDataUrl;
    }
    if (wasmUrl) {
      docParams.wasmUrl = wasmUrl;
    }
    if (iccUrl) {
      docParams.iccUrl = iccUrl;
    }

    const localTask = this.pdfjs.getDocument(docParams);
    this.inFlightLoadingTask = localTask;

    let localDoc: PdfDocumentLike;
    try {
      localDoc = await localTask.promise;
    } catch (err) {
      if (this.inFlightLoadingTask === localTask) {
        this.inFlightLoadingTask = null;
      }
      await localTask.destroy().catch(() => {});
      if (myGen !== this.loadGeneration) {
        throw new Error('PdfEngine: loadDeck aborted or superseded.');
      }
      throw err;
    }

    if (this.inFlightLoadingTask === localTask) {
      this.inFlightLoadingTask = null;
    }

    const cleanupLocal = async (): Promise<void> => {
      await localDoc.destroy?.().catch(() => {});
      await localTask.destroy().catch(() => {});
    };

    const assertCurrentGeneration = (): void => {
      if (myGen !== this.loadGeneration) {
        throw new Error('PdfEngine: loadDeck aborted or superseded.');
      }
    };

    try {
      assertCurrentGeneration();

      const numPages = localDoc.numPages;
      if (!Number.isInteger(numPages) || numPages < 1) {
        throw new Error('PdfEngine: PDF document contains 0 pages.');
      }
      const pageLabels = normalizePageLabels(await localDoc.getPageLabels().catch(() => null));
      assertCurrentGeneration();

      const firstPage = await localDoc.getPage(1);
      let firstPageAspectRatio = 16 / 9;
      let suggestedCropMode = computeSuggestedCropMode(firstPageAspectRatio);
      let outline: LoadedDeckMeta['outline'] = [];
      let extractedNotes: Record<number, string> = {};
      let pdfpcConfig: LoadedDeckMeta['extractedPdfpcConfig'];

      try {
        assertCurrentGeneration();
        const vp1 = firstPage.getViewport({ scale: 1 });
        firstPageAspectRatio = vp1.height > 0 ? vp1.width / vp1.height : 16 / 9;
        suggestedCropMode = computeSuggestedCropMode(firstPageAspectRatio);

        const rawOutline = await localDoc.getOutline().catch(() => null);
        assertCurrentGeneration();

        outline = await resolveOutlineTree(localDoc, rawOutline);
        assertCurrentGeneration();

        const parsedAttachments = await parseNotesAttachments(localDoc);
        assertCurrentGeneration();
        extractedNotes = parsedAttachments.notes;
        pdfpcConfig = parsedAttachments.pdfpcConfig;

        const textAnnotationType = this.pdfjs.AnnotationType?.TEXT ?? PDF_TEXT_ANNOTATION_TYPE;
        const firstSticky = await extractStickyNotesFromPage(firstPage, textAnnotationType);
        assertCurrentGeneration();
        if (firstSticky) {
          mergePageNote(extractedNotes, 1, firstSticky);
        }
      } finally {
        firstPage.cleanup();
      }

      const textAnnotationType = this.pdfjs.AnnotationType?.TEXT ?? PDF_TEXT_ANNOTATION_TYPE;
      for (let pageNum = 2; pageNum <= numPages; pageNum += 1) {
        const page = await localDoc.getPage(pageNum);
        try {
          assertCurrentGeneration();
          const sticky = await extractStickyNotesFromPage(page, textAnnotationType);
          assertCurrentGeneration();
          if (sticky) {
            mergePageNote(extractedNotes, pageNum, sticky);
          }
        } finally {
          page.cleanup();
        }
      }

      assertCurrentGeneration();

      const meta: LoadedDeckMeta = {
        deckId,
        fileName,
        byteLength,
        numPages,
        pageLabels,
        firstPageAspectRatio,
        suggestedCropMode,
        outline,
        extractedNotes,
        ...(pdfpcConfig ? { extractedPdfpcConfig: pdfpcConfig } : {}),
      };

      this.doc = localDoc;
      this.activeTask = localTask;
      this.meta = meta;
      return meta;
    } catch (err) {
      await cleanupLocal();
      throw err;
    }
  }

  async renderPageToCanvas(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    options: RenderOptions,
  ): Promise<RenderResult | null> {
    const doc = this.doc;
    if (!doc) {
      throw new Error('PdfEngine: no PDF document loaded.');
    }
    if (options.signal?.aborted) {
      return null;
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      throw new RangeError(
        `PdfEngine: pageNumber ${pageNumber} out of range [1..${doc.numPages}].`,
      );
    }

    this.trackedCanvases.add(canvas);
    const nextGen = (this.canvasRenderGeneration.get(canvas) ?? 0) + 1;
    this.canvasRenderGeneration.set(canvas, nextGen);

    const hasZoomView = Boolean(
      options.zoomView && Number.isFinite(options.zoomView.scale) && options.zoomView.scale > 1.001,
    );
    const cacheKey = this.buildPrefetchKey(pageNumber, options);
    const cached = !hasZoomView ? this.prefetchCache.get(cacheKey) : undefined;
    if (cached && cached.canvas !== canvas && cached.canvas.width > 0 && cached.canvas.height > 0) {
      const ctx = canvas.getContext('2d');
      if (ctx && typeof ctx.drawImage === 'function') {
        const active = this.activeRenderTasks.get(canvas);
        if (active) {
          this.activeRenderTasks.delete(canvas);
          this.activeRenderTaskSet.delete(active);
          try {
            active.cancel();
          } catch {
            // Ignore cancel errors
          }
        }
        canvas.width = cached.canvas.width;
        canvas.height = cached.canvas.height;
        canvas.style.width = `${cached.cssWidth}px`;
        canvas.style.height = `${cached.cssHeight}px`;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cached.canvas, 0, 0);
        // Touch LRU order
        this.prefetchCache.delete(cacheKey);
        this.prefetchCache.set(cacheKey, cached);
        return {
          cssWidth: cached.cssWidth,
          cssHeight: cached.cssHeight,
          pageNumber: cached.pageNumber,
        };
      }
    }

    this.inFlightRenderCount += 1;
    this.preRenderTaskCount += 1;
    let markedPreRender = true;
    this.acquirePageUse(doc, pageNumber);
    let page: PdfPageLike | null = null;
    let renderCompleted = false;

    const waitForPriorRenderSettlement = async (): Promise<boolean> => {
      while (this.activeRenderTasks.has(canvas) || this.settlingRenderTasks.has(canvas)) {
        const prevTask = this.activeRenderTasks.get(canvas);
        if (prevTask) {
          this.activeRenderTasks.delete(canvas);
          this.activeRenderTaskSet.delete(prevTask);
          try {
            prevTask.cancel();
          } catch {
            // Ignore cancel errors from already settled tasks
          }
        }
        const settling = this.settlingRenderTasks.get(canvas);
        if (settling) {
          await settling;
        } else if (prevTask) {
          await prevTask.promise.catch(() => {});
        }
        if (
          options.signal?.aborted ||
          this.doc !== doc ||
          this.canvasRenderGeneration.get(canvas) !== nextGen
        ) {
          return false;
        }
      }
      return true;
    };

    try {
      if (this.inFlightCleanupPromise) {
        await this.waitForCleanupSettlement();
        if (
          options.signal?.aborted ||
          this.doc !== doc ||
          this.canvasRenderGeneration.get(canvas) !== nextGen
        ) {
          return null;
        }
      }

      if (this.activeRenderTasks.has(canvas) || this.settlingRenderTasks.has(canvas)) {
        if (!(await waitForPriorRenderSettlement())) {
          return null;
        }
      }

      if (
        options.signal?.aborted ||
        this.doc !== doc ||
        this.canvasRenderGeneration.get(canvas) !== nextGen
      ) {
        return null;
      }

      page = await doc.getPage(pageNumber);

      if (
        options.signal?.aborted ||
        this.doc !== doc ||
        this.canvasRenderGeneration.get(canvas) !== nextGen
      ) {
        return null;
      }

      if (this.inFlightCleanupPromise) {
        await this.waitForCleanupSettlement();
        if (
          options.signal?.aborted ||
          this.doc !== doc ||
          this.canvasRenderGeneration.get(canvas) !== nextGen
        ) {
          return null;
        }
      }

      if (this.activeRenderTasks.has(canvas) || this.settlingRenderTasks.has(canvas)) {
        if (!(await waitForPriorRenderSettlement())) {
          return null;
        }
      }

      if (
        options.signal?.aborted ||
        this.doc !== doc ||
        this.canvasRenderGeneration.get(canvas) !== nextGen
      ) {
        return null;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const plan = computeRenderPlan(baseViewport.width, baseViewport.height, options);

      const renderViewport = page.getViewport({
        scale: plan.scale,
        offsetX: plan.offsetX,
        offsetY: plan.offsetY,
      });

      canvas.width = plan.canvasWidth;
      canvas.height = plan.canvasHeight;
      canvas.style.width = `${plan.cssWidth}px`;
      canvas.style.height = `${plan.cssHeight}px`;

      const renderTask = page.render({
        canvas,
        viewport: renderViewport,
        transform: plan.transform,
      });
      if (markedPreRender) {
        this.preRenderTaskCount -= 1;
        markedPreRender = false;
      }
      this.activeRenderTasks.set(canvas, renderTask);
      this.activeRenderTaskSet.add(renderTask);

      const settlingPromise = renderTask.promise
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          this.allSettlingRenderTasks.delete(settlingPromise);
          if (this.settlingRenderTasks.get(canvas) === settlingPromise) {
            this.settlingRenderTasks.delete(canvas);
          }
        });
      this.settlingRenderTasks.set(canvas, settlingPromise);
      this.allSettlingRenderTasks.add(settlingPromise);

      const onAbort = () => {
        try {
          renderTask.cancel();
        } catch {
          // Ignore cancel errors
        }
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) {
        onAbort();
      }

      try {
        await renderTask.promise;
        if (
          options.signal?.aborted ||
          this.doc !== doc ||
          this.canvasRenderGeneration.get(canvas) !== nextGen
        ) {
          return null;
        }
        renderCompleted = true;
        return {
          cssWidth: plan.cssWidth,
          cssHeight: plan.cssHeight,
          pageNumber,
        };
      } catch (err) {
        if (
          options.signal?.aborted ||
          this.doc !== doc ||
          this.canvasRenderGeneration.get(canvas) !== nextGen ||
          isCancellationError(err, this.pdfjs.RenderingCancelledException)
        ) {
          return null;
        }
        throw err;
      } finally {
        options.signal?.removeEventListener('abort', onAbort);
        if (this.activeRenderTasks.get(canvas) === renderTask) {
          this.activeRenderTasks.delete(canvas);
        }
        this.activeRenderTaskSet.delete(renderTask);
      }
    } finally {
      if (markedPreRender) {
        this.preRenderTaskCount -= 1;
        markedPreRender = false;
      }
      const remainingUsers = this.releasePageUse(doc, pageNumber);
      if (!renderCompleted && remainingUsers === 0 && page) {
        page.cleanup();
      }
      this.inFlightRenderCount -= 1;
    }
  }

  async extractPageLinks(
    pageNumber: number,
    cropRegion: CropRegion = 'full',
  ): Promise<PdfLinkAnnotation[]> {
    const doc = this.doc;
    if (!doc) {
      throw new Error('PdfEngine: no PDF document loaded.');
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      throw new RangeError(
        `PdfEngine: pageNumber ${pageNumber} out of range [1..${doc.numPages}].`,
      );
    }

    this.inFlightLinkExtractCount += 1;
    this.acquirePageUse(doc, pageNumber);
    let page: PdfPageLike | null = null;
    try {
      while (this.inFlightCleanupPromise) {
        await this.inFlightCleanupPromise.catch(() => {});
        if (this.doc !== doc) {
          throw new Error('PdfEngine: no PDF document loaded.');
        }
      }

      page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const annotations = await page.getAnnotations().catch(() => []);
      const linkAnnotationType = this.pdfjs.AnnotationType?.LINK ?? PDF_LINK_ANNOTATION_TYPE;

      const links: PdfLinkAnnotation[] = [];
      for (const annot of annotations) {
        if (!annot || typeof annot !== 'object') continue;
        const isLink =
          annot.subtype === 'Link' || annot.annotationType === linkAnnotationType;
        if (!isLink || !Array.isArray(annot.rect)) continue;

        const normalizedRect = normalizeAndCropLinkRect(
          annot.rect as number[],
          viewport,
          cropRegion,
        );
        if (!normalizedRect) continue;

        const url = sanitizeLinkUrl(annot.url);
        const destPage =
          url === undefined && annot.dest !== undefined
            ? (await resolveDestToPageNumber(doc, annot.dest)) ?? undefined
            : undefined;

        if (url === undefined && destPage === undefined) {
          continue;
        }

        links.push({
          rect: normalizedRect,
          ...(url !== undefined ? { url } : {}),
          ...(destPage !== undefined ? { destPage } : {}),
        });
      }

      return links;
    } finally {
      if (this.releasePageUse(doc, pageNumber) === 0 && page) {
        page.cleanup();
      }
      this.inFlightLinkExtractCount -= 1;
    }
  }

  async getPage(pageNumber: number): Promise<PdfPageLike> {
    const doc = this.doc;
    if (!doc) {
      throw new Error('PdfEngine: no PDF document loaded.');
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      throw new RangeError(
        `PdfEngine: pageNumber ${pageNumber} out of range [1..${doc.numPages}].`,
      );
    }
    while (this.inFlightCleanupPromise) {
      await this.inFlightCleanupPromise.catch(() => {});
      if (this.doc !== doc) {
        throw new Error('PdfEngine: no PDF document loaded.');
      }
    }
    return doc.getPage(pageNumber);
  }

  releaseCanvas(canvas: HTMLCanvasElement): void {
    const nextGen = (this.canvasRenderGeneration.get(canvas) ?? 0) + 1;
    this.canvasRenderGeneration.set(canvas, nextGen);

    const active = this.activeRenderTasks.get(canvas);
    if (active) {
      this.activeRenderTasks.delete(canvas);
      this.activeRenderTaskSet.delete(active);
      try {
        active.cancel();
      } catch {
        // Ignore cancel errors
      }
    }

    this.trackedCanvases.delete(canvas);
    canvas.width = 0;
    canvas.height = 0;
  }

  async cleanupPage(pageNumber: number): Promise<void> {
    const doc = this.doc;
    if (!doc || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      return;
    }
    if (this.inFlightCleanupPromise || this.hasActivePageUsers(doc, pageNumber)) {
      return;
    }
    const page = await doc.getPage(pageNumber);
    if (
      this.doc !== doc ||
      this.inFlightCleanupPromise ||
      this.hasActivePageUsers(doc, pageNumber)
    ) {
      return;
    }
    page.cleanup();
  }

  private buildPrefetchKey(
    pageNumber: number,
    options: Pick<RenderOptions, 'targetWidth' | 'targetHeight' | 'dpr' | 'cropRegion' | 'zoomScale'>,
  ): string {
    const zoom =
      typeof options.zoomScale === 'number' && Number.isFinite(options.zoomScale)
        ? options.zoomScale
        : 1;
    return `${pageNumber}|${options.cropRegion}|${Math.round(options.targetWidth)}x${Math.round(options.targetHeight)}|${options.dpr.toFixed(2)}|${zoom.toFixed(2)}`;
  }

  private setPrefetchEntry(key: string, entry: PrefetchEntry): void {
    if (this.prefetchCache.has(key)) {
      this.prefetchCache.delete(key);
    }
    this.prefetchCache.set(key, entry);
    while (this.prefetchCache.size > MAX_PREFETCH_ENTRIES) {
      const oldestKey = this.prefetchCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.prefetchCache.get(oldestKey);
      this.prefetchCache.delete(oldestKey);
      if (oldest) {
        this.releaseCanvas(oldest.canvas);
      }
    }
  }

  prefetchAdjacentPages(currentPage: number, options: Omit<RenderOptions, 'signal'>): void {
    const doc = this.doc;
    if (!doc || typeof document === 'undefined') {
      return;
    }
    if ((options.zoomScale ?? 1) > 1.01 || (options.zoomView && options.zoomView.scale > 1.001)) {
      return;
    }

    const targets = [currentPage + 1, currentPage - 1].filter(
      (p) => Number.isInteger(p) && p >= 1 && p <= doc.numPages,
    );
    const desiredKeys = new Map<string, number>();
    for (const p of targets) {
      desiredKeys.set(this.buildPrefetchKey(p, options), p);
    }

    for (const [key, ctrl] of Array.from(this.prefetchControllers.entries())) {
      if (!desiredKeys.has(key)) {
        ctrl.abort();
        this.prefetchControllers.delete(key);
      }
    }

    const missing = Array.from(desiredKeys.entries()).filter(
      ([key]) => !this.prefetchCache.has(key) && !this.prefetchControllers.has(key),
    );
    if (missing.length === 0) {
      return;
    }

    void (async () => {
      for (const [key, targetPage] of missing) {
        if (this.doc !== doc || this.prefetchCache.has(key)) continue;
        const controller = new AbortController();
        this.prefetchControllers.set(key, controller);
        const offscreen = document.createElement('canvas');
        try {
          const res = await this.renderPageToCanvas(targetPage, offscreen, {
            ...options,
            signal: controller.signal,
          });
          if (res && !controller.signal.aborted && this.doc === doc && offscreen.width > 0) {
            this.setPrefetchEntry(key, {
              canvas: offscreen,
              cssWidth: res.cssWidth,
              cssHeight: res.cssHeight,
              pageNumber: res.pageNumber,
            });
          } else {
            this.releaseCanvas(offscreen);
          }
        } catch {
          this.releaseCanvas(offscreen);
        } finally {
          if (this.prefetchControllers.get(key) === controller) {
            this.prefetchControllers.delete(key);
          }
        }
      }
    })();
  }

  getPrefetchCacheSize(): number {
    return this.prefetchCache.size;
  }

  hasPrefetchedPage(pageNumber: number): boolean {
    for (const entry of this.prefetchCache.values()) {
      if (entry.pageNumber === pageNumber && entry.canvas.width > 0) {
        return true;
      }
    }
    return false;
  }

  clearPrefetchCache(): void {
    for (const ctrl of this.prefetchControllers.values()) {
      ctrl.abort();
    }
    this.prefetchControllers.clear();
    for (const entry of this.prefetchCache.values()) {
      this.releaseCanvas(entry.canvas);
    }
    this.prefetchCache.clear();
  }

  async cleanup(): Promise<void> {
    this.clearPrefetchCache();
    const doc = this.doc;
    if (!doc) {
      return;
    }
    if (this.inFlightCleanupPromise) {
      await this.inFlightCleanupPromise.catch(() => {});
      return;
    }
    if (
      this.activeRenderTaskSet.size > 0 ||
      this.preRenderTaskCount > 0 ||
      this.inFlightLinkExtractCount > 0 ||
      (this.allSettlingRenderTasks.size === 0 &&
        (this.inFlightRenderCount > 0 || this.activePageUseCount > 0))
    ) {
      return;
    }
    while (this.allSettlingRenderTasks.size > 0) {
      await Promise.allSettled(Array.from(this.allSettlingRenderTasks));
      if (
        this.doc !== doc ||
        this.activeRenderTaskSet.size > 0 ||
        this.preRenderTaskCount > 0 ||
        this.inFlightLinkExtractCount > 0
      ) {
        return;
      }
    }
    if (
      this.doc !== doc ||
      this.inFlightRenderCount !== 0 ||
      this.activeRenderTaskSet.size !== 0 ||
      this.allSettlingRenderTasks.size !== 0 ||
      this.activePageUseCount !== 0 ||
      this.inFlightCleanupPromise !== null
    ) {
      return;
    }
    const cleanupTask = doc.cleanup().finally(() => {
      if (this.inFlightCleanupPromise === cleanupTask) {
        this.inFlightCleanupPromise = null;
      }
    });
    this.inFlightCleanupPromise = cleanupTask;
    await cleanupTask;
  }

  private async teardownResources(): Promise<void> {
    this.abortInFlightFetch();
    this.clearPrefetchCache();
    for (const canvas of Array.from(this.trackedCanvases)) {
      this.releaseCanvas(canvas);
    }
    this.trackedCanvases.clear();

    const inFlight = this.inFlightLoadingTask;
    this.inFlightLoadingTask = null;

    const doc = this.doc;
    const activeTask = this.activeTask;
    this.doc = null;
    this.activeTask = null;
    this.meta = null;

    await Promise.all([
      inFlight ? inFlight.destroy().catch(() => {}) : Promise.resolve(),
      doc ? (doc.destroy?.().catch(() => {}) ?? Promise.resolve()) : Promise.resolve(),
      activeTask && activeTask !== inFlight
        ? activeTask.destroy().catch(() => {})
        : Promise.resolve(),
    ]);
  }

  async destroy(): Promise<void> {
    this.loadGeneration += 1;
    this.abortInFlightFetch();
    await this.teardownResources();
  }
}
