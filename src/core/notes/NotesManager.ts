import { clampNoteFontSize, DEFAULT_PREFS } from '../storage/StorageService.ts';
import { parseValidHHMM } from '../timer/TimerEngine.ts';
import type { DeckNotesBundle, SlideNoteEntry } from './types.ts';

export interface ParsedSidecarResult {
  slides: Record<number, SlideNoteEntry>;
  durationMinutes?: number;
  lastMinutesWarning?: number;
  noteFontSizePx?: number;
  endTimeHHMM?: string;
  qrUrl?: string;
  qrLabel?: string;
}

export interface ParseMarkdownSidecarOptions {
  mode?: 'auto' | 'marp-slidev';
}

interface MarkdownSegment {
  fenced: boolean;
  content: string;
}

const MARP_SLIDEV_DIRECTIVE_KEY_RE =
  /^_?(?:paginate|theme|class|header|footer|backgroundColor|backgroundImage|backgroundPosition|backgroundRepeat|backgroundSize|color|marp|style|size|headingDivider|math|layout|transition|clicks|hide|disabled|level|zoom|preload|dragPos|routeAlias)\b/i;

const MARP_SLIDEV_FRONTMATTER_KEY_RE =
  /^[ \t]*(?:theme|paginate|headingDivider|layout|transition|highlighter|backgroundColor|backgroundImage|size|header|footer|clicks|mdc|colorSchema|canvasWidth|aspectRatio|lineNumbers)[ \t]*:[ \t]*\S/im;

const SLIDEV_PER_SLIDE_FRONTMATTER_KEY_RE =
  /^(?:layout|transition|clicks|hide|disabled|level|zoom|preload|dragPos|routeAlias|class|src|background|image)$/i;

function splitByCodeFences(text: string): MarkdownSegment[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split('\n');
  const segments: MarkdownSegment[] = [];
  let buffer: string[] = [];
  let activeFence: { char: '`' | '~'; length: number } | null = null;

  const flush = (fenced: boolean) => {
    if (buffer.length > 0) {
      segments.push({ fenced, content: buffer.join('\n') });
      buffer = [];
    }
  };

  for (const line of lines) {
    if (activeFence === null) {
      const fenceOpen = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
      if (fenceOpen) {
        const marker = fenceOpen[1]!;
        const fenceChar = marker[0] as '`' | '~';
        const rest = fenceOpen[2] ?? '';
        if (fenceChar === '~' || !rest.includes('`')) {
          flush(false);
          activeFence = { char: fenceChar, length: marker.length };
          buffer.push(line);
          continue;
        }
      }
      buffer.push(line);
    } else {
      buffer.push(line);
      const fenceClose = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (fenceClose) {
        const marker = fenceClose[1]!;
        if (marker[0] === activeFence.char && marker.length >= activeFence.length) {
          flush(true);
          activeFence = null;
        }
      }
    }
  }

  flush(activeFence !== null);
  return segments;
}

function getOutsideCodeFences(text: string): string {
  return splitByCodeFences(text)
    .filter((seg) => !seg.fenced)
    .map((seg) => seg.content)
    .join('\n');
}

function dedentCommentText(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const startsOnNewLine = lines.length > 1 && lines[0]!.trim().length === 0;

  while (lines.length > 0 && lines[0]!.trim().length === 0) {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1]!.trim().length === 0) {
    lines.pop();
  }
  if (lines.length === 0) {
    return '';
  }

  if (!startsOnNewLine) {
    return lines.join('\n').trim();
  }

  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^[ \t]*/);
    const indentLen = match ? match[0].length : 0;
    if (indentLen < minIndent) {
      minIndent = indentLen;
    }
  }

  if (Number.isFinite(minIndent) && minIndent > 0) {
    return lines
      .map((line) => (line.trim().length === 0 ? '' : line.slice(minIndent)))
      .join('\n')
      .trim();
  }

  return lines.join('\n').trim();
}

