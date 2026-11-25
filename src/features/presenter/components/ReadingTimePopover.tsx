import { useEffect, useRef } from 'react';
import { useI18n } from '../../../core/i18n/I18nContext.tsx';
import {
  READING_SPEED_PRESETS,
  type DeckTargetEstimateResult,
  type ReadingSpeedPreset,
  type ReadingTimeEstimate,
} from '../../../core/notes/readingTime.ts';

export interface ReadingTimePopoverProps {
  anchor: { top: number; left: number };
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  preset: ReadingSpeedPreset;
  currentEstimate: ReadingTimeEstimate;
  inheritedFromPage: number | null;
  missingEstimate: DeckTargetEstimateResult;
  overwriteEstimate: DeckTargetEstimateResult;
  onChangePreset: (preset: ReadingSpeedPreset) => void;
  onApplyCurrent: () => void;
  onApplyMissing: () => void;
  onApplyAll: () => void;
  onClose: () => void;
}

const POPOVER_WIDTH_PX = 288;
const POPOVER_ESTIMATED_HEIGHT_PX = 310;

export function ReadingTimePopover({
  anchor,
  anchorRef,
  preset,
  currentEstimate,
  inheritedFromPage,
  missingEstimate,
  overwriteEstimate,
  onChangePreset,
  onApplyCurrent,
  onApplyMissing,
  onApplyAll,
  onClose,
}: ReadingTimePopoverProps) {
  const { locale, t } = useI18n();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [anchorRef, onClose]);

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clampedLeft = Math.max(8, Math.min(viewportW - POPOVER_WIDTH_PX - 8, anchor.left));
  const fitsBelow = anchor.top + POPOVER_ESTIMATED_HEIGHT_PX <= viewportH - 8;
  const clampedTop = fitsBelow
    ? Math.max(8, anchor.top)
    : Math.max(8, anchor.top - POPOVER_ESTIMATED_HEIGHT_PX - 38);

  const cfg = READING_SPEED_PRESETS[preset];
  const speedSubtitle =
    locale === 'ja'
      ? `${cfg.cjkCharsPerMin} 字/分・${cfg.latinWordsPerMin} 語/分`
      : `${cfg.cjkCharsPerMin} chars/m · ${cfg.latinWordsPerMin} wpm`;

  const countSummary =
    locale === 'ja'
      ? `${currentEstimate.cjkChars} 字・${currentEstimate.latinWords} 語`
      : `${currentEstimate.cjkChars} chars · ${currentEstimate.latinWords} words`;

  const presetOptions: Array<{ id: ReadingSpeedPreset; label: string }> = [
    { id: 'slow', label: t.readingSpeedSlow },
    { id: 'normal', label: t.readingSpeedNormal },
    { id: 'fast', label: t.readingSpeedFast },
  ];

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t.readingTimePopoverAria}
      data-testid="reading-time-popover"
      style={{ top: `${clampedTop}px`, left: `${clampedLeft}px`, width: `${POPOVER_WIDTH_PX}px` }}
      className="fixed z-50 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900 dark:text-white">{t.readingTimeTitle}</span>
        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
          {speedSubtitle}
        </span>
      </div>

      {/* Speed Preset Selector */}
      <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
        {presetOptions.map((opt) => {
          const active = preset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`reading-speed-${opt.id}`}
              aria-pressed={active}
              onClick={() => onChangePreset(opt.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                active
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Current Slide Summary */}
      <div
        data-testid="reading-time-current-summary"
        className="mb-2.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>{countSummary}</span>
          {inheritedFromPage !== null && (
            <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {t.logicalInheritedFrom}
              {inheritedFromPage}
            </span>
          )}
        </div>
        <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
          {currentEstimate.estimatedSeconds > 0
            ? `${currentEstimate.estimatedSeconds} ${t.secondsUnit}`
            : t.readingTimeNoScript}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          data-testid="apply-estimate-current"
          disabled={currentEstimate.estimatedSeconds <= 0}
          onClick={onApplyCurrent}
          className="flex items-center justify-between rounded bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span>{t.readingTimeApplyCurrent}</span>
          {currentEstimate.estimatedSeconds > 0 && (
            <span className="font-mono">{currentEstimate.estimatedSeconds}s</span>
          )}
        </button>

        <button
          type="button"
          data-testid="apply-estimate-missing"
          disabled={missingEstimate.updatedCount === 0}
          onClick={onApplyMissing}
          className="flex items-center justify-between rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <span>{t.readingTimeApplyMissing}</span>
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
            {missingEstimate.updatedCount}
          </span>
        </button>

        <button
          type="button"
          data-testid="apply-estimate-all"
          disabled={overwriteEstimate.updatedCount === 0}
          onClick={onApplyAll}
          className="flex items-center justify-between rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span>{t.readingTimeApplyAll}</span>
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
            {overwriteEstimate.updatedCount}
          </span>
        </button>
      </div>
    </div>
  );
}
