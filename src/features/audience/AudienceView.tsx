import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlideStage } from '../../components/SlideStage.tsx';
import { useI18n } from '../../core/i18n/I18nContext.tsx';
import { PdfEngine } from '../../core/pdf/PdfEngine.ts';
import type { CropMode } from '../../core/pdf/types.ts';
import { resolveSplitCropRegions } from '../../core/pdf/viewportMath.ts';
import {
  getAudienceWindowFullscreen,
  isTauriRuntime,
  setAudienceWindowFullscreen,
} from '../../core/platform/DesktopBridge.ts';
import { generateQrSvg } from '../../core/qr/qrSvg.ts';
import { storageService } from '../../core/storage/StorageService.ts';
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
import { DEFAULT_ZOOM_STATE } from '../../core/zoom/zoomMath.ts';

function parseSessionIdFromHash(hash: string): string {
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return 'default';
  const search = new URLSearchParams(hash.slice(qIndex + 1));
  return search.get('session')?.trim() || 'default';
}

const IDLE_CURSOR_MS = 2500;

function checkIsFullscreen(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  const docWithWebkit = document as Document & { webkitFullscreenElement?: Element | null };
  if (docWithWebkit.fullscreenElement || docWithWebkit.webkitFullscreenElement) {
    return true;
  }
  if (isTauriRuntime() && window.screen) {
    return (
      window.innerWidth >= window.screen.width && window.innerHeight >= window.screen.height
    );
  }
  return false;
}

