import { parseValidHHMM } from '../timer/TimerEngine.ts';
import type { LoadedDeckMeta, OutlineNode } from './types.ts';

export interface PdfOutlineItemLike {
  title?: unknown;
  dest?: unknown;
  items?: PdfOutlineItemLike[] | null;
}

export interface PdfAttachmentLike {
  filename?: unknown;
  rawFilename?: unknown;
  description?: unknown;
  content?: ArrayBufferView | ArrayBuffer | null;
}

export interface PdfAnnotationLike {
  subtype?: unknown;
  annotationType?: unknown;
  contentsObj?: { str?: unknown } | null;
  contents?: unknown;
  richText?: { str?: unknown; html?: unknown } | string | null;
  url?: unknown;
  dest?: unknown;
  rect?: unknown;
}

export interface PdfDocumentExtractLike {
  numPages: number;
  getPageLabels(): Promise<string[] | null>;
  getOutline(): Promise<PdfOutlineItemLike[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getAttachments?(): Promise<Map<string, PdfAttachmentLike> | Record<string, PdfAttachmentLike> | null>;
  getAttachmentContent?(id: string): Promise<Uint8Array | null>;
}

export interface PdfPageExtractLike {
  getAnnotations(params?: unknown): Promise<PdfAnnotationLike[]>;
}

const PDF_TEXT_ANNOTATION_TYPE = 1;
const PDF_LINK_ANNOTATION_TYPE = 2;
const PDF_FREETEXT_ANNOTATION_TYPE = 3;
const PDF_POPUP_ANNOTATION_TYPE = 16;
const PDF_WIDGET_ANNOTATION_TYPE = 20;

const IGNORED_NOTE_SUBTYPES = new Set(['Link', 'Widget', 'Popup']);
const IGNORED_NOTE_ANNOTATION_TYPES = new Set([
  PDF_LINK_ANNOTATION_TYPE,
  PDF_POPUP_ANNOTATION_TYPE,
  PDF_WIDGET_ANNOTATION_TYPE,
]);

export function normalizePageLabels(rawLabels: unknown): string[] | null {
  if (!Array.isArray(rawLabels) || rawLabels.length === 0) {
    return null;
  }
  return rawLabels.map((label, idx) =>
    typeof label === 'string' && label.length > 0 ? label : String(idx + 1),
  );
}

export async function resolveDestToPageNumber(
  doc: Pick<PdfDocumentExtractLike, 'numPages' | 'getDestination' | 'getPageIndex'>,
  dest: unknown,
): Promise<number | null> {
  if (!dest) {
    return null;
  }

  let resolvedDest: unknown = dest;
  if (typeof resolvedDest === 'string') {
    try {
      resolvedDest = await doc.getDestination(resolvedDest);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) {
    return null;
  }

  const target = resolvedDest[0];
  if (typeof target === 'number' && Number.isInteger(target)) {
    return target >= 0 && target < doc.numPages ? target + 1 : null;
  }

  if (target && typeof target === 'object' && 'num' in target && 'gen' in target) {
    try {
      const idx = await doc.getPageIndex(target);
      return Number.isInteger(idx) && idx >= 0 && idx < doc.numPages ? idx + 1 : null;
    } catch {
      return null;
    }
  }

  return null;
}

export async function resolveOutlineTree(
  doc: Pick<PdfDocumentExtractLike, 'numPages' | 'getDestination' | 'getPageIndex'>,
  rawOutline: PdfOutlineItemLike[] | null | undefined,
  ancestors: Set<object> = new Set<object>(),
): Promise<OutlineNode[]> {
  if (!Array.isArray(rawOutline) || rawOutline.length === 0) {
    return [];
  }

  const result: OutlineNode[] = [];
  for (const item of rawOutline) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (ancestors.has(item)) {
      continue;
    }
    ancestors.add(item);

    try {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const pageNumber = await resolveDestToPageNumber(doc, item.dest);
      const items = await resolveOutlineTree(doc, item.items, ancestors);
      if (title.length === 0 && items.length === 0) {
        continue;
      }
      result.push({ title, pageNumber, items });
    } finally {
      ancestors.delete(item);
    }
  }
  return result;
}

export function mergePageNote(
  target: Record<number, string>,
  pageNumber: number,
  incoming: string,
): void {
  const trimmed = incoming.trim();
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || trimmed.length === 0) {
    return;
  }
  const existing = target[pageNumber];
  if (!existing) {
    target[pageNumber] = trimmed;
    return;
  }
  if (
    existing === trimmed ||
    existing.split(/\n{2,}/).some((block) => block.trim() === trimmed)
  ) {
    return;
  }
  target[pageNumber] = `${existing}\n\n${trimmed}`;
}

function extractNoteTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => extractNoteTextFromUnknown(item))
      .filter((part) => part.length > 0)
      .join('\n\n');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidate = obj.markdown ?? obj.note ?? obj.notes ?? obj.text ?? obj.content;
    if (candidate !== undefined) {
      return extractNoteTextFromUnknown(candidate);
    }
  }
  return '';
}

function splitMarkdownByHr(text: string): string[] {
  const withoutFrontmatter = text.replace(
    /^---[ \t]*\n(?:[\s\S]*?\n)?---[ \t]*(?:\n|$)/,
    '',
  );
  if (withoutFrontmatter.length === 0) {
    return [];
  }

  const lines = withoutFrontmatter.split('\n');
  const parts: string[] = [];
  let currentLines: string[] = [];
  let activeFence: { char: '`' | '~'; length: number } | null = null;

  for (const line of lines) {
    if (activeFence === null) {
      const fenceOpen = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
      if (fenceOpen) {
        const marker = fenceOpen[1]!;
        const fenceChar = marker[0] as '`' | '~';
        const rest = fenceOpen[2] ?? '';
        if (fenceChar === '~' || !rest.includes('`')) {
          activeFence = { char: fenceChar, length: marker.length };
          currentLines.push(line);
          continue;
        }
      }
      if (/^[ \t]*---[ \t]*$/.test(line)) {
        parts.push(currentLines.join('\n'));
        currentLines = [];
        continue;
      }
      currentLines.push(line);
    } else {
      currentLines.push(line);
      const fenceClose = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (fenceClose) {
        const marker = fenceClose[1]!;
        if (marker[0] === activeFence.char && marker.length >= activeFence.length) {
          activeFence = null;
        }
      }
    }
  }

  parts.push(currentLines.join('\n'));
  return parts;
}

function extractTargetDirectiveFromText(
  rawText: string,
  pageNum: number,
  targets: Record<number, number>,
): void {
  const matches = rawText.matchAll(/^[ \t]*<!--\s*target:\s*(\d+)\s*-->[ \t]*$/gim);
  for (const m of matches) {
    const sec = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(sec) && sec > 0) {
      targets[pageNum] = sec;
    }
  }
}

function extractLeadingFrontmatterConfig(
  text: string,
): { body: string; config?: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> } {
  const m = text.match(/^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/);
  if (!m) {
    return { body: text };
  }
  const rawYaml = m[1] ?? '';
  const body = text.slice(m[0].length);
  const cfg: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> = {};

  for (const line of rawYaml.split('\n')) {
    const kv = line.match(/^[ \t]*([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.+?)[ \t]*$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const val = kv[2]!.replace(/^['"]|['"]$/g, '').trim();
    if (key === 'duration' || key === 'durationminutes') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num > 0) cfg.durationMinutes = num;
    } else if (key === 'lastminutes' || key === 'lastminuteswarning') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num >= 0) cfg.lastMinutes = num;
    } else if (key === 'notefontsize' || key === 'notefontsizepx') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num > 0) cfg.noteFontSize = num;
    } else if ((key === 'endtime' || key === 'endtimehhmm') && parseValidHHMM(val) !== null) {
      cfg.endTimeHHMM = val;
    } else if ((key === 'qrurl' || key === 'qr_url' || key === 'qr') && val.length > 0) {
      cfg.qrUrl = val;
    } else if ((key === 'qrlabel' || key === 'qr_label') && val.length > 0) {
      cfg.qrLabel = val;
    }
  }

  return Object.keys(cfg).length > 0 ? { body, config: cfg } : { body };
}

function extractTargetFromUnknown(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const candidate = obj.targetSeconds ?? obj.target;
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
    return Math.round(candidate);
  }
  return undefined;
}