function unwrapNoteComments(text: string): string {
  const segments = splitByCodeFences(text);
  return segments
    .map((seg) => {
      if (seg.fenced) {
        return seg.content;
      }
      return seg.content.replace(
        /<!--\s*note:[ \t]*([\s\S]*?)\s*-->/gi,
        (_m, inner: string) => dedentCommentText(inner),
      );
    })
    .join('\n');
}

function isMarpOrSlidevDirectiveComment(rawComment: string): boolean {
  const trimmed = dedentCommentText(rawComment);
  if (trimmed.length === 0) {
    return false;
  }
  if (/^note\s*:/i.test(trimmed)) {
    return false;
  }
  if (trimmed.toLowerCase() === 'fit') {
    return true;
  }

  const lines = trimmed.split('\n');
  const firstNonEmpty = lines.find((line) => line.trim().length > 0)?.trim() ?? '';
  if (/^_?style\s*:/i.test(firstNonEmpty)) {
    return true;
  }

  if (lines.length === 1) {
    const kv = firstNonEmpty.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    return kv !== null && MARP_SLIDEV_DIRECTIVE_KEY_RE.test(kv[1]!);
  }

  let sawDirectiveKey = false;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    // Allow indented continuation lines (YAML block scalars / arrays / nested maps)
    if (/^[ \t]+\S/.test(line)) {
      if (!sawDirectiveKey) return false;
      continue;
    }
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('#') || trimmedLine === '---' || trimmedLine === '...') {
      continue;
    }
    const kv = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (!kv || !MARP_SLIDEV_DIRECTIVE_KEY_RE.test(kv[1]!)) {
      return false;
    }
    sawDirectiveKey = true;
  }

  return sawDirectiveKey;
}

function extractTargetDirective(rawBlock: string): {
  markdown: string;
  targetSeconds?: number;
} {
  let targetSeconds: number | undefined;
  const cleaned = rawBlock.replace(
    /^[ \t]*<!--\s*target:\s*(\d+)\s*-->[ \t]*\n?/gim,
    (_m, secStr: string) => {
      const parsed = Number.parseInt(secStr, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        targetSeconds = parsed;
      }
      return '';
    },
  );
  return {
    markdown: unwrapNoteComments(cleaned).trim(),
    ...(targetSeconds !== undefined ? { targetSeconds } : {}),
  };
}