export function AudienceView() {
  const { t } = useI18n();
  const [sessionId, setSessionId] = useState<string>(() =>
    parseSessionIdFromHash(window.location.hash),
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => checkIsFullscreen());
  const isFullscreenRef = useRef<boolean>(isFullscreen);
  isFullscreenRef.current = isFullscreen;
  const [cursorHidden, setCursorHidden] = useState<boolean>(false);
  const engineRef = useRef<PdfEngine | null>(null);
  const loadedDeckIdRef = useRef<string | null>(null);
  const inFlightDeckIdRef = useRef<string | null>(null);
  const inFlightLoadPromiseRef = useRef<Promise<void> | null>(null);
  const frozenRef = useRef<boolean>(false);
  const pendingPageRef = useRef<number>(1);
  const strokesByPageRef = useRef<Record<number, InkStroke[]>>({});
  const [renderVersion, setRenderVersion] = useState<number>(0);

  const [deckId, setDeckId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [cropMode, setCropMode] = useState<CropMode>('full');
  const [swapSplitHalves, setSwapSplitHalves] = useState<boolean>(false);
  const [curtainMode, setCurtainMode] = useState<CurtainMode>('none');
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [inkVisible, setInkVisible] = useState<boolean>(true);
  const [pointerTool, setPointerTool] = useState<PointerTool>('none');
  const [laserColor, setLaserColor] = useState<string>('#ef4444');
  const [laserPoint, setLaserPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightPoint, setSpotlightPoint] = useState<NormalizedPoint | null>(null);
  const [spotlightRadius, setSpotlightRadius] = useState<number>(0.16);
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM_STATE);
  const [qrOverlay, setQrOverlay] = useState<QrOverlayState>({ visible: false, url: '' });
  const [audienceProgressBar, setAudienceProgressBar] = useState<boolean>(false);

  if (!engineRef.current) {
    engineRef.current = new PdfEngine();
  }

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#000000';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  useEffect(() => {
    const onHash = () => {
      setSessionId(parseSessionIdFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadDeckFromStorage = async (targetDeckId: string, targetPage?: number) => {
    if (targetPage !== undefined && targetPage >= 1) {
      pendingPageRef.current = targetPage;
      if (!frozenRef.current) {
        setCurrentPage(targetPage);
      }
    }

    if (loadedDeckIdRef.current === targetDeckId && engineRef.current?.isLoaded()) {
      setDeckId(targetDeckId);
      return;
    }

    if (inFlightDeckIdRef.current === targetDeckId && inFlightLoadPromiseRef.current) {
      await inFlightLoadPromiseRef.current;
      return;
    }

    inFlightDeckIdRef.current = targetDeckId;
    const task = (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const stored = await storageService.getDeck(targetDeckId);
        if (stored && stored.bytes && engineRef.current) {
          try {
            const loadedMeta = await engineRef.current.loadDeck(stored.bytes, stored.fileName);
            loadedDeckIdRef.current = targetDeckId;
            setDeckId(targetDeckId);
            setTotalPages((prev) => (loadedMeta.numPages > 0 ? loadedMeta.numPages : prev));
            setRenderVersion((v) => v + 1);
            if (!frozenRef.current && pendingPageRef.current >= 1) {
              setCurrentPage(pendingPageRef.current);
            }
            return;
          } catch {
            // Retry briefly if superseded or settling
          }
        }
        await new Promise((r) => setTimeout(r, 80));
      }
    })();

    inFlightLoadPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (inFlightLoadPromiseRef.current === task) {
        inFlightLoadPromiseRef.current = null;
        inFlightDeckIdRef.current = null;
      }
    }
  };

  const enterFullscreen = useCallback(() => {
    if (isTauriRuntime()) {
      void setAudienceWindowFullscreen(true).then((ok) => {
        if (ok) setIsFullscreen(true);
      });
      return;
    }
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exitFullscreen = useCallback(() => {
    if (isTauriRuntime()) {
      void setAudienceWindowFullscreen(false).then((ok) => {
        if (ok) setIsFullscreen(false);
      });
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreenRef.current) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen]);

  useEffect(() => {
    let active = true;
    const syncFullscreen = () => {
      if (isTauriRuntime()) {
        void getAudienceWindowFullscreen().then((fs) => {
          if (!active) return;
          setIsFullscreen(fs !== null ? fs : checkIsFullscreen());
        });
        return;
      }
      setIsFullscreen(checkIsFullscreen());
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    window.addEventListener('resize', syncFullscreen);
    return () => {
      active = false;
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      window.removeEventListener('resize', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleHide = () => {
      setCursorHidden(false);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setCursorHidden(true);
      }, IDLE_CURSOR_MS);
    };

    scheduleHide();
    window.addEventListener('mousemove', scheduleHide);
    window.addEventListener('mousedown', scheduleHide);
    window.addEventListener('pointermove', scheduleHide);
    window.addEventListener('touchstart', scheduleHide);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('mousemove', scheduleHide);
      window.removeEventListener('mousedown', scheduleHide);
      window.removeEventListener('pointermove', scheduleHide);
      window.removeEventListener('touchstart', scheduleHide);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const bridge = new SyncBridge(sessionId, 'audience');

    // Attempt initial recovery from IndexedDB session snapshot
    void storageService.getSessionSnapshot(sessionId).then((snap) => {
      if (!active || !snap || !snap.deckId) return;
      frozenRef.current = snap.frozen;
      pendingPageRef.current = snap.currentPage;
      setTotalPages(snap.totalPages ?? 0);
      setCropMode(snap.cropMode);
      setSwapSplitHalves(snap.swapSplitHalves);
      setCurtainMode(snap.curtainMode);
      setCurrentPage(snap.currentPage);
      if (snap.audienceProgressBar !== undefined) {
        setAudienceProgressBar(Boolean(snap.audienceProgressBar));
      }
      void loadDeckFromStorage(snap.deckId, snap.currentPage);
    });

    const handleSyncMessage = (msg: SyncMessage) => {
      if (!active) return;

      switch (msg.type) {
        case 'STATE_SNAPSHOT': {
          const wasFrozen = frozenRef.current;
          frozenRef.current = msg.frozen;
          pendingPageRef.current = msg.currentPage;

          setTotalPages(msg.totalPages);
          setCropMode(msg.cropMode);
          setSwapSplitHalves(msg.swapSplitHalves);
          setCurtainMode(msg.curtainMode);
          setInkVisible(msg.inkVisible);
          setPointerTool(msg.pointerTool);
          if (msg.laserColor) {
            setLaserColor(msg.laserColor);
          }
          setLaserPoint(msg.laserPoint);
          setSpotlightPoint(msg.spotlightPoint);
          setSpotlightRadius(msg.spotlightRadius);
          if (msg.zoomState) {
            setZoomState(msg.zoomState);
          }
          if (msg.qrOverlay) {
            setQrOverlay(msg.qrOverlay);
          }
          if (msg.audienceProgressBar !== undefined) {
            setAudienceProgressBar(msg.audienceProgressBar);
          }

          if (!msg.frozen || !wasFrozen || loadedDeckIdRef.current === null) {
            setCurrentPage(msg.currentPage);
            strokesByPageRef.current[msg.currentPage] = msg.strokesForPage;
            setStrokes(msg.strokesForPage);
          }

          if (msg.deckId) {
            void loadDeckFromStorage(
              msg.deckId,
              msg.frozen && loadedDeckIdRef.current !== null ? undefined : msg.currentPage,
            );
          } else {
            loadedDeckIdRef.current = null;
            setDeckId(null);
            setTotalPages(0);
          }
          break;
        }
        case 'DECK_READY': {
          void loadDeckFromStorage(msg.deckId, 1);
          break;
        }
        case 'NAVIGATE': {
          pendingPageRef.current = msg.page;
          if (msg.strokesForPage) {
            strokesByPageRef.current[msg.page] = msg.strokesForPage;
          }
          if (!frozenRef.current) {
            setCurrentPage(msg.page);
            setStrokes(strokesByPageRef.current[msg.page] ?? []);
            setZoomState(DEFAULT_ZOOM_STATE);
          }
          break;
        }
        case 'FREEZE': {
          frozenRef.current = msg.frozen;
          if (!msg.frozen) {
            const target = pendingPageRef.current;
            setCurrentPage(target);
            setStrokes(strokesByPageRef.current[target] ?? []);
          }
          break;
        }
        case 'CROP_MODE': {
          setCropMode(msg.cropMode);
          setSwapSplitHalves(msg.swapSplitHalves);
          break;
        }
        case 'CURTAIN': {
          setCurtainMode(msg.mode);
          break;
        }
        case 'LASER_MOVE': {
          setPointerTool(msg.active ? 'laser' : 'none');
          if (msg.color) {
            setLaserColor(msg.color);
          }
          setLaserPoint(msg.active ? msg.point : null);
          break;
        }
        case 'SPOTLIGHT_MOVE': {
          setPointerTool(msg.active ? 'spotlight' : 'none');
          setSpotlightPoint(msg.active ? msg.point : null);
          setSpotlightRadius(msg.radius);
          break;
        }
        case 'ZOOM_STATE': {
          setZoomState(msg.zoom);
          break;
        }
        case 'QR_OVERLAY': {
          setQrOverlay(msg.overlay);
          break;
        }
        case 'PROGRESS_BAR': {
          setAudienceProgressBar(msg.visible);
          break;
        }
        case 'STROKE_ADD':
        case 'STROKE_UPDATE': {
          const p = msg.stroke.page;
          const existing = strokesByPageRef.current[p] ?? [];
          const idx = existing.findIndex((s) => s.id === msg.stroke.id);
          const next =
            idx >= 0
              ? existing.map((s, i) => (i === idx ? msg.stroke : s))
              : [...existing, msg.stroke];
          strokesByPageRef.current[p] = next;
          if (!frozenRef.current || p === currentPage) {
            setStrokes(next);
          }
          break;
        }
        case 'STROKE_UNDO': {
          const p = msg.page;
          const existing = strokesByPageRef.current[p] ?? [];
          const next = existing.slice(0, -1);
          strokesByPageRef.current[p] = next;
          setStrokes(next);
          break;
        }
        case 'STROKE_CLEAR': {
          const p = msg.page;
          strokesByPageRef.current[p] = [];
          setStrokes([]);
          break;
        }
        case 'INK_VISIBILITY': {
          setInkVisible(msg.visible);
          break;
        }
        default:
          break;
      }
    };

    const unsub = bridge.onMessage(handleSyncMessage);
    bridge.start();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && isTauriRuntime() && isFullscreenRef.current) {
        e.preventDefault();
        exitFullscreen();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        e.key === 'ArrowDown' ||
        e.key === ' '
      ) {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_NAVIGATE', delta: 1 });
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_NAVIGATE', delta: -1 });
      } else if (e.key === 'Home') {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_ACTION', action: 'first' });
      } else if (e.key === 'End') {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_ACTION', action: 'last' });
      } else if (e.key === '.' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_ACTION', action: 'toggle-blackout' });
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        bridge.post({ type: 'REQUEST_ACTION', action: 'toggle-whiteout' });
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      active = false;
      window.removeEventListener('keydown', onKeyDown);
      unsub();
      bridge.destroy();
    };
  }, [sessionId, toggleFullscreen, exitFullscreen]);

  const { slideRegion } = resolveSplitCropRegions(cropMode, swapSplitHalves);
  const qrSvgMarkup = useMemo(() => {
    if (!qrOverlay.visible || qrOverlay.url.trim().length === 0) {
      return '';
    }
    return generateQrSvg(qrOverlay.url);
  }, [qrOverlay.visible, qrOverlay.url]);

  const progressPct =
    totalPages > 0 ? Math.max(0, Math.min(100, (currentPage / totalPages) * 100)) : 0;

  return (
    <main
      data-testid="audience-shell"
      data-cursor-hidden={cursorHidden ? 'true' : 'false'}
      style={{ backgroundColor: '#000000' }}
      onDoubleClick={toggleFullscreen}
      className={`relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-slate-200 ${
        cursorHidden ? 'cursor-none' : ''
      }`}
    >
      {deckId ? (
        <SlideStage
          engine={engineRef.current}
          deckId={deckId ? `${deckId}-${renderVersion}` : null}
          pageNumber={currentPage}
          cropRegion={slideRegion}
          canvasTestId="audience-slide-canvas"
          stageTestId="audience-stage"
          interactive={false}
          showLinks={false}
          pointerTool={pointerTool}
          laserColor={laserColor}
          laserPoint={laserPoint}
          spotlightPoint={spotlightPoint}
          spotlightRadius={spotlightRadius}
          strokes={strokes}
          inkVisible={inkVisible}
          curtainMode={curtainMode}
          isAudience={true}
          zoomState={zoomState}
        />
      ) : (
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-200">{t.audienceStandbyTitle}</h1>
          <p className="mt-2 text-sm text-slate-400">{t.audienceStandbySubtitle}</p>
        </div>
      )}

      {/* Q&A QR Code Instant Overlay */}
      {curtainMode === 'none' && qrOverlay.visible && qrSvgMarkup && (
        <div
          data-testid="audience-qr-overlay"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6"
        >
          <div className="flex max-w-sm flex-col items-center rounded-2xl border border-slate-700 bg-white p-6 text-slate-900 shadow-2xl">
            <div
              data-testid="audience-qr-svg"
              className="h-56 w-56 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
            />
            {qrOverlay.label && qrOverlay.label.trim().length > 0 && (
              <div className="mt-3 text-center text-sm font-semibold text-slate-900">
                {qrOverlay.label}
              </div>
            )}
            <div className="mt-1.5 max-w-xs break-all text-center font-mono text-xs text-slate-600">
              {qrOverlay.url}
            </div>
          </div>
        </div>
      )}

      {/* Ultra-thin 2px Audience Progress Bar (default OFF) */}
      {curtainMode === 'none' && audienceProgressBar && deckId && totalPages > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed right-0 bottom-0 left-0 z-30 h-[2px] bg-white/15"
        >
          <div
            data-testid="audience-progress-bar"
            role="progressbar"
            aria-valuenow={currentPage}
            aria-valuemin={1}
            aria-valuemax={totalPages}
            style={{ width: `${progressPct}%` }}
            className="h-full bg-white/85 transition-[width] duration-200"
          />
        </div>
      )}

      {/* Fullscreen hint pill */}
      {curtainMode === 'none' && !isFullscreen && (
        <button
          type="button"
          onClick={enterFullscreen}
          data-testid="fullscreen-prompt"
          className="fixed right-2 bottom-2.5 z-20 rounded bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-400 transition-opacity hover:bg-slate-800 hover:text-slate-200"
        >
          {t.fullscreenPrompt}
        </button>
      )}

      {/* Blackout / Whiteout pure curtain overlay */}
      {curtainMode === 'black' && (
        <div
          data-testid="audience-blackout-curtain"
          style={{ backgroundColor: '#000000' }}
          className="fixed inset-0 z-50 bg-black"
        />
      )}
      {curtainMode === 'white' && (
        <div
          data-testid="audience-whiteout-curtain"
          style={{ backgroundColor: '#ffffff' }}
          className="fixed inset-0 z-50 bg-white"
        />
      )}
    </main>
  );
}