function parseMarkdownNotes(
  text: string,
  fileName: string,
  notes: Record<number, string>,
  targets: Record<number, number>,
): LoadedDeckMeta['extractedPdfpcConfig'] | undefined {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  const slideMatch = fileName.match(/notes-slide-(\d+)\.(?:md|markdown|txt)$/i);
  if (slideMatch) {
    const pageNum = Number.parseInt(slideMatch[1]!, 10);
    extractTargetDirectiveFromText(normalized, pageNum, targets);
    mergePageNote(notes, pageNum, normalized);
    return undefined;
  }

  const { body, config } = extractLeadingFrontmatterConfig(normalized);

  const markerRegex = /^[ \t]*<!--\s*slide:\s*(\d+)\s*-->[ \t]*$/gim;
  const matches = Array.from(body.matchAll(markerRegex));
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i]!;
      const pageNum = Number.parseInt(m[1]!, 10);
      const start = (m.index ?? 0) + m[0].length;
      const end =
        i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
      let block = body.slice(start, end).trim();
      block = block.replace(/(?:^|\n)[ \t]*---[ \t]*$/, '').trim();
      extractTargetDirectiveFromText(block, pageNum, targets);
      mergePageNote(notes, pageNum, block);
    }
    return config;
  }

  const parts = splitMarkdownByHr(body);
  parts.forEach((part, idx) => {
    const pageNum = idx + 1;
    extractTargetDirectiveFromText(part, pageNum, targets);
    mergePageNote(notes, pageNum, part);
  });
  return config;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    value instanceof ArrayBuffer ||
    (typeof value === 'object' &&
      Object.prototype.toString.call(value) === '[object ArrayBuffer]' &&
      'byteLength' in value &&
      typeof (value as ArrayBuffer).byteLength === 'number')
  ) {
    return new Uint8Array(value as ArrayBuffer);
  }
  return null;
}