function splitBodyByHr(body: string): string[] {
  if (body.length === 0) {
    return [];
  }

  const parts: string[] = [];
  let currentLines: string[] = [];

  for (const seg of splitByCodeFences(body)) {
    if (seg.fenced) {
      currentLines.push(seg.content);
      continue;
    }
    for (const line of seg.content.split('\n')) {
      if (/^[ \t]*---[ \t]*$/.test(line)) {
        parts.push(currentLines.join('\n'));
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
  }

  parts.push(currentLines.join('\n'));
  return parts;
}

function isSlidevPerSlideFrontmatterBlock(part: string): boolean {
  if (part.includes('<!--') || /^#{1,6}[ \t]+/m.test(part)) {
    return false;
  }
  const lines = part.split('\n');
  let sawSlidevKey = false;
  let sawAnyKey = false;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (/^[ \t]+\S/.test(line) || /^[ \t]*-\s+/.test(line)) {
      if (!sawAnyKey) return false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const kv = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (!kv) {
      return false;
    }
    sawAnyKey = true;
    if (SLIDEV_PER_SLIDE_FRONTMATTER_KEY_RE.test(kv[1]!)) {
      sawSlidevKey = true;
    }
  }
  return sawSlidevKey;
}

function collapseSlidevPerSlideFrontmatter(parts: string[]): string[] {
  const collapsed: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (i >= 1 && i + 1 < parts.length && isSlidevPerSlideFrontmatterBlock(part)) {
      continue;
    }
    collapsed.push(part);
  }
  return collapsed;
}

export function extractMarpOrSlidevNotesFromSlides(
  parts: string[],
): Record<number, SlideNoteEntry> {
  const slides: Record<number, SlideNoteEntry> = {};
  const now = Date.now();

  parts.forEach((part, idx) => {
    const outsideFences = getOutsideCodeFences(part);

    const noteChunks: string[] = [];
    let targetSeconds: number | undefined;

    for (const match of outsideFences.matchAll(/<!--([\s\S]*?)-->/g)) {
      const rawInner = match[1] ?? '';
      const trimmed = rawInner.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const targetMatch = trimmed.match(/^target:\s*(\d+)$/i);
      if (targetMatch) {
        const parsed = Number.parseInt(targetMatch[1]!, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          targetSeconds = parsed;
        }
        continue;
      }

      if (/^slide:\s*\d+$/i.test(trimmed)) {
        continue;
      }

      if (isMarpOrSlidevDirectiveComment(rawInner)) {
        continue;
      }

      const isExplicitNote = /^note:[ \t]*/i.test(trimmed);
      const cleaned = isExplicitNote
        ? dedentCommentText(rawInner.replace(/^\s*note:[ \t]*/i, ''))
        : dedentCommentText(rawInner);
      if (cleaned.length > 0) {
        noteChunks.push(cleaned);
      }
    }

    if (noteChunks.length > 0 || targetSeconds !== undefined) {
      slides[idx + 1] = {
        markdown: noteChunks.join('\n\n'),
        ...(targetSeconds !== undefined ? { targetSeconds } : {}),
        updatedAt: now,
      };
    }
  });

  return slides;
}

function isLikelyMarpOrSlidevDocument(
  rawFrontmatter: string | null,
  parts: string[],
): boolean {
  if (rawFrontmatter !== null) {
    if (/^[ \t]*marp[ \t]*:[ \t]*true[ \t]*(?:#.*)?$/im.test(rawFrontmatter)) {
      return true;
    }
    if (MARP_SLIDEV_FRONTMATTER_KEY_RE.test(rawFrontmatter)) {
      return true;
    }
  }

  let hasDirectiveComment = false;
  let hasSlideWithContentAndComment = false;

  for (const part of parts) {
    const outsideFences = getOutsideCodeFences(part);

    let partHasNonTargetComment = false;
    for (const match of outsideFences.matchAll(/<!--([\s\S]*?)-->/g)) {
      const rawInner = match[1] ?? '';
      const trimmed = rawInner.trim();
      if (trimmed.length === 0) continue;
      if (/^target:\s*\d+$/i.test(trimmed) || /^slide:\s*\d+$/i.test(trimmed)) {
        continue;
      }
      if (isMarpOrSlidevDirectiveComment(rawInner)) {
        hasDirectiveComment = true;
      } else {
        partHasNonTargetComment = true;
      }
    }

    if (partHasNonTargetComment) {
      const visibleContent = outsideFences.replace(/<!--[\s\S]*?-->/g, '').trim();
      if (visibleContent.length > 0) {
        hasSlideWithContentAndComment = true;
      }
    }
  }

  if (hasDirectiveComment) {
    return true;
  }

  return parts.length >= 2 && hasSlideWithContentAndComment;
}

function parseLeadingFrontmatter(text: string): {
  rawFrontmatter: string | null;
  body: string;
  durationMinutes?: number;
  lastMinutesWarning?: number;
  noteFontSizePx?: number;
  endTimeHHMM?: string;
  qrUrl?: string;
  qrLabel?: string;
} {
  const m = text.match(/^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/);
  if (!m) {
    return { rawFrontmatter: null, body: text };
  }
  const rawYaml = m[1] ?? '';
  const body = text.slice(m[0].length);
  let durationMinutes: number | undefined;
  let lastMinutesWarning: number | undefined;
  let noteFontSizePx: number | undefined;
  let endTimeHHMM: string | undefined;
  let qrUrl: string | undefined;
  let qrLabel: string | undefined;

  for (const line of rawYaml.split('\n')) {
    const kv = line.match(/^[ \t]*([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.+?)[ \t]*$/);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    const val = kv[2]!.replace(/^['"]|['"]$/g, '').trim();
    if (key === 'duration' || key === 'durationminutes') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num > 0) durationMinutes = num;
    } else if (key === 'lastminutes' || key === 'lastminuteswarning') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num >= 0) lastMinutesWarning = num;
    } else if (key === 'notefontsize' || key === 'notefontsizepx') {
      const num = Number.parseFloat(val);
      if (Number.isFinite(num) && num > 0) noteFontSizePx = clampNoteFontSize(num);
    } else if ((key === 'endtime' || key === 'endtimehhmm') && parseValidHHMM(val) !== null) {
      endTimeHHMM = val;
    } else if ((key === 'qrurl' || key === 'qr_url' || key === 'qr') && val.length > 0) {
      qrUrl = val;
    } else if ((key === 'qrlabel' || key === 'qr_label') && val.length > 0) {
      qrLabel = val;
    }
  }

  return {
    rawFrontmatter: rawYaml,
    body,
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(lastMinutesWarning !== undefined ? { lastMinutesWarning } : {}),
    ...(noteFontSizePx !== undefined ? { noteFontSizePx } : {}),
    ...(endTimeHHMM !== undefined ? { endTimeHHMM } : {}),
    ...(qrUrl !== undefined ? { qrUrl } : {}),
    ...(qrLabel !== undefined ? { qrLabel } : {}),
  };
}

export function parseMarkdownSidecar(
  text: string,
  options?: ParseMarkdownSidecarOptions,
): ParsedSidecarResult {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const { rawFrontmatter, body, ...frontmatterMeta } = parseLeadingFrontmatter(normalized);
  const slides: Record<number, SlideNoteEntry> = {};
  const now = Date.now();

  const markerRegex = /^[ \t]*<!--\s*slide:\s*(\d+)\s*-->[ \t]*$/gim;
  const matches = Array.from(body.matchAll(markerRegex));

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i]!;
      const pageNum = Number.parseInt(m[1]!, 10);
      if (!Number.isInteger(pageNum) || pageNum < 1) continue;
      const start = (m.index ?? 0) + m[0].length;
      const end =
        i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
      let block = body.slice(start, end).trim();
      block = block.replace(/(?:^|\n)[ \t]*---[ \t]*$/, '').trim();
      const extracted = extractTargetDirective(block);
      slides[pageNum] = {
        markdown: extracted.markdown,
        ...(extracted.targetSeconds !== undefined
          ? { targetSeconds: extracted.targetSeconds }
          : {}),
        updatedAt: now,
      };
    }
    return { slides, ...frontmatterMeta };
  }

  const rawParts = splitBodyByHr(body);
  const mode = options?.mode ?? 'auto';
  const useMarpSlidev =
    mode === 'marp-slidev' ||
    (mode === 'auto' && isLikelyMarpOrSlidevDocument(rawFrontmatter, rawParts));

  if (useMarpSlidev) {
    const normalizedParts = collapseSlidevPerSlideFrontmatter(rawParts);
    return {
      slides: extractMarpOrSlidevNotesFromSlides(normalizedParts),
      ...frontmatterMeta,
    };
  }

  rawParts.forEach((part, idx) => {
    const extracted = extractTargetDirective(part);
    if (extracted.markdown.length > 0 || extracted.targetSeconds !== undefined) {
      slides[idx + 1] = {
        markdown: extracted.markdown,
        ...(extracted.targetSeconds !== undefined
          ? { targetSeconds: extracted.targetSeconds }
          : {}),
        updatedAt: now,
      };
    }
  });

  return { slides, ...frontmatterMeta };
}

