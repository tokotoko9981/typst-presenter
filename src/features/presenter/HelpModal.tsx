import { useEffect, useState } from 'react';
import { useI18n } from '../../core/i18n/I18nContext.tsx';

export type HelpModalTab = 'quickstart' | 'shortcuts' | 'formats';

export interface HelpModalProps {
  initialTab?: HelpModalTab;
  onClose: () => void;
}

export function HelpModal({ initialTab = 'shortcuts', onClose }: HelpModalProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<HelpModalTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts help"
      data-testid="help-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.helpModalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Guide sections"
          className="flex items-center gap-1 border-b border-slate-200 px-5 py-2 text-xs dark:border-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quickstart'}
            onClick={() => setActiveTab('quickstart')}
            className={`rounded px-3 py-1.5 font-medium transition ${
              activeTab === 'quickstart'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.helpTabQuickStart}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shortcuts'}
            onClick={() => setActiveTab('shortcuts')}
            className={`rounded px-3 py-1.5 font-medium transition ${
              activeTab === 'shortcuts'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.helpTabShortcuts}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'formats'}
            onClick={() => setActiveTab('formats')}
            className={`rounded px-3 py-1.5 font-medium transition ${
              activeTab === 'formats'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.helpTabFormats}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'quickstart' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.helpQuickStep1Title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpQuickStep1Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.helpQuickStep2Title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpQuickStep2Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.helpQuickStep3Title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpQuickStep3Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.helpQuickStep4Title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpQuickStep4Body}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              {[
                [['→', 'Space', '←'], t.shortcutNav],
                [['1-9', 'Enter'], t.shortcutJump],
                [['B'], t.shortcutBlackout],
                [['W'], t.shortcutWhiteout],
                [['F'], t.shortcutFreeze],
                [['L'], t.shortcutLaser],
                [['D'], t.shortcutPen],
                [['S'], t.shortcutSpotlight],
                [['C'], t.shortcutClearInk],
                [['H'], t.shortcutToggleInk],
                [['R'], t.shortcutStats],
                [['G', 'Tab'], t.shortcutGrid],
                [['O'], t.shortcutOutline],
                [['E'], t.shortcutEditNotes],
                [['I'], t.shortcutUiGuide],
              ].map(([keys, desc]) => (
                <li key={desc as string} className="flex items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1">
                    {(keys as string[]).map((k, idx) => (
                      <span key={k} className="flex items-center gap-1">
                        {idx > 0 && <span className="text-slate-400">/</span>}
                        <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </span>
                  <span className="text-slate-400">:</span>
                  <span>{desc as string}</span>
                </li>
              ))}
            </ul>
          )}

          {activeTab === 'formats' && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {t.helpFormatMarkdownTitle}
                </h3>
                <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpFormatMarkdownBody}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {t.helpFormatMarpTitle}
                </h3>
                <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpFormatMarpBody}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {t.helpFormatPdfpcTitle}
                </h3>
                <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpFormatPdfpcBody}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/70">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {t.helpFormatEmbeddedTitle}
                </h3>
                <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                  {t.helpFormatEmbeddedBody}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
