import { useEffect, useMemo } from 'react';
import { useI18n } from '../../core/i18n/I18nContext.tsx';
import type { RehearsalReport, SlideTimingSummary } from '../../core/timer/RehearsalTracker.ts';
import { formatDurationMMSS } from '../../core/timer/TimerEngine.ts';

export interface RehearsalStatsModalProps {
  report: RehearsalReport;
  deckFileName: string;
  onClose: () => void;
  onJumpToSlide: (page: number) => void;
  onApplyActualAsTargets: (targets: Record<number, number>) => void;
  onExportMarkdown: () => void;
  onExportCsv: () => void;
}

function getStatusBadgeClasses(status: SlideTimingSummary['status']): string {
  switch (status) {
    case 'overtime':
      return 'bg-red-950 text-red-300 border border-red-700';
    case 'ahead':
      return 'bg-emerald-950 text-emerald-300 border border-emerald-700';
    case 'on-track':
      return 'bg-blue-950 text-blue-300 border border-blue-700';
    case 'no-target':
    default:
      return 'bg-slate-800 text-slate-400 border border-slate-700';
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
      return 'bg-slate-500';
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
  onClose,
  onJumpToSlide,
  onApplyActualAsTargets,
  onExportMarkdown,
  onExportCsv,
}: RehearsalStatsModalProps) {
  const { t } = useI18n();

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
      report.slides.reduce(
        (max, slide) => (slide.actualSeconds > max ? slide.actualSeconds : max),
        0,
      ),
    [report.slides],
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
    report.totalTargetSeconds > 0
      ? report.totalActualSeconds - report.totalTargetSeconds
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">{t.rehearsalTitle}</h2>
            <p className="truncate text-xs text-slate-400">
              {deckFileName || t.presentationFallback}
            </p>
          </div>
          {totalDelta !== null && (
            <span
              className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs font-semibold ${
                totalDelta > 0
                  ? 'border border-red-700 bg-red-950 text-red-300'
                  : 'border border-emerald-700 bg-emerald-950 text-emerald-300'
              }`}
            >
              {t.totalDeltaPrefix} {formatDeltaSeconds(totalDelta)}
            </span>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 border-b border-slate-800 px-5 py-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {t.totalActual}
            </div>
            <div
              data-testid="rehearsal-total-actual"
              className="mt-0.5 font-mono text-lg font-bold text-slate-100"
            >
              {formatDurationMMSS(report.totalActualSeconds * 1000)}
            </div>
            <div className="text-[11px] text-slate-500">{report.totalActualSeconds}s</div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {t.totalTarget}
            </div>
            <div
              data-testid="rehearsal-total-target"
              className="mt-0.5 font-mono text-lg font-bold text-slate-100"
            >
              {report.totalTargetSeconds > 0
                ? formatDurationMMSS(report.totalTargetSeconds * 1000)
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500">
              {report.totalTargetSeconds > 0 ? `${report.totalTargetSeconds}s` : t.noTargetsSet}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {t.visitedSlides}
            </div>
            <div
              data-testid="rehearsal-slides-visited"
              className="mt-0.5 font-mono text-lg font-bold text-slate-100"
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
          {report.slides.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t.noTimingData}</p>
          ) : (
            report.slides.map((slide) => {
              const barPercent =
                slide.targetSeconds && slide.targetSeconds > 0
                  ? Math.min(100, Math.round((slide.actualSeconds / slide.targetSeconds) * 100))
                  : maxActualSeconds > 0
                    ? Math.min(100, Math.round((slide.actualSeconds / maxActualSeconds) * 100))
                    : 0;

              return (
                <button
                  key={slide.page}
                  type="button"
                  data-testid={`rehearsal-slide-row-${slide.page}`}
                  onClick={() => onJumpToSlide(slide.page)}
                  className="flex w-full flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-left transition hover:border-slate-600 hover:bg-slate-800/70"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">
                        {t.slideLabel} {slide.page}
                      </span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        {slide.visits} {slide.visits === 1 ? t.visitSingular : t.visitPlural}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-200">
                        {formatDurationMMSS(slide.actualSeconds * 1000)}
                        {slide.targetSeconds !== undefined
                          ? ` / ${formatDurationMMSS(slide.targetSeconds * 1000)}`
                          : ''}
                      </span>
                      {slide.deltaSeconds !== undefined && (
                        <span className="font-mono text-[11px] text-slate-400">
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

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3 text-xs">
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
              className="rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
            >
              {t.exportReportMd}
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
            >
              {t.exportReportCsv}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>
      </div>
    </div>
  );
}
