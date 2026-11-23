import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { useI18n } from '../../core/i18n/I18nContext.tsx';

export type CoachmarkGroup = 'row1' | 'row2' | 'notes';

export interface UiGuideOverlayProps {
  onClose: () => void;
}

interface AnchorItem {
  id: string;
  group: CoachmarkGroup;
  label: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface PillSize {
  width: number;
  height: number;
}

interface PlacedCallout extends AnchorItem {
  pillX: number;
  pillY: number;
  pillW: number;
  pillH: number;
  anchorX: number;
  anchorY: number;
  elbowY: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GROUP_COLORS: Record<
  CoachmarkGroup,
  { stroke: string; badgeClass: string; ringClass: string; dotClass: string }
> = {
  row1: {
    stroke: '#38bdf8',
    badgeClass:
      'border-sky-400/80 bg-slate-900/95 text-sky-100 shadow-md shadow-sky-950/60',
    ringClass: 'border-sky-400 bg-sky-400/15',
    dotClass: 'bg-sky-400',
  },
  row2: {
    stroke: '#fbbf24',
    badgeClass:
      'border-amber-400/80 bg-slate-900/95 text-amber-100 shadow-md shadow-amber-950/60',
    ringClass: 'border-amber-400 bg-amber-400/15',
    dotClass: 'bg-amber-400',
  },
  notes: {
    stroke: '#34d399',
    badgeClass:
      'border-emerald-400/80 bg-slate-900/95 text-emerald-100 shadow-md shadow-emerald-950/60',
    ringClass: 'border-emerald-400 bg-emerald-400/15',
    dotClass: 'bg-emerald-400',
  },
};

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, v));
}

function boxesOverlap(a: Box, b: Box, padX: number, padY: number): boolean {
  return (
    a.left < b.right + padX &&
    a.right + padX > b.left &&
    a.top < b.bottom + padY &&
    a.bottom + padY > b.top
  );
}

