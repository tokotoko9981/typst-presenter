import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { SlideStage } from '../../components/SlideStage.tsx';
import { ThumbnailCanvas } from '../../components/ThumbnailCanvas.tsx';
import {
  FileWatchService,
  isFileSystemAccessSupported,
  pickPdfFileHandle,
} from '../../core/files/FileWatchService.ts';
import type { WatchStatus } from '../../core/files/FileWatchService.ts';
import {
  createEmptyNotesBundle,
  exportNotesToJson,
  exportNotesToMarkdown,
  exportNotesToPdfpc,
  parseSidecarFileContent,
} from '../../core/notes/NotesManager.ts';
import type { DeckNotesBundle } from '../../core/notes/types.ts';
import { PdfEngine } from '../../core/pdf/PdfEngine.ts';
import type { CropMode, LoadedDeckMeta, OutlineNode } from '../../core/pdf/types.ts';
import { resolveSplitCropRegions } from '../../core/pdf/viewportMath.ts';
import {
  isTauriRuntime,
  launchAudienceDisplay,
  listAvailableMonitors,
  selectDefaultAudienceMonitor,
  supportsWebScreenDetails,
} from '../../core/platform/DesktopBridge.ts';
import type { MonitorDescriptor } from '../../core/platform/types.ts';
import {
  clampNoteFontSize,
  DEFAULT_PREFS,
  storageService,
} from '../../core/storage/StorageService.ts';
import type { StoredDeckRecord } from '../../core/storage/types.ts';
import { SyncBridge } from '../../core/sync/SyncBridge.ts';
import type {
  CurtainMode,
  InkStroke,
  NormalizedPoint,
  PointerTool,
  SyncMessage,
} from '../../core/sync/types.ts';
import {
  exportRehearsalReportCsv,
  exportRehearsalReportMarkdown,
  RehearsalTracker,
} from '../../core/timer/RehearsalTracker.ts';
import {
  computeTimerSnapshot,
  formatCountdownMMSS,
  formatDurationMMSS,
  parseValidHHMM,
} from '../../core/timer/TimerEngine.ts';
import { RehearsalStatsModal } from './RehearsalStatsModal.tsx';

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem('typst-presenter-session-id');
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }
    const created = `sess-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('typst-presenter-session-id', created);
    return created;
  } catch {
    return 'default';
  }
}

function triggerTextDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const PEN_COLOR_SWATCHES = [
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'yellow', label: 'Yellow', hex: '#facc15' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'white', label: 'White', hex: '#ffffff' },
] as const;

function clampPenWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PREFS.penWidth;
  return Math.max(0.003, Math.min(0.032, Number(width.toFixed(4))));
}

function clampSpotlightRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DEFAULT_PREFS.spotlightRadius;
  return Math.max(0.05, Math.min(0.45, Number(radius.toFixed(4))));
}

function deriveDurationMinutesFromSlides(
  slides: Record<number, { targetSeconds?: number }> | undefined,
): number | undefined {
  if (!slides) return undefined;
  let totalSec = 0;
  for (const entry of Object.values(slides)) {
    if (entry?.targetSeconds && Number.isFinite(entry.targetSeconds) && entry.targetSeconds > 0) {
      totalSec += entry.targetSeconds;
    }
  }
  return totalSec > 0 ? Math.max(1, Math.round(totalSec / 60)) : undefined;
}

function formatWallClock(nowMs: number): string {
  const d = new Date(nowMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function PresenterConsole() {
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const engineRef = useRef<PdfEngine | null>(null);
  const syncBridgeRef = useRef<SyncBridge | null>(null);
  const fileWatchRef = useRef<FileWatchService | null>(null);
  const rehearsalTrackerRef = useRef(new RehearsalTracker());
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidecarFileInputRef = useRef<HTMLInputElement | null>(null);
  const digitBufferRef = useRef<string>('');
  const digitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStageHoverRef = useRef<NormalizedPoint | null>(null);

  if (!engineRef.current) {
    engineRef.current = new PdfEngine();
  }
  if (!fileWatchRef.current) {
    fileWatchRef.current = new FileWatchService();
  }

  // Deck & navigation state
  const [meta, setMeta] = useState<LoadedDeckMeta | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpInputText, setJumpInputText] = useState<string>('1');
  const [cropMode, setCropMode] = useState<CropMode>('full');
  const [swapSplitHalves, setSwapSplitHalves] = useState<boolean>(false);
  const [splitBannerDismissed, setSplitBannerDismissed] = useState<boolean>(false);
  const [recentDecks, setRecentDecks] = useState<StoredDeckRecord[]>([]);

  // Desktop / Multi-monitor & Guard / Watch state
  const [tauriMode] = useState<boolean>(() => isTauriRuntime());
  const [webScreenDetailsSupported] = useState<boolean>(() => supportsWebScreenDetails());
  const [monitors, setMonitors] = useState<MonitorDescriptor[]>([]);
  const [selectedMonitorIndex, setSelectedMonitorIndex] = useState<number | undefined>(undefined);
  const [guardEnabled, setGuardEnabled] = useState<boolean>(false);
  const [fsAccessSupported] = useState<boolean>(() => isFileSystemAccessSupported());
  const [pdfWatchStatus, setPdfWatchStatus] = useState<WatchStatus>(() =>
    fileWatchRef.current!.getPdfStatus(),
  );

  // Audience & Curtain / Freeze state
  const [audienceConnected, setAudienceConnected] = useState<boolean>(false);
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [curtainMode, setCurtainMode] = useState<CurtainMode>('none');
  const [frozen, setFrozen] = useState<boolean>(false);

  // Pointer & Ink annotations state
  const [pointerTool, setPointerTool] = useState<PointerTool>('none');
  const [penColor, setPenColor] = useState<string>(DEFAULT_PREFS.penColor);
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PREFS.penWidth);
  const [laserPoint, setLaserPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightPoint, setSpotlightPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightRadius, setSpotlightRadius] = useState<number>(DEFAULT_PREFS.spotlightRadius);
  const [strokesByPage, setStrokesByPage] = useState<Record<number, InkStroke[]>>({});
  const [inkVisible, setInkVisible] = useState<boolean>(true);

  // Notes state
  const [notesBundle, setNotesBundle] = useState<DeckNotesBundle | null>(null);
  const [noteFontSizePx, setNoteFontSizePx] = useState<number>(DEFAULT_PREFS.noteFontSizePx);
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [draftNoteText, setDraftNoteText] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Timer state
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [accumulatedElapsedMs, setAccumulatedElapsedMs] = useState<number>(0);
  const [lastResumeMs, setLastResumeMs] = useState<number | null>(null);
  const [slideAccumulatedMs, setSlideAccumulatedMs] = useState<number>(0);
  const [slideLastResumeMs, setSlideLastResumeMs] = useState<number | null>(null);
  const [countdownMinutes, setCountdownMinutes] = useState<number>(DEFAULT_PREFS.countdownMinutes);
  const [countdownInputText, setCountdownInputText] = useState<string>(
    String(DEFAULT_PREFS.countdownMinutes),
  );
  const [lastMinutesWarning, setLastMinutesWarning] = useState<number>(
    DEFAULT_PREFS.lastMinutesWarning,
  );
  const [lastMinutesInputText, setLastMinutesInputText] = useState<string>(
    String(DEFAULT_PREFS.lastMinutesWarning),
  );
  const [endTimeHHMM, setEndTimeHHMM] = useState<string>('');
  const [slideTargetInputText, setSlideTargetInputText] = useState<string>('');
  const [autoStartTimerOnFirstNav, setAutoStartTimerOnFirstNav] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Modals / Drawers state
  const [activeModal, setActiveModal] = useState<'none' | 'grid' | 'outline' | 'help' | 'stats'>(
    'none',
  );

  // Keep latest state in refs for async / SyncBridge / FileWatch callbacks
  const notesBundleRef = useRef<DeckNotesBundle | null>(notesBundle);
  notesBundleRef.current = notesBundle;

  const stateRef = useRef({
    meta,
    currentPage,
    cropMode,
    swapSplitHalves,
    splitBannerDismissed,
    curtainMode,
    frozen,
    strokesByPage,
    inkVisible,
    pointerTool,
    laserPoint,
    spotlightPoint,
    spotlightRadius,
    timerRunning,
  });
  stateRef.current = {
    meta,
    currentPage,
    cropMode,
    swapSplitHalves,
    splitBannerDismissed,
    curtainMode,
    frozen,
    strokesByPage,
    inkVisible,
    pointerTool,
    laserPoint,
    spotlightPoint,
    spotlightRadius,
    timerRunning,
  };

  const broadcastStateSnapshot = useCallback(() => {
    const s = stateRef.current;
    const bridge = syncBridgeRef.current;
    const pageStrokes = s.strokesByPage[s.currentPage] ?? [];
    if (bridge) {
      bridge.post({
        type: 'STATE_SNAPSHOT',
        deckId: s.meta?.deckId ?? null,
        fileName: s.meta?.fileName ?? null,
        currentPage: s.currentPage,
        totalPages: s.meta?.numPages ?? 0,
        cropMode: s.cropMode,
        swapSplitHalves: s.swapSplitHalves,
        curtainMode: s.curtainMode,
        frozen: s.frozen,
        strokesForPage: pageStrokes,
        inkVisible: s.inkVisible,
        pointerTool: s.pointerTool,
        laserPoint: s.laserPoint,
        spotlightPoint: s.spotlightPoint,
        spotlightRadius: s.spotlightRadius,
      });
    }
    void storageService.saveSessionSnapshot({
      sessionId,
      deckId: s.meta?.deckId ?? null,
      fileName: s.meta?.fileName ?? null,
      currentPage: s.currentPage,
      totalPages: s.meta?.numPages ?? 0,
      cropMode: s.cropMode,
      swapSplitHalves: s.swapSplitHalves,
      curtainMode: s.curtainMode,
      frozen: s.frozen,
      updatedAt: Date.now(),
    });
  }, [sessionId]);

  // Initialize SyncBridge
  useEffect(() => {
    const bridge = new SyncBridge(sessionId, 'presenter');
    syncBridgeRef.current = bridge;

    const unsubConn = bridge.onConnectionChange((connected) => {
      setAudienceConnected(connected);
    });

    const unsubMsg = bridge.onMessage((msg: SyncMessage) => {
      if (msg.type === 'HELLO' && msg.role === 'audience') {
        broadcastStateSnapshot();
      } else if (msg.type === 'REQUEST_NAVIGATE') {
        const s = stateRef.current;
        if (!s.meta) return;
        const target = Math.max(1, Math.min(s.meta.numPages, s.currentPage + msg.delta));
        if (target !== s.currentPage) {
          rehearsalTrackerRef.current.onPageChange(target, s.timerRunning);
          setCurrentPage(target);
          setJumpInputText(String(target));
        }
      }
    });

    bridge.start();

    return () => {
      unsubConn();
      unsubMsg();
      bridge.destroy();
      syncBridgeRef.current = null;
    };
  }, [sessionId, broadcastStateSnapshot]);

  // Broadcast snapshot whenever core synchronized state changes
  useEffect(() => {
    broadcastStateSnapshot();
  }, [
    meta?.deckId,
    currentPage,
    cropMode,
    swapSplitHalves,
    curtainMode,
    frozen,
    inkVisible,
    broadcastStateSnapshot,
  ]);

  const refreshMonitors = useCallback(async () => {
    const found = await listAvailableMonitors();
    setMonitors(found);
    setSelectedMonitorIndex((prev) => {
      if (prev !== undefined && found.some((m) => m.index === prev)) {
        return prev;
      }
      return selectDefaultAudienceMonitor(found)?.index;
    });
  }, []);

  const refreshRecentDecks = useCallback(async () => {
    const list = await storageService.listDecks();
    setRecentDecks(list);
  }, []);

  useEffect(() => {
    void refreshMonitors();
  }, [refreshMonitors]);

  useEffect(() => {
    return () => {
      fileWatchRef.current?.stopAll();
    };
  }, []);

  useEffect(() => {
    if (!guardEnabled) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [guardEnabled]);

  // Restore preferences & most recent deck from IndexedDB on initial mount
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const prefs = await storageService.getPrefs();
      if (!mounted) return;
      setNoteFontSizePx(clampNoteFontSize(prefs.noteFontSizePx));
      setCountdownMinutes(prefs.countdownMinutes);
      setCountdownInputText(String(prefs.countdownMinutes));
      setLastMinutesWarning(prefs.lastMinutesWarning);
      setLastMinutesInputText(String(prefs.lastMinutesWarning));
      setEndTimeHHMM(prefs.endTimeHHMM || '');
      setAutoStartTimerOnFirstNav(Boolean(prefs.autoStartTimerOnFirstNav));
      setPenColor(prefs.penColor || DEFAULT_PREFS.penColor);
      setPenWidth(clampPenWidth(prefs.penWidth));
      setSpotlightRadius(clampSpotlightRadius(prefs.spotlightRadius));

      const decks = await storageService.listDecks();
      if (!mounted) return;
      setRecentDecks(decks);

      const recent = prefs.activeDeckId
        ? (await storageService.getDeck(prefs.activeDeckId)) ??
          (await storageService.getMostRecentDeck())
        : null;
      if (!mounted || !recent || !recent.bytes || recent.bytes.byteLength === 0) return;

      try {
        const loadedMeta = await engineRef.current!.loadDeck(recent.bytes, recent.fileName);
        if (!mounted) return;
        const restoredPage = Math.max(
          1,
          Math.min(loadedMeta.numPages, recent.currentPage ?? 1),
        );
        const restoredCrop = recent.cropMode ?? 'full';
        const restoredSwap = Boolean(recent.swapSplitHalves);

        setMeta(loadedMeta);
        setCurrentPage(restoredPage);
        setJumpInputText(String(restoredPage));
        setCropMode(restoredCrop);
        setSwapSplitHalves(restoredSwap);
        setSplitBannerDismissed(Boolean(recent.splitBannerDismissed));
        rehearsalTrackerRef.current.reset(restoredPage);

        const savedNotes = await storageService.getNotes(loadedMeta.deckId);
        let activeNotes = savedNotes;
        if (!activeNotes) {
          activeNotes = createEmptyNotesBundle(
            loadedMeta.deckId,
            loadedMeta.fileName,
            loadedMeta.extractedNotes,
            loadedMeta.extractedPdfpcConfig,
          );
          await storageService.saveNotes(activeNotes);
        }
        setNotesBundle(activeNotes);

        const derivedMin = deriveDurationMinutesFromSlides(activeNotes.slides);
        if (
          prefs.countdownMinutes === DEFAULT_PREFS.countdownMinutes &&
          derivedMin !== undefined &&
          activeNotes.globalTargetSeconds === DEFAULT_PREFS.countdownMinutes * 60
        ) {
          setCountdownMinutes(derivedMin);
          setCountdownInputText(String(derivedMin));
          const updatedBundle = { ...activeNotes, globalTargetSeconds: derivedMin * 60 };
          setNotesBundle(updatedBundle);
          await storageService.saveNotes(updatedBundle);
        } else if (
          prefs.countdownMinutes === DEFAULT_PREFS.countdownMinutes &&
          activeNotes.globalTargetSeconds > 0 &&
          activeNotes.globalTargetSeconds !== DEFAULT_PREFS.countdownMinutes * 60
        ) {
          const bundleMin = Math.max(1, Math.round(activeNotes.globalTargetSeconds / 60));
          setCountdownMinutes(bundleMin);
          setCountdownInputText(String(bundleMin));
        }
      } catch {
        // Ignore corrupt cached deck on startup
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Interval tick for timer & wall clock
  useEffect(() => {
    const intervalMs = timerRunning ? 200 : 1000;
    const id = setInterval(() => {
      setNowTick(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [timerRunning]);

  const startTimer = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    rehearsalTrackerRef.current.start(stateRef.current.currentPage, now);
    setTimerRunning((alreadyRunning) => {
      if (alreadyRunning) return true;
      setLastResumeMs(now);
      setSlideLastResumeMs(now);
      return true;
    });
  }, []);

  const pauseTimer = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    rehearsalTrackerRef.current.pause(now);
    setTimerRunning((wasRunning) => {
      if (!wasRunning) return false;
      setAccumulatedElapsedMs((prev) =>
        lastResumeMs !== null ? prev + Math.max(0, now - lastResumeMs) : prev,
      );
      setSlideAccumulatedMs((prev) =>
        slideLastResumeMs !== null ? prev + Math.max(0, now - slideLastResumeMs) : prev,
      );
      setLastResumeMs(null);
      setSlideLastResumeMs(null);
      return false;
    });
  }, [lastResumeMs, slideLastResumeMs]);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    rehearsalTrackerRef.current.reset(stateRef.current.currentPage);
    setTimerRunning(false);
    setAccumulatedElapsedMs(0);
    setLastResumeMs(null);
    setSlideAccumulatedMs(0);
    setSlideLastResumeMs(null);
  }, []);

  // Navigate to a specific slide (1-based)
  const navigateToSlide = useCallback(
    (targetPage: number) => {
      if (!meta) return;
      const clamped = Math.max(1, Math.min(meta.numPages, Math.trunc(targetPage)));
      if (!Number.isFinite(clamped)) return;

      const now = Date.now();
      setNowTick(now);
      setSlideAccumulatedMs(0);
      setSlideLastResumeMs(timerRunning ? now : null);

      const willAutoStart = autoStartTimerOnFirstNav && !timerRunning && clamped !== currentPage;
      const nextRunning = timerRunning || willAutoStart;
      rehearsalTrackerRef.current.onPageChange(clamped, nextRunning, now);

      if (willAutoStart) {
        setTimerRunning(true);
        setLastResumeMs(now);
        setSlideLastResumeMs(now);
      }

      setCurrentPage(clamped);
      setJumpInputText(String(clamped));

      void storageService.updateDeckState(meta.deckId, { currentPage: clamped });

      if (!frozen) {
        syncBridgeRef.current?.post({
          type: 'NAVIGATE',
          page: clamped,
          strokesForPage: strokesByPage[clamped] ?? [],
        });
      }
    },
    [meta, timerRunning, autoStartTimerOnFirstNav, currentPage, frozen, strokesByPage],
  );

  const applySidecarContent = useCallback(
    async (
      text: string,
      sidecarName: string,
      targetDeckId: string,
      targetFileName: string,
    ): Promise<DeckNotesBundle> => {
      const parsed = parseSidecarFileContent(text, sidecarName);
      const effectiveDuration =
        parsed.durationMinutes ?? deriveDurationMinutesFromSlides(parsed.slides);
      const nextDuration = effectiveDuration ?? countdownMinutes;
      const nextWarning = parsed.lastMinutesWarning ?? lastMinutesWarning;
      const nextFont = parsed.noteFontSizePx
        ? clampNoteFontSize(parsed.noteFontSizePx)
        : noteFontSizePx;
      const nextEndTime =
        parsed.endTimeHHMM ?? (effectiveDuration !== undefined ? '' : endTimeHHMM);

      if (effectiveDuration !== undefined) {
        setCountdownMinutes(effectiveDuration);
        setCountdownInputText(String(effectiveDuration));
        setEndTimeHHMM('');
      }
      if (parsed.lastMinutesWarning !== undefined) {
        setLastMinutesWarning(parsed.lastMinutesWarning);
        setLastMinutesInputText(String(parsed.lastMinutesWarning));
      }
      if (parsed.noteFontSizePx !== undefined) {
        setNoteFontSizePx(nextFont);
      }
      if (parsed.endTimeHHMM !== undefined) {
        setEndTimeHHMM(parsed.endTimeHHMM);
      }

      await storageService.savePrefs({
        countdownMinutes: nextDuration,
        lastMinutesWarning: nextWarning,
        noteFontSizePx: nextFont,
        endTimeHHMM: nextEndTime,
      });

      const updatedBundle: DeckNotesBundle = {
        version: 1,
        deckId: targetDeckId,
        fileName: targetFileName,
        globalTargetSeconds: nextDuration * 60,
        lastMinutesWarning: nextWarning,
        ...(nextEndTime ? { endTimeHHMM: nextEndTime } : {}),
        noteFontSizePx: nextFont,
        slides: parsed.slides,
      };
      setNotesBundle(updatedBundle);
      await storageService.saveNotes(updatedBundle);
      return updatedBundle;
    },
    [countdownMinutes, lastMinutesWarning, noteFontSizePx, endTimeHHMM],
  );

  // Load a PDF from ArrayBuffer
  const ingestPdfBytes = useCallback(
    async (
      bytes: ArrayBuffer,
      fileName: string,
      pairedSidecar?: { text: string; name: string },
    ): Promise<void> => {
      setErrorMessage(null);
      setInfoMessage(null);

      if (!bytes || bytes.byteLength === 0) {
        setErrorMessage('Error: Invalid or empty PDF file (0 bytes).');
        return;
      }

      try {
        const clonedForStorage = bytes.slice(0);
        const loadedMeta = await engineRef.current!.loadDeck(bytes, fileName);

        setMeta(loadedMeta);
        setCurrentPage(1);
        setJumpInputText('1');
        setCropMode('full');
        setSwapSplitHalves(false);
        setSplitBannerDismissed(false);
        setStrokesByPage({});
        setIsEditingNotes(false);
        rehearsalTrackerRef.current.reset(1);

        await storageService.saveDeck({
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
          bytes: clonedForStorage,
          lastOpenedAt: Date.now(),
          currentPage: 1,
          cropMode: 'full',
          swapSplitHalves: false,
          splitBannerDismissed: false,
        });
        await storageService.savePrefs({ activeDeckId: loadedMeta.deckId });
        await refreshRecentDecks();

        let bundle = await storageService.getNotes(loadedMeta.deckId);
        if (pairedSidecar) {
          bundle = await applySidecarContent(
            pairedSidecar.text,
            pairedSidecar.name,
            loadedMeta.deckId,
            loadedMeta.fileName,
          );
        } else if (!bundle) {
          bundle = createEmptyNotesBundle(
            loadedMeta.deckId,
            loadedMeta.fileName,
            loadedMeta.extractedNotes,
            loadedMeta.extractedPdfpcConfig,
          );
          await storageService.saveNotes(bundle);
        }

        if (!pairedSidecar) {
          const derivedFromSlides = deriveDurationMinutesFromSlides(bundle.slides);
          const embeddedOrDerivedDuration =
            loadedMeta.extractedPdfpcConfig?.durationMinutes ??
            (bundle.globalTargetSeconds !== DEFAULT_PREFS.countdownMinutes * 60
              ? Math.max(1, Math.round(bundle.globalTargetSeconds / 60))
              : derivedFromSlides);

          if (embeddedOrDerivedDuration !== undefined) {
            setCountdownMinutes(embeddedOrDerivedDuration);
            setCountdownInputText(String(embeddedOrDerivedDuration));
            setEndTimeHHMM('');
            await storageService.savePrefs({
              countdownMinutes: embeddedOrDerivedDuration,
              endTimeHHMM: '',
            });
            if (bundle.globalTargetSeconds !== embeddedOrDerivedDuration * 60) {
              bundle = { ...bundle, globalTargetSeconds: embeddedOrDerivedDuration * 60 };
              await storageService.saveNotes(bundle);
            }
          }
          if (loadedMeta.extractedPdfpcConfig?.lastMinutes !== undefined) {
            setLastMinutesWarning(loadedMeta.extractedPdfpcConfig.lastMinutes);
            setLastMinutesInputText(String(loadedMeta.extractedPdfpcConfig.lastMinutes));
          }
          if (loadedMeta.extractedPdfpcConfig?.noteFontSize) {
            const clampedFont = clampNoteFontSize(loadedMeta.extractedPdfpcConfig.noteFontSize);
            setNoteFontSizePx(clampedFont);
          }
          setNotesBundle(bundle);
        }

        syncBridgeRef.current?.post({
          type: 'DECK_READY',
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
        });
      } catch (err) {
        setErrorMessage(
          `Error: Failed to load invalid or corrupt PDF "${fileName}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    },
    [applySidecarContent, refreshRecentDecks],
  );

  const hotReloadPdfBytes = useCallback(
    async (bytes: ArrayBuffer, fileName: string): Promise<void> => {
      setErrorMessage(null);
      if (!bytes || bytes.byteLength === 0) {
        return;
      }
      try {
        const clonedForStorage = bytes.slice(0);
        const loadedMeta = await engineRef.current!.loadDeck(bytes, fileName);
        const s = stateRef.current;
        const clampedPage = Math.max(
          1,
          Math.min(loadedMeta.numPages, s.meta ? s.currentPage : 1),
        );
        const keptCropMode = s.meta ? s.cropMode : 'full';
        const keptSwap = s.meta ? s.swapSplitHalves : false;
        const keptSplitDismissed = s.meta ? s.splitBannerDismissed : false;

        const nextStrokesByPage: Record<number, InkStroke[]> = {};
        for (const [pageKey, list] of Object.entries(s.strokesByPage)) {
          const p = Number.parseInt(pageKey, 10);
          if (Number.isInteger(p) && p >= 1 && p <= loadedMeta.numPages && list.length > 0) {
            nextStrokesByPage[p] = list;
          }
        }

        const prevBundle = notesBundleRef.current;
        let updatedNotes: DeckNotesBundle;
        if (prevBundle) {
          updatedNotes = {
            ...prevBundle,
            deckId: loadedMeta.deckId,
            fileName: loadedMeta.fileName,
          };
          await storageService.saveNotes(updatedNotes);
        } else {
          const saved = await storageService.getNotes(loadedMeta.deckId);
          if (saved) {
            updatedNotes = saved;
          } else {
            updatedNotes = createEmptyNotesBundle(
              loadedMeta.deckId,
              loadedMeta.fileName,
              loadedMeta.extractedNotes,
              loadedMeta.extractedPdfpcConfig,
            );
            await storageService.saveNotes(updatedNotes);
          }
        }

        await storageService.saveDeck({
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
          bytes: clonedForStorage,
          lastOpenedAt: Date.now(),
          currentPage: clampedPage,
          cropMode: keptCropMode,
          swapSplitHalves: keptSwap,
          splitBannerDismissed: keptSplitDismissed,
        });
        await storageService.savePrefs({ activeDeckId: loadedMeta.deckId });
        await refreshRecentDecks();

        stateRef.current = {
          ...stateRef.current,
          meta: loadedMeta,
          currentPage: clampedPage,
          cropMode: keptCropMode,
          swapSplitHalves: keptSwap,
          splitBannerDismissed: keptSplitDismissed,
          strokesByPage: nextStrokesByPage,
        };

        setMeta(loadedMeta);
        setCurrentPage(clampedPage);
        setJumpInputText(String(clampedPage));
        setCropMode(keptCropMode);
        setSwapSplitHalves(keptSwap);
        setSplitBannerDismissed(keptSplitDismissed);
        setStrokesByPage(nextStrokesByPage);
        setNotesBundle(updatedNotes);

        syncBridgeRef.current?.post({
          type: 'DECK_READY',
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
        });
        broadcastStateSnapshot();
      } catch (err) {
        setErrorMessage(
          `Error: Failed to reload PDF "${fileName}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    },
    [broadcastStateSnapshot, refreshRecentDecks],
  );

  const handleToggleWatchPdf = useCallback(async () => {
    const watcher = fileWatchRef.current;
    if (!watcher) return;

    if (watcher.getPdfStatus().active) {
      watcher.stopPdfWatch();
      setPdfWatchStatus(watcher.getPdfStatus());
      setInfoMessage('Stopped watching PDF file.');
      return;
    }

    setErrorMessage(null);
    try {
      const handle = await pickPdfFileHandle();
      if (!handle) {
        return;
      }
      let isFirstCallback = true;
      await watcher.watchPdf(
        handle,
        async (bytes, fileName) => {
          const wasFirst = isFirstCallback;
          isFirstCallback = false;
          if (wasFirst && !stateRef.current.meta) {
            await ingestPdfBytes(bytes, fileName);
            setInfoMessage(`Watching ${fileName} for changes.`);
            return;
          }
          await hotReloadPdfBytes(bytes, fileName);
          setInfoMessage(
            wasFirst ? `Watching ${fileName} for changes.` : `Auto-reloaded ${fileName}`,
          );
        },
        (status) => {
          setPdfWatchStatus(status);
          if (status.error) {
            setErrorMessage(`Error: File watch failed (${status.error}).`);
          }
        },
      );
    } catch (err) {
      setErrorMessage(
        `Error: Failed to start PDF watch (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }, [ingestPdfBytes, hotReloadPdfBytes]);

  const handleOpenRecentDeck = useCallback(
    async (deckId: string) => {
      setErrorMessage(null);
      setInfoMessage(null);
      const record = await storageService.getDeck(deckId);
      if (!record || !record.bytes || record.bytes.byteLength === 0) {
        setErrorMessage('Error: Stored deck is no longer available.');
        await refreshRecentDecks();
        return;
      }

      try {
        const clonedForStorage = record.bytes.slice(0);
        const loadedMeta = await engineRef.current!.loadDeck(record.bytes, record.fileName);
        const restoredPage = Math.max(
          1,
          Math.min(loadedMeta.numPages, record.currentPage ?? 1),
        );
        const restoredCrop = record.cropMode ?? 'full';
        const restoredSwap = Boolean(record.swapSplitHalves);
        const restoredDismissed = Boolean(record.splitBannerDismissed);

        setMeta(loadedMeta);
        setCurrentPage(restoredPage);
        setJumpInputText(String(restoredPage));
        setCropMode(restoredCrop);
        setSwapSplitHalves(restoredSwap);
        setSplitBannerDismissed(restoredDismissed);
        setStrokesByPage({});
        setIsEditingNotes(false);
        rehearsalTrackerRef.current.reset(restoredPage);

        await storageService.saveDeck({
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
          bytes: clonedForStorage,
          lastOpenedAt: Date.now(),
          currentPage: restoredPage,
          cropMode: restoredCrop,
          swapSplitHalves: restoredSwap,
          splitBannerDismissed: restoredDismissed,
        });
        await storageService.savePrefs({ activeDeckId: loadedMeta.deckId });
        await refreshRecentDecks();

        const savedNotes = await storageService.getNotes(loadedMeta.deckId);
        let activeNotes = savedNotes;
        if (!activeNotes) {
          activeNotes = createEmptyNotesBundle(
            loadedMeta.deckId,
            loadedMeta.fileName,
            loadedMeta.extractedNotes,
            loadedMeta.extractedPdfpcConfig,
          );
          await storageService.saveNotes(activeNotes);
        }
        setNotesBundle(activeNotes);

        const derivedMin = deriveDurationMinutesFromSlides(activeNotes.slides);
        const targetMin =
          activeNotes.globalTargetSeconds !== DEFAULT_PREFS.countdownMinutes * 60
            ? Math.max(1, Math.round(activeNotes.globalTargetSeconds / 60))
            : derivedMin;
        if (targetMin !== undefined) {
          setCountdownMinutes(targetMin);
          setCountdownInputText(String(targetMin));
          setEndTimeHHMM('');
          await storageService.savePrefs({ countdownMinutes: targetMin, endTimeHHMM: '' });
          if (activeNotes.globalTargetSeconds !== targetMin * 60) {
            const updatedBundle = { ...activeNotes, globalTargetSeconds: targetMin * 60 };
            setNotesBundle(updatedBundle);
            await storageService.saveNotes(updatedBundle);
          }
        }

        syncBridgeRef.current?.post({
          type: 'DECK_READY',
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          byteLength: loadedMeta.byteLength,
        });
      } catch (err) {
        setErrorMessage(
          `Error: Failed to restore recent deck "${record.fileName}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    },
    [refreshRecentDecks],
  );

  const handleDeleteRecentDeck = useCallback(
    async (deckId: string) => {
      await storageService.deleteDeck(deckId);
      await refreshRecentDecks();
    },
    [refreshRecentDecks],
  );

  const handleCloseDeck = useCallback(async () => {
    fileWatchRef.current?.stopPdfWatch();
    if (fileWatchRef.current) {
      setPdfWatchStatus(fileWatchRef.current.getPdfStatus());
    }
    resetTimer();
    setMeta(null);
    setNotesBundle(null);
    setIsEditingNotes(false);
    setActiveModal('none');
    setInfoMessage(null);
    setErrorMessage(null);
    await storageService.savePrefs({ activeDeckId: null });
    await refreshRecentDecks();
  }, [refreshRecentDecks, resetTimer]);

  const handleLoadSampleDeck = useCallback(async () => {
    setErrorMessage(null);
    try {
      const [pdfRes, notesRes] = await Promise.all([
        fetch('/sample-deck.pdf'),
        fetch('/sample-notes.md').catch(() => null),
      ]);
      if (!pdfRes.ok) {
        throw new Error(`HTTP ${pdfRes.status}`);
      }
      const pdfBytes = await pdfRes.arrayBuffer();
      const mdText = notesRes && notesRes.ok ? await notesRes.text() : undefined;
      await ingestPdfBytes(
        pdfBytes,
        'sample-deck.pdf',
        mdText ? { text: mdText, name: 'sample-notes.md' } : undefined,
      );
    } catch (err) {
      setErrorMessage(
        `Error: Failed to load sample deck (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }, [ingestPdfBytes]);

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size === 0) {
      setErrorMessage(`Error: Empty PDF file "${file.name}" (0 bytes).`);
      return;
    }
    const buf = await file.arrayBuffer();
    await ingestPdfBytes(buf, file.name);
  };

  const handleSidecarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const text = await file.text();
      await applySidecarContent(
        text,
        file.name,
        meta?.deckId ?? 'unloaded-deck',
        meta?.fileName ?? 'deck.pdf',
      );
    } catch (err) {
      setErrorMessage(
        `Error: Failed to parse sidecar file "${file.name}" (${
          err instanceof Error ? err.message : String(err)
        }).`,
      );
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    const pdfFile = files.find(
      (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf',
    );
    const sidecarFile = files.find((f) =>
      /\.(md|markdown|json|pdfpc)$/i.test(f.name.toLowerCase()),
    );

    if (pdfFile) {
      if (pdfFile.size === 0) {
        setErrorMessage(`Error: Empty PDF file "${pdfFile.name}" (0 bytes).`);
        return;
      }
      const buf = await pdfFile.arrayBuffer();
      const sidecarText = sidecarFile ? await sidecarFile.text() : undefined;
      await ingestPdfBytes(
        buf,
        pdfFile.name,
        sidecarFile && sidecarText !== undefined
          ? { text: sidecarText, name: sidecarFile.name }
          : undefined,
      );
    } else if (sidecarFile && meta) {
      setErrorMessage(null);
      setInfoMessage(null);
      try {
        const text = await sidecarFile.text();
        await applySidecarContent(text, sidecarFile.name, meta.deckId, meta.fileName);
      } catch (err) {
        setErrorMessage(
          `Error: Invalid notes file "${sidecarFile.name}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    }
  };

  const handleLaunchAudienceWindow = async () => {
    const base = window.location.href.split('#')[0] ?? window.location.origin + '/';
    const url = `${base}#/audience?session=${encodeURIComponent(sessionId)}`;
    const result = await launchAudienceDisplay({
      sessionId,
      audienceUrl: url,
      monitorIndex: selectedMonitorIndex,
      fullscreen: isTauriRuntime(),
    });
    if (!result.opened && result.popupBlockedUrl) {
      setPopupBlockedUrl(result.popupBlockedUrl);
    } else if (result.opened) {
      setPopupBlockedUrl(null);
      setTimeout(() => broadcastStateSnapshot(), 150);
    } else {
      setErrorMessage('Error: Failed to open Audience display window.');
    }
  };

  const handleSelectCropMode = (nextMode: CropMode) => {
    setCropMode(nextMode);
    if (meta) {
      void storageService.updateDeckState(meta.deckId, { cropMode: nextMode });
    }
    syncBridgeRef.current?.post({
      type: 'CROP_MODE',
      cropMode: nextMode,
      swapSplitHalves,
    });
  };

  const handleToggleSwapSplit = () => {
    if (cropMode === 'full') return;
    const nextSwap = !swapSplitHalves;
    setSwapSplitHalves(nextSwap);
    if (meta) {
      void storageService.updateDeckState(meta.deckId, { swapSplitHalves: nextSwap });
    }
    syncBridgeRef.current?.post({
      type: 'CROP_MODE',
      cropMode,
      swapSplitHalves: nextSwap,
    });
  };

  const handleToggleCurtain = useCallback(
    (target: 'black' | 'white') => {
      setCurtainMode((prev) => {
        const next: CurtainMode = prev === target ? 'none' : target;
        syncBridgeRef.current?.post({ type: 'CURTAIN', mode: next });
        return next;
      });
    },
    [],
  );

  const handleToggleFreeze = useCallback(() => {
    setFrozen((prev) => {
      const next = !prev;
      syncBridgeRef.current?.post({ type: 'FREEZE', frozen: next });
      if (!next && meta) {
        syncBridgeRef.current?.post({
          type: 'NAVIGATE',
          page: currentPage,
          strokesForPage: strokesByPage[currentPage] ?? [],
        });
      }
      return next;
    });
  }, [meta, currentPage, strokesByPage]);

  const handleToggleTool = useCallback(
    (tool: PointerTool) => {
      setPointerTool((prev) => {
        const next: PointerTool = prev === tool ? 'none' : tool;
        if (next === 'laser') {
          const initialPt = lastStageHoverRef.current;
          setLaserPoint(initialPt);
          syncBridgeRef.current?.post({
            type: 'LASER_MOVE',
            active: initialPt !== null,
            point: initialPt,
          });
        } else if (prev === 'laser') {
          setLaserPoint(null);
          syncBridgeRef.current?.post({ type: 'LASER_MOVE', active: false, point: null });
        }

        if (next === 'spotlight') {
          const initialSpot = lastStageHoverRef.current ?? spotlightPoint ?? { x: 0.5, y: 0.5 };
          setSpotlightPoint(initialSpot);
          syncBridgeRef.current?.post({
            type: 'SPOTLIGHT_MOVE',
            active: true,
            point: initialSpot,
            radius: spotlightRadius,
          });
        } else if (prev === 'spotlight') {
          setSpotlightPoint(null);
          syncBridgeRef.current?.post({
            type: 'SPOTLIGHT_MOVE',
            active: false,
            point: null,
            radius: spotlightRadius,
          });
        }
        return next;
      });
    },
    [spotlightPoint, spotlightRadius],
  );

  const handleAdjustPenSize = useCallback((delta: number) => {
    setPenWidth((prev) => {
      const next = clampPenWidth(prev + delta);
      void storageService.savePrefs({ penWidth: next });
      return next;
    });
  }, []);

  const handleSelectPenColor = useCallback((color: string) => {
    setPenColor(color);
    void storageService.savePrefs({ penColor: color });
  }, []);

  const handleToggleInkVisibility = useCallback(() => {
    setInkVisible((prev) => {
      const next = !prev;
      syncBridgeRef.current?.post({ type: 'INK_VISIBILITY', visible: next });
      return next;
    });
  }, []);

  const handleAdjustSpotlightRadius = useCallback((delta: number) => {
    const next = clampSpotlightRadius(stateRef.current.spotlightRadius + delta);
    stateRef.current.spotlightRadius = next;
    setSpotlightRadius(next);
    void storageService.savePrefs({ spotlightRadius: next });
    if (stateRef.current.pointerTool === 'spotlight') {
      const pt = stateRef.current.spotlightPoint ?? { x: 0.5, y: 0.5 };
      syncBridgeRef.current?.post({
        type: 'SPOTLIGHT_MOVE',
        active: true,
        point: pt,
        radius: next,
      });
    }
  }, []);

  const handleStrokeLiveUpdate = useCallback((stroke: InkStroke) => {
    syncBridgeRef.current?.post({ type: 'STROKE_UPDATE', stroke });
  }, []);

  const handleStrokeCommit = useCallback((stroke: InkStroke) => {
    setStrokesByPage((prev) => {
      const existing = prev[stroke.page] ?? [];
      const next = [...existing, stroke];
      return { ...prev, [stroke.page]: next };
    });
    syncBridgeRef.current?.post({ type: 'STROKE_ADD', stroke });
  }, []);

  const handleUndoStroke = useCallback(() => {
    setStrokesByPage((prev) => {
      const existing = prev[currentPage] ?? [];
      if (existing.length === 0) return prev;
      return { ...prev, [currentPage]: existing.slice(0, -1) };
    });
    syncBridgeRef.current?.post({ type: 'STROKE_UNDO', page: currentPage });
  }, [currentPage]);

  const handleClearInk = useCallback(() => {
    setStrokesByPage((prev) => {
      if (!prev[currentPage] || prev[currentPage]!.length === 0) return prev;
      return { ...prev, [currentPage]: [] };
    });
    syncBridgeRef.current?.post({ type: 'STROKE_CLEAR', page: currentPage });
  }, [currentPage]);

  // Notes actions
  const currentSlideEntry = notesBundle?.slides[currentPage];
  const currentSlideMarkdown = currentSlideEntry?.markdown ?? '';

  useEffect(() => {
    setSlideTargetInputText(
      currentSlideEntry?.targetSeconds ? String(currentSlideEntry.targetSeconds) : '',
    );
  }, [currentPage, currentSlideEntry?.targetSeconds]);

  const commitSlideTargetInput = useCallback(
    async (raw: string) => {
      if (!meta) return;
      const trimmed = raw.trim();
      const parsed = trimmed === '' ? 0 : Number.parseInt(trimmed, 10);
      const nextSeconds = Number.isFinite(parsed) && parsed > 0 ? Math.min(3600, parsed) : undefined;
      setSlideTargetInputText(nextSeconds !== undefined ? String(nextSeconds) : '');

      const baseBundle =
        notesBundle ??
        createEmptyNotesBundle(meta.deckId, meta.fileName, meta.extractedNotes);
      const prevEntry = baseBundle.slides[currentPage];
      const nextEntry = {
        markdown: prevEntry?.markdown ?? '',
        ...(nextSeconds !== undefined ? { targetSeconds: nextSeconds } : {}),
        updatedAt: Date.now(),
      };
      const updatedBundle: DeckNotesBundle = {
        ...baseBundle,
        slides: {
          ...baseBundle.slides,
          [currentPage]: nextEntry,
        },
      };
      setNotesBundle(updatedBundle);
      await storageService.saveNotes(updatedBundle);
    },
    [meta, notesBundle, currentPage],
  );

  const openNotesEditor = useCallback(() => {
    setDraftNoteText(currentSlideMarkdown);
    setIsEditingNotes(true);
  }, [currentSlideMarkdown]);

  const saveNotesEditor = useCallback(async () => {
    if (!meta) {
      setIsEditingNotes(false);
      return;
    }
    const baseBundle =
      notesBundle ??
      createEmptyNotesBundle(meta.deckId, meta.fileName, meta.extractedNotes);
    const updatedBundle: DeckNotesBundle = {
      ...baseBundle,
      slides: {
        ...baseBundle.slides,
        [currentPage]: {
          markdown: draftNoteText,
          ...(baseBundle.slides[currentPage]?.targetSeconds !== undefined
            ? { targetSeconds: baseBundle.slides[currentPage]!.targetSeconds }
            : {}),
          updatedAt: Date.now(),
        },
      },
    };
    setNotesBundle(updatedBundle);
    setIsEditingNotes(false);
    await storageService.saveNotes(updatedBundle);
  }, [meta, notesBundle, currentPage, draftNoteText]);

  const handleAdjustFontSize = async (delta: number) => {
    const nextPx = clampNoteFontSize(noteFontSizePx + delta);
    setNoteFontSizePx(nextPx);
    await storageService.savePrefs({ noteFontSizePx: nextPx });
    if (notesBundle) {
      const updated = { ...notesBundle, noteFontSizePx: nextPx };
      setNotesBundle(updated);
      await storageService.saveNotes(updated);
    }
  };

  const handleImportEmbeddedNotes = async () => {
    if (!meta) return;
    const extractedEntries = Object.entries(meta.extractedNotes ?? {});
    if (extractedEntries.length === 0) {
      setInfoMessage('No embedded notes found in this PDF (埋め込みノートが見つかりません).');
      return;
    }
    const freshBundle = createEmptyNotesBundle(
      meta.deckId,
      meta.fileName,
      meta.extractedNotes,
      meta.extractedPdfpcConfig,
    );
    setNotesBundle(freshBundle);
    await storageService.saveNotes(freshBundle);
    setInfoMessage(`Imported embedded notes for ${extractedEntries.length} slide(s).`);
  };

  const handleExportNotes = (format: 'md' | 'json' | 'pdfpc') => {
    const baseName = (meta?.fileName ?? 'deck').replace(/\.pdf$/i, '');
    const bundle =
      notesBundle ??
      createEmptyNotesBundle(meta?.deckId ?? 'deck', meta?.fileName ?? 'deck.pdf');
    const numPages = meta?.numPages ?? 1;

    if (format === 'md') {
      const content = exportNotesToMarkdown(bundle, numPages);
      triggerTextDownload(`${baseName}-notes.md`, content, 'text/markdown;charset=utf-8');
    } else if (format === 'json') {
      const content = exportNotesToJson(bundle);
      triggerTextDownload(`${baseName}-notes.json`, content, 'application/json;charset=utf-8');
    } else {
      const content = exportNotesToPdfpc(bundle, numPages, meta?.pageLabels);
      triggerTextDownload(`${baseName}.pdfpc`, content, 'application/json;charset=utf-8');
    }
  };

  const handleApplyActualAsTargets = useCallback(
    async (targets: Record<number, number>) => {
      if (!meta) return;
      const baseBundle =
        notesBundle ??
        createEmptyNotesBundle(
          meta.deckId,
          meta.fileName,
          meta.extractedNotes,
          meta.extractedPdfpcConfig,
        );
      const now = Date.now();
      const nextSlides = { ...baseBundle.slides };
      let appliedCount = 0;

      for (const [pageStr, seconds] of Object.entries(targets)) {
        const pageNum = Number.parseInt(pageStr, 10);
        if (!Number.isInteger(pageNum) || pageNum < 1) continue;
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        const existing = nextSlides[pageNum];
        nextSlides[pageNum] = {
          markdown: existing?.markdown ?? '',
          targetSeconds: Math.round(seconds),
          updatedAt: now,
        };
        appliedCount += 1;
      }

      const updatedBundle: DeckNotesBundle = {
        ...baseBundle,
        slides: nextSlides,
      };
      setNotesBundle(updatedBundle);
      await storageService.saveNotes(updatedBundle);
      setInfoMessage(
        `Applied actual rehearsal times as slide targets for ${appliedCount} slide(s).`,
      );
    },
    [meta, notesBundle],
  );

  // Focus-safe global keyboard shortcuts
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
          void saveNotesEditor();
          return;
        }
        if (activeModal !== 'none') {
          e.preventDefault();
          setActiveModal('none');
          return;
        }
      }

      if (inEditable || isEditingNotes) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
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
        if (meta && target >= 1 && target <= meta.numPages) {
          navigateToSlide(target);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ': {
          e.preventDefault();
          if (meta && currentPage < meta.numPages) {
            navigateToSlide(currentPage + 1);
          }
          break;
        }
        case 'ArrowLeft':
        case 'PageUp': {
          e.preventDefault();
          if (meta && currentPage > 1) {
            navigateToSlide(currentPage - 1);
          }
          break;
        }
        case 'b':
        case 'B': {
          e.preventDefault();
          handleToggleCurtain('black');
          break;
        }
        case 'w':
        case 'W': {
          e.preventDefault();
          handleToggleCurtain('white');
          break;
        }
        case 'f':
        case 'F': {
          e.preventDefault();
          handleToggleFreeze();
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          handleToggleTool('laser');
          break;
        }
        case 'd':
        case 'D': {
          e.preventDefault();
          handleToggleTool('pen');
          break;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          handleToggleTool('spotlight');
          break;
        }
        case 'c':
        case 'C': {
          e.preventDefault();
          handleClearInk();
          break;
        }
        case 'h':
        case 'H': {
          e.preventDefault();
          handleToggleInkVisibility();
          break;
        }
        case '[':
        case '{':
        case '「':
        case '［': {
          e.preventDefault();
          handleAdjustSpotlightRadius(-0.04);
          break;
        }
        case ']':
        case '}':
        case '」':
        case '］': {
          e.preventDefault();
          handleAdjustSpotlightRadius(0.04);
          break;
        }
        case '+':
        case '=': {
          e.preventDefault();
          handleAdjustPenSize(0.004);
          break;
        }
        case '-':
        case '_': {
          e.preventDefault();
          handleAdjustPenSize(-0.004);
          break;
        }
        case 'g':
        case 'G':
        case 'Tab': {
          if (e.key === 'Tab' && !meta) return;
          e.preventDefault();
          setActiveModal((prev) => (prev === 'grid' ? 'none' : 'grid'));
          break;
        }
        case 'o':
        case 'O': {
          e.preventDefault();
          setActiveModal((prev) => (prev === 'outline' ? 'none' : 'outline'));
          break;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          if (meta) {
            setNowTick(Date.now());
            setActiveModal((prev) => (prev === 'stats' ? 'none' : 'stats'));
          }
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          if (meta) openNotesEditor();
          break;
        }
        case '?': {
          e.preventDefault();
          setActiveModal((prev) => (prev === 'help' ? 'none' : 'help'));
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    meta,
    currentPage,
    isEditingNotes,
    activeModal,
    navigateToSlide,
    saveNotesEditor,
    openNotesEditor,
    handleToggleCurtain,
    handleToggleFreeze,
    handleToggleTool,
    handleClearInk,
    handleToggleInkVisibility,
    handleAdjustSpotlightRadius,
    handleAdjustPenSize,
  ]);

  const timerSnapshot = useMemo(
    () =>
      computeTimerSnapshot({
        running: timerRunning,
        accumulatedElapsedMs,
        lastResumeTimestampMs: lastResumeMs,
        slideAccumulatedElapsedMs: slideAccumulatedMs,
        slideLastResumeTimestampMs: slideLastResumeMs,
        countdownMinutes,
        lastMinutesWarning,
        endTimeHHMM: endTimeHHMM || undefined,
        slideTargetSeconds: currentSlideEntry?.targetSeconds,
        nowMs: nowTick,
      }),
    [
      timerRunning,
      accumulatedElapsedMs,
      lastResumeMs,
      slideAccumulatedMs,
      slideLastResumeMs,
      countdownMinutes,
      lastMinutesWarning,
      endTimeHHMM,
      currentSlideEntry?.targetSeconds,
      nowTick,
    ],
  );

  const targetSecondsByPage = useMemo(() => {
    const targets: Record<number, number | undefined> = {};
    if (notesBundle) {
      for (const [pageKey, entry] of Object.entries(notesBundle.slides)) {
        const pageNum = Number.parseInt(pageKey, 10);
        if (Number.isInteger(pageNum) && pageNum >= 1 && entry.targetSeconds !== undefined) {
          targets[pageNum] = entry.targetSeconds;
        }
      }
    }
    return targets;
  }, [notesBundle]);

  const rehearsalReport = useMemo(() => {
    if (activeModal !== 'stats' || !meta) return null;
    return rehearsalTrackerRef.current.buildReport(meta.numPages, targetSecondsByPage, nowTick);
  }, [activeModal, meta, targetSecondsByPage, nowTick]);

  const { slideRegion } = resolveSplitCropRegions(cropMode, swapSplitHalves);
  const showSplitSuggestionBanner =
    Boolean(meta) &&
    meta!.suggestedCropMode === 'split-horizontal' &&
    cropMode === 'full' &&
    !splitBannerDismissed;

  const commitDurationInput = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(600, Math.max(1, Math.round(parsed)));
      setCountdownMinutes(clamped);
      setCountdownInputText(String(clamped));
      setEndTimeHHMM('');
      void storageService.savePrefs({ countdownMinutes: clamped, endTimeHHMM: '' });
      if (notesBundleRef.current) {
        const updatedBundle: DeckNotesBundle = {
          ...notesBundleRef.current,
          globalTargetSeconds: clamped * 60,
        };
        setNotesBundle(updatedBundle);
        void storageService.saveNotes(updatedBundle);
      }
    } else {
      setCountdownInputText(String(countdownMinutes));
    }
  };

  const commitWarningInput = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      const clamped = Math.min(120, Math.max(0, Math.round(parsed)));
      setLastMinutesWarning(clamped);
      setLastMinutesInputText(String(clamped));
      void storageService.savePrefs({ lastMinutesWarning: clamped });
    } else {
      setLastMinutesInputText(String(lastMinutesWarning));
    }
  };

  const commitEndTimeInput = (raw: string) => {
    if (!raw || raw.trim() === '') {
      setEndTimeHHMM('');
      void storageService.savePrefs({ endTimeHHMM: '' });
      return;
    }
    const valid = parseValidHHMM(raw);
    if (valid) {
      const formatted = `${String(valid.hh).padStart(2, '0')}:${String(valid.mm).padStart(2, '0')}`;
      setEndTimeHHMM(formatted);
      void storageService.savePrefs({ endTimeHHMM: formatted });
    }
  };

  const commitSlideJump = (raw: string) => {
    if (!meta) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= meta.numPages) {
      navigateToSlide(parsed);
    } else {
      setJumpInputText(String(currentPage));
    }
  };

  const renderOutlineNodes = (nodes: OutlineNode[], depth = 0) => {
    return nodes.map((node, idx) => (
      <div key={`${depth}-${idx}-${node.title}`} className="flex flex-col">
        <button
          type="button"
          onClick={() => {
            if (node.pageNumber && node.pageNumber >= 1) {
              navigateToSlide(node.pageNumber);
              setActiveModal('none');
            }
          }}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          className="flex w-full items-center justify-between rounded py-1.5 pr-3 text-left text-sm text-slate-200 hover:bg-slate-800"
        >
          <span className="truncate">{node.title || 'Untitled section'}</span>
          {node.pageNumber && (
            <span className="ml-2 shrink-0 text-xs text-slate-400">p.{node.pageNumber}</span>
          )}
        </button>
        {node.items && node.items.length > 0 && renderOutlineNodes(node.items, depth + 1)}
      </div>
    ));
  };

  return (
    <main
      data-testid="presenter-shell"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={handleDrop}
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100"
    >
      {/* Hidden persistent file inputs for PDF & Sidecar uploads */}
      <input
        ref={pdfFileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        data-testid="pdf-file-input"
        onChange={handlePdfFileChange}
        className="sr-only"
      />
      <input
        ref={sidecarFileInputRef}
        type="file"
        accept=".md,.markdown,.json,.pdfpc"
        data-testid="sidecar-file-input"
        onChange={handleSidecarFileChange}
        className="sr-only"
      />

      {/* Top Toolbar */}
      <header
        role="toolbar"
        aria-label="Presenter controls"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-white">Typst Presenter</span>

          <button
            type="button"
            onClick={() => pdfFileInputRef.current?.click()}
            className="rounded bg-slate-800 px-2.5 py-1 font-medium text-slate-200 hover:bg-slate-700"
          >
            Open PDF
          </button>

          <button
            type="button"
            onClick={handleLoadSampleDeck}
            className="rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-500"
          >
            Load Sample Deck
          </button>

          {meta && (
            <button
              type="button"
              data-testid="close-deck-button"
              onClick={() => void handleCloseDeck()}
              className="rounded bg-slate-800 px-2.5 py-1 font-medium text-slate-200 hover:bg-slate-700"
            >
              Recent Decks
            </button>
          )}

          {fsAccessSupported && (
            <button
              type="button"
              data-testid="watch-pdf-button"
              aria-pressed={pdfWatchStatus.active}
              onClick={() => void handleToggleWatchPdf()}
              className={`rounded px-2.5 py-1 font-medium ${
                pdfWatchStatus.active
                  ? 'bg-amber-600 text-white hover:bg-amber-500'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {pdfWatchStatus.active
                ? `Stop Watch (${pdfWatchStatus.fileName ?? 'PDF'})`
                : 'Watch PDF'}
            </button>
          )}

          {(tauriMode || monitors.length > 0) && (
            <select
              data-testid="monitor-select"
              aria-label="Target display"
              value={selectedMonitorIndex !== undefined ? String(selectedMonitorIndex) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                setSelectedMonitorIndex(raw === '' ? undefined : Number.parseInt(raw, 10));
              }}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
            >
              {monitors.length === 0 ? (
                <option value="">Default Display</option>
              ) : (
                monitors.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name} ({m.width}x{m.height}){m.isPrimary ? ' [Primary]' : ''}
                  </option>
                ))
              )}
            </select>
          )}

          {(tauriMode || monitors.length > 0 || webScreenDetailsSupported) && (
            <button
              type="button"
              data-testid="refresh-monitors-button"
              aria-label="Refresh displays"
              title="Refresh displays"
              onClick={() => void refreshMonitors()}
              className="rounded bg-slate-800 px-2 py-1 font-medium text-slate-200 hover:bg-slate-700"
            >
              Displays
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleLaunchAudienceWindow()}
            className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500"
          >
            Launch Audience Window
          </button>

          <span
            data-testid="audience-status"
            className={`inline-block min-w-[140px] rounded px-2 py-0.5 text-center text-[11px] font-medium ${
              audienceConnected
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {audienceConnected ? 'Audience Connected' : 'Audience Disconnected'}
          </span>
        </div>

        {/* Slide navigation & counter */}
        {meta && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => navigateToSlide(currentPage - 1)}
              className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
            >
              Prev
            </button>

            <div
              data-testid="slide-counter"
              className="flex items-center gap-1 rounded bg-slate-950 px-2 py-0.5 font-mono text-xs"
            >
              <input
                type="number"
                aria-label="Jump to slide"
                min={1}
                max={meta.numPages}
                value={jumpInputText}
                onChange={(e) => setJumpInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitSlideJump(jumpInputText);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                onBlur={() => commitSlideJump(jumpInputText)}
                className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-slate-100"
              />
              <span>/ {meta.numPages}</span>
              <span className="sr-only">
                {currentPage} / {meta.numPages}
              </span>
            </div>

            <button
              type="button"
              disabled={currentPage >= meta.numPages}
              onClick={() => navigateToSlide(currentPage + 1)}
              className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}

        {/* Crop, Curtain, Pointer & Modal tools */}
        <div className="flex flex-wrap items-center gap-1">
          <select
            aria-label="Crop mode"
            data-testid="crop-mode-select"
            value={cropMode}
            onChange={(e) => handleSelectCropMode(e.target.value as CropMode)}
            className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-slate-200"
          >
            <option value="full">Full</option>
            <option value="split-horizontal">Split L|R</option>
            <option value="split-vertical">Split T|B</option>
          </select>

          <button
            type="button"
            aria-label="Swap split halves"
            disabled={cropMode === 'full'}
            onClick={handleToggleSwapSplit}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700 disabled:opacity-40"
          >
            Swap Halves
          </button>

          <button
            type="button"
            aria-label="Blackout"
            aria-pressed={curtainMode === 'black'}
            onClick={() => handleToggleCurtain('black')}
            className={`rounded px-1.5 py-1 font-medium ${
              curtainMode === 'black'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Blackout (B)
          </button>

          <button
            type="button"
            aria-label="Whiteout"
            aria-pressed={curtainMode === 'white'}
            onClick={() => handleToggleCurtain('white')}
            className={`rounded px-1.5 py-1 font-medium ${
              curtainMode === 'white'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Whiteout (W)
          </button>

          <button
            type="button"
            aria-label="Freeze"
            aria-pressed={frozen}
            onClick={handleToggleFreeze}
            className={`rounded px-1.5 py-1 font-medium ${
              frozen
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Freeze (F)
          </button>

          <button
            type="button"
            aria-label="Laser"
            aria-pressed={pointerTool === 'laser'}
            onClick={() => handleToggleTool('laser')}
            className={`rounded px-1.5 py-1 font-medium ${
              pointerTool === 'laser'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Laser (L)
          </button>

          <button
            type="button"
            aria-label="Pen"
            aria-pressed={pointerTool === 'pen'}
            onClick={() => handleToggleTool('pen')}
            className={`rounded px-1.5 py-1 font-medium ${
              pointerTool === 'pen'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Pen (D)
          </button>

          <div
            role="group"
            aria-label="Ink colors"
            className="flex items-center gap-1 rounded bg-slate-950/70 px-1 py-0.5"
          >
            {PEN_COLOR_SWATCHES.map((swatch) => {
              const selected = penColor === swatch.hex;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  data-testid={`pen-color-${swatch.id}`}
                  aria-label={`Ink color ${swatch.label}`}
                  aria-pressed={selected}
                  title={swatch.label}
                  onClick={() => handleSelectPenColor(swatch.hex)}
                  style={{ backgroundColor: swatch.hex }}
                  className={`h-4 w-4 rounded-full border transition ${
                    selected
                      ? 'scale-110 border-white ring-2 ring-blue-400'
                      : 'border-slate-600 opacity-80 hover:opacity-100'
                  }`}
                />
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Spotlight"
            aria-pressed={pointerTool === 'spotlight'}
            onClick={() => handleToggleTool('spotlight')}
            className={`rounded px-1.5 py-1 font-medium ${
              pointerTool === 'spotlight'
                ? 'bg-yellow-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Spotlight (S)
          </button>

          <button
            type="button"
            data-testid="spotlight-size-down"
            aria-label="Spotlight size -"
            title={`Decrease spotlight radius ([ or mouse wheel) — current ${Math.round(spotlightRadius * 100)}%`}
            onClick={() => handleAdjustSpotlightRadius(-0.04)}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Spot -
          </button>
          <button
            type="button"
            data-testid="spotlight-size-up"
            aria-label="Spotlight size +"
            title={`Increase spotlight radius (] or mouse wheel) — current ${Math.round(spotlightRadius * 100)}%`}
            onClick={() => handleAdjustSpotlightRadius(0.04)}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Spot +
          </button>

          <button
            type="button"
            aria-label="Pen size -"
            onClick={() => handleAdjustPenSize(-0.004)}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Pen -
          </button>
          <button
            type="button"
            aria-label="Pen size +"
            onClick={() => handleAdjustPenSize(0.004)}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Pen +
          </button>

          <button
            type="button"
            aria-label="Undo"
            onClick={handleUndoStroke}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Undo
          </button>

          <button
            type="button"
            aria-label="Clear Ink"
            onClick={handleClearInk}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Clear Ink (C)
          </button>

          <button
            type="button"
            data-testid="toggle-ink-visibility"
            aria-pressed={inkVisible}
            onClick={handleToggleInkVisibility}
            className={`rounded px-1.5 py-1 font-medium ${
              inkVisible
                ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'bg-purple-700 text-white hover:bg-purple-600'
            }`}
          >
            Ink (H)
          </button>

          <button
            type="button"
            data-testid="guard-toggle"
            aria-pressed={guardEnabled}
            onClick={() => setGuardEnabled((prev) => !prev)}
            className={`rounded px-1.5 py-1 font-medium ${
              guardEnabled
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Guard
          </button>

          <button
            type="button"
            data-testid="open-stats-button"
            disabled={!meta}
            onClick={() => {
              if (!meta) return;
              setNowTick(Date.now());
              setActiveModal((prev) => (prev === 'stats' ? 'none' : 'stats'));
            }}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700 disabled:opacity-40"
          >
            Stats (R)
          </button>

          <button
            type="button"
            onClick={() => setActiveModal((prev) => (prev === 'grid' ? 'none' : 'grid'))}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Grid (G)
          </button>

          <button
            type="button"
            onClick={() => setActiveModal((prev) => (prev === 'outline' ? 'none' : 'outline'))}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Outline (O)
          </button>

          <button
            type="button"
            onClick={() => setActiveModal((prev) => (prev === 'help' ? 'none' : 'help'))}
            className="rounded bg-slate-800 px-1.5 py-1 hover:bg-slate-700"
          >
            Help (?)
          </button>
        </div>
      </header>

      {/* Error banner */}
      {errorMessage && (
        <div
          role="alert"
          data-testid="error-banner"
          className="flex items-center justify-between border-b border-red-800 bg-red-950/90 px-4 py-2 text-xs text-red-200"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-4 rounded bg-red-900 px-2 py-0.5 text-red-100 hover:bg-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Info banner */}
      {infoMessage && (
        <div
          role="status"
          data-testid="info-banner"
          className="flex items-center justify-between border-b border-blue-800 bg-blue-950/90 px-4 py-2 text-xs text-blue-200"
        >
          <span>{infoMessage}</span>
          <button
            type="button"
            onClick={() => setInfoMessage(null)}
            className="ml-4 rounded bg-blue-900 px-2 py-0.5 text-blue-100 hover:bg-blue-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Popup-Blocked fallback banner */}
      {popupBlockedUrl && (
        <div
          role="alert"
          data-testid="popup-blocked-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-700 bg-amber-950/90 px-4 py-2 text-xs text-amber-100"
        >
          <span>
            Popup blocked by browser! Open Audience URL manually:{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono">{popupBlockedUrl}</code>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(popupBlockedUrl).catch(() => {});
              }}
              className="rounded bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-500"
            >
              Copy URL
            </button>
            <button
              type="button"
              onClick={() => setPopupBlockedUrl(null)}
              className="rounded bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Touying Split-Page Auto-Detection Banner */}
      {showSplitSuggestionBanner && (
        <div
          role="alert"
          data-testid="split-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-700 bg-indigo-950/90 px-4 py-2 text-xs text-indigo-100"
        >
          <span>
            Wide Touying split-page PDF detected (aspect ratio &gt; 2.4 / 分割スライド検出). Apply
            Split L|R cropping?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectCropMode('split-horizontal')}
              className="rounded bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500"
            >
              Apply Split L|R
            </button>
            <button
              type="button"
              onClick={() => {
                setSplitBannerDismissed(true);
                if (meta) {
                  void storageService.updateDeckState(meta.deckId, {
                    splitBannerDismissed: true,
                  });
                }
              }}
              className="rounded bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Onboarding vs Active Presenter Workspace */}
      {!meta ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
          <div
            data-testid="pdf-dropzone"
            aria-label="Drop PDF file here"
            onClick={() => pdfFileInputRef.current?.click()}
            className="flex max-w-xl w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/60 p-10 text-center transition hover:border-blue-500 hover:bg-slate-900"
          >
            <h1 className="text-2xl font-bold tracking-tight text-white">Typst Presenter</h1>
            <p className="mt-2 text-sm text-slate-300">
              Drag &amp; drop your PDF slide deck here, or click to select a file
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Supports Typst, Marp, Beamer, PowerPoint/Keynote PDFs, paired Markdown/pdfpc notes,
              and dual-window sync
            </p>
            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => pdfFileInputRef.current?.click()}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
              >
                Choose PDF File
              </button>
              <button
                type="button"
                onClick={handleLoadSampleDeck}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Load Sample Deck
              </button>
            </div>
          </div>

          {recentDecks.length > 0 && (
            <section
              data-testid="recent-decks-section"
              aria-label="Recent decks"
              className="mt-6 w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900/80 p-4"
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Recent Decks
              </h2>
              <ul className="space-y-2">
                {recentDecks.map((deck) => (
                  <li
                    key={deck.deckId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-100">{deck.fileName}</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(deck.lastOpenedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`open-recent-${deck.deckId}`}
                        onClick={() => void handleOpenRecentDeck(deck.deckId)}
                        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        data-testid={`delete-recent-${deck.deckId}`}
                        onClick={() => void handleDeleteRecentDeck(deck.deckId)}
                        className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/60"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-12 gap-3 overflow-hidden p-3">
          {/* Left / Center: Current Slide Stage */}
          <div className="col-span-7 flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-2">
            <SlideStage
              engine={engineRef.current}
              deckId={meta.deckId}
              pageNumber={currentPage}
              cropRegion={slideRegion}
              canvasTestId="presenter-slide-canvas"
              stageTestId="presenter-stage"
              interactive={true}
              showLinks={true}
              pointerTool={pointerTool}
              penColor={penColor}
              penWidth={penWidth}
              laserPoint={laserPoint}
              spotlightPoint={spotlightPoint}
              spotlightRadius={spotlightRadius}
              strokes={strokesByPage[currentPage] ?? []}
              inkVisible={inkVisible}
              curtainMode={curtainMode}
              isAudience={false}
              onNavigatePage={navigateToSlide}
              onSwipeNext={() => {
                if (currentPage < meta.numPages) navigateToSlide(currentPage + 1);
              }}
              onSwipePrev={() => {
                if (currentPage > 1) navigateToSlide(currentPage - 1);
              }}
              onLaserMove={(pt) => {
                setLaserPoint(pt);
                syncBridgeRef.current?.post({
                  type: 'LASER_MOVE',
                  active: pt !== null,
                  point: pt,
                });
              }}
              onSpotlightMove={(pt) => {
                setSpotlightPoint(pt);
                syncBridgeRef.current?.post({
                  type: 'SPOTLIGHT_MOVE',
                  active: pt !== null,
                  point: pt,
                  radius: spotlightRadius,
                });
              }}
              onSpotlightRadiusDelta={handleAdjustSpotlightRadius}
              onHoverPointChange={(pt) => {
                lastStageHoverRef.current = pt;
              }}
              onStrokeLiveUpdate={handleStrokeLiveUpdate}
              onStrokeCommit={handleStrokeCommit}
            />
          </div>

          {/* Right Column: Next Preview + Timer + Speaker Notes */}
          <div className="col-span-5 flex flex-col gap-3 overflow-hidden">
            {/* Top row of right column: Next Slide Preview & Timer Panel */}
            <div className="grid grid-cols-2 gap-3">
              {/* Next Slide Preview */}
              <section
                aria-label="Next slide panel"
                className="flex flex-col rounded-lg border border-slate-800 bg-slate-900 p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider">Next Slide</span>
                  <span>
                    {currentPage < meta.numPages
                      ? `Slide ${currentPage + 1}`
                      : 'Final Slide'}
                  </span>
                </div>
                <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-slate-950 p-1">
                  {currentPage < meta.numPages ? (
                    <ThumbnailCanvas
                      engine={engineRef.current}
                      deckId={meta.deckId}
                      pageNumber={currentPage + 1}
                      cropRegion={slideRegion}
                      targetWidth={320}
                      targetHeight={180}
                      testId="next-slide-canvas"
                      ariaLabel="Next slide preview"
                      onClick={() => navigateToSlide(currentPage + 1)}
                    />
                  ) : (
                    <div
                      data-testid="end-of-presentation"
                      className="text-center text-xs font-medium text-slate-400"
                    >
                      End of Presentation
                    </div>
                  )}
                </div>
              </section>

              {/* Timer & Pacing Panel */}
              <section
                data-testid="timer-panel"
                aria-label="Timer panel"
                className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold uppercase tracking-wider text-slate-400">
                    Clock{' '}
                    <span data-testid="wall-clock" className="font-mono text-slate-200">
                      {formatWallClock(nowTick)}
                    </span>{' '}
                  </div>

                  <div
                    data-testid="pacing-badge"
                    data-pacing={timerSnapshot.pacingStatus}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      timerSnapshot.pacingStatus === 'overtime'
                        ? 'bg-red-950 text-red-300 border border-red-700'
                        : timerSnapshot.pacingStatus === 'warning'
                          ? 'bg-amber-950 text-amber-300 border border-amber-700'
                          : timerSnapshot.pacingStatus === 'ahead'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : 'bg-blue-950 text-blue-300 border border-blue-700'
                    }`}
                  >
                    {timerSnapshot.pacingStatus}
                  </div>
                </div>

                {/* Elapsed & Countdown */}
                <div className="my-1.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded bg-slate-950 px-2 py-1">
                    <div className="text-[10px] text-slate-400">Elapsed</div>
                    <div
                      data-testid="elapsed-timer"
                      aria-label="Elapsed time"
                      className="font-mono text-base font-bold text-slate-100"
                    >
                      {formatDurationMMSS(timerSnapshot.totalElapsedMs)}
                    </div>
                  </div>

                  <div
                    className={`rounded px-2 py-1 ${
                      timerSnapshot.remainingMs < 0
                        ? 'bg-red-950/70 text-red-300 border border-red-700 danger overtime'
                        : timerSnapshot.lastMinutesWarning
                          ? 'bg-amber-950/70 text-amber-300 border border-amber-700 warning'
                          : 'bg-slate-950 text-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Remaining</span>
                      {timerSnapshot.lastMinutesWarning && (
                        <span
                          data-status="warning"
                          data-warning="true"
                          data-testid="timer-warning-badge"
                          className="font-bold text-amber-400"
                        >
                          Warning
                        </span>
                      )}
                    </div>
                    <div
                      data-testid="countdown-timer"
                      className={`font-mono text-base font-bold ${
                        timerSnapshot.remainingMs < 0 ? 'text-red-400 overtime' : ''
                      }`}
                    >
                      {formatCountdownMMSS(timerSnapshot.remainingMs)}
                    </div>
                  </div>
                </div>

                {/* Per-slide timer */}
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Slide:{' '}
                    <strong data-testid="slide-elapsed" className="font-mono text-slate-200">
                      {formatDurationMMSS(timerSnapshot.slideElapsedMs)}
                    </strong>
                    {currentSlideEntry?.targetSeconds
                      ? ` / ${formatDurationMMSS(currentSlideEntry.targetSeconds * 1000)}`
                      : ''}
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label="Auto-start timer"
                      checked={autoStartTimerOnFirstNav}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoStartTimerOnFirstNav(checked);
                        void storageService.savePrefs({ autoStartTimerOnFirstNav: checked });
                      }}
                    />
                    <span>Auto-start</span>
                  </label>
                </div>

                {/* Start / Pause / Reset buttons */}
                <div className="mb-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={startTimer}
                    className="flex-1 rounded bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-600"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    onClick={pauseTimer}
                    className="flex-1 rounded bg-amber-700 px-2 py-1 font-medium text-white hover:bg-amber-600"
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={resetTimer}
                    className="flex-1 rounded bg-slate-800 px-2 py-1 font-medium text-slate-200 hover:bg-slate-700"
                  >
                    Reset
                  </button>
                </div>

                {/* Duration, Warning & End-Time inputs */}
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <label className="flex flex-col text-slate-400">
                    <span>Duration (min)</span>
                    <input
                      type="number"
                      aria-label="Countdown duration (min)"
                      value={countdownInputText}
                      onChange={(e) => setCountdownInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitDurationInput(countdownInputText);
                        }
                      }}
                      onBlur={() => commitDurationInput(countdownInputText)}
                      className="mt-0.5 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-xs text-slate-100"
                    />
                  </label>

                  <label className="flex flex-col text-slate-400">
                    <span>Warning (min)</span>
                    <input
                      type="number"
                      aria-label="Last minutes warning"
                      value={lastMinutesInputText}
                      onChange={(e) => setLastMinutesInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitWarningInput(lastMinutesInputText);
                        }
                      }}
                      onBlur={() => commitWarningInput(lastMinutesInputText)}
                      className="mt-0.5 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-xs text-slate-100"
                    />
                  </label>

                  <label className="flex flex-col text-slate-400">
                    <span>End Time</span>
                    <input
                      type="time"
                      aria-label="End time"
                      value={endTimeHHMM}
                      onChange={(e) => commitEndTimeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEndTimeInput((e.target as HTMLInputElement).value);
                        }
                      }}
                      className="mt-0.5 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-xs text-slate-100"
                    />
                  </label>
                </div>
              </section>
            </div>

            {/* Speaker Notes Panel */}
            <section
              data-testid="notes-panel"
              aria-label="Speaker notes"
              className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800 pb-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold uppercase tracking-wider text-slate-300">
                    Speaker Notes
                  </span>
                  <button
                    type="button"
                    aria-label="A- decrease font"
                    onClick={() => void handleAdjustFontSize(-2)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    aria-label="A+ increase font"
                    onClick={() => void handleAdjustFontSize(2)}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    A+
                  </button>
                  <label className="ml-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <span>目標</span>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      placeholder="--"
                      aria-label="Slide target seconds"
                      data-testid="slide-target-seconds-input"
                      value={slideTargetInputText}
                      onChange={(e) => setSlideTargetInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitSlideTargetInput(slideTargetInputText);
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      onBlur={() => void commitSlideTargetInput(slideTargetInputText)}
                      className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-center font-mono text-xs text-slate-100"
                    />
                    <span>秒</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {!isEditingNotes ? (
                    <button
                      type="button"
                      onClick={openNotesEditor}
                      className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500"
                    >
                      Edit Notes (E)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void saveNotesEditor()}
                      className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white hover:bg-emerald-500"
                    >
                      Save
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => sidecarFileInputRef.current?.click()}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    Import Notes
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleImportEmbeddedNotes()}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    Import Embedded Notes
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportNotes('md')}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    Export .md
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportNotes('json')}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    Export .json
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportNotes('pdfpc')}
                    className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                  >
                    Export .pdfpc
                  </button>
                </div>
              </div>

              {isEditingNotes ? (
                <div className="flex flex-1 flex-col gap-2">
                  <textarea
                    aria-label="Speaker notes editor"
                    value={draftNoteText}
                    onChange={(e) => setDraftNoteText(e.target.value)}
                    placeholder="Enter Markdown speaker notes for this slide..."
                    className="flex-1 resize-none rounded border border-slate-700 bg-slate-950 p-2.5 font-mono text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div
                  data-testid="notes-content"
                  style={{ fontSize: `${noteFontSizePx}px` }}
                  className="prose prose-invert max-w-none flex-1 overflow-y-auto leading-relaxed text-slate-200"
                >
                  {currentSlideMarkdown.trim().length > 0 ? (
                    <ReactMarkdown>{currentSlideMarkdown}</ReactMarkdown>
                  ) : (
                    <p
                      style={{ fontSize: `${noteFontSizePx}px` }}
                      className="italic text-slate-500"
                    >
                      No speaker notes for this slide. Press E or click Edit Notes to add script.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Slide Grid Modal (G) */}
      {activeModal === 'grid' && meta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Slide grid overview"
          data-testid="slide-grid-dialog"
          className="fixed inset-0 z-40 flex flex-col bg-slate-950/95 p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Slide Grid Overview (G)</h2>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            >
              Close (Esc)
            </button>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-4 overflow-y-auto p-2 md:grid-cols-4">
            {Array.from({ length: meta.numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                onClick={() => {
                  navigateToSlide(pageNum);
                  setActiveModal('none');
                }}
                className={`flex cursor-pointer flex-col items-center rounded-lg border p-2 transition ${
                  pageNum === currentPage
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                }`}
              >
                <div className="flex h-36 w-full items-center justify-center overflow-hidden">
                  <ThumbnailCanvas
                    engine={engineRef.current}
                    deckId={meta.deckId}
                    pageNumber={pageNum}
                    cropRegion={slideRegion}
                    targetWidth={320}
                    targetHeight={180}
                    testId={`thumb-canvas-${pageNum}`}
                    ariaLabel={`Slide ${pageNum} thumbnail`}
                    onClick={() => {
                      navigateToSlide(pageNum);
                      setActiveModal('none');
                    }}
                  />
                </div>
                <span className="mt-1.5 text-xs font-medium text-slate-300">
                  Slide {pageNum}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outline Drawer (O) */}
      {activeModal === 'outline' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Document outline"
          data-testid="outline-drawer"
          className="fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-slate-800 bg-slate-900 p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-base font-bold text-white">Outline / Table of Contents (O)</h2>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {meta && meta.outline.length > 0 ? (
              renderOutlineNodes(meta.outline)
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                No outline available in this PDF (見出しなし)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Help Modal (?) */}
      {activeModal === 'help' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts help"
          data-testid="help-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="max-w-lg w-full rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Keyboard Shortcuts &amp; Help (?)</h2>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                Close (Esc)
              </button>
            </div>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">→</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Space</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">←</kbd> : Next /
                Previous Slide
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">1-9</kbd> +{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Enter</kbd> : Direct
                Slide Jump
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">B</kbd> : Toggle
                Blackout Curtain
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">W</kbd> : Toggle
                Whiteout Curtain
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">F</kbd> : Toggle
                Freeze Audience Display
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">L</kbd> : Toggle
                Laser Pointer
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">D</kbd> : Toggle
                Freehand Pen Tool (<kbd className="rounded bg-slate-800 px-1 font-mono">+/-</kbd>{' '}
                size)
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">S</kbd> : Toggle
                Spotlight Tool (<kbd className="rounded bg-slate-800 px-1 font-mono">[</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1 font-mono">]</kbd> or wheel size)
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">C</kbd> : Clear Ink
                on Current Slide
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">H</kbd> : Toggle Ink
                Visibility
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">R</kbd> : Toggle
                Rehearsal Stats
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">G</kbd> /{' '}
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">Tab</kbd> : Toggle
                Slide Grid Overview
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">O</kbd> : Toggle PDF
                Outline Drawer
              </li>
              <li>
                <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">E</kbd> : Edit
                Speaker Notes Inline
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Rehearsal Stats Modal (R) */}
      {activeModal === 'stats' && meta && rehearsalReport && (
        <RehearsalStatsModal
          report={rehearsalReport}
          deckFileName={meta.fileName}
          onClose={() => setActiveModal('none')}
          onJumpToSlide={(page) => {
            navigateToSlide(page);
            setActiveModal('none');
          }}
          onApplyActualAsTargets={(targets) => {
            void handleApplyActualAsTargets(targets);
          }}
          onExportMarkdown={() => {
            const baseName = (meta.fileName ?? 'deck').replace(/\.pdf$/i, '');
            const md = exportRehearsalReportMarkdown(rehearsalReport, meta.fileName);
            triggerTextDownload(`${baseName}-rehearsal-report.md`, md, 'text/markdown;charset=utf-8');
          }}
          onExportCsv={() => {
            const baseName = (meta.fileName ?? 'deck').replace(/\.pdf$/i, '');
            const csv = exportRehearsalReportCsv(rehearsalReport);
            triggerTextDownload(`${baseName}-rehearsal-report.csv`, csv, 'text/csv;charset=utf-8');
          }}
        />
      )}
    </main>
  );
}
