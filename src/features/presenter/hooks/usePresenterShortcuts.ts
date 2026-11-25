import { useEffect, useRef } from 'react';
import type { CurtainMode, PointerTool } from '../../../core/sync/types.ts';
import type { HelpModalTab } from '../HelpModal.tsx';

export type PresenterModalKind =
  | 'none'
  | 'grid'
  | 'outline'
  | 'help'
  | 'stats'
  | 'notes-import'
  | 'ui-guide'
  | 'qr';

export interface UsePresenterShortcutsOptions {
  numPages: number | null;
  currentPage: number;
  isEditingNotes: boolean;
  activeModal: PresenterModalKind;
  curtainMode: CurtainMode;
  pointerTool: PointerTool;
  zoomMode?: boolean;
  zoomScale?: number;
  onNavigateToSlide: (page: number) => void;
  onSaveNotesEditor: () => Promise<void> | void;
  onSetActiveModal: React.Dispatch<React.SetStateAction<PresenterModalKind>>;
  onSetHelpInitialTab: (tab: HelpModalTab) => void;
  onOpenStatsModal: () => void;
  onOpenNotesEditor: () => void;
  onToggleCurtain: (target: 'black' | 'white') => void;
  onToggleFreeze: () => void;
  onToggleTool: (tool: PointerTool) => void;
  onToggleZoomMode?: () => void;
  onResetZoom?: () => void;
  onClearStageOverlay: () => void;
  onClearInk: () => void;
  onToggleInkVisibility: () => void;
  onAdjustSpotlightRadius: (delta: number) => void;
  onAdjustPenSize: (delta: number) => void;
}

