import { useEffect, useRef, useState } from 'react';
import type { PdfEngine } from '../core/pdf/PdfEngine.ts';
import type { CropRegion } from '../core/pdf/types.ts';

export interface ThumbnailCanvasProps {
  engine: PdfEngine | null;
  deckId: string | null;
  pageNumber: number;
  cropRegion: CropRegion;
  targetWidth?: number;
  targetHeight?: number;
  testId: string;
  ariaLabel: string;
  onClick?: () => void;
}

export function ThumbnailCanvas({
  engine,
  deckId,
  pageNumber,
  cropRegion,
  targetWidth = 320,
  targetHeight = 180,
  testId,
  ariaLabel,
  onClick,
}: ThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;

    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const w = Math.floor(rect.width || parent.clientWidth || 0);
      const h = Math.floor(rect.height || parent.clientHeight || 0);
      if (w > 24 && h > 24) {
        const nextW = Math.max(48, w - 4);
        const nextH = Math.max(48, h - 4);
        setBoxSize((prev) =>
          prev && prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH },
        );
      }
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure());
      ro.observe(parent);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const renderTargetWidth = boxSize ? boxSize.width : targetWidth;
  const renderTargetHeight = boxSize ? boxSize.height : targetHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!engine || !deckId || !engine.isLoaded() || !canvas || pageNumber < 1) {
      return;
    }

    const controller = new AbortController();
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    void engine
      .renderPageToCanvas(pageNumber, canvas, {
        targetWidth: renderTargetWidth,
        targetHeight: renderTargetHeight,
        dpr,
        cropRegion,
        signal: controller.signal,
      })
      .then((res) => {
        if (res && !controller.signal.aborted) {
          canvas.style.aspectRatio = `${res.cssWidth} / ${res.cssHeight}`;
        }
      })
      .catch(() => {
        // Ignore cancelled render
      });

    return () => {
      controller.abort();
    };
  }, [engine, deckId, pageNumber, cropRegion, renderTargetWidth, renderTargetHeight]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className="block max-h-full max-w-full shrink-0 cursor-pointer rounded shadow"
    />
  );
}
