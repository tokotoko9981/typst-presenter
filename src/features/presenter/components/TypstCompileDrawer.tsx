import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, FileCode2, RefreshCw, Square, Terminal, X } from 'lucide-react';
import { useI18n } from '../../../core/i18n/I18nContext.tsx';
import type { TypstCliStatus } from '../../../core/platform/DesktopBridge.ts';
import type { TypstDiagnostic } from '../../../core/typst/typstDiagnostics.ts';
import type { TypstBuildStatus } from '../hooks/useTypstLiveCompile.ts';

export interface TypstCompileDrawerProps {
  cliStatus: TypstCliStatus | null;
  watchedPath: string | null;
  buildStatus: TypstBuildStatus;
  lastDurationMs: number | null;
  diagnostics: TypstDiagnostic[];
  rootDir: string;
  inputsText: string;
  fontPathsText: string;
  fonts: string[];
  loadingFonts: boolean;
  onChangeRootDir: (val: string) => void;
  onChangeInputsText: (val: string) => void;
  onChangeFontPathsText: (val: string) => void;
  onRefreshCli: () => void;
  onPickTypstFile: () => void;
  onRecompile: () => void;
  onStopWatch: () => void;
  onRefreshFonts: () => void;
  onClose: () => void;
}

export function TypstCompileDrawer({
  cliStatus,
  watchedPath,
  buildStatus,
  lastDurationMs,
  diagnostics,
  rootDir,
  inputsText,
  fontPathsText,
  fonts,
  loadingFonts,
  onChangeRootDir,
  onChangeInputsText,
  onChangeFontPathsText,
  onRefreshCli,
  onPickTypstFile,
  onRecompile,
  onStopWatch,
  onRefreshFonts,
  onClose,
}: TypstCompileDrawerProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.typstDrawerTitle}
      data-testid="typst-compile-drawer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 backdrop-blur-[1px] dark:bg-black/60"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <h2 className="text-base font-bold">{t.typstDrawerTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.closeEsc}
            className="rounded border border-slate-200 bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {/* CLI Detection */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <Terminal className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>{t.typstCliStatusLabel}</span>
              </div>
              <button
                type="button"
                onClick={onRefreshCli}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>{t.typstCliRecheck}</span>
              </button>
            </div>
            {cliStatus?.available ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono">
                  {cliStatus.version ?? 'typst'} {cliStatus.path ? `(${cliStatus.path})` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-amber-700 dark:text-amber-300">
                <p>{t.typstCliMissingGuide}</p>
                <pre className="overflow-x-auto rounded border border-amber-300/60 bg-white p-2 font-mono text-[11px] text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-200">
                  {`winget install Typst.Typst\nbrew install typst\ncargo install typst-cli`}
                </pre>
              </div>
            )}
          </div>

          {/* Active Watch & Actions */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {t.typstWatchedFileLabel}
                </div>
                <div className="mt-0.5 truncate font-mono text-slate-800 dark:text-slate-200">
                  {watchedPath ?? t.typstNoFileSelected}
                </div>
              </div>
              {lastDurationMs !== null && (
                <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800">
                  {lastDurationMs}ms
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPickTypstFile}
                className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
              >
                {t.openTypstBtn}
              </button>
              {watchedPath && (
                <>
                  <button
                    type="button"
                    onClick={onRecompile}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.typstRecompileBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onStopWatch}
                    className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2.5 py-1.5 font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/60"
                  >
                    <Square className="h-3 w-3" aria-hidden="true" />
                    <span>{t.typstStopWatchBtn}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Live Compile Guard & Diagnostics */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{t.typstDiagnosticsTitle}</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  buildStatus === 'error'
                    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : buildStatus === 'ok'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {buildStatus}
              </span>
            </div>

            {buildStatus === 'error' && (
              <div className="mb-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.typstLiveGuardNotice}</span>
              </div>
            )}

            {diagnostics.length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.typstNoDiagnostics}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {diagnostics.map((d, idx) => (
                  <li
                    key={`${idx}-${d.line ?? 0}-${d.message}`}
                    data-testid="typst-diagnostic-item"
                    className={`rounded border p-2 font-mono text-[11px] ${
                      d.severity === 'error'
                        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200'
                        : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                    }`}
                  >
                    {(d.file || d.line !== undefined) && (
                      <div className="mb-0.5 font-semibold">
                        {d.file ?? ''}
                        {d.line !== undefined ? `:${d.line}` : ''}
                        {d.column !== undefined ? `:${d.column}` : ''}
                      </div>
                    )}
                    <div>{d.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Compile Options */}
          <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="font-semibold">{t.typstOptionsTitle}</div>
            <label className="block">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">--root</span>
              <input
                type="text"
                value={rootDir}
                onChange={(e) => onChangeRootDir(e.target.value)}
                placeholder="/path/to/project-root"
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                --input (key=value, comma or newline separated)
              </span>
              <input
                type="text"
                value={inputsText}
                onChange={(e) => onChangeInputsText(e.target.value)}
                placeholder="theme=dark, lang=ja"
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                --font-path (comma or newline separated)
              </span>
              <input
                type="text"
                value={fontPathsText}
                onChange={(e) => onChangeFontPathsText(e.target.value)}
                placeholder="./fonts"
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          {/* Available Fonts */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t.typstFontsTitle}</span>
              <button
                type="button"
                disabled={loadingFonts}
                onClick={onRefreshFonts}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                {loadingFonts ? '...' : t.typstLoadFontsBtn}
              </button>
            </div>
            {fonts.length > 0 && (
              <div className="mt-2 max-h-36 overflow-y-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900">
                {fonts.map((f) => (
                  <div key={f} className="truncate">
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