export async function parseNotesAttachments(
  doc: Pick<PdfDocumentExtractLike, 'getAttachments' | 'getAttachmentContent'>,
): Promise<{
  notes: Record<number, string>;
  targets?: Record<number, number>;
  pdfpcConfig?: LoadedDeckMeta['extractedPdfpcConfig'];
}> {
  const notes: Record<number, string> = {};
  const targets: Record<number, number> = {};
  let pdfpcConfig: LoadedDeckMeta['extractedPdfpcConfig'] | undefined;

  const mergePdfpcConfig = (incoming?: LoadedDeckMeta['extractedPdfpcConfig']) => {
    if (!incoming || Object.keys(incoming).length === 0) return;
    pdfpcConfig = { ...pdfpcConfig, ...incoming };
  };

  if (typeof doc.getAttachments !== 'function') {
    return { notes };
  }

  const rawAttachments = await doc.getAttachments().catch(() => null);
  if (!rawAttachments) {
    return { notes };
  }

  const isMap =
    rawAttachments instanceof Map ||
    (Object.prototype.toString.call(rawAttachments) === '[object Map]' &&
      typeof (rawAttachments as unknown as { entries?: unknown }).entries === 'function');

  const entries: Array<[string, PdfAttachmentLike]> = isMap
    ? Array.from((rawAttachments as unknown as Map<string, PdfAttachmentLike>).entries())
    : Object.entries(rawAttachments);

  const decoder = new TextDecoder('utf-8', { fatal: false });

  for (const [id, attachment] of entries) {
    if (!attachment || typeof attachment !== 'object') {
      continue;
    }

    const fileName =
      (typeof attachment.filename === 'string' && attachment.filename) ||
      (typeof attachment.rawFilename === 'string' && attachment.rawFilename) ||
      id;
    const lowerName = fileName.toLowerCase();

    const isLikelyNoteFile =
      lowerName.endsWith('.pdfpc') ||
      lowerName.endsWith('.json') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      lowerName.endsWith('.txt');

    if (!isLikelyNoteFile) {
      continue;
    }

    let content = toUint8Array(attachment.content);
    if (!content && typeof doc.getAttachmentContent === 'function') {
      const fetched = await doc.getAttachmentContent(id).catch(() => null);
      content = toUint8Array(fetched);
    }
    if (!content || content.byteLength === 0) {
      continue;
    }

    const decoded = decoder.decode(content);

    if (lowerName.endsWith('.pdfpc') || lowerName.endsWith('.json')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(decoded);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== 'object') {
        const presioMatch = lowerName.match(/notes-slide-(\d+)\.json$/i);
        if (presioMatch) {
          const pageNum = Number.parseInt(presioMatch[1]!, 10);
          mergePageNote(notes, pageNum, extractNoteTextFromUnknown(parsed));
        }
        continue;
      }

      const obj = parsed as Record<string, unknown>;

      // .pdfpc v2 JSON format (pages[] with 0-based idx)
      if (Array.isArray(obj.pages) || 'pdfpcFormat' in obj) {
        const cfg: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> = {};
        if (typeof obj.duration === 'number' && Number.isFinite(obj.duration) && obj.duration > 0) {
          cfg.durationMinutes = obj.duration;
        }
        if (
          typeof obj.lastMinutes === 'number' &&
          Number.isFinite(obj.lastMinutes) &&
          obj.lastMinutes >= 0
        ) {
          cfg.lastMinutes = obj.lastMinutes;
        }
        if (
          typeof obj.noteFontSize === 'number' &&
          Number.isFinite(obj.noteFontSize) &&
          obj.noteFontSize > 0
        ) {
          cfg.noteFontSize = obj.noteFontSize;
        }
        if (Object.keys(cfg).length > 0) {
          pdfpcConfig = { ...pdfpcConfig, ...cfg };
        }
        if (Array.isArray(obj.pages)) {
          for (const pageEntry of obj.pages) {
            if (!pageEntry || typeof pageEntry !== 'object') continue;
            const entry = pageEntry as Record<string, unknown>;
            if (typeof entry.idx === 'number' && Number.isInteger(entry.idx) && entry.idx >= 0) {
              const noteStr = extractNoteTextFromUnknown(entry.note ?? entry.notes ?? '');
              mergePageNote(notes, entry.idx + 1, noteStr);
            }
          }
        }
        continue;
      }

      // Presio per-slide attachment: notes-slide-<N>.json
      const presioMatch = lowerName.match(/notes-slide-(\d+)\.json$/i);
      if (presioMatch) {
        const pageNum = Number.parseInt(presioMatch[1]!, 10);
        const t = extractTargetFromUnknown(parsed);
        if (t !== undefined) {
          targets[pageNum] = t;
        }
        mergePageNote(notes, pageNum, extractNoteTextFromUnknown(parsed));
        continue;
      }

      // Optional top-level bundle / presenter config fields in JSON attachment
      const jsonCfg: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> = {};
      if (
        typeof obj.globalTargetSeconds === 'number' &&
        Number.isFinite(obj.globalTargetSeconds) &&
        obj.globalTargetSeconds > 0
      ) {
        jsonCfg.durationMinutes = Math.max(1, Math.round(obj.globalTargetSeconds / 60));
      } else if (
        typeof obj.duration === 'number' &&
        Number.isFinite(obj.duration) &&
        obj.duration > 0
      ) {
        jsonCfg.durationMinutes = obj.duration;
      }
      if (
        typeof obj.lastMinutesWarning === 'number' &&
        Number.isFinite(obj.lastMinutesWarning) &&
        obj.lastMinutesWarning >= 0
      ) {
        jsonCfg.lastMinutes = obj.lastMinutesWarning;
      } else if (
        typeof obj.lastMinutes === 'number' &&
        Number.isFinite(obj.lastMinutes) &&
        obj.lastMinutes >= 0
      ) {
        jsonCfg.lastMinutes = obj.lastMinutes;
      }
      if (
        typeof obj.noteFontSizePx === 'number' &&
        Number.isFinite(obj.noteFontSizePx) &&
        obj.noteFontSizePx > 0
      ) {
        jsonCfg.noteFontSize = obj.noteFontSizePx;
      } else if (
        typeof obj.noteFontSize === 'number' &&
        Number.isFinite(obj.noteFontSize) &&
        obj.noteFontSize > 0
      ) {
        jsonCfg.noteFontSize = obj.noteFontSize;
      }
      const rawEndTime =
        typeof obj.endTimeHHMM === 'string'
          ? obj.endTimeHHMM
          : typeof obj.endTime === 'string'
            ? obj.endTime
            : undefined;
      if (rawEndTime && parseValidHHMM(rawEndTime) !== null) {
        jsonCfg.endTimeHHMM = rawEndTime.trim();
      }
      if (typeof obj.qrUrl === 'string' && obj.qrUrl.trim().length > 0) {
        jsonCfg.qrUrl = obj.qrUrl.trim();
      }
      if (typeof obj.qrLabel === 'string' && obj.qrLabel.trim().length > 0) {
        jsonCfg.qrLabel = obj.qrLabel.trim();
      }
      mergePdfpcConfig(jsonCfg);

      // Array-shaped slides: { slides: [...] } (e.g., strings or { page/slide/idx, markdown/note })
      if (Array.isArray(obj.slides)) {
        for (let idx = 0; idx < obj.slides.length; idx += 1) {
          const item = obj.slides[idx];
          let pageNum = idx + 1;
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const rec = item as Record<string, unknown>;
            if ('page' in rec && rec.page !== undefined) {
              if (typeof rec.page === 'number' && Number.isInteger(rec.page) && rec.page >= 1) {
                pageNum = rec.page;
              } else {
                continue;
              }
            } else if ('slide' in rec && rec.slide !== undefined) {
              if (typeof rec.slide === 'number' && Number.isInteger(rec.slide) && rec.slide >= 1) {
                pageNum = rec.slide;
              } else {
                continue;
              }
            } else if ('idx' in rec && rec.idx !== undefined) {
              if (typeof rec.idx === 'number' && Number.isInteger(rec.idx) && rec.idx >= 0) {
                pageNum = rec.idx + 1;
              } else {
                continue;
              }
            }
          }
          const t = extractTargetFromUnknown(item);
          if (t !== undefined) {
            targets[pageNum] = t;
          }
          mergePageNote(notes, pageNum, extractNoteTextFromUnknown(item));
        }
        continue;
      }

      if (Array.isArray(parsed)) {
        continue;
      }

      // Generic JSON: { slides: { "1": "..." | { markdown: "..." } } } or { "1": "..." }
      const slidesContainer =
        obj.slides && typeof obj.slides === 'object' && !Array.isArray(obj.slides)
          ? (obj.slides as Record<string, unknown>)
          : obj;

      for (const [key, val] of Object.entries(slidesContainer)) {
        if (/^\d+$/.test(key)) {
          const pageNum = Number.parseInt(key, 10);
          const t = extractTargetFromUnknown(val);
          if (t !== undefined) {
            targets[pageNum] = t;
          }
          mergePageNote(notes, pageNum, extractNoteTextFromUnknown(val));
        }
      }
      continue;
    }

    if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.txt')) {
      const mdConfig = parseMarkdownNotes(decoded, lowerName, notes, targets);
      mergePdfpcConfig(mdConfig);
    }
  }

  return {
    notes,
    ...(Object.keys(targets).length > 0 ? { targets } : {}),
    ...(pdfpcConfig ? { pdfpcConfig } : {}),
  };
}