export function parseJsonOrPdfpcSidecar(text: string, fileName: string): ParsedSidecarResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new Error(
      `Invalid JSON in "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid notes file structure in "${fileName}": expected JSON object.`);
  }

  const obj = parsed as Record<string, unknown>;
  const slides: Record<number, SlideNoteEntry> = {};
  const now = Date.now();
  let durationMinutes: number | undefined;
  let lastMinutesWarning: number | undefined;
  let noteFontSizePx: number | undefined;
  let endTimeHHMM: string | undefined;
  let qrUrl: string | undefined;
  let qrLabel: string | undefined;

  // 1. .pdfpc v2 format
  if ('pdfpcFormat' in obj || Array.isArray(obj.pages)) {
    if (typeof obj.duration === 'number' && Number.isFinite(obj.duration) && obj.duration > 0) {
      durationMinutes = obj.duration;
    }
    if (
      typeof obj.lastMinutes === 'number' &&
      Number.isFinite(obj.lastMinutes) &&
      obj.lastMinutes >= 0
    ) {
      lastMinutesWarning = obj.lastMinutes;
    }
    if (
      typeof obj.noteFontSize === 'number' &&
      Number.isFinite(obj.noteFontSize) &&
      obj.noteFontSize > 0
    ) {
      noteFontSizePx = clampNoteFontSize(obj.noteFontSize);
    }
    if (typeof obj.endTime === 'string' && parseValidHHMM(obj.endTime) !== null) {
      endTimeHHMM = obj.endTime.trim();
    }

    if (Array.isArray(obj.pages)) {
      for (const p of obj.pages) {
        if (!p || typeof p !== 'object') continue;
        const entry = p as Record<string, unknown>;
        const idx = typeof entry.idx === 'number' ? entry.idx : -1;
        const noteText =
          typeof entry.note === 'string'
            ? entry.note
            : typeof entry.notes === 'string'
              ? entry.notes
              : '';
        if (Number.isInteger(idx) && idx >= 0 && noteText.trim().length > 0) {
          slides[idx + 1] = {
            markdown: noteText.trim(),
            updatedAt: now,
          };
        }
      }
    }

    return {
      slides,
      ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      ...(lastMinutesWarning !== undefined ? { lastMinutesWarning } : {}),
      ...(noteFontSizePx !== undefined ? { noteFontSizePx } : {}),
      ...(endTimeHHMM !== undefined ? { endTimeHHMM } : {}),
    };
  }

  // 2. DeckNotesBundle v1 or generic JSON
  if (
    typeof obj.globalTargetSeconds === 'number' &&
    Number.isFinite(obj.globalTargetSeconds) &&
    obj.globalTargetSeconds > 0
  ) {
    durationMinutes = Math.max(1, Math.round(obj.globalTargetSeconds / 60));
  }
  if (
    typeof obj.lastMinutesWarning === 'number' &&
    Number.isFinite(obj.lastMinutesWarning) &&
    obj.lastMinutesWarning >= 0
  ) {
    lastMinutesWarning = obj.lastMinutesWarning;
  }
  if (
    typeof obj.noteFontSizePx === 'number' &&
    Number.isFinite(obj.noteFontSizePx) &&
    obj.noteFontSizePx > 0
  ) {
    noteFontSizePx = clampNoteFontSize(obj.noteFontSizePx);
  }
  if (typeof obj.endTimeHHMM === 'string' && parseValidHHMM(obj.endTimeHHMM) !== null) {
    endTimeHHMM = obj.endTimeHHMM.trim();
  }
  if (typeof obj.qrUrl === 'string' && obj.qrUrl.trim().length > 0) {
    qrUrl = obj.qrUrl.trim();
  }
  if (typeof obj.qrLabel === 'string' && obj.qrLabel.trim().length > 0) {
    qrLabel = obj.qrLabel.trim();
  }

  const rawSlides =
    obj.slides && typeof obj.slides === 'object' && !Array.isArray(obj.slides)
      ? (obj.slides as Record<string, unknown>)
      : obj;

  let foundAnySlideKey = 'slides' in obj || 'version' in obj;

  for (const [key, val] of Object.entries(rawSlides)) {
    if (!/^\d+$/.test(key)) continue;
    foundAnySlideKey = true;
    const pageNum = Number.parseInt(key, 10);
    if (pageNum < 1) continue;

    if (typeof val === 'string') {
      slides[pageNum] = { markdown: val.trim(), updatedAt: now };
    } else if (val && typeof val === 'object') {
      const rec = val as Record<string, unknown>;
      const md =
        typeof rec.markdown === 'string'
          ? rec.markdown
          : typeof rec.note === 'string'
            ? rec.note
            : typeof rec.text === 'string'
              ? rec.text
              : '';
      const targetSeconds =
        typeof rec.targetSeconds === 'number' &&
        Number.isFinite(rec.targetSeconds) &&
        rec.targetSeconds > 0
          ? rec.targetSeconds
          : undefined;
      slides[pageNum] = {
        markdown: md.trim(),
        ...(targetSeconds !== undefined ? { targetSeconds } : {}),
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : now,
      };
    }
  }

  if (!foundAnySlideKey) {
    throw new Error(`Invalid notes JSON format in "${fileName}".`);
  }

  return {
    slides,
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(lastMinutesWarning !== undefined ? { lastMinutesWarning } : {}),
    ...(noteFontSizePx !== undefined ? { noteFontSizePx } : {}),
    ...(endTimeHHMM !== undefined ? { endTimeHHMM } : {}),
    ...(qrUrl !== undefined ? { qrUrl } : {}),
    ...(qrLabel !== undefined ? { qrLabel } : {}),
  };
}

