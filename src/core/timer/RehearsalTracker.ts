import { buildLogicalSlideGroups } from '../notes/logicalSlides.ts';

export interface SlideTimingSummary {
  page: number;
  actualSeconds: number;
  targetSeconds?: number;
  deltaSeconds?: number; // actual - target
  visits: number;
  status: 'no-target' | 'ahead' | 'on-track' | 'overtime';
}

export interface LogicalSlideTimingSummary extends SlideTimingSummary {
  label: string;
  pages: number[];
}

export interface RehearsalReport {
  totalActualSeconds: number;
  totalTargetSeconds: number;
  slidesVisited: number;
  totalPages: number;
  slides: SlideTimingSummary[];
}

/**
 * Tracks per-slide active presentation time in milliseconds and generates
 * pacing reports against per-slide target durations.
 */
export class RehearsalTracker {
  private running = false;
  private activePage: number | null = null;
  private lastResumeMs: number | null = null;
  private lastCountedVisitPage: number | null = null;
  private readonly elapsedMsByPage = new Map<number, number>();
  private readonly visitsByPage = new Map<number, number>();

  private normalizePage(page: number): number | null {
    if (!Number.isFinite(page)) return null;
    const normalized = Math.trunc(page);
    return normalized >= 1 ? normalized : null;
  }

  private commitActiveElapsed(nowMs: number): void {
    if (!this.running || this.activePage === null || this.lastResumeMs === null) {
      return;
    }
    const delta = Math.max(0, nowMs - this.lastResumeMs);
    this.elapsedMsByPage.set(
      this.activePage,
      (this.elapsedMsByPage.get(this.activePage) ?? 0) + delta,
    );
    this.lastResumeMs = nowMs;
  }

  private incrementVisit(page: number): void {
    this.visitsByPage.set(page, (this.visitsByPage.get(page) ?? 0) + 1);
    this.lastCountedVisitPage = page;
  }

  start(currentPage: number, nowMs?: number): void {
    const page = this.normalizePage(currentPage);
    if (page === null) return;
    const now = nowMs ?? Date.now();

    if (this.running) {
      if (this.activePage === page) {
        return;
      }
      this.commitActiveElapsed(now);
      this.activePage = page;
      this.lastResumeMs = now;
      if (this.lastCountedVisitPage !== page) {
        this.incrementVisit(page);
      }
      return;
    }

    this.running = true;
    this.activePage = page;
    this.lastResumeMs = now;
    if (this.lastCountedVisitPage !== page) {
      this.incrementVisit(page);
    }
  }

  pause(nowMs?: number): void {
    if (!this.running) return;
    const now = nowMs ?? Date.now();
    this.commitActiveElapsed(now);
    this.running = false;
    this.lastResumeMs = null;
  }

  onPageChange(nextPage: number, isRunning: boolean, nowMs?: number): void {
    const page = this.normalizePage(nextPage);
    if (page === null) return;
    const now = nowMs ?? Date.now();

    if (this.running) {
      this.commitActiveElapsed(now);
    }

    const prevPage = this.activePage;
    this.activePage = page;

    if (!isRunning) {
      this.running = false;
      this.lastResumeMs = null;
      if (prevPage !== page) {
        this.lastCountedVisitPage = null;
      }
      return;
    }

    this.running = true;
    this.lastResumeMs = now;
    if (this.lastCountedVisitPage !== page) {
      this.incrementVisit(page);
    }
  }

  reset(currentPage?: number): void {
    this.elapsedMsByPage.clear();
    this.visitsByPage.clear();
    this.running = false;
    this.lastResumeMs = null;
    this.lastCountedVisitPage = null;
    this.activePage = currentPage !== undefined ? this.normalizePage(currentPage) : null;
  }

  getElapsedMsByPage(nowMs?: number): Record<number, number> {
    const now = nowMs ?? Date.now();
    const out: Record<number, number> = {};
    for (const [page, ms] of this.elapsedMsByPage.entries()) {
      out[page] = ms;
    }
    if (this.running && this.activePage !== null && this.lastResumeMs !== null) {
      const liveDelta = Math.max(0, now - this.lastResumeMs);
      out[this.activePage] = (out[this.activePage] ?? 0) + liveDelta;
    }
    return out;
  }

