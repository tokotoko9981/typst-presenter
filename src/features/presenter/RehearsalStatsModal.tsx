import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../core/i18n/I18nContext.tsx';
import { hasRepeatedPageLabels } from '../../core/notes/logicalSlides.ts';
import {
  aggregateReportByLogicalSlide,
  type RehearsalReport,
  type SlideTimingSummary,
} from '../../core/timer/RehearsalTracker.ts';
import { formatDurationMMSS } from '../../core/timer/TimerEngine.ts';

export interface RehearsalStatsModalProps {
  report: RehearsalReport;
  deckFileName: string;
  pageLabels?: string[] | null;
  onClose: () => void;
  onJumpToSlide: (page: number) => void;
  onApplyActualAsTargets: (targets: Record<number, number>) => void;
  onExportMarkdown: () => void;
  onExportCsv: () => void;
}

function getStatusBadgeClasses(status: SlideTimingSummary['status']): string {
  switch (status) {
    case 'overtime':
      return 'bg-red-50 text-red-700 border border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-700';
    case 'ahead':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700';
    case 'on-track':
      return 'bg-blue-50 text-blue-700 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-700';
    case 'no-target':
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

function getProgressBarClasses(status: SlideTimingSummary['status']): string {
  switch (status) {
    case 'overtime':
      return 'bg-red-500';
    case 'ahead':
      return 'bg-emerald-500';
    case 'on-track':
      return 'bg-blue-500';
    case 'no-target':
    default:
      return 'bg-slate-400 dark:bg-slate-500';
  }
}

function formatDeltaSeconds(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}s`;
  return `${rounded}s`;
}

export function RehearsalStatsModal({
  report,
  deckFileName,
  pageLabels,
  onClose,
  onJumpToSlide,
  onApplyActualAsTargets,
  onExportMarkdown,
  onExportCsv,
}: RehearsalStatsModalProps) {
  const { t, locale } = useI18n();
  const hasLogicalGroups = useMemo(
    () => hasRepeatedPageLabels(pageLabels, report.totalPages),
    [pageLabels, report.totalPages],
  );
  const [groupByLogical, setGroupByLogical] = useState<boolean>(hasLogicalGroups);

  const logicalAggregated = useMemo(() => {
    if (!hasLogicalGroups || !groupByLogical) {
      return null;
    }
    return aggregateReportByLogicalSlide(report, pageLabels);
  }, [hasLogicalGroups, groupByLogical, report, pageLabels]);

  const displayedSlides = useMemo(
    () =>
      logicalAggregated
        ? logicalAggregated.logicalSlides.map((ls) => ({
            ...ls,
            displayTitle:
              ls.pages.length > 1
                ? `${t.slideLabel} ${ls.label} (p.${ls.pages[0]}-${ls.pages[ls.pages.length - 1]})`
                : `${t.slideLabel} ${ls.label}`,
          }))
        : report.slides.map((s) => ({
            ...s,
            displayTitle: `${t.slideLabel} ${s.page}`,
          })),
    [logicalAggregated, report.slides, t.slideLabel],
  );

  const effectiveTotalTargetSeconds = logicalAggregated
    ? logicalAggregated.totalTargetSeconds
    : report.totalTargetSeconds;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const maxActualSeconds = useMemo(
    () =>
      displayedSlides.reduce(
        (max, slide) => (slide.actualSeconds > max ? slide.actualSeconds : max),
        0,
      ),
    [displayedSlides],
  );

  const derivedTargets = useMemo(() => {
    const targets: Record<number, number> = {};
    for (const slide of report.slides) {
      if (slide.visits > 0 || slide.actualSeconds > 0) {
        targets[slide.page] = Math.max(1, Math.round(slide.actualSeconds));
      }
    }
    return targets;
  }, [report.slides]);

  const hasApplicableTargets = Object.keys(derivedTargets).length > 0;
  const totalDelta =
    effectiveTotalTargetSeconds > 0
      ? report.totalActualSeconds - effectiveTotalTargetSeconds
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rehearsal timing analytics"
      data-testid="rehearsal-stats-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t.rehearsalTitle}
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {deckFileName || t.presentationFallback}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasLogicalGroups && (
              <button
                type="button"
                data-testid="rehearsal-logical-toggle"
                aria-pressed={groupByLogical}
                onClick={() => setGroupByLogical((prev) => !prev)}
                className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-medium transition ${
                  groupByLogical
                    ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-500'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {groupByLogical
                  ? locale === 'ja'
                    ? '論理スライド合算'
                    : 'Logical Slides'
                  : locale === 'ja'
                    ? '物理ページ別'
                    : 'Physical Pages'}
              </button>
            )}
            {totalDelta !== null && (
              <span
                className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                  totalDelta > 0
                    ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {t.totalDeltaPrefix} {formatDeltaSeconds(totalDelta)}
              </span>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.totalActual}
            </div>
            <div
              data-testid="rehearsal-total-actual"
              className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {formatDurationMMSS(report.totalActualSeconds * 1000)}
            </div>
            <div className="text-[11px] text-slate-500">{report.totalActualSeconds}s</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.totalTarget}
            </div>
            <div
              data-testid="rehearsal-total-target"
              className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {effectiveTotalTargetSeconds > 0
                ? formatDurationMMSS(effectiveTotalTargetSeconds * 1000)
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500">
              {effectiveTotalTargetSeconds > 0
                ? `${effectiveTotalTargetSeconds}s`
                : t.noTargetsSet}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.visitedSlides}
            </div>
            <div
              data-testid="rehearsal-slides-visited"
              className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {report.slidesVisited} / {report.totalPages}
            </div>
            <div className="text-[11px] text-slate-500">
              {report.totalPages > 0
                ? `${Math.round((report.slidesVisited / report.totalPages) * 100)}${t.coverageSuffix}`
                : `0${t.coverageSuffix}`}
            </div>
          </div>
        </div>

        {/* Per-Slide Breakdown */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {displayedSlides.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t.noTimingData}
            </p>
          ) : (
            displayedSlides.map((slide) => {
              const barPercent =
                slide.targetSeconds && slide.targetSeconds > 0
                  ? Math.min(100, Math.round((slide.actualSeconds / slide.targetSeconds) * 100))
                  : maxActualSeconds > 0
                    ? Math.min(100, Math.round((slide.actualSeconds / maxActualSeconds) * 100))
                    : 0;

              return (
                <button
                  key={`${slide.page}-${slide.displayTitle}`}
                  type="button"
                  data-testid={`rehearsal-slide-row-${slide.page}`}
                  onClick={() => onJumpToSlide(slide.page)}
                  className="flex w-full flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-600 dark:hover:bg-slate-800/70"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {slide.displayTitle}
                      </span>
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        {slide.visits} {slide.visits === 1 ? t.visitSingular : t.visitPlural}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {formatDurationMMSS(slide.actualSeconds * 1000)}
                        {slide.targetSeconds !== undefined
                          ? ` / ${formatDurationMMSS(slide.targetSeconds * 1000)}`
                          : ''}
                      </span>
                      {slide.deltaSeconds !== undefined && (
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          ({formatDeltaSeconds(slide.deltaSeconds)})
                        </span>
                      )}
                      <span
                        data-status={slide.status}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${getStatusBadgeClasses(
                          slide.status,
                        )}`}
                      >
                        {slide.status}
                      </span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${getProgressBarClasses(
                        slide.status,
                      )}`}
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-xs dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasApplicableTargets}
              onClick={() => {
                if (hasApplicableTargets) {
                  onApplyActualAsTargets(derivedTargets);
                }
              }}
              className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.applyActualAsTargets}
            </button>
            <button
              type="button"
              onClick={onExportMarkdown}
              className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.exportReportMd}
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.exportReportCsv}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>
      </div>
    </div>
  );
}
