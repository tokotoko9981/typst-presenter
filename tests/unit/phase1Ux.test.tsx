import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/core/i18n/I18nContext.tsx';
import { SyncBridge } from '../../src/core/sync/SyncBridge.ts';
import type { CurtainMode, PointerTool } from '../../src/core/sync/types.ts';
import { AudienceView } from '../../src/features/audience/AudienceView.tsx';
import { UiGuideOverlay } from '../../src/features/presenter/UiGuideOverlay.tsx';
import {
  BlackoutScreenIcon,
  WhiteoutScreenIcon,
} from '../../src/features/presenter/components/CurtainIcons.tsx';
import {
  usePresenterShortcuts,
  type PresenterModalKind,
} from '../../src/features/presenter/hooks/usePresenterShortcuts.ts';

function ShortcutHarness(props: {
  numPages?: number | null;
  currentPage?: number;
  isEditingNotes?: boolean;
  activeModal?: PresenterModalKind;
  curtainMode?: CurtainMode;
  pointerTool?: PointerTool;
  onNavigateToSlide?: (page: number) => void;
  onSaveNotesEditor?: () => void;
  onSetActiveModal?: (val: unknown) => void;
  onToggleCurtain?: (target: 'black' | 'white') => void;
  onClearStageOverlay?: () => void;
}) {
  usePresenterShortcuts({
    numPages: props.numPages ?? 5,
    currentPage: props.currentPage ?? 3,
    isEditingNotes: props.isEditingNotes ?? false,
    activeModal: props.activeModal ?? 'none',
    curtainMode: props.curtainMode ?? 'none',
    pointerTool: props.pointerTool ?? 'none',
    onNavigateToSlide: props.onNavigateToSlide ?? vi.fn(),
    onSaveNotesEditor: props.onSaveNotesEditor ?? vi.fn(),
    onSetActiveModal: (props.onSetActiveModal ?? vi.fn()) as React.Dispatch<
      React.SetStateAction<PresenterModalKind>
    >,
    onSetHelpInitialTab: vi.fn(),
    onOpenStatsModal: vi.fn(),
    onOpenNotesEditor: vi.fn(),
    onToggleCurtain: props.onToggleCurtain ?? vi.fn(),
    onToggleFreeze: vi.fn(),
    onToggleTool: vi.fn(),
    onClearStageOverlay: props.onClearStageOverlay ?? vi.fn(),
    onClearInk: vi.fn(),
    onToggleInkVisibility: vi.fn(),
    onAdjustSpotlightRadius: vi.fn(),
    onAdjustPenSize: vi.fn(),
  });
  return <input data-testid="editable-input" aria-label="test input" />;
}

describe('Phase 1 UX — usePresenterShortcuts', () => {
  it('supports ., ArrowDown, ArrowUp, Home, and End navigation', () => {
    const onNavigateToSlide = vi.fn();
    const onToggleCurtain = vi.fn();

    render(
      <ShortcutHarness
        numPages={5}
        currentPage={3}
        onNavigateToSlide={onNavigateToSlide}
        onToggleCurtain={onToggleCurtain}
      />,
    );

    fireEvent.keyDown(window, { key: '.' });
    expect(onToggleCurtain).toHaveBeenCalledWith('black');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(onNavigateToSlide).toHaveBeenCalledWith(4);

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onNavigateToSlide).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: 'Home' });
    expect(onNavigateToSlide).toHaveBeenCalledWith(1);

    fireEvent.keyDown(window, { key: 'End' });
    expect(onNavigateToSlide).toHaveBeenCalledWith(5);
  });

  it('respects Escape priority: notes editor > modal > stage overlay, and ignores editable inputs', () => {
    const onSaveNotesEditor = vi.fn();
    const onSetActiveModal = vi.fn();
    const onClearStageOverlay = vi.fn();

    const { rerender } = render(
      <ShortcutHarness
        isEditingNotes={true}
        activeModal="help"
        curtainMode="black"
        onSaveNotesEditor={onSaveNotesEditor}
        onSetActiveModal={onSetActiveModal}
        onClearStageOverlay={onClearStageOverlay}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSaveNotesEditor).toHaveBeenCalledTimes(1);
    expect(onSetActiveModal).not.toHaveBeenCalled();
    expect(onClearStageOverlay).not.toHaveBeenCalled();

    rerender(
      <ShortcutHarness
        isEditingNotes={false}
        activeModal="help"
        curtainMode="black"
        onSaveNotesEditor={onSaveNotesEditor}
        onSetActiveModal={onSetActiveModal}
        onClearStageOverlay={onClearStageOverlay}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSetActiveModal).toHaveBeenCalledWith('none');
    expect(onClearStageOverlay).not.toHaveBeenCalled();

    rerender(
      <ShortcutHarness
        isEditingNotes={false}
        activeModal="none"
        curtainMode="black"
        pointerTool="laser"
        onSaveNotesEditor={onSaveNotesEditor}
        onSetActiveModal={onSetActiveModal}
        onClearStageOverlay={onClearStageOverlay}
      />,
    );

    const input = screen.getByTestId('editable-input');
    input.focus();
    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClearStageOverlay).not.toHaveBeenCalled();

    input.blur();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClearStageOverlay).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 1 UX — CurtainIcons', () => {
  it('renders crisp Blackout (B with center bar) and Whiteout (W) SVG icons', () => {
    const { container } = render(
      <div>
        <BlackoutScreenIcon />
        <WhiteoutScreenIcon />
      </div>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    expect(container.innerHTML).toContain('H5.8');
  });
});

