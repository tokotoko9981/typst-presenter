import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../core/i18n/I18nContext.tsx';
import type { PdfEngine } from '../core/pdf/PdfEngine.ts';
import type { CropRegion, PdfLinkAnnotation } from '../core/pdf/types.ts';
import type {
  CurtainMode,
  InkStroke,
  NormalizedPoint,
  PointerTool,
  ZoomState,
} from '../core/sync/types.ts';
import {
  DEFAULT_ZOOM_STATE,
  isZoomed,
  panByNormalizedDelta,
  zoomAtPoint,
} from '../core/zoom/zoomMath.ts';

export const LASER_COLOR_SWATCHES = [
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
] as const;

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [239, 68, 68];
}

export interface SlideStageProps {
  engine: PdfEngine | null;
  deckId: string | null;
  pageNumber: number;
  cropRegion: CropRegion;
  canvasTestId: string;
  stageTestId: string;
  interactive?: boolean;
  showLinks?: boolean;
  pointerTool?: PointerTool;
  penColor?: string;
  penWidth?: number;
  laserColor?: string;
  laserPoint?: NormalizedPoint | null;
  spotlightPoint?: NormalizedPoint | null;
  spotlightRadius?: number;
  strokes?: InkStroke[];
  inkVisible?: boolean;
  curtainMode?: CurtainMode;
  isAudience?: boolean;
  zoomState?: ZoomState;
  zoomMode?: boolean;
  onZoomChange?: (next: ZoomState) => void;
  onNavigatePage?: (targetPage: number) => void;
  onSwipeNext?: () => void;
  onSwipePrev?: () => void;
  onLaserMove?: (point: NormalizedPoint | null) => void;
  onSpotlightMove?: (point: NormalizedPoint | null) => void;
  onSpotlightRadiusDelta?: (delta: number) => void;
  onHoverPointChange?: (point: NormalizedPoint | null) => void;
  onStrokeCommit?: (stroke: InkStroke) => void;
  onStrokeLiveUpdate?: (stroke: InkStroke) => void;
}

function clamp01(val: number): number {
  if (val <= 0) return 0;
  if (val >= 1) return 1;
  return val;
}

