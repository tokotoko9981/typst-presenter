import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Focus,
  FolderOpen,
  History,
  LayoutGrid,
  ListTree,
  Minus,
  Moon,
  Paperclip,
  Pencil,
  PenTool,
  Plus,
  Presentation,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Snowflake,
  Sun,
  Tag,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LASER_COLOR_SWATCHES, SlideStage } from '../../components/SlideStage.tsx';
import { ThumbnailCanvas } from '../../components/ThumbnailCanvas.tsx';
import { clampChimeVolume } from '../../core/audio/ChimeEngine.ts';
import {
  FileWatchService,
  isFileSystemAccessSupported,
  pickNotesFileHandle,
  pickPdfFileHandle,
} from '../../core/files/FileWatchService.ts';
import type { WatchStatus } from '../../core/files/FileWatchService.ts';
import {
  detectNotesSourceFormat,
  evaluateDirectOverwrite,
  overwriteLinkedMarkdown,
  type LinkedNotesSource,
} from '../../core/files/NotesFileSaver.ts';
import { useI18n } from '../../core/i18n/I18nContext.tsx';
import { useTheme } from '../../core/theme/ThemeContext.tsx';
import {
  createEmptyNotesBundle,
  exportNotesToJson,
  exportNotesToMarkdown,
  exportNotesToPdfpc,
  mergeHotReloadNotesBundle,
  parseSidecarFileContent,
} from '../../core/notes/NotesManager.ts';
import {
  hasRepeatedPageLabels,
  isSameLogicalSlide,
  resolveNoteForPage,
} from '../../core/notes/logicalSlides.ts';
import type { DeckNotesBundle } from '../../core/notes/types.ts';
import { PdfEngine } from '../../core/pdf/PdfEngine.ts';
import type { CropMode, LoadedDeckMeta, OutlineNode } from '../../core/pdf/types.ts';
import { resolveSplitCropRegions } from '../../core/pdf/viewportMath.ts';
import {
  forceCloseApp,
  getLaunchFile,
  isTauriRuntime,
  launchAudienceDisplay,
  listAvailableMonitors,
  onCloseGuardBlocked,
  pickNotesFilePath,
  readLocalBinaryFile,
  readLocalTextFile,
  selectDefaultAudienceMonitor,
  setCloseGuard,
  supportsWebScreenDetails,
  writeLocalTextFile,
} from '../../core/platform/DesktopBridge.ts';
import {
  mergeEmbeddedWithTypstQuery,
  type TypstPdfpcQueryResult,
} from '../../core/typst/typstPdfpcParser.ts';
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
  QrOverlayState,
  SyncMessage,
  ZoomState,
} from '../../core/sync/types.ts';
import { DEFAULT_ZOOM_STATE, isZoomed, zoomAtPoint } from '../../core/zoom/zoomMath.ts';
import {
  exportRehearsalReportCsv,
  exportRehearsalReportMarkdown,
  RehearsalTracker,
} from '../../core/timer/RehearsalTracker.ts';
import {
  computeTimerSnapshot,
  formatCountdownMMSS,
  formatDurationMMSS,
} from '../../core/timer/TimerEngine.ts';
import { HelpModal, type HelpModalTab } from './HelpModal.tsx';
import { NotesImportModal } from './NotesImportModal.tsx';
import { RehearsalStatsModal } from './RehearsalStatsModal.tsx';
import { UiGuideOverlay } from './UiGuideOverlay.tsx';
import { BlackoutScreenIcon, WhiteoutScreenIcon } from './components/CurtainIcons.tsx';
import { QrOverlayModal } from './components/QrOverlayModal.tsx';
import { TypstCompileDrawer } from './components/TypstCompileDrawer.tsx';
import { useChimeAlerts } from './hooks/useChimeAlerts.ts';
import {
  usePresenterShortcuts,
  type PresenterModalKind,
} from './hooks/usePresenterShortcuts.ts';
import { useTypstLiveCompile } from './hooks/useTypstLiveCompile.ts';

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
  const { locale, toggleLocale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const engineRef = useRef<PdfEngine | null>(null);
  const syncBridgeRef = useRef<SyncBridge | null>(null);
  const fileWatchRef = useRef<FileWatchService | null>(null);
  const rehearsalTrackerRef = useRef(new RehearsalTracker());
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidecarFileInputRef = useRef<HTMLInputElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const laserMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const laserPopoverRef = useRef<HTMLDivElement | null>(null);
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
  const [laserColor, setLaserColor] = useState<string>(DEFAULT_PREFS.laserColor);
  const [laserMenuAnchor, setLaserMenuAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [penColor, setPenColor] = useState<string>(DEFAULT_PREFS.penColor);
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PREFS.penWidth);
  const [laserPoint, setLaserPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightPoint, setSpotlightPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightRadius, setSpotlightRadius] = useState<number>(DEFAULT_PREFS.spotlightRadius);
  const [strokesByPage, setStrokesByPage] = useState<Record<number, InkStroke[]>>({});
  const [inkVisible, setInkVisible] = useState<boolean>(true);

  // Phase 2: Zoom/Pan, Q&A QR, Audience Progress Bar & Chime state
  const [zoomMode, setZoomMode] = useState<boolean>(false);
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM_STATE);
  const [qrOverlay, setQrOverlay] = useState<QrOverlayState>({
    visible: false,
    url: '',
    label: '',
  });
  const [audienceProgressBar, setAudienceProgressBar] = useState<boolean>(false);
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(false);
  const [chimeVolume, setChimeVolume] = useState<number>(0.7);
  const [chimeResetToken, setChimeResetToken] = useState<number>(0);

  // Notes state
  const [notesBundle, setNotesBundle] = useState<DeckNotesBundle | null>(null);
  const [noteFontSizePx, setNoteFontSizePx] = useState<number>(DEFAULT_PREFS.noteFontSizePx);
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [draftNoteText, setDraftNoteText] = useState<string>('');
  const [shareNotesByPageLabel, setShareNotesByPageLabel] = useState<boolean>(true);
  const [linkedNotesSource, setLinkedNotesSource] = useState<LinkedNotesSource | null>(null);
  const [closeGuardModalOpen, setCloseGuardModalOpen] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const typstCompiledHandlerRef = useRef<
    ((bytes: ArrayBuffer, fileName: string, queryResult: TypstPdfpcQueryResult | null) => Promise<void>) | null
  >(null);

  const typstLive = useTypstLiveCompile({
    onCompiledPdf: async (bytes, fileName, queryResult) => {
      if (typstCompiledHandlerRef.current) {
        await typstCompiledHandlerRef.current(bytes, fileName, queryResult);
      }
    },
  });

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
  const [slideTargetInputText, setSlideTargetInputText] = useState<string>('');
  const [autoStartTimerOnFirstNav, setAutoStartTimerOnFirstNav] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Modals / Drawers state
  const [activeModal, setActiveModal] = useState<PresenterModalKind>('none');
  const [helpInitialTab, setHelpInitialTab] = useState<HelpModalTab>('shortcuts');
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!laserMenuAnchor) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        laserPopoverRef.current?.contains(target) ||
        laserMenuBtnRef.current?.contains(target)
      ) {
        return;
      }
      setLaserMenuAnchor(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLaserMenuAnchor(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [laserMenuAnchor]);

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
    laserColor,
    laserPoint,
    spotlightPoint,
    spotlightRadius,
    zoomState,
    qrOverlay,
    audienceProgressBar,
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
    laserColor,
    laserPoint,
    spotlightPoint,
    spotlightRadius,
    zoomState,
    qrOverlay,
    audienceProgressBar,
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
        laserColor: s.laserColor,
        laserPoint: s.laserPoint,
        spotlightPoint: s.spotlightPoint,
        spotlightRadius: s.spotlightRadius,
        zoomState: s.zoomState,
        qrOverlay: s.qrOverlay,
        audienceProgressBar: s.audienceProgressBar,
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
      audienceProgressBar: s.audienceProgressBar,
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
          setZoomMode(false);
          setZoomState(DEFAULT_ZOOM_STATE);
          syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
        }
      } else if (msg.type === 'REQUEST_ACTION') {
        const s = stateRef.current;
        if (msg.action === 'first' && s.meta && s.currentPage !== 1) {
          rehearsalTrackerRef.current.onPageChange(1, s.timerRunning);
          setCurrentPage(1);
          setJumpInputText('1');
          setZoomMode(false);
          setZoomState(DEFAULT_ZOOM_STATE);
          syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
        } else if (msg.action === 'last' && s.meta && s.currentPage !== s.meta.numPages) {
          rehearsalTrackerRef.current.onPageChange(s.meta.numPages, s.timerRunning);
          setCurrentPage(s.meta.numPages);
          setJumpInputText(String(s.meta.numPages));
          setZoomMode(false);
          setZoomState(DEFAULT_ZOOM_STATE);
          syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
        } else if (msg.action === 'toggle-blackout') {
          setCurtainMode((prev) => {
            const next: CurtainMode = prev === 'black' ? 'none' : 'black';
            syncBridgeRef.current?.post({ type: 'CURTAIN', mode: next });
            return next;
          });
        } else if (msg.action === 'toggle-whiteout') {
          setCurtainMode((prev) => {
            const next: CurtainMode = prev === 'white' ? 'none' : 'white';
            syncBridgeRef.current?.post({ type: 'CURTAIN', mode: next });
            return next;
          });
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
    laserColor,
    audienceProgressBar,
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
    if (tauriMode) {
      void setCloseGuard(guardEnabled);
    }
    if (!guardEnabled) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [guardEnabled, tauriMode]);

  useEffect(() => {
    if (!tauriMode) return;
    let active = true;
    let unlisten: (() => void) | null = null;
    void onCloseGuardBlocked(() => {
      if (active) {
        setCloseGuardModalOpen(true);
      }
    }).then((fn) => {
      if (active) {
        unlisten = fn;
      } else {
        fn();
      }
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [tauriMode]);

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
      setAutoStartTimerOnFirstNav(Boolean(prefs.autoStartTimerOnFirstNav));
      setLaserColor(prefs.laserColor || DEFAULT_PREFS.laserColor);
      setPenColor(prefs.penColor || DEFAULT_PREFS.penColor);
      setPenWidth(clampPenWidth(prefs.penWidth));
      setSpotlightRadius(clampSpotlightRadius(prefs.spotlightRadius));
      setChimeEnabled(Boolean(prefs.chimeEnabled));
      setChimeVolume(clampChimeVolume(prefs.chimeVolume ?? DEFAULT_PREFS.chimeVolume ?? 0.7));
      setAudienceProgressBar(Boolean(prefs.audienceProgressBar));
      setShareNotesByPageLabel(prefs.shareNotesByPageLabel ?? true);

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
            loadedMeta.extractedSlideTargets,
          );
          await storageService.saveNotes(activeNotes);
        }
        setNotesBundle(activeNotes);
        if (activeNotes.qrUrl) {
          setQrOverlay({
            visible: false,
            url: activeNotes.qrUrl,
            label: activeNotes.qrLabel ?? '',
          });
        }

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
    setChimeResetToken((n) => n + 1);
  }, []);

  // Navigate to a specific slide (1-based)
  const navigateToSlide = useCallback(
    (targetPage: number) => {
      if (!meta) return;
      const clamped = Math.max(1, Math.min(meta.numPages, Math.trunc(targetPage)));
      if (!Number.isFinite(clamped)) return;

      const now = Date.now();
      setNowTick(now);
      const keepSlideTimer = isSameLogicalSlide(
        currentPage,
        clamped,
        meta.pageLabels,
        meta.numPages,
        shareNotesByPageLabel,
      );
      if (!keepSlideTimer) {
        setSlideAccumulatedMs(0);
        setSlideLastResumeMs(timerRunning ? now : null);
      }

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
      setZoomMode(false);
      setZoomState(DEFAULT_ZOOM_STATE);

      void storageService.updateDeckState(meta.deckId, { currentPage: clamped });

      if (!frozen) {
        syncBridgeRef.current?.post({
          type: 'NAVIGATE',
          page: clamped,
          strokesForPage: strokesByPage[clamped] ?? [],
        });
        syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
      }
    },
    [
      meta,
      timerRunning,
      autoStartTimerOnFirstNav,
      currentPage,
      frozen,
      strokesByPage,
      shareNotesByPageLabel,
    ],
  );

  const applySidecarContent = useCallback(
    async (
      text: string,
      sidecarName: string,
      targetDeckId: string,
      targetFileName: string,
      totalDeckPages?: number,
    ): Promise<DeckNotesBundle> => {
      const parsed = parseSidecarFileContent(text, sidecarName);
      const slideNums = Object.keys(parsed.slides)
        .map((k) => Number.parseInt(k, 10))
        .filter((n) => Number.isInteger(n) && n >= 1);
      const hasMeta =
        parsed.durationMinutes !== undefined ||
        parsed.lastMinutesWarning !== undefined ||
        parsed.noteFontSizePx !== undefined;

      if (slideNums.length === 0 && !hasMeta) {
        const fallbackBundle =
          notesBundleRef.current ??
          createEmptyNotesBundle(
            targetDeckId,
            targetFileName,
            stateRef.current.meta?.extractedNotes,
            stateRef.current.meta?.extractedPdfpcConfig,
          );
        setErrorMessage(`${t.msgSidecarNoNotesFound} (${sidecarName})`);
        return fallbackBundle;
      }

      const effectiveDuration =
        parsed.durationMinutes ?? deriveDurationMinutesFromSlides(parsed.slides);
      const nextDuration = effectiveDuration ?? countdownMinutes;
      const nextWarning = parsed.lastMinutesWarning ?? lastMinutesWarning;
      const nextFont = parsed.noteFontSizePx
        ? clampNoteFontSize(parsed.noteFontSizePx)
        : noteFontSizePx;

      if (effectiveDuration !== undefined) {
        setCountdownMinutes(effectiveDuration);
        setCountdownInputText(String(effectiveDuration));
      }
      if (parsed.lastMinutesWarning !== undefined) {
        setLastMinutesWarning(parsed.lastMinutesWarning);
        setLastMinutesInputText(String(parsed.lastMinutesWarning));
      }
      if (parsed.noteFontSizePx !== undefined) {
        setNoteFontSizePx(nextFont);
      }

      await storageService.savePrefs({
        countdownMinutes: nextDuration,
        lastMinutesWarning: nextWarning,
        noteFontSizePx: nextFont,
      });

      const updatedBundle: DeckNotesBundle = {
        version: 1,
        deckId: targetDeckId,
        fileName: targetFileName,
        globalTargetSeconds: nextDuration * 60,
        lastMinutesWarning: nextWarning,
        ...(parsed.qrUrl ? { qrUrl: parsed.qrUrl } : {}),
        ...(parsed.qrLabel ? { qrLabel: parsed.qrLabel } : {}),
        noteFontSizePx: nextFont,
        slides: parsed.slides,
      };
      setNotesBundle(updatedBundle);
      await storageService.saveNotes(updatedBundle);
      if (parsed.qrUrl) {
        setQrOverlay((prev) => ({
          visible: prev.visible,
          url: parsed.qrUrl!,
          label: parsed.qrLabel ?? prev.label ?? '',
        }));
      }

      if (slideNums.length > 0) {
        const maxSlideNum = Math.max(...slideNums);
        const exceedMsg =
          totalDeckPages !== undefined && maxSlideNum > totalDeckPages
            ? locale === 'ja'
              ? `（注意: PDF のページ数 ${totalDeckPages} を超えるノート ${maxSlideNum} が含まれています）`
              : ` (note: includes slide ${maxSlideNum}, which exceeds PDF page count ${totalDeckPages}).`
            : '';
        setInfoMessage(
          locale === 'ja'
            ? `${sidecarName} から ${slideNums.length} スライド分のノートを取り込みました${exceedMsg}`
            : `Imported notes for ${slideNums.length} slide(s) from "${sidecarName}"${exceedMsg}`,
        );
      }

      return updatedBundle;
    },
    [countdownMinutes, lastMinutesWarning, noteFontSizePx, locale, t],
  );

  // Load a PDF from ArrayBuffer
  const ingestPdfBytes = useCallback(
    async (
      bytes: ArrayBuffer,
      fileName: string,
      pairedSidecar?: { text: string; name: string },
      extraTypstQuery?: TypstPdfpcQueryResult | null,
    ): Promise<void> => {
      setErrorMessage(null);
      setInfoMessage(null);

      if (!bytes || bytes.byteLength === 0) {
        setErrorMessage(t.msgEmptyPdf);
        return;
      }

      try {
        const clonedForStorage = bytes.slice(0);
        const rawMeta = await engineRef.current!.loadDeck(bytes, fileName);
        const mergedEmbedded = mergeEmbeddedWithTypstQuery(
          rawMeta.extractedNotes,
          rawMeta.extractedSlideTargets,
          rawMeta.extractedPdfpcConfig,
          extraTypstQuery,
        );
        const loadedMeta: LoadedDeckMeta = {
          ...rawMeta,
          extractedNotes: mergedEmbedded.notes,
          ...(mergedEmbedded.targets ? { extractedSlideTargets: mergedEmbedded.targets } : {}),
          ...(mergedEmbedded.pdfpcConfig
            ? { extractedPdfpcConfig: mergedEmbedded.pdfpcConfig }
            : {}),
        };

        notesBundleRef.current = null;
        setNotesBundle(null);
        setMeta(loadedMeta);
        setCurrentPage(1);
        setJumpInputText('1');
        setCropMode('full');
        setSwapSplitHalves(false);
        setSplitBannerDismissed(false);
        setStrokesByPage({});
        setIsEditingNotes(false);
        setZoomMode(false);
        setZoomState(DEFAULT_ZOOM_STATE);
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
        let applyDefaultMetadata = !pairedSidecar;

        if (pairedSidecar) {
          try {
            bundle = await applySidecarContent(
              pairedSidecar.text,
              pairedSidecar.name,
              loadedMeta.deckId,
              loadedMeta.fileName,
              loadedMeta.numPages,
            );
          } catch (sidecarErr) {
            applyDefaultMetadata = true;
            setErrorMessage(
              `Error: PDF loaded, but failed to parse sidecar "${pairedSidecar.name}" (${
                sidecarErr instanceof Error ? sidecarErr.message : String(sidecarErr)
              }).`,
            );
          }
        }

        if (applyDefaultMetadata) {
          if (!bundle) {
            bundle = createEmptyNotesBundle(
              loadedMeta.deckId,
              loadedMeta.fileName,
              loadedMeta.extractedNotes,
              loadedMeta.extractedPdfpcConfig,
              loadedMeta.extractedSlideTargets,
            );
            await storageService.saveNotes(bundle);
          }

          const derivedFromSlides = deriveDurationMinutesFromSlides(bundle.slides);
          const embeddedOrDerivedDuration =
            loadedMeta.extractedPdfpcConfig?.durationMinutes ??
            (bundle.globalTargetSeconds !== DEFAULT_PREFS.countdownMinutes * 60
              ? Math.max(1, Math.round(bundle.globalTargetSeconds / 60))
              : derivedFromSlides);

          if (embeddedOrDerivedDuration !== undefined) {
            setCountdownMinutes(embeddedOrDerivedDuration);
            setCountdownInputText(String(embeddedOrDerivedDuration));
            await storageService.savePrefs({
              countdownMinutes: embeddedOrDerivedDuration,
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
          if (bundle.qrUrl) {
            setQrOverlay({
              visible: false,
              url: bundle.qrUrl,
              label: bundle.qrLabel ?? '',
            });
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
          `Error: Failed to load invalid or corrupt PDF "${fileName}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    },
    [applySidecarContent, refreshRecentDecks, t.msgEmptyPdf],
  );

  const hotReloadPdfBytes = useCallback(
    async (
      bytes: ArrayBuffer,
      fileName: string,
      extraTypstQuery?: TypstPdfpcQueryResult | null,
    ): Promise<void> => {
      setErrorMessage(null);
      if (!bytes || bytes.byteLength === 0) {
        return;
      }
      try {
        const clonedForStorage = bytes.slice(0);
        const rawMeta = await engineRef.current!.loadDeck(bytes, fileName);
        const mergedEmbedded = mergeEmbeddedWithTypstQuery(
          rawMeta.extractedNotes,
          rawMeta.extractedSlideTargets,
          rawMeta.extractedPdfpcConfig,
          extraTypstQuery,
        );
        const loadedMeta: LoadedDeckMeta = {
          ...rawMeta,
          extractedNotes: mergedEmbedded.notes,
          ...(mergedEmbedded.targets ? { extractedSlideTargets: mergedEmbedded.targets } : {}),
          ...(mergedEmbedded.pdfpcConfig
            ? { extractedPdfpcConfig: mergedEmbedded.pdfpcConfig }
            : {}),
        };
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

        const prevBundle = notesBundleRef.current ?? (await storageService.getNotes(loadedMeta.deckId));
        const updatedNotes = mergeHotReloadNotesBundle(prevBundle, {
          deckId: loadedMeta.deckId,
          fileName: loadedMeta.fileName,
          numPages: loadedMeta.numPages,
          extractedNotes: loadedMeta.extractedNotes,
          extractedTargets: loadedMeta.extractedSlideTargets,
          extractedPdfpcConfig: loadedMeta.extractedPdfpcConfig,
        });
        await storageService.saveNotes(updatedNotes);

        if (updatedNotes.qrUrl) {
          setQrOverlay((prev) => ({
            visible: prev.visible,
            url: updatedNotes.qrUrl!,
            label: updatedNotes.qrLabel ?? prev.label ?? '',
          }));
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

  typstCompiledHandlerRef.current = async (bytes, fileName, queryResult) => {
    if (!stateRef.current.meta) {
      await ingestPdfBytes(bytes, fileName, undefined, queryResult);
    } else {
      await hotReloadPdfBytes(bytes, fileName, queryResult);
    }
  };

  useEffect(() => {
    if (!tauriMode) return;
    let active = true;
    void (async () => {
      const req = await getLaunchFile();
      if (!active || !req) return;
      if (req.kind === 'typ') {
        await typstLive.startWatchPath(req.path);
      } else if (req.kind === 'pdf') {
        try {
          const bytes = await readLocalBinaryFile(req.path);
          if (!active) return;
          const fileName = req.path.split(/[\\/]/).pop() || 'deck.pdf';
          await ingestPdfBytes(bytes, fileName);
        } catch (err) {
          if (!active) return;
          setErrorMessage(
            `Error: Failed to open launch PDF "${req.path}" (${
              err instanceof Error ? err.message : String(err)
            }).`,
          );
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauriMode]);

  const handleToggleWatchPdf = useCallback(async () => {
    const watcher = fileWatchRef.current;
    if (!watcher) return;

    if (watcher.getPdfStatus().active) {
      watcher.stopPdfWatch();
      setPdfWatchStatus(watcher.getPdfStatus());
      setInfoMessage(t.msgWatchStopped);
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
        setErrorMessage(t.msgStoredDeckMissing);
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
            loadedMeta.extractedSlideTargets,
          );
          await storageService.saveNotes(activeNotes);
        }
        setNotesBundle(activeNotes);
        if (activeNotes.qrUrl) {
          setQrOverlay({
            visible: false,
            url: activeNotes.qrUrl,
            label: activeNotes.qrLabel ?? '',
          });
        }

        const derivedMin = deriveDurationMinutesFromSlides(activeNotes.slides);
        const targetMin =
          activeNotes.globalTargetSeconds !== DEFAULT_PREFS.countdownMinutes * 60
            ? Math.max(1, Math.round(activeNotes.globalTargetSeconds / 60))
            : derivedMin;
        if (targetMin !== undefined) {
          setCountdownMinutes(targetMin);
          setCountdownInputText(String(targetMin));
          await storageService.savePrefs({ countdownMinutes: targetMin });
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
    setExportMenuOpen(false);
    setActiveModal('none');
    setInfoMessage(null);
    setErrorMessage(null);
    await storageService.savePrefs({ activeDeckId: null });
    await refreshRecentDecks();
  }, [refreshRecentDecks, resetTimer]);

  const handleLoadSampleDeck = useCallback(async () => {
    setErrorMessage(null);
    try {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      const [pdfRes, notesRes] = await Promise.all([
        fetch(`${baseUrl}sample-deck.pdf`),
        fetch(`${baseUrl}sample-notes.md`).catch(() => null),
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

  const handleSidecarFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        const text = await file.text();
        const parsed = parseSidecarFileContent(text, file.name);
        setLinkedNotesSource(null);
        await applySidecarContent(
          text,
          file.name,
          meta?.deckId ?? 'unloaded-deck',
          meta?.fileName ?? 'deck.pdf',
          meta?.numPages,
        );
        void parsed;
      } catch (err) {
        setErrorMessage(
          `Error: Failed to parse sidecar file "${file.name}" (${
            err instanceof Error ? err.message : String(err)
          }).`,
        );
      }
    },
    [applySidecarContent, meta],
  );

  const handleChooseNotesFile = useCallback(async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (tauriMode) {
      try {
        const filePath = await pickNotesFilePath();
        if (!filePath) return;
        const text = await readLocalTextFile(filePath);
        const fileName = filePath.split(/[\\/]/).pop() || 'notes.md';
        const parsed = parseSidecarFileContent(text, fileName);
        setLinkedNotesSource({
          kind: 'tauri-path',
          fileName,
          filePath,
          format: detectNotesSourceFormat(fileName),
          isMarpOrSlidev: Boolean(parsed.isMarpOrSlidev),
        });
        await applySidecarContent(
          text,
          fileName,
          meta?.deckId ?? 'unloaded-deck',
          meta?.fileName ?? 'deck.pdf',
          meta?.numPages,
        );
        return;
      } catch (err) {
        setErrorMessage(
          `Error: Failed to open notes file (${err instanceof Error ? err.message : String(err)}).`,
        );
        return;
      }
    }

    if (fsAccessSupported) {
      try {
        const handle = await pickNotesFileHandle();
        if (!handle) return;
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = parseSidecarFileContent(text, handle.name);
        setLinkedNotesSource({
          kind: 'fs-handle',
          fileName: handle.name,
          handle,
          format: detectNotesSourceFormat(handle.name),
          isMarpOrSlidev: Boolean(parsed.isMarpOrSlidev),
        });
        await applySidecarContent(
          text,
          handle.name,
          meta?.deckId ?? 'unloaded-deck',
          meta?.fileName ?? 'deck.pdf',
          meta?.numPages,
        );
        return;
      } catch (err) {
        setErrorMessage(
          `Error: Failed to open notes file (${err instanceof Error ? err.message : String(err)}).`,
        );
        return;
      }
    }

    sidecarFileInputRef.current?.click();
  }, [applySidecarContent, fsAccessSupported, meta, tauriMode]);

  const handleSidecarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleSidecarFile(file);
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
      await handleSidecarFile(sidecarFile);
    } else if (sidecarFile && !meta) {
      setInfoMessage(null);
      setErrorMessage(t.msgNotesNeedPdfFirst);
    } else {
      setInfoMessage(null);
      setErrorMessage(t.msgUnsupportedDrop);
    }
  };

  const handleLaunchAudienceWindow = async () => {
    const base = window.location.href.split('#')[0] ?? window.location.origin + '/';
    const url = `${base}#/audience?session=${encodeURIComponent(sessionId)}`;
    const result = await launchAudienceDisplay({
      sessionId,
      audienceUrl: url,
      monitorIndex: selectedMonitorIndex,
      fullscreen: isTauriRuntime() && monitors.length > 1,
    });
    if (!result.opened && result.popupBlockedUrl) {
      setPopupBlockedUrl(result.popupBlockedUrl);
    } else if (result.opened) {
      setPopupBlockedUrl(null);
      setTimeout(() => broadcastStateSnapshot(), 150);
    } else {
      setErrorMessage(t.msgAudienceOpenFailed);
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
            color: laserColor,
          });
        } else if (prev === 'laser') {
          setLaserPoint(null);
          syncBridgeRef.current?.post({
            type: 'LASER_MOVE',
            active: false,
            point: null,
            color: laserColor,
          });
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
    [spotlightPoint, spotlightRadius, laserColor],
  );

  const handleSelectLaserColor = useCallback((color: string) => {
    setLaserColor(color);
    setLaserMenuAnchor(null);
    void storageService.savePrefs({ laserColor: color });
    const s = stateRef.current;
    syncBridgeRef.current?.post({
      type: 'LASER_MOVE',
      active: s.pointerTool === 'laser' && s.laserPoint !== null,
      point: s.pointerTool === 'laser' ? s.laserPoint : null,
      color,
    });
  }, []);

  const handleZoomChange = useCallback((nextZoom: ZoomState) => {
    setZoomState(nextZoom);
    syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: nextZoom });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomMode(false);
    setZoomState(DEFAULT_ZOOM_STATE);
    syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
  }, []);

  const handleToggleZoomMode = useCallback(() => {
    setZoomMode((prev) => {
      const next = !prev;
      if (!next && isZoomed(stateRef.current.zoomState)) {
        setZoomState(DEFAULT_ZOOM_STATE);
        syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
      }
      return next;
    });
  }, []);

  const handleToggleAudienceProgressBar = useCallback(() => {
    setAudienceProgressBar((prev) => {
      const next = !prev;
      void storageService.savePrefs({ audienceProgressBar: next });
      syncBridgeRef.current?.post({ type: 'PROGRESS_BAR', visible: next });
      return next;
    });
  }, []);

  const handleToggleQrOnAudience = useCallback(() => {
    setQrOverlay((prev) => {
      const next: QrOverlayState = {
        ...prev,
        visible: !prev.visible,
      };
      syncBridgeRef.current?.post({ type: 'QR_OVERLAY', overlay: next });
      return next;
    });
  }, []);

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
  const hasRepeatedLabels = useMemo(
    () => hasRepeatedPageLabels(meta?.pageLabels, meta?.numPages ?? 0),
    [meta?.pageLabels, meta?.numPages],
  );
  const resolvedNote = useMemo(
    () =>
      resolveNoteForPage(
        notesBundle?.slides,
        currentPage,
        meta?.pageLabels,
        meta?.numPages ?? 0,
        shareNotesByPageLabel,
      ),
    [notesBundle?.slides, currentPage, meta?.pageLabels, meta?.numPages, shareNotesByPageLabel],
  );
  const currentSlideEntry = resolvedNote.entry;
  const currentSlideMarkdown = currentSlideEntry?.markdown ?? '';
  const noteOwnerPage = resolvedNote.ownerPage;

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
        createEmptyNotesBundle(
          meta.deckId,
          meta.fileName,
          meta.extractedNotes,
          meta.extractedPdfpcConfig,
          meta.extractedSlideTargets,
        );
      const prevEntry = baseBundle.slides[noteOwnerPage] ?? currentSlideEntry;
      const nextEntry = {
        markdown: prevEntry?.markdown ?? '',
        ...(nextSeconds !== undefined ? { targetSeconds: nextSeconds } : {}),
        updatedAt: Date.now(),
        source: 'manual' as const,
      };
      const updatedBundle: DeckNotesBundle = {
        ...baseBundle,
        slides: {
          ...baseBundle.slides,
          [noteOwnerPage]: nextEntry,
        },
      };
      setNotesBundle(updatedBundle);
      await storageService.saveNotes(updatedBundle);
    },
    [meta, notesBundle, noteOwnerPage, currentSlideEntry],
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
      createEmptyNotesBundle(
        meta.deckId,
        meta.fileName,
        meta.extractedNotes,
        meta.extractedPdfpcConfig,
        meta.extractedSlideTargets,
      );
    const existingTarget =
      baseBundle.slides[noteOwnerPage]?.targetSeconds ?? currentSlideEntry?.targetSeconds;
    const updatedBundle: DeckNotesBundle = {
      ...baseBundle,
      slides: {
        ...baseBundle.slides,
        [noteOwnerPage]: {
          markdown: draftNoteText,
          ...(existingTarget !== undefined ? { targetSeconds: existingTarget } : {}),
          updatedAt: Date.now(),
          source: 'manual',
        },
      },
    };
    setNotesBundle(updatedBundle);
    setIsEditingNotes(false);
    await storageService.saveNotes(updatedBundle);
  }, [meta, notesBundle, noteOwnerPage, currentSlideEntry?.targetSeconds, draftNoteText]);

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
      setInfoMessage(t.msgNoEmbeddedNotes);
      return;
    }
    const freshBundle = createEmptyNotesBundle(
      meta.deckId,
      meta.fileName,
      meta.extractedNotes,
      meta.extractedPdfpcConfig,
      meta.extractedSlideTargets,
    );
    setNotesBundle(freshBundle);
    await storageService.saveNotes(freshBundle);
    setInfoMessage(
      locale === 'ja'
        ? `${extractedEntries.length} スライド分の埋め込みノートを取り込みました。`
        : `Imported embedded notes for ${extractedEntries.length} slide(s).`,
    );
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

  const handleOverwriteLinkedMarkdown = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    const evalResult = evaluateDirectOverwrite(linkedNotesSource);
    if (!evalResult.allowed) {
      if (evalResult.reason === 'marp-slidev-protected') {
        setErrorMessage(t.msgOverwriteMarpProtected);
        return;
      }
      handleExportNotes('md');
      return;
    }

    const bundle =
      notesBundle ??
      createEmptyNotesBundle(meta?.deckId ?? 'deck', meta?.fileName ?? 'deck.pdf');
    const content = exportNotesToMarkdown(bundle, meta?.numPages ?? 1);
    try {
      await overwriteLinkedMarkdown(linkedNotesSource, content, writeLocalTextFile);
      setInfoMessage(`${t.msgOverwriteMdSuccess} ${linkedNotesSource!.fileName}`);
    } catch (err) {
      setErrorMessage(
        `Error: Failed to overwrite "${linkedNotesSource!.fileName}" (${
          err instanceof Error ? err.message : String(err)
        }).`,
      );
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
          source: 'manual',
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
        locale === 'ja'
          ? `${appliedCount} スライド分の実測時間を目標時間へ反映しました。`
          : `Applied actual rehearsal times as slide targets for ${appliedCount} slide(s).`,
      );
    },
    [meta, notesBundle, locale],
  );

  const handleClearStageOverlay = useCallback(() => {
    if (curtainMode !== 'none') {
      setCurtainMode('none');
      syncBridgeRef.current?.post({ type: 'CURTAIN', mode: 'none' });
    }
    if (pointerTool !== 'none') {
      if (pointerTool === 'laser') {
        setLaserPoint(null);
        syncBridgeRef.current?.post({
          type: 'LASER_MOVE',
          active: false,
          point: null,
          color: laserColor,
        });
      } else if (pointerTool === 'spotlight') {
        setSpotlightPoint(null);
        syncBridgeRef.current?.post({
          type: 'SPOTLIGHT_MOVE',
          active: false,
          point: null,
          radius: spotlightRadius,
        });
      }
      setPointerTool('none');
    }
    if (zoomMode || isZoomed(zoomState)) {
      setZoomMode(false);
      setZoomState(DEFAULT_ZOOM_STATE);
      syncBridgeRef.current?.post({ type: 'ZOOM_STATE', zoom: DEFAULT_ZOOM_STATE });
    }
  }, [curtainMode, pointerTool, spotlightRadius, laserColor, zoomMode, zoomState]);

  const handleOpenStatsModal = useCallback(() => {
    setNowTick(Date.now());
    setActiveModal((prev) => (prev === 'stats' ? 'none' : 'stats'));
  }, []);

  // Focus-safe global keyboard shortcuts
  usePresenterShortcuts({
    numPages: meta?.numPages ?? null,
    currentPage,
    isEditingNotes,
    activeModal,
    curtainMode,
    pointerTool,
    zoomMode,
    zoomScale: zoomState.scale,
    onNavigateToSlide: navigateToSlide,
    onSaveNotesEditor: saveNotesEditor,
    onSetActiveModal: setActiveModal,
    onSetHelpInitialTab: setHelpInitialTab,
    onOpenStatsModal: handleOpenStatsModal,
    onOpenNotesEditor: openNotesEditor,
    onToggleCurtain: handleToggleCurtain,
    onToggleFreeze: handleToggleFreeze,
    onToggleTool: handleToggleTool,
    onToggleZoomMode: handleToggleZoomMode,
    onResetZoom: handleResetZoom,
    onClearStageOverlay: handleClearStageOverlay,
    onClearInk: handleClearInk,
    onToggleInkVisibility: handleToggleInkVisibility,
    onAdjustSpotlightRadius: handleAdjustSpotlightRadius,
    onAdjustPenSize: handleAdjustPenSize,
  });

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
      currentSlideEntry?.targetSeconds,
      nowTick,
    ],
  );

  const { ringManual, lastBell } = useChimeAlerts({
    enabled: chimeEnabled,
    volume: chimeVolume,
    running: timerRunning,
    remainingMs: timerSnapshot.remainingMs,
    lastMinutesWarning,
    countdownMinutes,
    resetToken: chimeResetToken,
  });

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
      void storageService.savePrefs({ countdownMinutes: clamped });
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

  const commitSlideJump = (raw: string) => {
    if (!meta) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= meta.numPages) {
      navigateToSlide(parsed);
    } else {
      setJumpInputText(String(currentPage));
    }
  };

  const iconBtnClass =
    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white';

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
          className="flex w-full items-center justify-between rounded py-1.5 pr-3 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="truncate">{node.title || t.untitledSection}</span>
          {node.pageNumber && (
            <span className="ml-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
              p.{node.pageNumber}
            </span>
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
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
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

      {/* Top Toolbar: Fixed 2-Row Layout (Zero Height Drift Across JP/EN & Light/Dark) */}
      <header
        role="toolbar"
        aria-label="Presenter controls"
        className="flex shrink-0 flex-col border-b border-slate-200 bg-white text-xs text-slate-900 select-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        {/* Row 1: Files, Monitors, Audience & Global Toggles */}
        <div className="flex h-10 flex-nowrap items-center justify-between gap-1.5 overflow-x-auto overflow-y-hidden border-b border-slate-200/80 px-2.5 [scrollbar-width:none] dark:border-slate-800/80 [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
            <span className="mr-1 text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              {t.appTitle}
            </span>

            <button
              type="button"
              data-coachmark-group="row1"
              data-coachmark-block="deck-files"
              onClick={() => pdfFileInputRef.current?.click()}
              title={t.openPdf}
              aria-label={t.openPdf}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t.openPdf}</span>
            </button>

            {tauriMode && (
              <button
                type="button"
                data-testid="open-typst-button"
                data-coachmark-group="row1"
                data-coachmark-block="deck-files"
                onClick={() => void typstLive.pickAndStartWatch()}
                title={t.openTypstBtn}
                aria-label={t.openTypstBtn}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.openTypstBtn}</span>
              </button>
            )}

            {tauriMode &&
              (typstLive.watchedPath ||
                typstLive.buildStatus === 'error' ||
                (typstLive.cliStatus && !typstLive.cliStatus.available)) && (
                <button
                  type="button"
                  data-testid="typst-status-badge"
                  onClick={() => typstLive.setDrawerOpen(true)}
                  className={`inline-flex h-7 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-semibold transition ${
                    typstLive.buildStatus === 'error' ||
                    (typstLive.cliStatus && !typstLive.cliStatus.available)
                      ? 'border-red-400 bg-red-600 text-white hover:bg-red-500'
                      : typstLive.buildStatus === 'compiling'
                        ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-400'
                        : 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  <span>
                    {typstLive.buildStatus === 'error' ||
                    (typstLive.cliStatus && !typstLive.cliStatus.available)
                      ? t.typstStatusError
                      : typstLive.buildStatus === 'compiling'
                        ? t.typstStatusCompiling
                        : t.typstStatusOk}
                  </span>
                </button>
              )}

            <button
              type="button"
              data-coachmark-group="row1"
              data-coachmark-block="deck-files"
              onClick={handleLoadSampleDeck}
              title={t.loadSampleDeck}
              aria-label={t.loadSampleDeck}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-blue-600 px-2 text-xs font-medium text-white transition hover:bg-blue-500"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t.sampleShortBtn}</span>
            </button>

            {meta && (
              <button
                type="button"
                data-testid="close-deck-button"
                data-coachmark-group="row1"
                data-coachmark-block="deck-files"
                title={t.recentDecksTooltip}
                aria-label={t.recentDecksTooltip}
                onClick={() => void handleCloseDeck()}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t.recentDecksBtn}</span>
              </button>
            )}

            {fsAccessSupported && (
              <button
                type="button"
                data-testid="watch-pdf-button"
                data-coachmark-group="row1"
                data-coachmark-block="deck-files"
                aria-pressed={pdfWatchStatus.active}
                title={
                  pdfWatchStatus.active
                    ? `${t.stopWatch}: ${pdfWatchStatus.fileName ?? 'PDF'}`
                    : t.watchPdfTooltip
                }
                aria-label={pdfWatchStatus.active ? t.stopWatch : t.watchPdf}
                onClick={() => void handleToggleWatchPdf()}
                className={`inline-flex h-7 shrink-0 items-center gap-1 rounded border px-2 text-xs font-medium transition ${
                  pdfWatchStatus.active
                    ? 'border-amber-500 bg-amber-600 text-white hover:bg-amber-500'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
                }`}
              >
                <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{pdfWatchStatus.active ? t.stopWatch : t.watchPdf}</span>
              </button>
            )}
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
            {(tauriMode || monitors.length > 0) && (
              <select
                data-testid="monitor-select"
                data-coachmark-group="row1"
                data-coachmark-block="audience-display"
                title={t.monitorSelectTooltip}
                aria-label="Target display"
                value={selectedMonitorIndex !== undefined ? String(selectedMonitorIndex) : ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  setSelectedMonitorIndex(raw === '' ? undefined : Number.parseInt(raw, 10));
                }}
                className="h-7 w-[116px] truncate rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {monitors.length === 0 ? (
                  <option value="">{t.defaultDisplay}</option>
                ) : (
                  monitors.map((m) => (
                    <option key={m.index} value={m.index}>
                      {m.name} ({m.width}x{m.height}){m.isPrimary ? ` ${t.primaryTag}` : ''}
                    </option>
                  ))
                )}
              </select>
            )}

            {(tauriMode || monitors.length > 0 || webScreenDetailsSupported) && (
              <button
                type="button"
                data-testid="refresh-monitors-button"
                data-coachmark-group="row1"
                data-coachmark-block="audience-display"
                aria-label={t.refreshDisplaysAria}
                title={t.refreshDisplaysAria}
                onClick={() => void refreshMonitors()}
                className={iconBtnClass}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              data-coachmark-group="row1"
              data-coachmark-block="audience-display"
              title={t.launchAudienceWindow}
              aria-label={t.launchAudienceWindow}
              onClick={() => void handleLaunchAudienceWindow()}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-emerald-600 px-2 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              <Presentation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t.audienceShortBtn}</span>
            </button>

            <span
              data-testid="audience-status"
              data-coachmark-group="row1"
              data-coachmark-block="audience-display"
              title={t.audienceStatusTooltip}
              className={`inline-flex h-7 w-[92px] shrink-0 items-center justify-center gap-1 rounded border px-1.5 text-[11px] font-medium ${
                audienceConnected
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  audienceConnected ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
                }`}
              />
              <span>{audienceConnected ? t.audienceConnected : t.audienceDisconnected}</span>
            </span>

            <button
              type="button"
              data-testid="qr-overlay-button"
              data-coachmark-group="row1"
              data-coachmark-block="audience-display"
              aria-label={t.qrBtn}
              title={t.qrBtn}
              aria-pressed={qrOverlay.visible}
              onClick={() => setActiveModal((prev) => (prev === 'qr' ? 'none' : 'qr'))}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                qrOverlay.visible
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="audience-progress-toggle"
              data-coachmark-group="row1"
              data-coachmark-block="audience-display"
              aria-label={t.progressBarToggle}
              title={t.progressBarToggle}
              aria-pressed={audienceProgressBar}
              onClick={handleToggleAudienceProgressBar}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                audienceProgressBar
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="1.5"
                  y="2.5"
                  width="11"
                  height="7.5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  opacity="0.7"
                />
                <rect x="1.5" y="11.5" width="11" height="1.5" rx="0.75" fill="currentColor" opacity="0.3" />
                <rect x="1.5" y="11.5" width="7" height="1.5" rx="0.75" fill="currentColor" />
              </svg>
            </button>

            <div
              aria-hidden="true"
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
            />

            <button
              type="button"
              data-testid="theme-toggle"
              data-coachmark-group="row1"
              data-coachmark-block="app-settings"
              aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
              title={theme === 'dark' ? t.themeToLight : t.themeToDark}
              onClick={toggleTheme}
              className={iconBtnClass}
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              data-testid="locale-toggle"
              data-coachmark-group="row1"
              data-coachmark-block="app-settings"
              title={t.localeToggleTitle}
              aria-label={t.localeToggleTitle}
              onClick={toggleLocale}
              className="inline-flex h-7 w-[52px] shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span className={locale === 'ja' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}>
                JP
              </span>
              <span className="mx-0.5 text-slate-400 dark:text-slate-500">/</span>
              <span className={locale === 'en' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}>
                EN
              </span>
            </button>

            <button
              type="button"
              data-testid="ui-guide-overlay-toggle"
              data-coachmark-group="row1"
              data-coachmark-block="app-settings"
              aria-label={t.uiGuideBtn}
              title={t.uiGuideBtn}
              aria-pressed={activeModal === 'ui-guide'}
              onClick={() => setActiveModal((prev) => (prev === 'ui-guide' ? 'none' : 'ui-guide'))}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                activeModal === 'ui-guide'
                  ? 'border-sky-500 bg-sky-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-coachmark-group="row1"
              data-coachmark-block="app-settings"
              aria-label={t.helpBtn}
              title={t.helpBtn}
              onClick={() => {
                setHelpInitialTab('shortcuts');
                setActiveModal((prev) => (prev === 'help' ? 'none' : 'help'));
              }}
              className={iconBtnClass}
            >
              <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Row 2: Slide Navigation, Stage Controls, Annotation Tools & View Modals */}
        <div className="flex h-9 flex-nowrap items-center justify-between gap-1.5 overflow-x-auto overflow-y-hidden px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Left: Slide navigation & counter */}
          <div className="flex h-7 min-w-[124px] shrink-0 flex-nowrap items-center gap-1">
            {meta && (
              <>
                <button
                  type="button"
                  data-coachmark-group="row2"
                  data-coachmark-block="slide-nav"
                  disabled={currentPage <= 1}
                  aria-label={t.prevSlideTooltip}
                  title={t.prevSlideTooltip}
                  onClick={() => navigateToSlide(currentPage - 1)}
                  className={iconBtnClass}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>

                <div
                  data-testid="slide-counter"
                  data-coachmark-group="row2"
                  data-coachmark-block="slide-nav"
                  title={t.jumpInputTooltip}
                  className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-950 dark:text-slate-200"
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
                    className="w-9 rounded border border-slate-300 bg-white px-1 py-0.5 text-center text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span>/ {meta.numPages}</span>
                  <span className="sr-only">
                    {currentPage} / {meta.numPages}
                  </span>
                </div>

                <button
                  type="button"
                  data-coachmark-group="row2"
                  data-coachmark-block="slide-nav"
                  disabled={currentPage >= meta.numPages}
                  aria-label={t.nextSlideTooltip}
                  title={t.nextSlideTooltip}
                  onClick={() => navigateToSlide(currentPage + 1)}
                  className={iconBtnClass}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* Center: Crop, Curtains & Pointer/Ink tools */}
          <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
            <select
              aria-label="Crop mode"
              data-testid="crop-mode-select"
              data-coachmark-group="row2"
              data-coachmark-block="split-crop"
              title={t.cropSelectTooltip}
              value={cropMode}
              onChange={(e) => handleSelectCropMode(e.target.value as CropMode)}
              className="h-7 w-[92px] rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="full">{t.cropFull}</option>
              <option value="split-horizontal">{t.cropSplitHorizontal}</option>
              <option value="split-vertical">{t.cropSplitVertical}</option>
            </select>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="split-crop"
              aria-label={t.swapHalves}
              title={t.swapHalves}
              disabled={cropMode === 'full'}
              onClick={handleToggleSwapSplit}
              className={iconBtnClass}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <div
              aria-hidden="true"
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
            />

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="stage-curtain"
              aria-label={t.blackoutBtn}
              title={t.blackoutBtn}
              aria-pressed={curtainMode === 'black'}
              onClick={() => handleToggleCurtain('black')}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                curtainMode === 'black'
                  ? 'border-amber-500 bg-amber-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <BlackoutScreenIcon />
            </button>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="stage-curtain"
              aria-label={t.whiteoutBtn}
              title={t.whiteoutBtn}
              aria-pressed={curtainMode === 'white'}
              onClick={() => handleToggleCurtain('white')}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                curtainMode === 'white'
                  ? 'border-amber-500 bg-amber-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <WhiteoutScreenIcon />
            </button>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="stage-curtain"
              aria-label={t.freezeBtn}
              title={t.freezeBtn}
              aria-pressed={frozen}
              onClick={handleToggleFreeze}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                frozen
                  ? 'border-cyan-500 bg-cyan-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Snowflake className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <div
              aria-hidden="true"
              className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700"
            />

            <div className="flex h-7 shrink-0 items-center overflow-hidden rounded border border-slate-200 bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800">
              <button
                type="button"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                aria-label={t.laserBtn}
                title={t.laserBtn}
                aria-pressed={pointerTool === 'laser'}
                onClick={() => handleToggleTool('laser')}
                className={`relative inline-flex h-full w-7 shrink-0 items-center justify-center transition ${
                  pointerTool === 'laser'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: laserColor }}
                  className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-white/80 dark:ring-slate-900"
                />
              </button>
              <button
                ref={laserMenuBtnRef}
                type="button"
                data-testid="laser-color-menu-button"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                aria-label={t.laserColorMenuTooltip}
                title={t.laserColorMenuTooltip}
                aria-haspopup="menu"
                aria-expanded={laserMenuAnchor !== null}
                onClick={() => {
                  if (laserMenuAnchor) {
                    setLaserMenuAnchor(null);
                    return;
                  }
                  const rect = laserMenuBtnRef.current?.getBoundingClientRect();
                  if (rect) {
                    setLaserMenuAnchor({
                      top: Math.round(rect.bottom + 4),
                      left: Math.max(8, Math.round(rect.left - 32)),
                    });
                  }
                }}
                className="inline-flex h-full w-4 shrink-0 items-center justify-center border-l border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              data-testid="zoom-toggle-button"
              data-coachmark-group="row2"
              data-coachmark-block="pointer-ink"
              aria-label={t.zoomBtn}
              title={t.zoomBtn}
              aria-pressed={zoomMode || isZoomed(zoomState)}
              onClick={handleToggleZoomMode}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                zoomMode || isZoomed(zoomState)
                  ? 'border-blue-500 bg-blue-600 text-white'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {/* Pen Tool Group: Toggle + Swatches + Live Thickness Stepper */}
            <div className="flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50/90 px-1 dark:border-slate-800 dark:bg-slate-950/60">
              <button
                type="button"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                aria-label={t.penBtn}
                title={t.penBtn}
                aria-pressed={pointerTool === 'pen'}
                onClick={() => handleToggleTool('pen')}
                className={`inline-flex h-5 w-6 shrink-0 items-center justify-center rounded transition ${
                  pointerTool === 'pen'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <div
                role="group"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                title={t.inkColorsLabel}
                aria-label="Ink colors"
                className="flex items-center gap-1 px-0.5"
              >
                {PEN_COLOR_SWATCHES.map((swatch) => {
                  const selected = penColor === swatch.hex;
                  const isWhite = swatch.id === 'white';
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
                      className={`h-3.5 w-3.5 rounded-full border transition ${
                        selected
                          ? 'scale-110 border-slate-900 ring-2 ring-blue-500 dark:border-white dark:ring-blue-400'
                          : isWhite
                            ? 'border-slate-500 opacity-95 hover:opacity-100'
                            : 'border-slate-500/60 opacity-85 hover:opacity-100 dark:border-slate-600'
                      }`}
                    />
                  );
                })}
              </div>

              <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

              <div
                role="group"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                title={t.penWidthLabel}
                aria-label="Pen width"
                className="flex h-5 shrink-0 items-center overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-800"
              >
                <button
                  type="button"
                  aria-label="Pen size -"
                  title={t.penMinus}
                  onClick={() => handleAdjustPenSize(-0.004)}
                  className="inline-flex h-full w-5 items-center justify-center text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
                <span
                  aria-hidden="true"
                  className="flex h-full w-4 items-center justify-center bg-slate-100 dark:bg-slate-900"
                >
                  <span
                    style={{
                      backgroundColor: penColor,
                      width: `${Math.max(4, Math.min(10, Math.round(penWidth * 550 + 3)))}px`,
                      height: `${Math.max(4, Math.min(10, Math.round(penWidth * 550 + 3)))}px`,
                    }}
                    className={`rounded-full ${
                      penColor.toLowerCase() === '#ffffff' ? 'ring-1 ring-slate-500' : ''
                    }`}
                  />
                </span>
                <button
                  type="button"
                  aria-label="Pen size +"
                  title={t.penPlus}
                  onClick={() => handleAdjustPenSize(0.004)}
                  className="inline-flex h-full w-5 items-center justify-center text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Spotlight Tool Group: Toggle + Radius Percentage Stepper */}
            <div className="flex h-7 shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50/90 px-1 dark:border-slate-800 dark:bg-slate-950/60">
              <button
                type="button"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                aria-label={t.spotlightBtn}
                title={t.spotlightBtn}
                aria-pressed={pointerTool === 'spotlight'}
                onClick={() => handleToggleTool('spotlight')}
                className={`inline-flex h-5 w-6 shrink-0 items-center justify-center rounded transition ${
                  pointerTool === 'spotlight'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Focus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <div
                role="group"
                data-coachmark-group="row2"
                data-coachmark-block="pointer-ink"
                title={t.spotlightSizeLabel}
                aria-label="Spotlight radius"
                className="flex h-5 shrink-0 items-center overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-800"
              >
                <button
                  type="button"
                  data-testid="spotlight-size-down"
                  aria-label="Spotlight size -"
                  title={`${t.spotMinus} (${Math.round(spotlightRadius * 100)}%)`}
                  onClick={() => handleAdjustSpotlightRadius(-0.04)}
                  className="inline-flex h-full w-5 items-center justify-center text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
                <span
                  data-testid="spotlight-radius-readout"
                  aria-hidden="true"
                  className="inline-flex h-full min-w-[26px] items-center justify-center bg-slate-100 px-1 font-mono text-[10px] font-semibold text-slate-700 tabular-nums dark:bg-slate-900 dark:text-slate-300"
                >
                  {Math.round(spotlightRadius * 100)}%
                </span>
                <button
                  type="button"
                  data-testid="spotlight-size-up"
                  aria-label="Spotlight size +"
                  title={`${t.spotPlus} (${Math.round(spotlightRadius * 100)}%)`}
                  onClick={() => handleAdjustSpotlightRadius(0.04)}
                  className="inline-flex h-full w-5 items-center justify-center text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="ink-actions"
              aria-label={t.undoBtn}
              title={t.undoBtn}
              onClick={handleUndoStroke}
              className={iconBtnClass}
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="ink-actions"
              aria-label={t.clearInkBtn}
              title={t.clearInkBtn}
              onClick={handleClearInk}
              className={iconBtnClass}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="toggle-ink-visibility"
              data-coachmark-group="row2"
              data-coachmark-block="ink-actions"
              aria-label={t.inkBtn}
              title={t.inkBtn}
              aria-pressed={inkVisible}
              onClick={handleToggleInkVisibility}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                inkVisible
                  ? 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  : 'border-purple-500 bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {inkVisible ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Right: Guard, Rehearsal Stats, Grid & Outline */}
          <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
            <button
              type="button"
              data-testid="guard-toggle"
              data-coachmark-group="row2"
              data-coachmark-block="views-guard"
              aria-label={t.guardBtn}
              title={t.guardBtn}
              aria-pressed={guardEnabled}
              onClick={() => setGuardEnabled((prev) => !prev)}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${
                guardEnabled
                  ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {guardEnabled ? (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              data-testid="open-stats-button"
              data-coachmark-group="row2"
              data-coachmark-block="views-guard"
              aria-label={t.statsBtn}
              title={t.statsBtn}
              disabled={!meta}
              onClick={() => {
                if (!meta) return;
                setNowTick(Date.now());
                setActiveModal((prev) => (prev === 'stats' ? 'none' : 'stats'));
              }}
              className={iconBtnClass}
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="views-guard"
              aria-label={t.gridAria}
              title={t.gridBtn}
              onClick={() => setActiveModal((prev) => (prev === 'grid' ? 'none' : 'grid'))}
              className={iconBtnClass}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-coachmark-group="row2"
              data-coachmark-block="views-guard"
              aria-label={t.outlineBtn}
              title={t.outlineBtn}
              onClick={() => setActiveModal((prev) => (prev === 'outline' ? 'none' : 'outline'))}
              className={iconBtnClass}
            >
              <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Fixed Laser Color Popover (positioned outside Row 2 overflow-y-hidden) */}
      {laserMenuAnchor && (
        <div
          ref={laserPopoverRef}
          role="menu"
          data-testid="laser-color-popover"
          aria-label={t.laserColorMenuTooltip}
          style={{ top: `${laserMenuAnchor.top}px`, left: `${laserMenuAnchor.left}px` }}
          className="fixed z-50 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          {LASER_COLOR_SWATCHES.map((swatch) => {
            const selected = laserColor.toLowerCase() === swatch.hex.toLowerCase();
            const label =
              swatch.id === 'red'
                ? t.laserColorRed
                : swatch.id === 'green'
                  ? t.laserColorGreen
                  : t.laserColorBlue;
            return (
              <button
                key={swatch.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                data-testid={`laser-color-${swatch.id}`}
                aria-label={label}
                title={label}
                onClick={() => handleSelectLaserColor(swatch.hex)}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                  selected
                    ? 'bg-slate-200 text-slate-900 ring-1 ring-blue-500 dark:bg-slate-700 dark:text-white'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/70'
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: swatch.hex }}
                  className="h-2.5 w-2.5 rounded-full"
                />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div
          role="alert"
          data-testid="error-banner"
          className="flex items-center justify-between border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/90 dark:text-red-200"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-4 rounded bg-red-200 px-2 py-0.5 text-red-900 hover:bg-red-300 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800"
          >
            {t.dismiss}
          </button>
        </div>
      )}

      {/* Info banner */}
      {infoMessage && (
        <div
          role="status"
          data-testid="info-banner"
          className="flex items-center justify-between border-b border-blue-300 bg-blue-50 px-4 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/90 dark:text-blue-200"
        >
          <span>{infoMessage}</span>
          <button
            type="button"
            onClick={() => setInfoMessage(null)}
            className="ml-4 rounded bg-blue-200 px-2 py-0.5 text-blue-900 hover:bg-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800"
          >
            {t.dismiss}
          </button>
        </div>
      )}

      {/* Popup-Blocked fallback banner */}
      {popupBlockedUrl && (
        <div
          role="alert"
          data-testid="popup-blocked-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/90 dark:text-amber-100"
        >
          <span>
            {t.popupBlockedPrefix}{' '}
            <code className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono dark:bg-black/40">
              {popupBlockedUrl}
            </code>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(popupBlockedUrl).catch(() => {});
              }}
              className="rounded bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-500"
            >
              {t.copyUrl}
            </button>
            <button
              type="button"
              onClick={() => setPopupBlockedUrl(null)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100 dark:border-transparent dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      )}

      {/* Touying Split-Page Auto-Detection Banner */}
      {showSplitSuggestionBanner && (
        <div
          role="alert"
          data-testid="split-banner"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-300 bg-indigo-50 px-4 py-2 text-xs text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/90 dark:text-indigo-100"
        >
          <span>{t.splitDetectedMessage}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectCropMode('split-horizontal')}
              className="rounded bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-500"
            >
              {t.applySplitLR}
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
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100 dark:border-transparent dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.dismiss}
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
            className="flex w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white/90 p-8 text-center shadow-sm transition hover:border-blue-500 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-none dark:hover:bg-slate-900"
          >
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.onboardingDropTitle}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t.onboardingDropDesc}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.onboardingSupports}
            </p>
            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => pdfFileInputRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {t.choosePdfFile}
              </button>
              <button
                type="button"
                onClick={handleLoadSampleDeck}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                {t.loadSampleDeck}
              </button>
              <button
                type="button"
                data-testid="onboarding-quick-guide-button"
                onClick={() => {
                  setHelpInitialTab('quickstart');
                  setActiveModal('help');
                }}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t.quickGuideBtn}
              </button>
            </div>
          </div>

          {/* 3-Step Quick Start Strip */}
          <section
            data-testid="onboarding-quickstart"
            aria-label={t.quickStartHeading}
            className="mt-4 w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none"
          >
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.quickStartHeading}
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {t.quickStartStep1Title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {t.quickStartStep1Desc}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {t.quickStartStep2Title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {t.quickStartStep2Desc}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {t.quickStartStep3Title}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {t.quickStartStep3Desc}
                </p>
              </div>
            </div>
          </section>

          {recentDecks.length > 0 && (
            <section
              data-testid="recent-decks-section"
              aria-label="Recent decks"
              className="mt-4 w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none"
            >
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t.recentDecksTitle}
              </h2>
              <ul className="space-y-2">
                {recentDecks.map((deck) => (
                  <li
                    key={deck.deckId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {deck.fileName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
                        {t.openRecent}
                      </button>
                      <button
                        type="button"
                        data-testid={`delete-recent-${deck.deckId}`}
                        onClick={() => void handleDeleteRecentDeck(deck.deckId)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-transparent dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-900/60"
                      >
                        {t.deleteRecent}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-12 lg:overflow-hidden">
          {/* Left / Center: Current Slide Stage */}
          <div className="relative flex min-h-[260px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-200/70 p-2 shadow-sm lg:col-span-7 lg:min-h-0 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            {qrOverlay.visible && (
              <div
                data-testid="presenter-qr-active-badge"
                className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full border border-blue-400/60 bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-blue-100 shadow-md"
              >
                <QrCode className="h-3 w-3 text-blue-400" aria-hidden="true" />
                <span>{t.qrActiveBadge}</span>
                <button
                  type="button"
                  onClick={handleToggleQrOnAudience}
                  className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {(zoomMode || isZoomed(zoomState)) && (
              <div
                data-testid="zoom-hud"
                className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-100 shadow-md"
              >
                <span className="font-mono font-semibold tabular-nums">
                  {zoomState.scale.toFixed(1)}x
                </span>
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() =>
                    handleZoomChange(zoomAtPoint(zoomState, zoomState.scale / 1.25, 0.5, 0.5))
                  }
                  className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                >
                  -
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() =>
                    handleZoomChange(zoomAtPoint(zoomState, zoomState.scale * 1.25, 0.5, 0.5))
                  }
                  className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                >
                  +
                </button>
                <button
                  type="button"
                  data-testid="zoom-reset-button"
                  onClick={handleResetZoom}
                  className="rounded bg-blue-600 px-1.5 py-0.5 font-medium text-white hover:bg-blue-500"
                >
                  {t.zoomResetBtn}
                </button>
              </div>
            )}

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
              laserColor={laserColor}
              laserPoint={laserPoint}
              spotlightPoint={spotlightPoint}
              spotlightRadius={spotlightRadius}
              strokes={strokesByPage[currentPage] ?? []}
              inkVisible={inkVisible}
              curtainMode={curtainMode}
              isAudience={false}
              zoomState={zoomState}
              zoomMode={zoomMode}
              onZoomChange={handleZoomChange}
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
                  color: laserColor,
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
          <div className="flex flex-col gap-3 lg:col-span-5 lg:overflow-hidden">
            {/* Top row of right column: Next Slide Preview & Timer Panel */}
            <div className="grid grid-cols-12 gap-2.5">
              {/* Next Slide Preview */}
              <section
                aria-label="Next slide panel"
                className="col-span-5 flex flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
              >
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold uppercase tracking-wider">{t.nextSlide}</span>
                  <span>
                    {currentPage < meta.numPages
                      ? `${t.slideLabel} ${currentPage + 1}`
                      : t.finalSlide}
                  </span>
                </div>
                <div className="flex h-32 items-center justify-center overflow-hidden rounded border border-slate-200/80 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
                  {currentPage < meta.numPages ? (
                    <ThumbnailCanvas
                      engine={engineRef.current}
                      deckId={meta.deckId}
                      pageNumber={currentPage + 1}
                      cropRegion={slideRegion}
                      targetWidth={260}
                      targetHeight={120}
                      testId="next-slide-canvas"
                      ariaLabel="Next slide preview"
                      onClick={() => navigateToSlide(currentPage + 1)}
                    />
                  ) : (
                    <div
                      data-testid="end-of-presentation"
                      className="text-center text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      {t.endOfPresentation}
                    </div>
                  )}
                </div>
              </section>

              {/* Timer & Pacing Panel */}
              <section
                data-testid="timer-panel"
                aria-label="Timer panel"
                className="col-span-7 flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t.clock}{' '}
                    <span
                      data-testid="wall-clock"
                      className="font-mono text-slate-800 dark:text-slate-200"
                    >
                      {formatWallClock(nowTick)}
                    </span>{' '}
                  </div>

                  <div
                    data-testid="pacing-badge"
                    data-pacing={timerSnapshot.pacingStatus}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      timerSnapshot.pacingStatus === 'overtime'
                        ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300'
                        : timerSnapshot.pacingStatus === 'warning'
                          ? 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : timerSnapshot.pacingStatus === 'ahead'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    }`}
                  >
                    {timerSnapshot.pacingStatus}
                  </div>
                </div>

                {/* Elapsed & Countdown */}
                <div className="my-1.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 dark:border-transparent dark:bg-slate-950">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {t.elapsed}
                    </div>
                    <div
                      data-testid="elapsed-timer"
                      aria-label="Elapsed time"
                      className="font-mono text-base font-bold text-slate-900 dark:text-slate-100"
                    >
                      {formatDurationMMSS(timerSnapshot.totalElapsedMs)}
                    </div>
                  </div>

                  <div
                    className={`rounded px-2 py-1 ${
                      timerSnapshot.remainingMs < 0
                        ? 'border border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/70 dark:text-red-300 danger overtime'
                        : timerSnapshot.lastMinutesWarning
                          ? 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-300 warning'
                          : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-transparent dark:bg-slate-950 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{t.remaining}</span>
                      {timerSnapshot.lastMinutesWarning && (
                        <span
                          data-status="warning"
                          data-warning="true"
                          data-testid="timer-warning-badge"
                          className="font-bold text-amber-600 dark:text-amber-400"
                        >
                          {t.warn}
                        </span>
                      )}
                    </div>
                    <div
                      data-testid="countdown-timer"
                      className={`font-mono text-base font-bold ${
                        timerSnapshot.remainingMs < 0
                          ? 'text-red-600 dark:text-red-400 overtime'
                          : ''
                      }`}
                    >
                      {formatCountdownMMSS(timerSnapshot.remainingMs)}
                    </div>
                  </div>
                </div>

                {/* Per-slide timer */}
                <div className="mb-1.5 flex items-center justify-between gap-1 text-[11px] whitespace-nowrap text-slate-500 dark:text-slate-400">
                  <span>
                    {t.slidePrefix}{' '}
                    <strong
                      data-testid="slide-elapsed"
                      className="font-mono text-slate-800 dark:text-slate-200"
                    >
                      {formatDurationMMSS(timerSnapshot.slideElapsedMs)}
                    </strong>
                    {currentSlideEntry?.targetSeconds
                      ? ` / ${formatDurationMMSS(currentSlideEntry.targetSeconds * 1000)}`
                      : ''}
                  </span>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap">
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
                    <span>{t.autoStart}</span>
                  </label>
                </div>

                {/* Start / Pause / Reset buttons */}
                <div className="mb-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={startTimer}
                    className="flex-1 whitespace-nowrap rounded bg-emerald-600 px-1.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 xl:text-xs dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    {t.start}
                  </button>
                  <button
                    type="button"
                    onClick={pauseTimer}
                    className="flex-1 whitespace-nowrap rounded bg-amber-600 px-1.5 py-1 text-[11px] font-medium text-white hover:bg-amber-500 xl:text-xs dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    {t.pause}
                  </button>
                  <button
                    type="button"
                    onClick={resetTimer}
                    className="flex-1 whitespace-nowrap rounded border border-slate-300 bg-slate-100 px-1.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 xl:text-xs dark:border-transparent dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {t.reset}
                  </button>
                </div>

                {/* Duration & Warning inputs */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <label className="flex min-w-0 flex-col text-slate-500 dark:text-slate-400">
                    <span className="truncate">{t.durationMin}</span>
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
                      className="mt-0.5 rounded border border-slate-300 bg-slate-50 px-1 py-0.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>

                  <label className="flex min-w-0 flex-col text-slate-500 dark:text-slate-400">
                    <span className="truncate">{t.warningMin}</span>
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
                      className="mt-0.5 rounded border border-slate-300 bg-slate-50 px-1 py-0.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>

                {/* Conference Chime Controls (Default OFF) */}
                <div
                  data-testid="chime-controls"
                  data-last-bell={lastBell ? String(lastBell.count) : ''}
                  className="mt-1.5 flex items-center justify-between gap-1 border-t border-slate-200/80 pt-1.5 text-[10px] dark:border-slate-800"
                >
                  <button
                    type="button"
                    data-testid="chime-toggle"
                    aria-pressed={chimeEnabled}
                    title={t.chimeToggleTooltip}
                    onClick={() => {
                      setChimeEnabled((prev) => {
                        const next = !prev;
                        void storageService.savePrefs({ chimeEnabled: next });
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium transition ${
                      chimeEnabled
                        ? 'border-amber-500 bg-amber-600 text-white'
                        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {chimeEnabled ? (
                      <Bell className="h-3 w-3 shrink-0" aria-hidden="true" />
                    ) : (
                      <BellOff className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span>{t.chimeLabel}</span>
                  </button>

                  <input
                    type="range"
                    data-testid="chime-volume"
                    aria-label={t.chimeVolumeLabel}
                    title={t.chimeVolumeLabel}
                    min={0}
                    max={1}
                    step={0.1}
                    value={chimeVolume}
                    onChange={(e) => {
                      const next = clampChimeVolume(Number.parseFloat(e.target.value));
                      setChimeVolume(next);
                      void storageService.savePrefs({ chimeVolume: next });
                    }}
                    className="h-1.5 w-14 cursor-pointer accent-amber-500"
                  />

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="chime-test-1"
                      title={t.chimeTest1Label}
                      aria-label={t.chimeTest1Label}
                      onClick={() => ringManual(1)}
                      className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      1🔔
                    </button>
                    <button
                      type="button"
                      data-testid="chime-ring-3"
                      title={t.chimeRing3Label}
                      aria-label={t.chimeRing3Label}
                      onClick={() => ringManual(3)}
                      className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      3🔔
                    </button>
                  </div>
                </div>
              </section>
            </div>

            {/* Speaker Notes Panel */}
            <section
              data-testid="notes-panel"
              aria-label="Speaker notes"
              className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:min-h-0 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
            >
              <div className="mb-2 flex h-9 shrink-0 flex-nowrap items-center justify-between gap-1 border-b border-slate-200 pb-1.5 text-xs dark:border-slate-800">
                <div className="flex min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 xl:text-xs dark:text-slate-300">
                    {t.speakerNotesTitle}
                  </span>
                  <button
                    type="button"
                    data-coachmark-group="notes"
                    data-coachmark-block="notes-font"
                    aria-label={t.fontDecreaseTooltip}
                    title={t.fontDecreaseTooltip}
                    onClick={() => void handleAdjustFontSize(-2)}
                    className="inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-slate-100 px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 xl:h-7 xl:px-2 xl:text-xs dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    data-coachmark-group="notes"
                    data-coachmark-block="notes-font"
                    aria-label={t.fontIncreaseTooltip}
                    title={t.fontIncreaseTooltip}
                    onClick={() => void handleAdjustFontSize(2)}
                    className="inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-slate-100 px-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 xl:h-7 xl:px-2 xl:text-xs dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    A+
                  </button>
                  <label
                    data-coachmark-group="notes"
                    data-coachmark-block="notes-target"
                    title={t.slideTargetTooltip}
                    className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"
                  >
                    <span>{t.targetLabel}</span>
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
                      className="h-6 w-9 rounded border border-slate-300 bg-slate-50 px-1 text-center font-mono text-xs text-slate-900 xl:w-10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <span>{t.secondsUnit}</span>
                  </label>
                </div>

                <div className="flex shrink-0 flex-nowrap items-center gap-1">
                  {!isEditingNotes ? (
                    <button
                      type="button"
                      data-coachmark-group="notes"
                      data-coachmark-block="notes-io"
                      aria-label={t.editNotesBtn}
                      title={t.editNotesBtn}
                      onClick={openNotesEditor}
                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-white transition hover:bg-blue-500 xl:h-7 xl:w-7"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-coachmark-group="notes"
                      data-coachmark-block="notes-io"
                      aria-label={t.saveNotesBtn}
                      title={t.saveNotesBtn}
                      onClick={() => void saveNotesEditor()}
                      className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-600 text-white transition hover:bg-emerald-500 xl:h-7 xl:w-7"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="open-notes-import-button"
                    data-coachmark-group="notes"
                    data-coachmark-block="notes-io"
                    aria-label={t.importNotesBtn}
                    title={t.importNotesBtn}
                    onClick={() => setActiveModal('notes-import')}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 xl:h-7 xl:w-7 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    data-coachmark-group="notes"
                    data-coachmark-block="notes-io"
                    aria-label={t.importEmbeddedBtn}
                    title={t.importEmbeddedBtn}
                    onClick={() => void handleImportEmbeddedNotes()}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 xl:h-7 xl:w-7 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <div ref={exportMenuRef} className="relative">
                    <button
                      type="button"
                      data-coachmark-group="notes"
                      data-coachmark-block="notes-io"
                      aria-haspopup="menu"
                      aria-expanded={exportMenuOpen}
                      aria-label={t.exportNotesBtn}
                      title={t.exportNotesBtn}
                      onClick={() => setExportMenuOpen((prev) => !prev)}
                      className="inline-flex h-6 items-center gap-0.5 rounded border border-slate-200 bg-slate-100 px-1.5 text-slate-700 transition hover:bg-slate-200 hover:text-slate-900 xl:h-7 xl:px-2 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <ChevronDown className="h-3 w-3 opacity-75" aria-hidden="true" />
                    </button>

                    {exportMenuOpen && (
                      <div
                        role="menu"
                        aria-label={t.exportNotesBtn}
                        className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                      >
                        {linkedNotesSource && (
                          <button
                            type="button"
                            role="menuitem"
                            data-testid="overwrite-notes-md-button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              void handleOverwriteLinkedMarkdown();
                            }}
                            className="flex w-full items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-slate-100 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-700"
                          >
                            <Save className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{t.overwriteNotesMdItem}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setExportMenuOpen(false);
                            handleExportNotes('md');
                          }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {t.exportMdItem}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setExportMenuOpen(false);
                            handleExportNotes('json');
                          }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {t.exportJsonItem}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setExportMenuOpen(false);
                            handleExportNotes('pdfpc');
                          }}
                          className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {t.exportPdfpcItem}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {hasRepeatedLabels && (
                <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] dark:border-slate-800 dark:bg-slate-950/70">
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      data-testid="logical-slide-toggle"
                      checked={shareNotesByPageLabel}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShareNotesByPageLabel(next);
                        void storageService.savePrefs({ shareNotesByPageLabel: next });
                      }}
                    />
                    <span>{t.logicalShareLabel}</span>
                  </label>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    <span>
                      #{resolvedNote.group.label} ({resolvedNote.group.subIndex}/
                      {resolvedNote.group.subCount})
                    </span>
                    {resolvedNote.inheritedFromPage !== null && (
                      <span
                        data-testid="logical-inherited-badge"
                        className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        {t.logicalInheritedFrom}
                        {resolvedNote.inheritedFromPage}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {isEditingNotes ? (
                <div className="flex flex-1 flex-col gap-2">
                  <textarea
                    aria-label="Speaker notes editor"
                    value={draftNoteText}
                    onChange={(e) => setDraftNoteText(e.target.value)}
                    placeholder={t.notesEditorPlaceholder}
                    className="flex-1 resize-none rounded border border-slate-300 bg-slate-50 p-2.5 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              ) : (
                <div
                  data-testid="notes-content"
                  style={{ fontSize: `${noteFontSizePx}px` }}
                  className="prose prose-sm max-w-none flex-1 overflow-y-auto leading-relaxed text-slate-800 dark:prose-invert dark:text-slate-200"
                >
                  {currentSlideMarkdown.trim().length > 0 ? (
                    <ReactMarkdown>{currentSlideMarkdown}</ReactMarkdown>
                  ) : (
                    <div className="flex flex-col items-start gap-2.5 py-2">
                      <p
                        style={{ fontSize: `${noteFontSizePx}px` }}
                        className="m-0 italic text-slate-400 dark:text-slate-500"
                      >
                        {t.noNotesPlaceholder}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={openNotesEditor}
                          className="rounded border border-slate-300 bg-slate-100 px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {t.quickEditHintBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveModal('notes-import')}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t.quickImportHintBtn}
                        </button>
                      </div>
                    </div>
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
          className="fixed inset-0 z-40 flex flex-col bg-slate-100/95 p-6 text-slate-900 backdrop-blur-sm dark:bg-slate-950/95 dark:text-slate-100"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t.gridOverviewTitle}
            </h2>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.closeEsc}
            </button>
          </div>
          <div className="grid flex-1 content-start grid-cols-3 gap-4 overflow-y-auto p-2 md:grid-cols-4">
            {Array.from({ length: meta.numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                onClick={() => {
                  navigateToSlide(pageNum);
                  setActiveModal('none');
                }}
                className={`flex cursor-pointer flex-col items-center rounded-lg border p-2 transition ${
                  pageNum === currentPage
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-950/50">
                  <ThumbnailCanvas
                    engine={engineRef.current}
                    deckId={meta.deckId}
                    pageNumber={pageNum}
                    cropRegion={slideRegion}
                    targetWidth={280}
                    targetHeight={136}
                    testId={`thumb-canvas-${pageNum}`}
                    ariaLabel={`Slide ${pageNum} thumbnail`}
                    onClick={() => {
                      navigateToSlide(pageNum);
                      setActiveModal('none');
                    }}
                  />
                </div>
                <span className="mt-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.slideLabel} {pageNum}
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
          className="fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t.outlineTitle}
            </h2>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {t.close}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {meta && meta.outline.length > 0 ? (
              renderOutlineNodes(meta.outline)
            ) : (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {t.noOutlineAvailable}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Notes Import Modal */}
      {activeModal === 'notes-import' && (
        <NotesImportModal
          hasDeck={Boolean(meta)}
          embeddedNotesCount={Object.keys(meta?.extractedNotes ?? {}).length}
          onClose={() => setActiveModal('none')}
          onChooseNotesFile={() => {
            void handleChooseNotesFile();
          }}
          onDropNotesFile={(file) => {
            void handleSidecarFile(file);
          }}
          onImportEmbeddedNotes={() => {
            void handleImportEmbeddedNotes();
          }}
          onDownloadTemplate={(content) => {
            triggerTextDownload('notes-template.md', content, 'text/markdown;charset=utf-8');
          }}
        />
      )}

      {/* Help & Quick Start Modal (?) */}
      {activeModal === 'help' && (
        <HelpModal initialTab={helpInitialTab} onClose={() => setActiveModal('none')} />
      )}

      {/* Simultaneous UI Tooltips Overlay (I) */}
      {activeModal === 'ui-guide' && (
        <UiGuideOverlay onClose={() => setActiveModal('none')} />
      )}

      {/* Q&A QR Code Instant Overlay Modal */}
      {activeModal === 'qr' && (
        <QrOverlayModal
          url={qrOverlay.url}
          label={qrOverlay.label ?? ''}
          visibleOnAudience={qrOverlay.visible}
          onChangeUrl={(nextUrl) => {
            setQrOverlay((prev) => {
              const next: QrOverlayState = { ...prev, url: nextUrl };
              if (next.visible) {
                syncBridgeRef.current?.post({ type: 'QR_OVERLAY', overlay: next });
              }
              return next;
            });
          }}
          onChangeLabel={(nextLabel) => {
            setQrOverlay((prev) => {
              const next: QrOverlayState = { ...prev, label: nextLabel };
              if (next.visible) {
                syncBridgeRef.current?.post({ type: 'QR_OVERLAY', overlay: next });
              }
              return next;
            });
          }}
          onToggleAudience={handleToggleQrOnAudience}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Rehearsal Stats Modal (R) */}
      {activeModal === 'stats' && meta && rehearsalReport && (
        <RehearsalStatsModal
          report={rehearsalReport}
          deckFileName={meta.fileName}
          pageLabels={meta.pageLabels}
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

      {/* Typst Live Compile Drawer */}
      {typstLive.drawerOpen && (
        <TypstCompileDrawer
          cliStatus={typstLive.cliStatus}
          watchedPath={typstLive.watchedPath}
          buildStatus={typstLive.buildStatus}
          lastDurationMs={typstLive.lastDurationMs}
          diagnostics={typstLive.diagnostics}
          rootDir={typstLive.rootDir}
          inputsText={typstLive.inputsText}
          fontPathsText={typstLive.fontPathsText}
          fonts={typstLive.fonts}
          loadingFonts={typstLive.loadingFonts}
          onChangeRootDir={typstLive.setRootDir}
          onChangeInputsText={typstLive.setInputsText}
          onChangeFontPathsText={typstLive.setFontPathsText}
          onRefreshCli={() => void typstLive.refreshCliStatus()}
          onPickTypstFile={() => void typstLive.pickAndStartWatch()}
          onRecompile={() => void typstLive.recompileNow()}
          onStopWatch={() => void typstLive.stopWatch()}
          onRefreshFonts={() => void typstLive.refreshFonts()}
          onClose={() => typstLive.setDrawerOpen(false)}
        />
      )}

      {/* Tauri Close Guard Confirmation Modal */}
      {closeGuardModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.closeGuardModalTitle}
          data-testid="close-guard-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCloseGuardModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] dark:bg-black/75"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <h2 className="text-base font-bold">{t.closeGuardModalTitle}</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {t.closeGuardModalDesc}
            </p>
            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCloseGuardModalOpen(false)}
                className="rounded border border-slate-300 bg-slate-100 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {t.closeGuardKeepPresenting}
              </button>
              <button
                type="button"
                data-testid="close-guard-force-exit"
                onClick={() => {
                  setCloseGuardModalOpen(false);
                  setGuardEnabled(false);
                  void forceCloseApp();
                }}
                className="rounded bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
              >
                {t.closeGuardForceExit}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