export function usePresenterShortcuts({
  numPages,
  currentPage,
  isEditingNotes,
  activeModal,
  curtainMode,
  pointerTool,
  zoomMode = false,
  zoomScale = 1,
  onNavigateToSlide,
  onSaveNotesEditor,
  onSetActiveModal,
  onSetHelpInitialTab,
  onOpenStatsModal,
  onOpenNotesEditor,
  onToggleCurtain,
  onToggleFreeze,
  onToggleTool,
  onToggleZoomMode,
  onResetZoom,
  onClearStageOverlay,
  onClearInk,
  onToggleInkVisibility,
  onAdjustSpotlightRadius,
  onAdjustPenSize,
}: UsePresenterShortcutsOptions): void {
  const digitBufferRef = useRef<string>('');
  const digitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (digitTimeoutRef.current) {
        clearTimeout(digitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (e.key === 'Escape') {
        if (isEditingNotes) {
          e.preventDefault();
          void onSaveNotesEditor();
          return;
        }
        if (activeModal !== 'none') {
          e.preventDefault();
          onSetActiveModal('none');
          return;
        }
        if (
          !inEditable &&
          (curtainMode !== 'none' || pointerTool !== 'none' || zoomMode || zoomScale > 1.001)
        ) {
          e.preventDefault();
          onClearStageOverlay();
          return;
        }
      }

      if (inEditable || isEditingNotes) {
        return;
      }

      if (active instanceof HTMLElement && active.getAttribute('role') === 'separator') {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // '0' resets zoom when no multi-digit slide jump is in progress and zoom is active
      if (e.key === '0' && digitBufferRef.current.length === 0 && (zoomMode || zoomScale > 1.001)) {
        e.preventDefault();
        onResetZoom?.();
        return;
      }

      // Numeric direct slide jump buffer (e.g., '2' then 'Enter')
      if (/^[0-9]$/.test(e.key)) {
        digitBufferRef.current += e.key;
        if (digitTimeoutRef.current) clearTimeout(digitTimeoutRef.current);
        digitTimeoutRef.current = setTimeout(() => {
          digitBufferRef.current = '';
        }, 2000);
        return;
      }

      if (e.key === 'Enter' && digitBufferRef.current.length > 0) {
        e.preventDefault();
        const target = Number.parseInt(digitBufferRef.current, 10);
        digitBufferRef.current = '';
        if (numPages !== null && target >= 1 && target <= numPages) {
          onNavigateToSlide(target);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ': {
          e.preventDefault();
          if (numPages !== null && currentPage < numPages) {
            onNavigateToSlide(currentPage + 1);
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp': {
          e.preventDefault();
          if (numPages !== null && currentPage > 1) {
            onNavigateToSlide(currentPage - 1);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (numPages !== null && currentPage > 1) {
            onNavigateToSlide(1);
          }
          break;
        }
        case 'End': {
          e.preventDefault();
          if (numPages !== null && currentPage < numPages) {
            onNavigateToSlide(numPages);
          }
          break;
        }
        case 'b':
        case 'B':
        case '.': {
          e.preventDefault();
          onToggleCurtain('black');
          break;
        }
        case 'w':
        case 'W': {
          e.preventDefault();
          onToggleCurtain('white');
          break;
        }
        case 'f':
        case 'F': {
          e.preventDefault();
          onToggleFreeze();
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          onToggleTool('laser');
          break;
        }
        case 'd':
        case 'D': {
          e.preventDefault();
          onToggleTool('pen');
          break;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          onToggleTool('spotlight');
          break;
        }
        case 'z':
        case 'Z': {
          e.preventDefault();
          onToggleZoomMode?.();
          break;
        }
        case 'c':
        case 'C': {
          e.preventDefault();
          onClearInk();
          break;
        }
        case 'h':
        case 'H': {
          e.preventDefault();
          onToggleInkVisibility();
          break;
        }
        case '[':
        case '{':
        case '「':
        case '［': {
          e.preventDefault();
          onAdjustSpotlightRadius(-0.04);
          break;
        }
        case ']':
        case '}':
        case '」':
        case '］': {
          e.preventDefault();
          onAdjustSpotlightRadius(0.04);
          break;
        }
        case '+':
        case '=': {
          e.preventDefault();
          onAdjustPenSize(0.004);
          break;
        }
        case '-':
        case '_': {
          e.preventDefault();
          onAdjustPenSize(-0.004);
          break;
        }
        case 'g':
        case 'G':
        case 'Tab': {
          if (e.key === 'Tab' && numPages === null) return;
          e.preventDefault();
          onSetActiveModal((prev) => (prev === 'grid' ? 'none' : 'grid'));
          break;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          onSetActiveModal((prev) => (prev === 'outline' ? 'none' : 'outline'));
          break;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          if (numPages !== null) {
            onOpenStatsModal();
          }
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          if (numPages !== null) onOpenNotesEditor();
          break;
        }
        case 'q':
        case 'Q': {
          e.preventDefault();
          onSetActiveModal((prev) => (prev === 'qr' ? 'none' : 'qr'));
          break;
        }
        case '?': {
          e.preventDefault();
          onSetHelpInitialTab('shortcuts');
          onSetActiveModal((prev) => (prev === 'help' ? 'none' : 'help'));
          break;
        }
        case 'i':
        case 'I': {
          e.preventDefault();
          onSetActiveModal((prev) => (prev === 'ui-guide' ? 'none' : 'ui-guide'));
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    numPages,
    currentPage,
    isEditingNotes,
    activeModal,
    curtainMode,
    pointerTool,
    zoomMode,
    zoomScale,
    onNavigateToSlide,
    onSaveNotesEditor,
    onSetActiveModal,
    onSetHelpInitialTab,
    onOpenStatsModal,
    onOpenNotesEditor,
    onToggleCurtain,
    onToggleFreeze,
    onToggleTool,
    onToggleZoomMode,
    onResetZoom,
    onClearStageOverlay,
    onClearInk,
    onToggleInkVisibility,
    onAdjustSpotlightRadius,
    onAdjustPenSize,
  ]);
}
