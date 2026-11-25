import type { SlideNoteEntry } from '../storage/types.ts';
import { resolveNoteForPage } from './logicalSlides.ts';

export type ReadingSpeedPreset = 'slow' | 'normal' | 'fast';

export interface ReadingSpeedConfig {
  id: ReadingSpeedPreset;
  cjkCharsPerMin: number;
  latinWordsPerMin: number;
}

export const DEFAULT_READING_SPEED_PRESET: ReadingSpeedPreset = 'normal';

export const READING_SPEED_PRESETS: Record<ReadingSpeedPreset, ReadingSpeedConfig> = {
  slow: { id: 'slow', cjkCharsPerMin: 280, latinWordsPerMin: 120 },
  normal: { id: 'normal', cjkCharsPerMin: 325, latinWordsPerMin: 140 },
  fast: { id: 'fast', cjkCharsPerMin: 370, latinWordsPerMin: 160 },
};

export const MIN_ESTIMATED_SECONDS = 5;
export const MAX_ESTIMATED_SECONDS = 3600;

export interface ReadingTimeEstimate {
  cjkChars: number;
  latinWords: number;
  estimatedSeconds: number;
}

export interface EstimateDeckTargetsOptions {
  totalPages: number;
  slides: Record<number, SlideNoteEntry> | undefined;
  pageLabels?: string[] | null;
  shareNotesByPageLabel: boolean;
  preset: ReadingSpeedPreset;
  mode: 'missing-only' | 'overwrite-all';
}

export interface DeckTargetEstimateResult {
  targets: Record<number, number>;
  updatedCount: number;
  totalEstimatedSeconds: number;
}

/**
 * Normalize an unknown value to a valid ReadingSpeedPreset.
 */
export function normalizeReadingSpeedPreset(value: unknown): ReadingSpeedPreset {
  if (value === 'slow' || value === 'normal' || value === 'fast') {
    return value;
  }
  return DEFAULT_READING_SPEED_PRESET;
}

/**
 * Strip Markdown syntax, HTML comments, fenced code blocks, and raw URLs
 * so only spoken script content is measured.
 */
export function stripMarkdownForReading(markdown: string): string {
  if (!markdown) return '';
  let text = markdown;
  // Remove HTML comments (including <!-- target: N -->, <!-- slide: N -->)
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // Remove fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
  // Keep alt text from Markdown images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Keep label from Markdown links [label](url)
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Remove raw URLs
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  // Unwrap inline code backticks while keeping spoken identifier text
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove horizontal rules
  text = text.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ');
  // Remove leading heading, blockquote, and list markers
  text = text.replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/gm, '');
  // Remove emphasis / strikethrough markers
  text = text.replace(/[*_~]+/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

const CJK_CHAR_RE = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u30FC]/g;
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/**
 * Count CJK characters and Latin/numeric words from Markdown script text.
 */
export function countReadableUnits(markdown: string): {
  cjkChars: number;
  latinWords: number;
} {
  const cleaned = stripMarkdownForReading(markdown);
  if (!cleaned) {
    return { cjkChars: 0, latinWords: 0 };
  }
  const cjkMatches = cleaned.match(CJK_CHAR_RE);
  const cjkChars = cjkMatches ? cjkMatches.length : 0;

  const withoutCjk = cleaned.replace(CJK_CHAR_RE, ' ');
  const latinMatches = withoutCjk.match(LATIN_WORD_RE);
  const latinWords = latinMatches ? latinMatches.length : 0;

  return { cjkChars, latinWords };
}

/**
 * Estimate spoken duration in seconds for a single slide script.
 */
export function estimateReadingSeconds(
  markdown: string,
  preset: ReadingSpeedPreset | ReadingSpeedConfig = DEFAULT_READING_SPEED_PRESET,
): ReadingTimeEstimate {
  const cfg = typeof preset === 'string' ? READING_SPEED_PRESETS[preset] : preset;
  const { cjkChars, latinWords } = countReadableUnits(markdown);
  if (cjkChars === 0 && latinWords === 0) {
    return { cjkChars: 0, latinWords: 0, estimatedSeconds: 0 };
  }
  const rawSeconds =
    (cjkChars / cfg.cjkCharsPerMin + latinWords / cfg.latinWordsPerMin) * 60;
  const estimatedSeconds = Math.min(
    MAX_ESTIMATED_SECONDS,
    Math.max(MIN_ESTIMATED_SECONDS, Math.round(rawSeconds)),
  );
  return { cjkChars, latinWords, estimatedSeconds };
}

/**
 * Estimate target seconds across all slides in a deck, respecting logical slide sharing.
 */
export function estimateDeckTargetSeconds({
  totalPages,
  slides,
  pageLabels,
  shareNotesByPageLabel,
  preset,
  mode,
}: EstimateDeckTargetsOptions): DeckTargetEstimateResult {
  const safeTotal = Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 0;
  const targets: Record<number, number> = {};
  const seenOwnerPages = new Set<number>();
  let updatedCount = 0;
  let totalEstimatedSeconds = 0;

  for (let page = 1; page <= safeTotal; page += 1) {
    const resolved = resolveNoteForPage(
      slides,
      page,
      pageLabels,
      safeTotal,
      shareNotesByPageLabel,
    );
    const ownerPage = resolved.ownerPage;
    if (seenOwnerPages.has(ownerPage)) {
      continue;
    }
    seenOwnerPages.add(ownerPage);

    const entry = resolved.entry;
    const est = estimateReadingSeconds(entry?.markdown ?? '', preset);
    if (est.estimatedSeconds <= 0) {
      continue;
    }
    if (mode === 'missing-only' && entry?.targetSeconds !== undefined && entry.targetSeconds > 0) {
      continue;
    }

    targets[ownerPage] = est.estimatedSeconds;
    updatedCount += 1;
    totalEstimatedSeconds += est.estimatedSeconds;
  }

  return {
    targets,
    updatedCount,
    totalEstimatedSeconds,
  };
}
