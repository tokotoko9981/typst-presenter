import type { SlideNoteEntry } from '../storage/types.ts';

export interface LogicalSlideGroup {
  label: string;
  primaryPage: number;
  pages: number[];
  subIndex: number; // 1-based position within this logical slide group
  subCount: number;
}

export interface ResolvedLogicalNote {
  entry: SlideNoteEntry | undefined;
  ownerPage: number;
  inheritedFromPage: number | null;
  group: LogicalSlideGroup;
}

function getEffectiveLabel(
  pageLabels: string[] | null | undefined,
  pageNumber: number,
): string {
  const raw = pageLabels?.[pageNumber - 1];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : String(pageNumber);
}

/**
 * Returns true only when `pageLabels` contains repeated labels (e.g. Polylux `#uncover`
 * or Touying `#pause` subslides sharing the same logical slide number).
 * Standard 1..N or null pageLabels return false.
 */
export function hasRepeatedPageLabels(
  pageLabels: string[] | null | undefined,
  numPages: number,
): boolean {
  if (!Array.isArray(pageLabels) || pageLabels.length < 2 || numPages < 2) {
    return false;
  }
  const limit = Math.min(numPages, pageLabels.length);
  const seen = new Set<string>();
  for (let p = 1; p <= limit; p += 1) {
    const label = getEffectiveLabel(pageLabels, p);
    if (seen.has(label)) {
      return true;
    }
    seen.add(label);
  }
  return false;
}

/**
 * Groups consecutive physical pages that share the same logical page label.
 */
export function buildLogicalSlideGroups(
  pageLabels: string[] | null | undefined,
  numPages: number,
): LogicalSlideGroup[] {
  const safeTotal = Number.isInteger(numPages) && numPages > 0 ? numPages : 0;
  if (safeTotal === 0) {
    return [];
  }

  const rawGroups: Array<{ label: string; pages: number[] }> = [];
  for (let p = 1; p <= safeTotal; p += 1) {
    const label = getEffectiveLabel(pageLabels, p);
    const last = rawGroups[rawGroups.length - 1];
    if (last && last.label === label) {
      last.pages.push(p);
    } else {
      rawGroups.push({ label, pages: [p] });
    }
  }

  return rawGroups.map((g) => ({
    label: g.label,
    primaryPage: g.pages[0]!,
    pages: g.pages,
    subIndex: 1,
    subCount: g.pages.length,
  }));
}

export function resolveLogicalSlideGroup(
  page: number,
  pageLabels: string[] | null | undefined,
  numPages: number,
): LogicalSlideGroup {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeTotal = Math.max(safePage, Number.isInteger(numPages) && numPages > 0 ? numPages : safePage);
  const groups = buildLogicalSlideGroups(pageLabels, safeTotal);
  for (const group of groups) {
    const idx = group.pages.indexOf(safePage);
    if (idx !== -1) {
      return {
        ...group,
        subIndex: idx + 1,
      };
    }
  }
  return {
    label: String(safePage),
    primaryPage: safePage,
    pages: [safePage],
    subIndex: 1,
    subCount: 1,
  };
}

function hasEntryContent(entry: SlideNoteEntry | undefined): boolean {
  if (!entry) return false;
  return entry.markdown.trim().length > 0 || (entry.targetSeconds !== undefined && entry.targetSeconds > 0);
}

/**
 * Resolves the active note entry and edit-owner page for `page`.
 * When `shareAcrossSubslides` is enabled and `page` itself has no note/target,
 * it inherits from the first page in the same logical slide group that does.
 */
export function resolveNoteForPage(
  slides: Record<number, SlideNoteEntry> | undefined,
  page: number,
  pageLabels: string[] | null | undefined,
  numPages: number,
  shareAcrossSubslides: boolean,
): ResolvedLogicalNote {
  const group = resolveLogicalSlideGroup(page, pageLabels, numPages);
  const direct = slides?.[page];

  if (!shareAcrossSubslides || group.subCount <= 1) {
    return {
      entry: direct,
      ownerPage: page,
      inheritedFromPage: null,
      group,
    };
  }

  if (hasEntryContent(direct)) {
    return {
      entry: direct,
      ownerPage: page,
      inheritedFromPage: null,
      group,
    };
  }

  for (const memberPage of group.pages) {
    if (memberPage === page) continue;
    const candidate = slides?.[memberPage];
    if (hasEntryContent(candidate)) {
      return {
        entry: candidate,
        ownerPage: memberPage,
        inheritedFromPage: memberPage,
        group,
      };
    }
  }

  return {
    entry: direct,
    ownerPage: group.primaryPage,
    inheritedFromPage: null,
    group,
  };
}