export function parseSidecarFileContent(
  text: string,
  fileName: string,
  options?: ParseMarkdownSidecarOptions,
): ParsedSidecarResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json') || lower.endsWith('.pdfpc')) {
    return parseJsonOrPdfpcSidecar(text, fileName);
  }
  return parseMarkdownSidecar(text, options);
}

export function createEmptyNotesBundle(
  deckId: string,
  fileName: string,
  extractedNotes?: Record<number, string>,
  pdfpcConfig?: {
    durationMinutes?: number;
    lastMinutes?: number;
    noteFontSize?: number;
  },
): DeckNotesBundle {
  const now = Date.now();
  const slides: Record<number, SlideNoteEntry> = {};
  if (extractedNotes) {
    for (const [pageStr, noteText] of Object.entries(extractedNotes)) {
      const pageNum = Number.parseInt(pageStr, 10);
      if (Number.isInteger(pageNum) && pageNum >= 1 && noteText.trim().length > 0) {
        const extracted = extractTargetDirective(noteText);
        slides[pageNum] = {
          markdown: extracted.markdown,
          ...(extracted.targetSeconds !== undefined
            ? { targetSeconds: extracted.targetSeconds }
            : {}),
          updatedAt: now,
        };
      }
    }
  }

  return {
    version: 1,
    deckId,
    fileName,
    globalTargetSeconds: (pdfpcConfig?.durationMinutes ?? DEFAULT_PREFS.countdownMinutes) * 60,
    lastMinutesWarning: pdfpcConfig?.lastMinutes ?? DEFAULT_PREFS.lastMinutesWarning,
    noteFontSizePx: clampNoteFontSize(
      pdfpcConfig?.noteFontSize ?? DEFAULT_PREFS.noteFontSizePx,
    ),
    slides,
  };
}