  buildReport(
    totalPages: number,
    targetSecondsByPage: Record<number, number | undefined>,
    nowMs?: number,
  ): RehearsalReport {
    const safeTotalPages =
      Number.isFinite(totalPages) && totalPages > 0 ? Math.trunc(totalPages) : 0;
    const elapsedByPage = this.getElapsedMsByPage(nowMs);

    const pageSet = new Set<number>();
    for (let p = 1; p <= safeTotalPages; p += 1) {
      pageSet.add(p);
    }
    for (const rawPage of Object.keys(elapsedByPage)) {
      const p = Number(rawPage);
      if (Number.isInteger(p) && p >= 1) {
        pageSet.add(p);
      }
    }
    for (const p of this.visitsByPage.keys()) {
      if (Number.isInteger(p) && p >= 1) {
        pageSet.add(p);
      }
    }

    const orderedPages = Array.from(pageSet).sort((a, b) => a - b);

    let totalActualSeconds = 0;
    let totalTargetSeconds = 0;
    let slidesVisited = 0;

    const slides: SlideTimingSummary[] = orderedPages.map((page) => {
      const elapsedMs = elapsedByPage[page] ?? 0;
      const actualSeconds = Math.round(elapsedMs / 1000);
      const visits = this.visitsByPage.get(page) ?? 0;
      if (visits > 0) {
        slidesVisited += 1;
      }

      const rawTarget = targetSecondsByPage[page];
      const hasTarget =
        typeof rawTarget === 'number' && Number.isFinite(rawTarget) && rawTarget > 0;

      let status: SlideTimingSummary['status'] = 'no-target';
      let targetSeconds: number | undefined;
      let deltaSeconds: number | undefined;

      if (hasTarget) {
        targetSeconds = rawTarget;
        deltaSeconds = actualSeconds - targetSeconds;
        totalTargetSeconds += targetSeconds;

        if (actualSeconds > targetSeconds) {
          status = 'overtime';
        } else if (actualSeconds < targetSeconds * 0.8) {
          status = 'ahead';
        } else {
          status = 'on-track';
        }
      }

      totalActualSeconds += actualSeconds;

      return {
        page,
        actualSeconds,
        ...(targetSeconds !== undefined ? { targetSeconds } : {}),
        ...(deltaSeconds !== undefined ? { deltaSeconds } : {}),
        visits,
        status,
      };
    });

    return {
      totalActualSeconds,
      totalTargetSeconds,
      slidesVisited,
      totalPages: safeTotalPages,
      slides,
    };
  }
}

function formatSecondsDisplay(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDeltaDisplay(deltaSeconds: number): string {
  const rounded = Math.round(deltaSeconds);
  if (rounded > 0) return `+${rounded}s`;
  return `${rounded}s`;
}

export function exportRehearsalReportMarkdown(
  report: RehearsalReport,
  deckFileName: string,
): string {
  const safeName = deckFileName.replace(/[\r\n]+/g, ' ').trim() || 'Presentation';
  const lines: string[] = [
    `# Rehearsal Report: ${safeName}`,
    '',
    `- Total Actual: ${formatSecondsDisplay(report.totalActualSeconds)} (${report.totalActualSeconds}s)`,
    `- Total Target: ${
      report.totalTargetSeconds > 0
        ? `${formatSecondsDisplay(report.totalTargetSeconds)} (${report.totalTargetSeconds}s)`
        : '—'
    }`,
    `- Slides Visited: ${report.slidesVisited} / ${report.totalPages}`,
    '',
    '| Slide | Visits | Actual | Target | Delta | Status |',
    '| ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const slide of report.slides) {
    const actualCell = `${formatSecondsDisplay(slide.actualSeconds)} (${slide.actualSeconds}s)`;
    const targetCell =
      slide.targetSeconds !== undefined
        ? `${formatSecondsDisplay(slide.targetSeconds)} (${slide.targetSeconds}s)`
        : '—';
    const deltaCell =
      slide.deltaSeconds !== undefined ? formatDeltaDisplay(slide.deltaSeconds) : '—';
    lines.push(
      `| ${slide.page} | ${slide.visits} | ${actualCell} | ${targetCell} | ${deltaCell} | ${slide.status} |`,
    );
  }

  return lines.join('\n');
}

function escapeCsvCell(value: string | number | undefined): string {
  if (value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function exportRehearsalReportCsv(report: RehearsalReport): string {
  const header = 'page,visits,actual_seconds,target_seconds,delta_seconds,status';
  const rows = report.slides.map((slide) =>
    [
      escapeCsvCell(slide.page),
      escapeCsvCell(slide.visits),
      escapeCsvCell(slide.actualSeconds),
      escapeCsvCell(slide.targetSeconds),
      escapeCsvCell(slide.deltaSeconds),
      escapeCsvCell(slide.status),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function aggregateReportByLogicalSlide(
  report: RehearsalReport,
  pageLabels: string[] | null | undefined,
): RehearsalReport & { logicalSlides: LogicalSlideTimingSummary[] } {
  const byPage = new Map<number, SlideTimingSummary>();
  for (const slide of report.slides) {
    byPage.set(slide.page, slide);
  }

  const groups = buildLogicalSlideGroups(pageLabels, report.totalPages);
  let totalTargetSeconds = 0;

  const logicalSlides: LogicalSlideTimingSummary[] = groups.map((group) => {
    let actualSeconds = 0;
    let visits = 0;
    let targetSeconds: number | undefined;

    for (const p of group.pages) {
      const entry = byPage.get(p);
      if (!entry) continue;
      actualSeconds += entry.actualSeconds;
      visits += entry.visits;
      if (targetSeconds === undefined && entry.targetSeconds !== undefined && entry.targetSeconds > 0) {
        targetSeconds = entry.targetSeconds;
      }
    }

    let status: SlideTimingSummary['status'] = 'no-target';
    let deltaSeconds: number | undefined;
    if (targetSeconds !== undefined) {
      deltaSeconds = actualSeconds - targetSeconds;
      totalTargetSeconds += targetSeconds;
      if (actualSeconds > targetSeconds) {
        status = 'overtime';
      } else if (actualSeconds < targetSeconds * 0.8) {
        status = 'ahead';
      } else {
        status = 'on-track';
      }
    }

    return {
      label: group.label,
      pages: group.pages,
      page: group.primaryPage,
      actualSeconds,
      ...(targetSeconds !== undefined ? { targetSeconds } : {}),
      ...(deltaSeconds !== undefined ? { deltaSeconds } : {}),
      visits,
      status,
    };
  });

  return {
    ...report,
    totalTargetSeconds,
    logicalSlides,
  };
}
