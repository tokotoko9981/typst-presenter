export type {
  CropMode,
  CropRegion,
  LoadedDeckMeta,
  OutlineNode,
  PdfLinkAnnotation,
  RenderOptions,
  RenderResult,
} from './types.ts';

export { computeDeckId, sha256HexFallback } from './hash.ts';

export {
  MAX_CANVAS_EDGE,
  MAX_DPR,
  SPLIT_HORIZONTAL_ASPECT_THRESHOLD,
  computeRenderPlan,
  computeSuggestedCropMode,
  getCropBounds,
  normalizeAndCropLinkRect,
  resolveSplitCropRegions,
  type CropBounds,
  type RenderPlan,
  type SplitCropRegions,
  type ViewportPointConverter,
} from './viewportMath.ts';

export {
  extractStickyNotesFromPage,
  mergePageNote,
  normalizePageLabels,
  parseNotesAttachments,
  resolveDestToPageNumber,
  resolveOutlineTree,
} from './extractors.ts';

export {
  PdfEngine,
  resolvePdfAssetUrl,
  type PdfDocumentLike,
  type PdfEngineOptions,
  type PdfJsLike,
  type PdfLoadingTaskLike,
  type PdfPageLike,
  type PdfRenderTaskLike,
  type PdfViewportLike,
} from './PdfEngine.ts';