export function SlideStage({
  engine,
  deckId,
  pageNumber,
  cropRegion,
  canvasTestId,
  stageTestId,
  interactive = false,
  showLinks = false,
  pointerTool = 'none',
  penColor = '#ef4444',
  penWidth = 0.008,
  laserColor = '#ef4444',
  laserPoint = null,
  spotlightPoint = null,
  spotlightRadius = 0.16,
  strokes = [],
  inkVisible = true,
  curtainMode = 'none',
  isAudience = false,
  zoomState = DEFAULT_ZOOM_STATE,
  zoomMode = false,
  onZoomChange,
  onNavigatePage,
  onSwipeNext,
  onSwipePrev,
  onLaserMove,
  onSpotlightMove,
  onSpotlightRadiusDelta,
  onHoverPointChange,
  onStrokeCommit,
  onStrokeLiveUpdate,
}: SlideStageProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const laserTrailRef = useRef<Array<{ x: number; y: number; ts: number }>>([]);
  const [trailTick, setTrailTick] = useState<number>(0);
  const [spotlightPinned, setSpotlightPinned] = useState<boolean>(false);
  const [settledZoomScale, setSettledZoomScale] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panDragRef = useRef<{ lastX: number; lastY: number; zoom: ZoomState } | null>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });
  const [links, setLinks] = useState<PdfLinkAnnotation[]>([]);
  const [activeDraftStroke, setActiveDraftStroke] = useState<InkStroke | null>(null);

  const touchStartRef = useRef<{ startX: number; lastX: number; startY: number; lastY: number } | null>(
    null,
  );

  // Measure outer stage container synchronously before first paint so initial PDF render uses real bounds
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(160, Math.floor(rect.width || el.clientWidth || 960));
      const h = Math.max(90, Math.floor(rect.height || el.clientHeight || 540));
      setContainerSize((prev) =>
        prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };

    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateSize());
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Debounce high-resolution PDF re-render when zoomed so math/tables stay crisp
  useEffect(() => {
    if (!isZoomed(zoomState)) {
      setSettledZoomScale(1);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSettledZoomScale(zoomState.scale);
    }, 180);
    return () => clearTimeout(timer);
  }, [zoomState.scale, zoomState.panX, zoomState.panY]);

  // Render PDF page offscreen and atomically blit to visible canvas on completion
  useEffect(() => {
    const visibleCanvas = pdfCanvasRef.current;
    if (
      !engine ||
      !deckId ||
      !engine.isLoaded() ||
      !visibleCanvas ||
      !containerSize ||
      pageNumber < 1
    ) {
      return;
    }

    const controller = new AbortController();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const offscreenCanvas = document.createElement('canvas');
    const targetWidth = Math.max(120, containerSize.width - 8);
    const targetHeight = Math.max(80, containerSize.height - 8);

    void engine
      .renderPageToCanvas(pageNumber, offscreenCanvas, {
        targetWidth,
        targetHeight,
        dpr,
        cropRegion,
        zoomScale: settledZoomScale,
        signal: controller.signal,
      })
      .then((res) => {
        if (res && !controller.signal.aborted) {
          if (offscreenCanvas.width > 0 && offscreenCanvas.height > 0) {
            visibleCanvas.width = offscreenCanvas.width;
            visibleCanvas.height = offscreenCanvas.height;
            visibleCanvas.style.width = `${res.cssWidth}px`;
            visibleCanvas.style.height = `${res.cssHeight}px`;
            const ctx = visibleCanvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
              ctx.drawImage(offscreenCanvas, 0, 0);
            }
          }
          setRenderedSize({ width: res.cssWidth, height: res.cssHeight });
          if (settledZoomScale <= 1.01) {
            engine.prefetchAdjacentPages(pageNumber, {
              targetWidth,
              targetHeight,
              dpr,
              cropRegion,
            });
          }
        }
      })
      .catch(() => {
        // Ignore cancelled or superseded render errors
      });

    return () => {
      controller.abort();
    };
  }, [
    engine,
    deckId,
    pageNumber,
    cropRegion,
    containerSize?.width,
    containerSize?.height,
    settledZoomScale,
  ]);

  // Extract clickable links for the active page & cropRegion
  useEffect(() => {
    if (!showLinks || !engine || !deckId || !engine.isLoaded() || pageNumber < 1) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    void engine
      .extractPageLinks(pageNumber, cropRegion)
      .then((extracted) => {
        if (!cancelled) {
          setLinks(extracted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLinks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showLinks, engine, deckId, pageNumber, cropRegion]);

  // Clear laser trail and spotlight pin when switching deck, slide, or tool
  useEffect(() => {
    laserTrailRef.current = [];
  }, [deckId, pageNumber]);

  useEffect(() => {
    if (pointerTool !== 'spotlight') {
      setSpotlightPinned(false);
    }
    if (pointerTool !== 'laser') {
      laserTrailRef.current = [];
    }
  }, [pointerTool]);

  // Track short time-decaying laser trail points while laser is active
  const LASER_TRAIL_TTL_MS = 150;
  useEffect(() => {
    const laserActive = Boolean(laserPoint && (pointerTool === 'laser' || !interactive));
    if (!laserActive || !laserPoint) {
      laserTrailRef.current = [];
      return;
    }

    const now = performance.now();
    const pt = {
      x: clamp01(laserPoint.x),
      y: clamp01(laserPoint.y),
      ts: now,
    };
    const fresh = laserTrailRef.current.filter((item) => now - item.ts <= LASER_TRAIL_TTL_MS);
    const last = fresh[fresh.length - 1];

    // If pointer jumped a long distance (e.g. re-entering slide), start a fresh trail without warp line
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) > 0.16) {
      laserTrailRef.current = [pt];
    } else if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.0015) {
      const next = [...fresh, pt];
      laserTrailRef.current = next.length > 10 ? next.slice(next.length - 10) : next;
    } else {
      laserTrailRef.current = fresh;
    }

    if (laserTrailRef.current.length > 1) {
      const timer = setTimeout(() => {
        const tNow = performance.now();
        laserTrailRef.current = laserTrailRef.current.filter(
          (item) => tNow - item.ts <= LASER_TRAIL_TTL_MS,
        );
        setTrailTick((v) => v + 1);
      }, 32);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [laserPoint, pointerTool, interactive, trailTick]);

  // Adjust spotlight radius or zoom level with mouse wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !interactive) {
      return;
    }
    const spotlightActive = pointerTool === 'spotlight' && Boolean(onSpotlightRadiusDelta);
    const zoomActive = (zoomMode || isZoomed(zoomState)) && Boolean(onZoomChange);
    if (!spotlightActive && !zoomActive) {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (spotlightActive && onSpotlightRadiusDelta) {
        const delta = e.deltaY < 0 ? 0.035 : -0.035;
        onSpotlightRadiusDelta(delta);
        return;
      }
      if (zoomActive && onZoomChange) {
        const frameRect = (stageFrameRef.current ?? el).getBoundingClientRect();
        const nx = frameRect.width > 0 ? (e.clientX - frameRect.left) / frameRect.width : 0.5;
        const ny = frameRect.height > 0 ? (e.clientY - frameRect.top) / frameRect.height : 0.5;
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        onZoomChange(zoomAtPoint(zoomState, zoomState.scale * factor, nx, ny));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [interactive, pointerTool, onSpotlightRadiusDelta, zoomMode, zoomState, onZoomChange]);

  // Draw annotations (Spotlight, Pen Strokes, Laser Pointer) onto overlay canvas
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;

    const w = Math.max(1, renderedSize.width);
    const h = Math.max(1, renderedSize.height);
    if (overlay.width !== w) overlay.width = w;
    if (overlay.height !== h) overlay.height = h;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // 1. Crisp optical Spotlight mask (tight C1-smoothstep radial gradient, zero Mach bands / double ring)
    const activeSpotlight =
      pointerTool === 'spotlight' ? (spotlightPoint ?? { x: 0.5, y: 0.5 }) : spotlightPoint;
    if (activeSpotlight && (pointerTool === 'spotlight' || spotlightPoint !== null)) {
      const cx = clamp01(activeSpotlight.x) * w;
      const cy = clamp01(activeSpotlight.y) * h;
      const r = Math.max(28, spotlightRadius * Math.min(w, h));
      const feather = Math.max(3, Math.min(8, Math.round(r * 0.06)));
      const innerR = Math.max(8, r - feather);
      const outerR = r + feather;
      const maxDimAlpha = 0.78;
      const stopCount = 8;

      ctx.save();
      const spotGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      for (let i = 0; i <= stopCount; i += 1) {
        const t = i / stopCount;
        const smooth = t * t * (3 - 2 * t);
        const alpha = Number((maxDimAlpha * smooth).toFixed(4));
        spotGrad.addColorStop(t, `rgba(0, 0, 0, ${alpha})`);
      }
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 2. Pen strokes
    if (inkVisible) {
      const allStrokes = activeDraftStroke ? [...strokes, activeDraftStroke] : strokes;
      for (const stroke of allStrokes) {
        if (!stroke.points || stroke.points.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = stroke.color || '#ef4444';
        ctx.fillStyle = stroke.color || '#ef4444';
        const pxWidth = Math.max(3, (stroke.width || 0.008) * w);
        ctx.lineWidth = pxWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const first = stroke.points[0]!;
        const x0 = clamp01(first.x) * w;
        const y0 = clamp01(first.y) * h;

        if (stroke.points.length === 1) {
          ctx.beginPath();
          ctx.arc(x0, y0, pxWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          for (let i = 1; i < stroke.points.length; i += 1) {
            const pt = stroke.points[i]!;
            ctx.lineTo(clamp01(pt.x) * w, clamp01(pt.y) * h);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 3. Laser pointer with auto-fading trail & borderless radial glow
    if (laserPoint && (pointerTool === 'laser' || !interactive)) {
      const lx = clamp01(laserPoint.x) * w;
      const ly = clamp01(laserPoint.y) * h;
      const coreR = Math.max(7, Math.round(Math.min(w, h) * 0.016));
      const glowR = Math.max(18, Math.round(coreR * 2.25));
      const [lr, lg, lb] = parseHexRgb(laserColor || '#ef4444');
      const hiR = Math.min(255, lr + 40);
      const hiG = Math.min(255, lg + 40);
      const hiB = Math.min(255, lb + 40);

      ctx.save();
      const now = performance.now();
      const trail = laserTrailRef.current.filter((item) => now - item.ts <= LASER_TRAIL_TTL_MS);
      if (trail.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < trail.length - 1; i += 1) {
          const p1 = trail[i]!;
          const p2 = trail[i + 1]!;
          const ageFactor = Math.max(0, 1 - (now - p2.ts) / LASER_TRAIL_TTL_MS);
          const orderFactor = (i + 1) / trail.length;
          const alpha = ageFactor * orderFactor * 0.48;
          if (alpha <= 0.01) continue;
          ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(2, coreR * 0.75 * orderFactor);
          ctx.beginPath();
          ctx.moveTo(clamp01(p1.x) * w, clamp01(p1.y) * h);
          ctx.lineTo(clamp01(p2.x) * w, clamp01(p2.y) * h);
          ctx.stroke();
        }
      }

      // Outer radial soft glow (borderless optical bloom)
      const laserGrad = ctx.createRadialGradient(lx, ly, coreR * 0.15, lx, ly, glowR);
      laserGrad.addColorStop(0, `rgba(${hiR}, ${hiG}, ${hiB}, 0.96)`);
      laserGrad.addColorStop(0.4, `rgba(${lr}, ${lg}, ${lb}, 0.72)`);
      laserGrad.addColorStop(0.72, `rgba(${lr}, ${lg}, ${lb}, 0.28)`);
      laserGrad.addColorStop(1, `rgba(${lr}, ${lg}, ${lb}, 0)`);
      ctx.fillStyle = laserGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Solid high-intensity laser core (no dark stroke border)
      ctx.fillStyle = laserColor || '#ef4444';
      ctx.beginPath();
      ctx.arc(lx, ly, coreR * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // Pinpoint white optical center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(2, coreR * 0.32), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, [
    renderedSize.width,
    renderedSize.height,
    strokes,
    activeDraftStroke,
    inkVisible,
    pointerTool,
    laserPoint,
    laserColor,
    spotlightPoint,
    spotlightRadius,
    interactive,
    trailTick,
  ]);

  // Pointer coordinate helper relative to the PDF canvas
  const getNormalizedPoint = (clientX: number, clientY: number): NormalizedPoint | null => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  // Interactive Pen drag on window so dragging outside canvas clamps cleanly
  useEffect(() => {
    if (!interactive || !activeDraftStroke) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const pt = getNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;
      setActiveDraftStroke((prev) => {
        if (!prev) return null;
        const updated: InkStroke = {
          ...prev,
          points: [...prev.points, pt],
        };
        onStrokeLiveUpdate?.(updated);
        return updated;
      });
    };

    const handleWindowMouseUp = () => {
      setActiveDraftStroke((prev) => {
        if (prev && prev.points.length > 0) {
          onStrokeCommit?.(prev);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [interactive, activeDraftStroke, onStrokeCommit, onStrokeLiveUpdate]);

  // Drag-to-pan on window when zoomed
  useEffect(() => {
    if (!interactive || !isPanning || !onZoomChange) return;

    const handlePanMove = (e: MouseEvent) => {
      const drag = panDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const w = Math.max(1, renderedSize.width);
      const h = Math.max(1, renderedSize.height);
      const next = panByNormalizedDelta(drag.zoom, dx / w, dy / h);
      drag.zoom = next;
      onZoomChange(next);
    };

    const handlePanEnd = () => {
      panDragRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handlePanMove);
    window.addEventListener('mouseup', handlePanEnd);
    return () => {
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
    };
  }, [interactive, isPanning, onZoomChange, renderedSize.width, renderedSize.height]);

  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return;
    if (pointerTool === 'pen') {
      const pt = getNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;
      const newStroke: InkStroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        page: pageNumber,
        color: penColor,
        width: penWidth,
        points: [pt],
      };
      setActiveDraftStroke(newStroke);
      onStrokeLiveUpdate?.(newStroke);
    } else if (pointerTool === 'spotlight') {
      const pt = getNormalizedPoint(e.clientX, e.clientY);
      if (!pt) return;
      setSpotlightPinned((prev) => {
        const nextPinned = !prev;
        onSpotlightMove?.(pt);
        return nextPinned;
      });
    } else if (isZoomed(zoomState) && onZoomChange) {
      panDragRef.current = { lastX: e.clientX, lastY: e.clientY, zoom: zoomState };
      setIsPanning(true);
    }
  };

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    onHoverPointChange?.(pt);
    if (pointerTool === 'laser') {
      if (pt) onLaserMove?.(pt);
    } else if (pointerTool === 'spotlight' && !spotlightPinned) {
      if (pt) onSpotlightMove?.(pt);
    }
  };

  const handleStageMouseLeave = () => {
    if (!interactive) return;
    onHoverPointChange?.(null);
    if (pointerTool === 'laser') {
      onLaserMove?.(null);
    }
  };

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pointerTool === 'pen') return;
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = {
      startX: t.clientX,
      lastX: t.clientX,
      startY: t.clientY,
      lastY: t.clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    if (!t || !touchStartRef.current) return;
    touchStartRef.current.lastX = t.clientX;
    touchStartRef.current.lastY = t.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const gesture = touchStartRef.current;
    touchStartRef.current = null;
    if (!gesture) return;
    const changed = e.changedTouches?.[0];
    const endX = changed ? changed.clientX : gesture.lastX;
    const endY = changed ? changed.clientY : gesture.lastY;
    const dx = endX - gesture.startX;
    const dy = endY - gesture.startY;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        onSwipeNext?.();
      } else {
        onSwipePrev?.();
      }
    }
  };

  const zoomed = isZoomed(zoomState);
  const zoomLayerTransform = zoomed
    ? `translate3d(${(zoomState.panX * 100).toFixed(4)}%, ${(zoomState.panY * 100).toFixed(4)}%, 0) scale(${zoomState.scale.toFixed(4)})`
    : undefined;

  return (
    <div
      ref={containerRef}
      data-testid={stageTestId}
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseLeave={handleStageMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden select-none ${
        interactive && pointerTool === 'laser'
          ? 'cursor-none'
          : interactive && pointerTool === 'pen'
            ? 'cursor-crosshair'
            : interactive && isPanning
              ? 'cursor-grabbing'
              : interactive && zoomed
                ? 'cursor-grab'
                : interactive && zoomMode
                  ? 'cursor-zoom-in'
                  : ''
      }`}
    >
      <div
        ref={stageFrameRef}
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          width: `${renderedSize.width}px`,
          height: `${renderedSize.height}px`,
        }}
      >
        <div
          data-testid="slide-zoom-layer"
          data-zoom-scale={zoomState.scale.toFixed(2)}
          data-zoom-pan-x={zoomState.panX.toFixed(3)}
          data-zoom-pan-y={zoomState.panY.toFixed(3)}
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: '50% 50%',
            transform: zoomLayerTransform,
          }}
          className="relative flex items-center justify-center"
        >
          <canvas
            ref={pdfCanvasRef}
            data-testid={canvasTestId}
            className="block shadow-lg"
          />

          <canvas
            ref={overlayCanvasRef}
            data-testid="slide-overlay-canvas"
            data-laser-color={laserColor}
            aria-label="Slide annotation overlay"
            style={{
              width: `${renderedSize.width}px`,
              height: `${renderedSize.height}px`,
            }}
            className={`pointer-events-none absolute inset-0 ${
              pointerTool === 'pen' ? 'cursor-crosshair' : ''
            }`}
          />

          {showLinks && links.length > 0 && (
            <div
              data-testid="pdf-link-layer"
              className={`absolute inset-0 ${
                pointerTool === 'none' ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {links.map((link, idx) => {
                const [x1, y1, x2, y2] = link.rect;
                const style: React.CSSProperties = {
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  width: `${Math.max(1, (x2 - x1) * 100)}%`,
                  height: `${Math.max(1, (y2 - y1) * 100)}%`,
                };

                if (link.url) {
                  return (
                    <a
                      key={`ext-${idx}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={link.url}
                      aria-label={link.url}
                      style={style}
                      className="absolute block cursor-pointer rounded transition-colors hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    >
                      <span className="sr-only">{link.url}</span>
                    </a>
                  );
                }

                if (link.destPage !== undefined) {
                  const targetPage = link.destPage;
                  return (
                    <button
                      key={`int-${idx}-${targetPage}`}
                      type="button"
                      role="link"
                      data-dest-page={targetPage}
                      data-link-dest={targetPage}
                      title={`Jump to Slide ${targetPage}`}
                      aria-label={`Jump to Slide ${targetPage}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onNavigatePage?.(targetPage);
                      }}
                      style={style}
                      className="absolute block cursor-pointer rounded transition-colors hover:bg-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <span className="sr-only">
                        Jump to Slide {targetPage} Back to Slide {targetPage}
                      </span>
                    </button>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>

        {/* Presenter stage curtain indicator */}
        {!isAudience && curtainMode !== 'none' && (
          <div
            data-testid="presenter-curtain-overlay"
            className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
              curtainMode === 'black'
                ? 'bg-black/85 text-slate-200'
                : 'bg-white/85 text-slate-900'
            }`}
          >
            <span className="rounded-md border border-current px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              {curtainMode === 'black' ? t.blackoutActive : t.whiteoutActive}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