function collectAnchors(): AnchorItem[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-coachmark-group]'));
  const items: AnchorItem[] = [];

  nodes.forEach((el, idx) => {
    const group = el.dataset.coachmarkGroup as CoachmarkGroup | undefined;
    if (group !== 'row1' && group !== 'row2' && group !== 'notes') return;

    const label = (
      el.dataset.coachmarkLabel ||
      el.getAttribute('title') ||
      el.getAttribute('aria-label') ||
      ''
    ).trim();
    if (!label) return;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (rect.right <= 0 || rect.left >= vw || rect.bottom <= 0 || rect.top >= vh) return;

    items.push({
      id: `${group}-${idx}`,
      group,
      label,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  });

  return items;
}

function computeCalloutLayout(
  anchors: AnchorItem[],
  sizes: Record<string, PillSize>,
  vw: number,
  vh: number,
): PlacedCallout[] {
  if (anchors.length === 0) return [];

  const row1 = anchors.filter((a) => a.group === 'row1').sort((a, b) => a.left - b.left);
  const row2 = anchors.filter((a) => a.group === 'row2').sort((a, b) => a.left - b.left);
  const notes = anchors.filter((a) => a.group === 'notes').sort((a, b) => a.left - b.left);

  const headerItems = [...row1, ...row2];
  const headerBottom =
    headerItems.length > 0 ? Math.max(...headerItems.map((a) => a.bottom)) : 77;

  const notesMinLeft =
    notes.length > 0 ? Math.min(...notes.map((a) => a.left)) : Math.round(vw * 0.58);
  const notesMinTop = notes.length > 0 ? Math.min(...notes.map((a) => a.top)) : 280;
  const notesMaxBottom = notes.length > 0 ? Math.max(...notes.map((a) => a.bottom)) : 316;

  const obstacles: Box[] = [
    { left: 0, top: 0, right: vw, bottom: headerBottom + 6 },
    {
      left: Math.max(8, vw / 2 - 260),
      top: Math.max(0, vh - 48),
      right: Math.min(vw - 8, vw / 2 + 260),
      bottom: vh,
    },
  ];
  if (notes.length > 0) {
    obstacles.push({
      left: Math.max(8, notesMinLeft - 10),
      top: Math.max(0, notesMinTop - 6),
      right: vw,
      bottom: notesMaxBottom + 6,
    });
  }

  const placed: PlacedCallout[] = [];
  const placedBoxes: Box[] = [];
  const rowStep = 26;
  const edgePad = 8;

  const tryPlaceItem = (
    item: AnchorItem,
    startY: number,
    minX: number,
    maxX: number,
    maxY: number,
  ): PlacedCallout => {
    const measured = sizes[item.id] ?? {
      width: Math.min(200, Math.max(64, item.label.length * 10 + 18)),
      height: 22,
    };
    const pillW = Math.min(measured.width, Math.max(60, maxX - minX));
    const pillH = measured.height;
    const anchorX = clamp(item.left + item.width / 2, 6, vw - 6);
    const anchorY = item.bottom;

    const idealX = clamp(anchorX - pillW / 2, minX, maxX - pillW);
    const localOffsets = [0, -24, 24, -48, 48, -72, 72, -96, 96, -128, 128];

    let chosenX = idealX;
    let chosenY = clamp(startY, 0, Math.max(startY, maxY - pillH));
    let found = false;

    for (let y = startY; y + pillH <= maxY; y += rowStep) {
      for (const dx of localOffsets) {
        const x = clamp(idealX + dx, minX, maxX - pillW);
        const candidate: Box = { left: x, top: y, right: x + pillW, bottom: y + pillH };
        const collidesPlaced = placedBoxes.some((b) => boxesOverlap(candidate, b, 6, 4));
        const collidesObstacle = obstacles.some((o) => boxesOverlap(candidate, o, 4, 4));
        if (!collidesPlaced && !collidesObstacle) {
          chosenX = x;
          chosenY = y;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // Fallback: full horizontal scan across available lanes
      for (let y = startY; y + pillH <= vh - 46; y += rowStep) {
        for (let x = minX; x <= maxX - pillW; x += 18) {
          const candidate: Box = { left: x, top: y, right: x + pillW, bottom: y + pillH };
          const collidesPlaced = placedBoxes.some((b) => boxesOverlap(candidate, b, 4, 3));
          const collidesObstacle = obstacles.some((o) => boxesOverlap(candidate, o, 4, 3));
          if (!collidesPlaced && !collidesObstacle) {
            chosenX = x;
            chosenY = y;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    placedBoxes.push({
      left: chosenX,
      top: chosenY,
      right: chosenX + pillW,
      bottom: chosenY + pillH,
    });

    const elbowY =
      item.group === 'notes'
        ? Math.max(anchorY + 4, chosenY - 5)
        : Math.max(headerBottom + 4, chosenY - 5);

    return {
      ...item,
      pillX: chosenX,
      pillY: chosenY,
      pillW,
      pillH,
      anchorX,
      anchorY,
      elbowY,
    };
  };

  let nextHeaderY = headerBottom + 12;
  for (const item of row1) {
    const callout = tryPlaceItem(item, nextHeaderY, edgePad, vw - edgePad, vh - 52);
    placed.push(callout);
  }

  if (placed.length > 0) {
    nextHeaderY = Math.max(...placed.map((p) => p.pillY + p.pillH)) + 8;
  }

  for (const item of row2) {
    const callout = tryPlaceItem(item, nextHeaderY, edgePad, vw - edgePad, vh - 52);
    placed.push(callout);
  }

  const notesStartY = notesMaxBottom + 12;
  const notesBandLeft = Math.max(edgePad, notesMinLeft - 12);
  for (const item of notes) {
    const callout = tryPlaceItem(item, notesStartY, notesBandLeft, vw - edgePad, vh - 52);
    placed.push(callout);
  }

  return placed;
}

export function UiGuideOverlay({ onClose }: UiGuideOverlayProps) {
  const { t } = useI18n();
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 1280, h: 800 });
  const [sizes, setSizes] = useState<Record<string, PillSize>>({});
  const measureRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const refreshAnchors = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setAnchors(collectAnchors());
  }, []);

  useLayoutEffect(() => {
    refreshAnchors();
  }, [refreshAnchors]);

  useEffect(() => {
    window.addEventListener('resize', refreshAnchors);
    return () => window.removeEventListener('resize', refreshAnchors);
  }, [refreshAnchors]);

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

  useLayoutEffect(() => {
    const nextSizes: Record<string, PillSize> = {};
    for (const item of anchors) {
      const el = measureRefs.current[item.id];
      if (el) {
        const rect = el.getBoundingClientRect();
        nextSizes[item.id] = {
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        };
      }
    }
    setSizes(nextSizes);
  }, [anchors]);

  const placed = computeCalloutLayout(anchors, sizes, viewport.w, viewport.h);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.uiGuideHeaderTitle}
      data-testid="ui-guide-overlay"
      onClick={onClose}
      className="fixed inset-0 z-50 cursor-pointer bg-slate-950/70 select-none"
    >
      {/* Hidden pass for exact pixel measurement of pill strings */}
      <div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 opacity-0">
        {anchors.map((item) => (
          <span
            key={item.id}
            ref={(el) => {
              measureRefs.current[item.id] = el;
            }}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap"
          >
            <span className="h-1.5 w-1.5 rounded-full" />
            <span>{item.label}</span>
          </span>
        ))}
      </div>

      {/* Orthogonal Leader Lines */}
      <svg
        width={viewport.w}
        height={viewport.h}
        className="pointer-events-none fixed inset-0 h-full w-full"
        aria-hidden="true"
      >
        {placed.map((item) => {
          const targetX = item.pillX + item.pillW / 2;
          const targetY = item.pillY;
          const color = GROUP_COLORS[item.group].stroke;
          const path =
            Math.abs(item.anchorX - targetX) < 3
              ? `M ${item.anchorX} ${item.anchorY} L ${item.anchorX} ${targetY}`
              : `M ${item.anchorX} ${item.anchorY} L ${item.anchorX} ${item.elbowY} L ${targetX} ${item.elbowY} L ${targetX} ${targetY}`;
          return (
            <g key={`line-${item.id}`}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1.35}
                strokeOpacity={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={item.anchorX} cy={item.anchorY} r={2.4} fill={color} />
            </g>
          );
        })}
      </svg>

      {/* Highlight boxes over target controls */}
      {anchors.map((item) => (
        <div
          key={`ring-${item.id}`}
          aria-hidden="true"
          style={{
            left: `${item.left - 1}px`,
            top: `${item.top - 1}px`,
            width: `${item.width + 2}px`,
            height: `${item.height + 2}px`,
          }}
          className={`pointer-events-none fixed rounded border ${GROUP_COLORS[item.group].ringClass}`}
        />
      ))}

      {/* Collision-free Tooltip Callout Pills */}
      {placed.map((item) => (
        <div
          key={`pill-${item.id}`}
          data-testid="ui-guide-pill"
          data-group={item.group}
          style={{
            left: `${item.pillX}px`,
            top: `${item.pillY}px`,
            maxWidth: `${item.pillW + 2}px`,
          }}
          className={`pointer-events-none fixed inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap ${GROUP_COLORS[item.group].badgeClass}`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${GROUP_COLORS[item.group].dotClass}`}
          />
          <span className="truncate">{item.label}</span>
        </div>
      ))}

      {/* Compact Legend & Dismiss Pill */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-3 left-1/2 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-3 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-1.5 text-xs whitespace-nowrap text-slate-200 shadow-2xl"
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-white">
          <Tag className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          <span>{t.uiGuideHeaderTitle}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-sky-300">
          <span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" />
          <span>{t.uiGuideRow1}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          <span>{t.uiGuideRow2}</span>
        </span>
        {anchors.some((a) => a.group === 'notes') && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>{t.uiGuideNotes}</span>
          </span>
        )}
        <span className="hidden shrink-0 text-[11px] text-slate-400 md:inline">
          {t.uiGuideCloseHint}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeEsc}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          <span>Esc</span>
        </button>
      </div>
    </div>
  );
}
