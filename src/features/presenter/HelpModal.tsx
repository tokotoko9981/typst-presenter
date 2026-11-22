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
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-bold text-white">{t.helpModalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Guide sections"
          className="flex items-center gap-1 border-b border-slate-800 px-5 py-2 text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quickstart'}
            onClick={() => setActiveTab('quickstart')}
            className={`rounded px-3 py-1.5 font-medium transition ${
              activeTab === 'quickstart'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t.helpTabFormats}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'quickstart' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">{t.helpQuickStep1Title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {t.helpQuickStep1Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">{t.helpQuickStep2Title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {t.helpQuickStep2Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">{t.helpQuickStep3Title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {t.helpQuickStep3Body}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="text-sm font-semibold text-white">{t.helpQuickStep4Title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {t.helpQuickStep4Body}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <ul className="space-y-2 text-sm text-slate-300">
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">→</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Space</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">←</kbd> :{' '}
                {t.shortcutNav}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">1-9</kbd> +{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Enter</kbd> :{' '}
                {t.shortcutJump}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">B</kbd> :{' '}
                {t.shortcutBlackout}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">W</kbd> :{' '}
                {t.shortcutWhiteout}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">F</kbd> :{' '}
                {t.shortcutFreeze}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">L</kbd> :{' '}
                {t.shortcutLaser}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">D</kbd> :{' '}
                {t.shortcutPen}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">S</kbd> :{' '}
                {t.shortcutSpotlight}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">C</kbd> :{' '}
                {t.shortcutClearInk}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">H</kbd> :{' '}
                {t.shortcutToggleInk}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">R</kbd> :{' '}
                {t.shortcutStats}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">G</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Tab</kbd> :{' '}
                {t.shortcutGrid}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">O</kbd> :{' '}
                {t.shortcutOutline}
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">E</kbd> :{' '}
                {t.shortcutEditNotes}
              </li>
            </ul>
          )}

          {activeTab === 'formats' && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="font-semibold text-white">{t.helpFormatMarkdownTitle}</h3>
                <p className="mt-1 leading-relaxed text-slate-300">{t.helpFormatMarkdownBody}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="font-semibold text-white">{t.helpFormatMarpTitle}</h3>
                <p className="mt-1 leading-relaxed text-slate-300">{t.helpFormatMarpBody}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="font-semibold text-white">{t.helpFormatPdfpcTitle}</h3>
                <p className="mt-1 leading-relaxed text-slate-300">{t.helpFormatPdfpcBody}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5">
                <h3 className="font-semibold text-white">{t.helpFormatEmbeddedTitle}</h3>
                <p className="mt-1 leading-relaxed text-slate-300">{t.helpFormatEmbeddedBody}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