function extractXfaHtmlText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child) => extractXfaHtmlText(child)).join('');
  }
  if (!node || typeof node !== 'object') {
    return '';
  }

  const obj = node as Record<string, unknown>;
  const tagName = typeof obj.name === 'string' ? obj.name.toLowerCase() : '';
  if (tagName === 'br') {
    return '\n';
  }

  let out = typeof obj.value === 'string' ? obj.value : '';
  if (Array.isArray(obj.children)) {
    out += obj.children.map((child) => extractXfaHtmlText(child)).join('');
  }
  if (tagName === 'p' || tagName === 'div' || tagName === 'li') {
    out += '\n';
  }
  return out;
}

function extractRichTextNote(richText: unknown): string {
  if (typeof richText === 'string') {
    if (/<\/?[a-zA-Z][^>]*>/.test(richText)) {
      return richText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|li)>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    }
    return richText;
  }
  if (richText && typeof richText === 'object') {
    const rec = richText as Record<string, unknown>;
    if (typeof rec.str === 'string' && rec.str.trim().length > 0) {
      return rec.str;
    }
    if (rec.html !== undefined) {
      return extractXfaHtmlText(rec.html);
    }
  }
  return '';
}

function normalizeNoteLines(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

function extractAnnotationNoteText(annot: PdfAnnotationLike): string {
  if (typeof annot.contentsObj?.str === 'string') {
    const normalized = normalizeNoteLines(annot.contentsObj.str);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  if (typeof annot.contents === 'string') {
    const normalized = normalizeNoteLines(annot.contents);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  if (annot.richText !== undefined && annot.richText !== null) {
    const normalized = normalizeNoteLines(extractRichTextNote(annot.richText));
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return '';
}

export async function extractStickyNotesFromPage(
  page: PdfPageExtractLike,
  textAnnotationType: number = PDF_TEXT_ANNOTATION_TYPE,
  freeTextAnnotationType: number = PDF_FREETEXT_ANNOTATION_TYPE,
): Promise<string | null> {
  const annotations = await page.getAnnotations().catch(() => []);
  if (!Array.isArray(annotations) || annotations.length === 0) {
    return null;
  }

  const parts: string[] = [];
  const seen = new Set<string>();

  for (const annot of annotations) {
    if (!annot || typeof annot !== 'object') continue;
    if (typeof annot.subtype === 'string' && IGNORED_NOTE_SUBTYPES.has(annot.subtype)) {
      continue;
    }
    if (
      typeof annot.annotationType === 'number' &&
      IGNORED_NOTE_ANNOTATION_TYPES.has(annot.annotationType)
    ) {
      continue;
    }
    if (annot.url !== undefined && annot.url !== null) {
      continue;
    }
    if (annot.dest !== undefined && annot.dest !== null) {
      continue;
    }

    const isSticky =
      annot.subtype === 'Text' || annot.annotationType === textAnnotationType;
    const isFreeText =
      annot.subtype === 'FreeText' || annot.annotationType === freeTextAnnotationType;
    if (!isSticky && !isFreeText) continue;

    const noteText = extractAnnotationNoteText(annot);
    if (noteText.length > 0 && !seen.has(noteText)) {
      seen.add(noteText);
      parts.push(noteText);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}
