export type CropMode = 'full' | 'split-horizontal' | 'split-vertical';
export type CropRegion = 'full' | 'left-half' | 'right-half' | 'top-half' | 'bottom-half';

export interface OutlineNode {
  title: string;
  pageNumber: number | null; // 1-based resolved physical page
  items: OutlineNode[];
}

export interface PdfLinkAnnotation {
  rect: [number, number, number, number]; // normalized [x1, y1, x2, y2] in [0..1] viewport coords
  url?: string;
  destPage?: number; // 1-based target page for internal links
}

export interface LoadedDeckMeta {
  deckId: string; // SHA-256 hex of raw PDF bytes
  fileName: string;
  byteLength: number;
  numPages: number;
  pageLabels: string[] | null;
  firstPageAspectRatio: number;
  suggestedCropMode: CropMode;
  outline: OutlineNode[];
  extractedNotes: Record<number, string>; // 1-based page -> note markdown/text
  extractedPdfpcConfig?: {
    durationMinutes?: number;
    lastMinutes?: number;
    noteFontSize?: number;
  };
}

export interface RenderOptions {
  targetWidth: number;
  targetHeight: number;
  dpr: number;
  cropRegion: CropRegion;
  zoomScale?: number;
  signal?: AbortSignal;
}

export interface RenderResult {
  cssWidth: number;
  cssHeight: number;
  pageNumber: number;
}
