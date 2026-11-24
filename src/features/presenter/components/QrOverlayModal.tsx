import { useEffect, useMemo } from 'react';
import { QrCode } from 'lucide-react';
import { useI18n } from '../../../core/i18n/I18nContext.tsx';
import { generateQrSvg } from '../../../core/qr/qrSvg.ts';

export interface QrOverlayModalProps {
  url: string;
  label: string;
  visibleOnAudience: boolean;
  onChangeUrl: (nextUrl: string) => void;
  onChangeLabel: (nextLabel: string) => void;
  onToggleAudience: () => void;
  onClose: () => void;
}

export function QrOverlayModal({
  url,
  label,
  visibleOnAudience,
  onChangeUrl,
  onChangeLabel,
  onToggleAudience,
  onClose,
}: QrOverlayModalProps) {
  const { t } = useI18n();

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

  const svgMarkup = useMemo(() => generateQrSvg(url), [url]);
  const hasValidUrl = url.trim().length > 0 && svgMarkup.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.qrModalTitle}
      data-testid="qr-overlay-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-blue-500" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t.qrModalTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">{t.qrModalDesc}</p>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700 dark:text-slate-200">{t.qrUrlLabel}</span>
            <input
              type="url"
              data-testid="qr-url-input"
              aria-label={t.qrUrlLabel}
              placeholder="https://example.com/slides"
              value={url}
              onChange={(e) => onChangeUrl(e.target.value)}
              className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {t.qrCaptionLabel}
            </span>
            <input
              type="text"
              data-testid="qr-label-input"
              aria-label={t.qrCaptionLabel}
              placeholder={t.qrCaptionPlaceholder}
              value={label}
              onChange={(e) => onChangeLabel(e.target.value)}
              className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            {hasValidUrl ? (
              <div
                data-testid="qr-preview-svg"
                className="h-44 w-44 rounded bg-white p-2 shadow-sm [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="flex h-44 w-44 items-center justify-center text-center text-xs text-slate-400">
                {t.qrEmptyPreview}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              data-testid="qr-toggle-audience-button"
              disabled={!hasValidUrl && !visibleOnAudience}
              onClick={onToggleAudience}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                visibleOnAudience
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {visibleOnAudience ? t.qrHideFromAudience : t.qrShowOnAudience}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