describe('Phase 1 UX — UiGuideOverlay (Pattern C)', () => {
  it('merges controls sharing data-coachmark-block into one pill and handles close interactions', () => {
    const onClose = vi.fn();

    const mockRect = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    render(
      <I18nProvider>
        <div>
          <button
            type="button"
            data-coachmark-group="row2"
            data-coachmark-block="stage-curtain"
            aria-label="Blackout (B)"
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => mockRect(200, 44, 28, 28);
            }}
          >
            B
          </button>
          <button
            type="button"
            data-coachmark-group="row2"
            data-coachmark-block="stage-curtain"
            aria-label="Whiteout (W)"
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => mockRect(232, 44, 28, 28);
            }}
          >
            W
          </button>
          <button
            type="button"
            data-coachmark-group="row1"
            data-coachmark-block="deck-files"
            aria-label="Open PDF"
            ref={(el) => {
              if (el) el.getBoundingClientRect = () => mockRect(20, 6, 80, 28);
            }}
          >
            Open
          </button>
          <UiGuideOverlay onClose={onClose} />
        </div>
      </I18nProvider>,
    );

    const pills = screen.getAllByTestId('ui-guide-pill');
    expect(pills).toHaveLength(2);
    expect(pills.map((p) => p.dataset.block).sort()).toEqual(['deck-files', 'stage-curtain']);

    // Clicking inside bottom legend bar should NOT close
    fireEvent.click(screen.getByText(/UI Controls Guide|ボタン説明オーバーレイ/));
    expect(onClose).not.toHaveBeenCalled();

    // Pressing Escape closes
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking backdrop closes
    fireEvent.click(screen.getByTestId('ui-guide-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('Phase 1 UX — AudienceView fullscreen, idle cursor, and key forwarding', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
  });

  it('hides fullscreen-prompt when fullscreen and auto-hides idle cursor after 2.5s', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });

    render(
      <I18nProvider>
        <AudienceView />
      </I18nProvider>,
    );

    expect(screen.getByTestId('fullscreen-prompt')).toBeInTheDocument();
    const shell = screen.getByTestId('audience-shell');
    expect(shell).toHaveAttribute('data-cursor-hidden', 'false');

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: document.documentElement,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(screen.queryByTestId('fullscreen-prompt')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(shell).toHaveAttribute('data-cursor-hidden', 'true');
    expect(shell.className).toContain('cursor-none');

    act(() => {
      fireEvent.mouseMove(window);
    });
    expect(shell).toHaveAttribute('data-cursor-hidden', 'false');

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(screen.getByTestId('fullscreen-prompt')).toBeInTheDocument();
  });

  it('forwards presenter remote keys from AudienceView via SyncBridge', () => {
    const postSpy = vi.spyOn(SyncBridge.prototype, 'post').mockImplementation(() => {});

    render(
      <I18nProvider>
        <AudienceView />
      </I18nProvider>,
    );

    fireEvent.keyDown(window, { key: 'PageDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'PageUp' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: 'w' });

    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_NAVIGATE', delta: 1 });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_NAVIGATE', delta: -1 });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_ACTION', action: 'first' });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_ACTION', action: 'last' });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_ACTION', action: 'toggle-blackout' });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_ACTION', action: 'toggle-whiteout' });
  });

  it('toggles Tauri native fullscreen via F and exits on Escape', async () => {
    const invokeMock = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === 'is_audience_fullscreen') return false;
      return undefined;
    });
    (
      window as unknown as { __TAURI_INTERNALS__?: { invoke?: typeof invokeMock } }
    ).__TAURI_INTERNALS__ = { invoke: invokeMock };

    try {
      render(
        <I18nProvider>
          <AudienceView />
        </I18nProvider>,
      );

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'f' });
        await Promise.resolve();
      });
      expect(invokeMock).toHaveBeenCalledWith('set_audience_fullscreen', { fullscreen: true });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
        await Promise.resolve();
      });
      expect(invokeMock).toHaveBeenCalledWith('set_audience_fullscreen', { fullscreen: false });
    } finally {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });
});