export function exportNotesToMarkdown(bundle: DeckNotesBundle, numPages: number): string {
  const maxPage = Math.max(
    numPages,
    ...Object.keys(bundle.slides).map((k) => Number.parseInt(k, 10) || 0),
  );
  const blocks: string[] = [];
  for (let p = 1; p <= maxPage; p += 1) {
    const entry = bundle.slides[p];
    const lines: string[] = [`<!-- slide: ${p} -->`];
    if (entry?.targetSeconds && entry.targetSeconds > 0) {
      lines.push(`<!-- target: ${entry.targetSeconds} -->`);
    }
    if (entry?.markdown) {
      lines.push(entry.markdown.trim());
    }
    blocks.push(lines.join('\n'));
  }

  const trimmedEndTime =
    typeof bundle.endTimeHHMM === 'string' && parseValidHHMM(bundle.endTimeHHMM) !== null
      ? bundle.endTimeHHMM.trim()
      : undefined;
  const trimmedQrUrl =
    typeof bundle.qrUrl === 'string' && bundle.qrUrl.trim().length > 0
      ? bundle.qrUrl.trim()
      : undefined;
  const trimmedQrLabel =
    typeof bundle.qrLabel === 'string' && bundle.qrLabel.trim().length > 0
      ? bundle.qrLabel.trim()
      : undefined;
  const hasCustomDuration =
    Number.isFinite(bundle.globalTargetSeconds) &&
    bundle.globalTargetSeconds > 0 &&
    bundle.globalTargetSeconds !== 900;
  const hasCustomLastMinutes =
    Number.isFinite(bundle.lastMinutesWarning) &&
    bundle.lastMinutesWarning >= 0 &&
    bundle.lastMinutesWarning !== 3;
  const hasCustomFontSize =
    Number.isFinite(bundle.noteFontSizePx) &&
    bundle.noteFontSizePx > 0 &&
    bundle.noteFontSizePx !== 16;

  const shouldEmitFrontmatter =
    hasCustomDuration ||
    hasCustomLastMinutes ||
    hasCustomFontSize ||
    trimmedEndTime !== undefined ||
    trimmedQrUrl !== undefined ||
    trimmedQrLabel !== undefined;

  const body = blocks.join('\n\n---\n\n');

  if (!shouldEmitFrontmatter) {
    return body + '\n';
  }

  const durationMinutes =
    Number.isFinite(bundle.globalTargetSeconds) && bundle.globalTargetSeconds > 0
      ? Number((bundle.globalTargetSeconds / 60).toFixed(4))
      : 15;
  const lastMinutes =
    Number.isFinite(bundle.lastMinutesWarning) && bundle.lastMinutesWarning >= 0
      ? bundle.lastMinutesWarning
      : DEFAULT_PREFS.lastMinutesWarning;
  const noteFontSize = clampNoteFontSize(bundle.noteFontSizePx);

  const frontmatterLines = [
    '---',
    `duration: ${durationMinutes}`,
    `lastMinutes: ${lastMinutes}`,
    `noteFontSize: ${noteFontSize}`,
  ];
  if (trimmedEndTime !== undefined) {
    frontmatterLines.push(`endTime: "${trimmedEndTime}"`);
  }
  if (trimmedQrUrl !== undefined) {
    frontmatterLines.push(`qrUrl: "${trimmedQrUrl}"`);
  }
  if (trimmedQrLabel !== undefined) {
    frontmatterLines.push(`qrLabel: "${trimmedQrLabel}"`);
  }
  frontmatterLines.push('---');

  const frontmatter = frontmatterLines.join('\n');
  return body.length > 0 ? `${frontmatter}\n\n${body}\n` : `${frontmatter}\n`;
}

export function exportNotesToJson(bundle: DeckNotesBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function exportNotesToPdfpc(
  bundle: DeckNotesBundle,
  numPages: number,
  pageLabels?: string[] | null,
): string {
  const maxPage = Math.max(
    numPages,
    ...Object.keys(bundle.slides).map((k) => Number.parseInt(k, 10) || 0),
  );
  const pages: Array<{
    idx: number;
    label: string;
    overlay: number;
    forcedOverlay: boolean;
    hidden: boolean;
    note: string;
  }> = [];

  for (let p = 1; p <= maxPage; p += 1) {
    const entry = bundle.slides[p];
    pages.push({
      idx: p - 1,
      label: pageLabels?.[p - 1] ?? String(p),
      overlay: 0,
      forcedOverlay: false,
      hidden: false,
      note: entry?.markdown ?? '',
    });
  }

  const payload = {
    pdfpcFormat: 2,
    disableMarkdown: false,
    duration: Math.max(1, Math.round(bundle.globalTargetSeconds / 60)),
    lastMinutes: bundle.lastMinutesWarning,
    noteFontSize: bundle.noteFontSizePx,
    pages,
  };

  return JSON.stringify(payload, null, 2);
}
