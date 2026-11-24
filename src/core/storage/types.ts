import type { CropMode } from '../pdf/types.ts';

export interface SlideNoteEntry {
  markdown: string;
  targetSeconds?: number;
  updatedAt: number;
}

export interface DeckNotesBundle {
  version: 1;
  deckId: string;
  fileName: string;
  globalTargetSeconds: number;
  lastMinutesWarning: number;
  endTimeHHMM?: string;
  qrUrl?: string;
  qrLabel?: string;
  noteFontSizePx: number;
  slides: Record<number, SlideNoteEntry>;
}

export interface StoredDeckRecord {
  deckId: string;
  fileName: string;
  byteLength: number;
  bytes: ArrayBuffer;
  lastOpenedAt: number;
  currentPage?: number;
  cropMode?: CropMode;
  swapSplitHalves?: boolean;
  splitBannerDismissed?: boolean;
}

export interface PresenterPrefs {
  noteFontSizePx: number;
  autoStartTimerOnFirstNav: boolean;
  countdownMinutes: number;
  lastMinutesWarning: number;
  endTimeHHMM: string;
  laserColor: string;
  penColor: string;
  penWidth: number;
  spotlightRadius: number;
  activeDeckId: string | null;
  locale?: 'ja' | 'en';
  theme?: 'dark' | 'light';
  chimeEnabled?: boolean;
  chimeVolume?: number;
  audienceProgressBar?: boolean;
}
