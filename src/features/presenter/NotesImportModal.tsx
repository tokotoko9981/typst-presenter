import { useEffect, useState } from 'react';
import { useI18n } from '../../core/i18n/I18nContext.tsx';

export const NOTES_TEMPLATE_MARKDOWN = `---
duration: 10
lastMinutes: 2
noteFontSize: 16
---

<!-- slide: 1 -->
<!-- target: 45 -->
### Title / Opening
- Key message for the opening slide.
- Watch pacing before moving to slide 2.

---

<!-- slide: 2 -->
<!-- target: 60 -->
### Main Point
- Explain the background and motivation cleanly.

---

<!-- slide: 3 -->
<!-- target: 45 -->
### Summary
- Wrap up main takeaways and Q&A prompt.
`;

export interface NotesImportModalProps {
  hasDeck: boolean;
  embeddedNotesCount: number;
  onClose: () => void;
  onChooseNotesFile: () => void;
  onDropNotesFile: (file: File) => void;
  onImportEmbeddedNotes: () => void;
  onDownloadTemplate: (content: string) => void;
}

export function NotesImportModal({
  hasDeck,
  embeddedNotesCount,
  onClose,
  onChooseNotesFile,
  onDropNotesFile,
  onImportEmbeddedNotes,
  onDownloadTemplate,
}: NotesImportModalProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

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

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard?.writeText(NOTES_TEMPLATE_MARKDOWN);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.notesImportTitle}
      data-testid="notes-import-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{t.notesImportTitle}</h2>
            <p className="text-xs text-slate-400">{t.notesImportSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            {t.closeEsc}
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {/* Dedicated Notes Dropzone & File Picker */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
                /\.(md|markdown|json|pdfpc)$/i.test(f.name.toLowerCase()),
              );
              if (file) {
                onDropNotesFile(file);
                onClose();
              }
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-950/70 p-5 text-center transition hover:border-blue-500"
          >
            <p className="text-sm font-medium text-slate-100">{t.notesDropzoneTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{t.notesDropzoneHint}</p>
            <button
              type="button"
              onClick={() => {
                onChooseNotesFile();
                onClose();
              }}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              {t.chooseNotesFile}
            </button>
          </div>

          {/* Embedded PDF Notes Section */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-200">{t.importEmbeddedSectionTitle}</div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {embeddedNotesCount > 0 ? t.importEmbeddedReadyDesc : t.importEmbeddedNoneDesc}
              </p>
            </div>
            <button
              type="button"
              disabled={!hasDeck}
              onClick={() => {
                onImportEmbeddedNotes();
                onClose();
              }}
              className="shrink-0 rounded bg-slate-800 px-3 py-1.5 font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              {t.importEmbeddedBtn}
            </button>
          </div>

          {/* Supported Format Guide + Template Actions */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-200">{t.formatGuideTitle}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCopyTemplate()}
                  className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  {copied ? t.copiedTemplateBtn : t.copyTemplateBtn}
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadTemplate(NOTES_TEMPLATE_MARKDOWN)}
                  className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  {t.downloadTemplateBtn}
                </button>
              </div>
            </div>

            <ul className="space-y-1.5 text-[11px] text-slate-300">
              <li>• {t.formatBulletMarkdown}</li>
              <li>• {t.formatBulletExplicit}</li>
              <li>• {t.formatBulletMarpSlidev}</li>
              <li>• {t.formatBulletPdfpc}</li>
              <li>• {t.formatBulletPairDrop}</li>
            </ul>

            <pre className="mt-3 overflow-x-auto rounded border border-slate-800 bg-slate-900 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
              {NOTES_TEMPLATE_MARKDOWN.trim()}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
