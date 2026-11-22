import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!engine || !deckId || !engine.isLoaded() || !canvas || pageNumber < 1) {
      return;
    }

    const controller = new AbortController();
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    void engine
      .renderPageToCanvas(pageNumber, canvas, {
        targetWidth,
        targetHeight,
        dpr,
        cropRegion,
        signal: controller.signal,
      })
      .catch(() => {
        // Ignore cancelled render
      });

    return () => {
      controller.abort();
    };
  }, [engine, deckId, pageNumber, cropRegion, targetWidth, targetHeight]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className="block max-h-full max-w-full cursor-pointer rounded shadow"
    />
  );
}
