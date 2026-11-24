import type { CropMode } from '../pdf/types.ts';

export type CurtainMode = 'none' | 'black' | 'white';
export type PointerTool = 'none' | 'laser' | 'pen' | 'spotlight';

export interface NormalizedPoint {
  x: number; // [0..1] within rendered slide rect
  y: number; // [0..1] within rendered slide rect
}

export interface ZoomState {
  scale: number; // [1..4]
  panX: number; // normalized pan offset in [-((scale-1)/2)..((scale-1)/2)]
  panY: number; // normalized pan offset in [-((scale-1)/2)..((scale-1)/2)]
}

export interface QrOverlayState {
  visible: boolean;
  url: string;
  label?: string;
}

export interface InkStroke {
  id: string;
  page: number;
  color: string;
  width: number; // normalized fraction of slide width
  points: NormalizedPoint[];
}

export type SyncMessage =
  | { type: 'HELLO'; role: 'presenter' | 'audience'; clientId: string; ts: number }
  | { type: 'BYE'; role: 'presenter' | 'audience'; clientId: string; ts: number }
  | { type: 'HEARTBEAT'; role: 'presenter' | 'audience'; clientId: string; ts: number }
  | { type: 'DECK_READY'; deckId: string; fileName: string; byteLength: number }
  | {
      type: 'STATE_SNAPSHOT';
      deckId: string | null;
      fileName: string | null;
      currentPage: number;
      totalPages: number;
      cropMode: CropMode;
      swapSplitHalves: boolean;
      curtainMode: CurtainMode;
      frozen: boolean;
      strokesForPage: InkStroke[];
      inkVisible: boolean;
      pointerTool: PointerTool;
      laserPoint: NormalizedPoint | null;
      laserColor?: string;
      spotlightPoint: NormalizedPoint | null;
      spotlightRadius: number;
      zoomState?: ZoomState;
      qrOverlay?: QrOverlayState;
      audienceProgressBar?: boolean;
    }
  | { type: 'NAVIGATE'; page: number; strokesForPage?: InkStroke[] }
  | { type: 'REQUEST_NAVIGATE'; delta: -1 | 1 }
  | { type: 'REQUEST_ACTION'; action: 'first' | 'last' | 'toggle-blackout' | 'toggle-whiteout' }
  | { type: 'CROP_MODE'; cropMode: CropMode; swapSplitHalves: boolean }
  | { type: 'CURTAIN'; mode: CurtainMode }
  | { type: 'FREEZE'; frozen: boolean }
  | { type: 'LASER_MOVE'; active: boolean; point: NormalizedPoint | null; color?: string }
  | { type: 'SPOTLIGHT_MOVE'; active: boolean; point: NormalizedPoint | null; radius: number }
  | { type: 'ZOOM_STATE'; zoom: ZoomState }
  | { type: 'QR_OVERLAY'; overlay: QrOverlayState }
  | { type: 'PROGRESS_BAR'; visible: boolean }
  | { type: 'STROKE_ADD'; stroke: InkStroke }
  | { type: 'STROKE_UPDATE'; stroke: InkStroke }
  | { type: 'STROKE_UNDO'; page: number }
  | { type: 'STROKE_CLEAR'; page: number }
  | { type: 'INK_VISIBILITY'; visible: boolean };
