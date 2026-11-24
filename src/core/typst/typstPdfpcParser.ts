import { mergePageNote } from '../pdf/extractors.ts';
import type { LoadedDeckMeta } from '../pdf/types.ts';
import { parseValidHHMM } from '../timer/TimerEngine.ts';

export interface TypstPdfpcQueryResult {
  notes: Record<number, string>;
  targets: Record<number, number>;
  pdfpcConfig?: LoadedDeckMeta['extractedPdfpcConfig'];
}

function extractTargetFromNoteString(raw: string): { text: string; targetSeconds?: number } {
  let targetSeconds: number | undefined;
  const cleaned = raw.replace(
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
    text: cleaned.trim(),
    ...(targetSeconds !== undefined ? { targetSeconds } : {}),
  };
}

/**
 * Parses JSON output from `typst query <input> "<pdfpc>" --field value --format json`.
 * Supports Polylux (`NewSlide`, `Idx`, `Note`, `Duration`, `LastMinutes`, `NoteFontSize`, `EndTime`)
 * and Touying (`Config` key-value pairs) metadata shapes.
 */
export function parseTypstPdfpcQueryJson(rawJson: string): TypstPdfpcQueryResult {
  const notes: Record<number, string> = {};
  const targets: Record<number, number> = {};
  const cfg: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> = {};

  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { notes, targets };
  }

  let items: unknown;
  try {
    items = JSON.parse(trimmed);
  } catch {
    return { notes, targets };
  }

  if (!Array.isArray(items)) {
    return { notes, targets };
  }

  let currentPage = 1;

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const tag = typeof item.t === 'string' ? item.t : '';
    const value = item.v;

    switch (tag) {
      case 'NewSlide': {
        currentPage += 1;
        break;
      }
      case 'Idx': {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
          currentPage = value + 1;
        }
        break;
      }
      case 'Note': {
        if (typeof value === 'string' && value.trim().length > 0) {
          const explicitPage =
            typeof item.p === 'number' && Number.isInteger(item.p) && item.p >= 1
              ? item.p
              : typeof item.idx === 'number' && Number.isInteger(item.idx) && item.idx >= 0
                ? item.idx + 1
                : currentPage;
          const extracted = extractTargetFromNoteString(value);
          if (extracted.text.length > 0) {
            mergePageNote(notes, explicitPage, extracted.text);
          }
          if (extracted.targetSeconds !== undefined) {
            targets[explicitPage] = extracted.targetSeconds;
          }
        }
        break;
      }
      case 'Duration': {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          cfg.durationMinutes = value;
        }
        break;
      }
      case 'LastMinutes': {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          cfg.lastMinutes = value;
        }
        break;
      }
      case 'NoteFontSize': {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          cfg.noteFontSize = value;
        }
        break;
      }
      case 'EndTime': {
        if (typeof value === 'string' && parseValidHHMM(value) !== null) {
          cfg.endTimeHHMM = value.trim();
        }
        break;
      }
      case 'Config': {
        const key = typeof item.k === 'string' ? item.k.toLowerCase() : '';
        if (key === 'duration' && typeof value === 'number' && Number.isFinite(value) && value > 0) {
          cfg.durationMinutes = value;
        } else if (
          key === 'last-minutes' &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0
        ) {
          cfg.lastMinutes = value;
        } else if (
          key === 'note-font-size' &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value > 0
        ) {
          cfg.noteFontSize = value;
        } else if (key === 'end-time' && typeof value === 'string' && parseValidHHMM(value) !== null) {
          cfg.endTimeHHMM = value.trim();
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    notes,
    targets,
    ...(Object.keys(cfg).length > 0 ? { pdfpcConfig: cfg } : {}),
  };
}

/**
 * Two-tier merge (Appendix A Option 1):
 * Embedded `#pdf.attach` notes/targets/config take precedence per page/field,
 * and `typst query <pdfpc>` fills in any missing pages or config fields.
 */
export function mergeEmbeddedWithTypstQuery(
  embeddedNotes: Record<number, string>,
  embeddedTargets: Record<number, number> | undefined,
  embeddedConfig: LoadedDeckMeta['extractedPdfpcConfig'] | undefined,
  queryResult: TypstPdfpcQueryResult | null | undefined,
): {
  notes: Record<number, string>;
  targets?: Record<number, number>;
  pdfpcConfig?: LoadedDeckMeta['extractedPdfpcConfig'];
} {
  const notes: Record<number, string> = { ...embeddedNotes };
  const targets: Record<number, number> = { ...(embeddedTargets ?? {}) };

  if (queryResult) {
    for (const [pageStr, noteText] of Object.entries(queryResult.notes)) {
      const pageNum = Number.parseInt(pageStr, 10);
      if (!Number.isInteger(pageNum) || pageNum < 1) continue;
      if (!notes[pageNum] || notes[pageNum]!.trim().length === 0) {
        notes[pageNum] = noteText;
      }
    }
    for (const [pageStr, sec] of Object.entries(queryResult.targets)) {
      const pageNum = Number.parseInt(pageStr, 10);
      if (!Number.isInteger(pageNum) || pageNum < 1) continue;
      if (targets[pageNum] === undefined) {
        targets[pageNum] = sec;
      }
    }
  }

  const mergedCfg: NonNullable<LoadedDeckMeta['extractedPdfpcConfig']> = {
    ...(queryResult?.pdfpcConfig ?? {}),
    ...(embeddedConfig ?? {}),
  };

  return {
    notes,
    ...(Object.keys(targets).length > 0 ? { targets } : {}),
    ...(Object.keys(mergedCfg).length > 0 ? { pdfpcConfig: mergedCfg } : {}),
  };
}
