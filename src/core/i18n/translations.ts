export type Locale = 'ja' | 'en';

export const LOCALE_STORAGE_KEY = 'typst-presenter-locale';

export function detectInitialLocale(): Locale {
  try {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (saved === 'ja' || saved === 'en') {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    if (navigator.language.toLowerCase().startsWith('ja')) {
      return 'ja';
    }
  }
  return 'en';
}

export interface TranslationDict {
  // Brand & Top Toolbar
  appTitle: string;
  openPdf: string;
  sampleShortBtn: string;
  loadSampleDeck: string;
  recentDecksBtn: string;
  recentDecksTooltip: string;
  watchPdf: string;
  watchPdfTooltip: string;
  stopWatch: string;
  defaultDisplay: string;
  primaryTag: string;
  displaysBtn: string;
  refreshDisplaysAria: string;
  audienceShortBtn: string;
  launchAudienceWindow: string;
  audienceConnected: string;
  audienceDisconnected: string;
  prev: string;
  next: string;
  prevSlideTooltip: string;
  nextSlideTooltip: string;
  cropFull: string;
  cropSplitHorizontal: string;
  cropSplitVertical: string;
  swapHalves: string;
  blackoutBtn: string;
  whiteoutBtn: string;
  freezeBtn: string;
  laserBtn: string;
  laserColorMenuTooltip: string;
  laserColorRed: string;
  laserColorGreen: string;
  laserColorBlue: string;
  zoomBtn: string;
  zoomResetBtn: string;
  qrBtn: string;
  qrModalTitle: string;
  qrModalDesc: string;
  qrUrlLabel: string;
  qrCaptionLabel: string;
  qrCaptionPlaceholder: string;
  qrEmptyPreview: string;
  qrShowOnAudience: string;
  qrHideFromAudience: string;
  qrActiveBadge: string;
  progressBarToggle: string;
  chimeLabel: string;
  chimeToggleTooltip: string;
  chimeVolumeLabel: string;
  chimeTest1Label: string;
  chimeRing3Label: string;
  penBtn: string;
  spotlightBtn: string;
  spotMinus: string;
  spotPlus: string;
  spotlightSizeLabel: string;
  penMinus: string;
  penPlus: string;
  penWidthLabel: string;
  inkColorsLabel: string;
  jumpInputTooltip: string;
  cropSelectTooltip: string;
  monitorSelectTooltip: string;
  audienceStatusTooltip: string;
  slideTargetTooltip: string;
  undoBtn: string;
  clearInkBtn: string;
  inkBtn: string;
  guardBtn: string;
  statsBtn: string;
  gridBtn: string;
  gridAria: string;
  outlineBtn: string;
  helpBtn: string;
  uiGuideBtn: string;
  uiGuideHeaderTitle: string;
  uiGuideRow1: string;
  uiGuideRow2: string;
  uiGuideNotes: string;
  uiGuideCloseHint: string;
  uiGuideBlockDeckFiles: string;
  uiGuideBlockAudienceDisplay: string;
  uiGuideBlockAppSettings: string;
  uiGuideBlockSlideNav: string;
  uiGuideBlockSplitCrop: string;
  uiGuideBlockStageCurtain: string;
  uiGuideBlockPointerInk: string;
  uiGuideBlockInkActions: string;
  uiGuideBlockViewsGuard: string;
  uiGuideBlockNotesFont: string;
  uiGuideBlockNotesTarget: string;
  uiGuideBlockNotesIo: string;
  quickGuideBtn: string;
  localeToggleTitle: string;
  themeToLight: string;
  themeToDark: string;
  dismiss: string;
  close: string;
  closeEsc: string;

  // Banners
  popupBlockedPrefix: string;
  copyUrl: string;
  splitDetectedMessage: string;
  applySplitLR: string;
  blackoutActive: string;
  whiteoutActive: string;

  // Onboarding & Quick Start
  onboardingDropTitle: string;
  onboardingDropDesc: string;
  onboardingSupports: string;
  choosePdfFile: string;
  recentDecksTitle: string;
  openRecent: string;
  deleteRecent: string;
  quickStartHeading: string;
  quickStartStep1Title: string;
  quickStartStep1Desc: string;
  quickStartStep2Title: string;
  quickStartStep2Desc: string;
  quickStartStep3Title: string;
  quickStartStep3Desc: string;

  // Right Panels: Next Slide & Timer
  nextSlide: string;
  slideLabel: string;
  finalSlide: string;
  endOfPresentation: string;
  clock: string;
  elapsed: string;
  remaining: string;
  warn: string;
  slidePrefix: string;
  autoStart: string;
  start: string;
  pause: string;
  reset: string;
  durationMin: string;
  warningMin: string;
  endTimeLabel: string;

  // Speaker Notes Panel
  speakerNotesTitle: string;
  targetLabel: string;
  secondsUnit: string;
  fontDecreaseTooltip: string;
  fontIncreaseTooltip: string;
  editNotesBtn: string;
  saveNotesBtn: string;
  importNotesBtn: string;
  importEmbeddedBtn: string;
  exportNotesBtn: string;
  exportMdItem: string;
  exportJsonItem: string;
  exportPdfpcItem: string;
  exportMdBtn: string;
  exportJsonBtn: string;
  exportPdfpcBtn: string;
  notesEditorPlaceholder: string;
  noNotesPlaceholder: string;
  quickImportHintBtn: string;
  quickEditHintBtn: string;

  // Notes Import Modal
  notesImportTitle: string;
  notesImportSubtitle: string;
  notesDropzoneTitle: string;
  notesDropzoneHint: string;
  chooseNotesFile: string;
  importEmbeddedSectionTitle: string;
  importEmbeddedReadyDesc: string;
  importEmbeddedNoneDesc: string;
  formatGuideTitle: string;
  formatBulletMarkdown: string;
  formatBulletExplicit: string;
  formatBulletMarpSlidev: string;
  formatBulletPdfpc: string;
  formatBulletPairDrop: string;
  copyTemplateBtn: string;
  copiedTemplateBtn: string;
  downloadTemplateBtn: string;

  // Help / Quick Start Modal
  helpModalTitle: string;
  helpTabQuickStart: string;
  helpTabShortcuts: string;
  helpTabFormats: string;
  helpQuickStep1Title: string;
  helpQuickStep1Body: string;
  helpQuickStep2Title: string;
  helpQuickStep2Body: string;
  helpQuickStep3Title: string;
  helpQuickStep3Body: string;
  helpQuickStep4Title: string;
  helpQuickStep4Body: string;
  shortcutNav: string;
  shortcutHomeEnd: string;
  shortcutJump: string;
  shortcutBlackout: string;
  shortcutWhiteout: string;
  shortcutEscClear: string;
  shortcutFreeze: string;
  shortcutLaser: string;
  shortcutZoom: string;
  shortcutZoomReset: string;
  shortcutPen: string;
  shortcutSpotlight: string;
  shortcutClearInk: string;
  shortcutToggleInk: string;
  shortcutStats: string;
  shortcutGrid: string;
  shortcutOutline: string;
  shortcutEditNotes: string;
  shortcutUiGuide: string;
  helpFormatMarkdownTitle: string;
  helpFormatMarkdownBody: string;
  helpFormatMarpTitle: string;
  helpFormatMarpBody: string;
  helpFormatPdfpcTitle: string;
  helpFormatPdfpcBody: string;
  helpFormatEmbeddedTitle: string;
  helpFormatEmbeddedBody: string;

  // Grid & Outline Modals
  gridOverviewTitle: string;
  outlineTitle: string;
  noOutlineAvailable: string;
  untitledSection: string;

  // Rehearsal Stats Modal
  rehearsalTitle: string;
  presentationFallback: string;
  totalDeltaPrefix: string;
  totalActual: string;
  totalTarget: string;
  noTargetsSet: string;
  visitedSlides: string;
  coverageSuffix: string;
  noTimingData: string;
  visitSingular: string;
  visitPlural: string;
  applyActualAsTargets: string;
  exportReportMd: string;
  exportReportCsv: string;

  // Audience View
  audienceStandbyTitle: string;
  audienceStandbySubtitle: string;
  fullscreenPrompt: string;

  // Status & Error Messages
  msgWatchStopped: string;
  msgNoEmbeddedNotes: string;
  msgUnsupportedDrop: string;
  msgNotesNeedPdfFirst: string;
  msgSidecarNoNotesFound: string;
  msgAudienceOpenFailed: string;
  msgStoredDeckMissing: string;
  msgEmptyPdf: string;

  // Phase 3: Typst Live Compile, Logical Slides, Direct MD Save & Close Guard
  openTypstBtn: string;
  typstDrawerTitle: string;
  typstCliStatusLabel: string;
  typstCliRecheck: string;
  typstCliMissingGuide: string;
  typstWatchedFileLabel: string;
  typstNoFileSelected: string;
  typstRecompileBtn: string;
  typstStopWatchBtn: string;
  typstDiagnosticsTitle: string;
  typstLiveGuardNotice: string;
  typstNoDiagnostics: string;
  typstOptionsTitle: string;
  typstFontsTitle: string;
  typstLoadFontsBtn: string;
  typstStatusOk: string;
  typstStatusError: string;
  typstStatusCompiling: string;
  logicalShareLabel: string;
  logicalInheritedFrom: string;
  overwriteNotesMdItem: string;
  msgOverwriteMdSuccess: string;
  msgOverwriteMarpProtected: string;
  closeGuardModalTitle: string;
  closeGuardModalDesc: string;
  closeGuardKeepPresenting: string;
  closeGuardForceExit: string;
  formatBulletTypstSingle: string;
  paneSplitHandleAria: string;
  paneSplitHandleTitle: string;
}

export const TRANSLATIONS: Record<Locale, TranslationDict> = {
  en: {
    appTitle: 'Typst Presenter',
    openPdf: 'Open PDF',
    sampleShortBtn: 'Sample',
    loadSampleDeck: 'Load Sample Deck',
    recentDecksBtn: 'Recent',
    recentDecksTooltip: 'Recent Decks & Start Screen',
    watchPdf: 'Watch',
    watchPdfTooltip: 'Watch PDF file for auto-reload on Chromium',
    stopWatch: 'Watching',
    defaultDisplay: 'Default Display',
    primaryTag: '[Primary]',
    displaysBtn: 'Displays',
    refreshDisplaysAria: 'Refresh displays',
    audienceShortBtn: 'Audience',
    launchAudienceWindow: 'Launch Audience Window',
    audienceConnected: 'Connected',
    audienceDisconnected: 'Disconnected',
    prev: 'Prev',
    next: 'Next',
    prevSlideTooltip: 'Previous (←)',
    nextSlideTooltip: 'Next (→)',
    cropFull: 'Full',
    cropSplitHorizontal: 'Split L|R',
    cropSplitVertical: 'Split T|B',
    swapHalves: 'Swap Split Halves',
    blackoutBtn: 'Blackout (B)',
    whiteoutBtn: 'Whiteout (W)',
    freezeBtn: 'Freeze Audience (F)',
    laserBtn: 'Laser Pointer (L)',
    laserColorMenuTooltip: 'Laser Pointer Color (Red / Green / Blue)',
    laserColorRed: 'Red',
    laserColorGreen: 'Green',
    laserColorBlue: 'Blue',
    zoomBtn: 'Zoom & Pan (Z)',
    zoomResetBtn: 'Reset (0)',
    qrBtn: 'Q&A QR Code Overlay',
    qrModalTitle: 'Q&A QR Code Overlay',
    qrModalDesc: 'Generate an offline QR code for handouts or links and project it onto the Audience display.',
    qrUrlLabel: 'Target URL / Text',
    qrCaptionLabel: 'Caption (optional)',
    qrCaptionPlaceholder: 'e.g. Slides & Code',
    qrEmptyPreview: 'Enter a URL above to preview QR code.',
    qrShowOnAudience: 'Show on Audience',
    qrHideFromAudience: 'Hide from Audience',
    qrActiveBadge: 'QR Active',
    progressBarToggle: 'Audience 2px Progress Bar',
    chimeLabel: 'Chime',
    chimeToggleTooltip: 'Toggle conference timer chime (1=warn, 2=end, 3=+1m)',
    chimeVolumeLabel: 'Chime volume',
    chimeTest1Label: 'Test 1-bell',
    chimeRing3Label: 'Ring 3-bell (finish)',
    penBtn: 'Pen (D)',
    spotlightBtn: 'Spotlight (S)',
    spotMinus: 'Smaller Spotlight ([)',
    spotPlus: 'Larger Spotlight (])',
    spotlightSizeLabel: 'Spotlight Size ([ / ])',
    penMinus: 'Thinner Pen (-)',
    penPlus: 'Thicker Pen (+)',
    penWidthLabel: 'Pen Width (- / +)',
    inkColorsLabel: 'Ink Colors (Red/Blue/Yellow/Green/White)',
    jumpInputTooltip: 'Jump to Slide Number (Enter)',
    cropSelectTooltip: 'Split-Page Crop Mode',
    monitorSelectTooltip: 'Audience Target Display',
    audienceStatusTooltip: 'Audience Sync Connection',
    slideTargetTooltip: 'Target Seconds for This Slide',
    undoBtn: 'Undo Stroke',
    clearInkBtn: 'Clear Ink (C)',
    inkBtn: 'Toggle Ink Visibility (H)',
    guardBtn: 'Reload Guard',
    statsBtn: 'Rehearsal Stats (R)',
    gridBtn: 'Slide Grid (G)',
    gridAria: 'Thumbnail Overview (G)',
    outlineBtn: 'Outline (O)',
    helpBtn: 'Help & Shortcuts (?)',
    uiGuideBtn: 'Show All Tooltips (I)',
    uiGuideHeaderTitle: 'UI Controls Guide (I)',
    uiGuideRow1: 'Top Bar',
    uiGuideRow2: 'Stage & Tools',
    uiGuideNotes: 'Notes Header',
    uiGuideCloseHint: 'Click anywhere or press Esc / I to close',
    uiGuideBlockDeckFiles: 'Deck & Watch (Open / Sample / Recent / Watch)',
    uiGuideBlockAudienceDisplay: 'Audience Window, Monitor, QR & Progress Bar',
    uiGuideBlockAppSettings: 'Theme, Language, UI Guide (I) & Help (?)',
    uiGuideBlockSlideNav: 'Slide Navigation & Direct Jump',
    uiGuideBlockSplitCrop: 'Split-Note Crop & L|R Swap',
    uiGuideBlockStageCurtain: 'Blackout (B / .) · Whiteout (W) · Freeze (F)',
    uiGuideBlockPointerInk: 'Laser (L) · Pen (D) · Spotlight (S) · Zoom (Z)',
    uiGuideBlockInkActions: 'Undo · Clear (C) · Show/Hide Ink (H)',
    uiGuideBlockViewsGuard: 'Focus Guard · Stats (R) · Grid (G) · Outline (O)',
    uiGuideBlockNotesFont: 'Note Font Size (A- / A+)',
    uiGuideBlockNotesTarget: 'Slide Target Duration (sec)',
    uiGuideBlockNotesIo: 'Edit (E) · Import · Embedded · Export Notes',
    quickGuideBtn: 'Quick Guide (?)',
    localeToggleTitle: 'Switch language (JP / EN)',
    themeToLight: 'Switch to Light Mode',
    themeToDark: 'Switch to Dark Mode',
    dismiss: 'Dismiss',
    close: 'Close',
    closeEsc: 'Close (Esc)',

    popupBlockedPrefix: 'Popup blocked. Open this Audience URL manually:',
    copyUrl: 'Copy URL',
    splitDetectedMessage:
      'Wide split-page PDF detected (aspect ratio > 2.4). Apply Split L|R?',
    applySplitLR: 'Apply Split L|R',
    blackoutActive: 'Blackout Active (B)',
    whiteoutActive: 'Whiteout Active (W)',

    onboardingDropTitle: 'Typst Presenter',
    onboardingDropDesc: 'Drop your slide PDF here, or click to select a file.',
    onboardingSupports:
      'Supports Typst, Marp, Beamer, PowerPoint/Keynote PDFs, Markdown/pdfpc notes, and local 2-window sync.',
    choosePdfFile: 'Choose PDF File',
    recentDecksTitle: 'Recent Decks',
    openRecent: 'Open',
    deleteRecent: 'Delete',
    quickStartHeading: 'Quick Start',
    quickStartStep1Title: '1. Load Slides',
    quickStartStep1Desc: 'Drop a PDF (and optional notes), or try Sample.',
    quickStartStep2Title: '2. Load or Edit Notes',
    quickStartStep2Desc: 'Import .md, Marp, .pdfpc, or embedded PDF notes; press E to edit.',
    quickStartStep3Title: '3. Present Dual-Window',
    quickStartStep3Desc: 'Click Audience for the projector view, plus Laser (L) and Spotlight (S).',

    nextSlide: 'Next Slide',
    slideLabel: 'Slide',
    finalSlide: 'Final Slide',
    endOfPresentation: 'End of Presentation',
    clock: 'Clock',
    elapsed: 'Elapsed',
    remaining: 'Remaining',
    warn: 'Warning',
    slidePrefix: 'Slide:',
    autoStart: 'Auto-start',
    start: 'Start',
    pause: 'Pause',
    reset: 'Reset',
    durationMin: 'Duration (min)',
    warningMin: 'Warning (min)',
    endTimeLabel: 'End Time',

    speakerNotesTitle: 'Speaker Notes',
    targetLabel: 'Target',
    secondsUnit: 's',
    fontDecreaseTooltip: 'Decrease font size (A-)',
    fontIncreaseTooltip: 'Increase font size (A+)',
    editNotesBtn: 'Edit Notes (E)',
    saveNotesBtn: 'Save',
    importNotesBtn: 'Import Notes',
    importEmbeddedBtn: 'Import Embedded Notes',
    exportNotesBtn: 'Export',
    exportMdItem: 'Markdown (.md)',
    exportJsonItem: 'JSON (.json)',
    exportPdfpcItem: 'pdfpc (.pdfpc)',
    exportMdBtn: 'Export .md',
    exportJsonBtn: 'Export .json',
    exportPdfpcBtn: 'Export .pdfpc',
    notesEditorPlaceholder: 'Enter Markdown speaker notes for this slide...',
    noNotesPlaceholder: 'No speaker notes for this slide.',
    quickImportHintBtn: 'Import Notes...',
    quickEditHintBtn: 'Write Note (E)',

    notesImportTitle: 'Import Speaker Notes',
    notesImportSubtitle: 'Load a script file or extract embedded PDF notes.',
    notesDropzoneTitle: 'Drop a notes file (.md, .markdown, .json, .pdfpc)',
    notesDropzoneHint: 'You can also drop a PDF and notes file together anywhere in the window.',
    chooseNotesFile: 'Choose Notes File',
    importEmbeddedSectionTitle: 'Embedded PDF Notes (#pdf.attach / Annotations)',
    importEmbeddedReadyDesc: 'Embedded notes were detected in this PDF.',
    importEmbeddedNoneDesc: 'No embedded notes found on load (click to re-scan).',
    formatGuideTitle: 'Supported Formats',
    formatBulletMarkdown:
      'Markdown: Split slides with ---, or assign pages with <!-- slide: N -->.',
    formatBulletExplicit:
      'Target seconds: Add <!-- target: 45 --> inside a slide note to set pacing.',
    formatBulletMarpSlidev:
      'Marp / Slidev .md: Directives are stripped and HTML comments become slide notes.',
    formatBulletPdfpc:
      'JSON / .pdfpc: Standard pdfpc v2 files and exported DeckNotesBundle JSON work directly.',
    formatBulletPairDrop:
      'Pair drop: Drop slides.pdf and notes.md together in one drag.',
    copyTemplateBtn: 'Copy .md Template',
    copiedTemplateBtn: 'Copied!',
    downloadTemplateBtn: 'Download .md Template',

    helpModalTitle: 'Guide & Shortcuts (?)',
    helpTabQuickStart: 'Quick Start',
    helpTabShortcuts: 'Shortcuts',
    helpTabFormats: 'Notes Format',
    helpQuickStep1Title: '1. Load or Watch PDF',
    helpQuickStep1Body:
      'Open or drop a PDF (portrait, mixed aspect ratios, and Touying split slides fit cleanly). Use Watch on Chromium to reload automatically when typst watch rebuilds.',
    helpQuickStep2Title: '2. Prepare Notes & Targets',
    helpQuickStep2Body:
      'Import Markdown, Marp/Slidev, .pdfpc, or embedded PDF notes, or press E to edit per slide. Set <!-- target: 45 --> for slide pacing.',
    helpQuickStep3Title: '3. Open Audience Display',
    helpQuickStep3Body:
      'Click Audience to open the projector window and press F (or double-click) for fullscreen. Sync runs locally via BroadcastChannel and IndexedDB.',
    helpQuickStep4Title: '4. Deliver & Review Timing',
    helpQuickStep4Body:
      'Use Laser (L), Pen (D), Spotlight (S; click to pin, wheel or [ / ] to resize), curtains (B/W), Freeze (F), and Stats (R) to inspect rehearsal pacing.',

    shortcutNav: 'Next / Previous Slide',
    shortcutHomeEnd: 'First / Last Slide',
    shortcutJump: 'Jump to Slide Number',
    shortcutBlackout: 'Toggle Blackout Curtain',
    shortcutWhiteout: 'Toggle Whiteout Curtain',
    shortcutEscClear: 'Close Modal / Clear Curtain & Pointer Tool',
    shortcutFreeze: 'Freeze / Unfreeze Audience Display',
    shortcutLaser: 'Toggle Laser Pointer',
    shortcutZoom: 'Toggle Slide Zoom & Pan (Wheel to zoom, Drag to pan)',
    shortcutZoomReset: 'Reset Slide Zoom',
    shortcutPen: 'Toggle Freehand Pen (+ / - width)',
    shortcutSpotlight: 'Toggle Spotlight (click to pin, wheel or [ / ] radius)',
    shortcutClearInk: 'Clear Ink on Current Slide',
    shortcutToggleInk: 'Show / Hide Ink',
    shortcutStats: 'Open Rehearsal Stats',
    shortcutGrid: 'Open Slide Grid',
    shortcutOutline: 'Open PDF Outline',
    shortcutEditNotes: 'Edit Current Slide Notes',
    shortcutUiGuide: 'Show All UI Tooltips Overlay',

    helpFormatMarkdownTitle: 'Markdown (--- or <!-- slide: N -->)',
    helpFormatMarkdownBody:
      'Separate slides with --- or explicit <!-- slide: 2 --> markers. Add <!-- target: 60 --> and YAML frontmatter (duration, lastMinutes, qrUrl) to configure the timer and Q&A QR.',
    helpFormatMarpTitle: 'Marp / Slidev Source .md',
    helpFormatMarpBody:
      'Slide formatting directives (paginate:, layout:, <!--fit-->) are removed and HTML speaker comments are assigned to each slide.',
    helpFormatPdfpcTitle: '.pdfpc v2 & JSON Backup',
    helpFormatPdfpcBody:
      'Loads .pdfpc metadata generated by Touying/Polylux scripts as well as exported Typst Presenter JSON files.',
    helpFormatEmbeddedTitle: 'Typst #pdf.attach & PDF Annotations',
    helpFormatEmbeddedBody:
      'Embedded Presio JSON, pdfpc attachments, and Text/FreeText PDF annotations are imported automatically when the PDF loads.',

    gridOverviewTitle: 'Slide Grid Overview (G)',
    outlineTitle: 'Outline / Table of Contents (O)',
    noOutlineAvailable: 'No outline found in this PDF.',
    untitledSection: 'Untitled section',

    rehearsalTitle: 'Rehearsal Timing Analytics',
    presentationFallback: 'Presentation',
    totalDeltaPrefix: 'Total Delta:',
    totalActual: 'Total Actual',
    totalTarget: 'Total Target',
    noTargetsSet: 'No targets set',
    visitedSlides: 'Visited Slides',
    coverageSuffix: '% coverage',
    noTimingData: 'No slide timing data recorded yet.',
    visitSingular: 'visit',
    visitPlural: 'visits',
    applyActualAsTargets: 'Apply Actual as Targets',
    exportReportMd: 'Export Report (.md)',
    exportReportCsv: 'Export Report (.csv)',

    audienceStandbyTitle: 'Typst Presenter — Audience Display',
    audienceStandbySubtitle: 'Standby — Waiting for slides from Presenter Console...',
    fullscreenPrompt: 'Click or press F for Fullscreen',

    msgWatchStopped: 'Stopped watching PDF file.',
    msgNoEmbeddedNotes: 'No embedded notes found in this PDF.',
    msgUnsupportedDrop:
      'Unsupported file type. Drop a .pdf deck or notes file (.md, .markdown, .json, .pdfpc).',
    msgNotesNeedPdfFirst:
      'Open a PDF first, or drop a PDF and notes file together.',
    msgSidecarNoNotesFound:
      'No speaker notes found in that file; existing notes were kept.',
    msgAudienceOpenFailed: 'Error: Failed to open Audience display window.',
    msgStoredDeckMissing: 'Error: Stored deck is no longer available.',
    msgEmptyPdf: 'Error: Empty or invalid PDF file (0 bytes).',

    openTypstBtn: 'Open .typ',
    typstDrawerTitle: 'Typst Live Compile & Diagnostics',
    typstCliStatusLabel: 'Typst CLI',
    typstCliRecheck: 'Re-check',
    typstCliMissingGuide:
      'typst CLI was not found on PATH. Install Typst using one of the commands below:',
    typstWatchedFileLabel: 'Watched .typ File',
    typstNoFileSelected: 'No .typ file selected',
    typstRecompileBtn: 'Recompile',
    typstStopWatchBtn: 'Stop Watch',
    typstDiagnosticsTitle: 'Compiler Diagnostics',
    typstLiveGuardNotice:
      'Live Compile Guard active: keeping the last valid PDF, page, and ink on screen.',
    typstNoDiagnostics: 'No compiler errors or warnings.',
    typstOptionsTitle: 'Compile Options',
    typstFontsTitle: 'Available Typst Fonts',
    typstLoadFontsBtn: 'Load Fonts',
    typstStatusOk: 'Typst OK',
    typstStatusError: 'Typst Error',
    typstStatusCompiling: 'Compiling…',
    logicalShareLabel: 'Share subslide notes',
    logicalInheritedFrom: 'Inherited from p.',
    overwriteNotesMdItem: 'Overwrite linked .md',
    msgOverwriteMdSuccess: 'Overwrote linked Markdown notes:',
    msgOverwriteMarpProtected:
      'Direct overwrite is blocked for Marp/Slidev source files to protect slide content. Export as a separate file instead.',
    closeGuardModalTitle: 'Presentation Guard Active',
    closeGuardModalDesc:
      'Reload/Close Guard is enabled to prevent accidental exit during your talk. Do you want to close the app anyway?',
    closeGuardKeepPresenting: 'Keep Presenting',
    closeGuardForceExit: 'Disable Guard & Exit',
    formatBulletTypstSingle:
      'Single .typ file: use typst/presenter-notes.typ (#speaker-note / #presenter-config) or Polylux/Touying <pdfpc>.',
    paneSplitHandleAria: 'Resize presenter panes',
    paneSplitHandleTitle: 'Drag to resize panes (double-click to reset)',
  },

  ja: {
    appTitle: 'Typst Presenter',
    openPdf: 'PDFを開く',
    sampleShortBtn: 'サンプル',
    loadSampleDeck: 'サンプル読込',
    recentDecksBtn: '履歴',
    recentDecksTooltip: '最近開いた資料一覧へ戻る',
    watchPdf: '自動更新',
    watchPdfTooltip: 'PDF 更新時に自動再読込（Chromium）',
    stopWatch: '自動更新中',
    defaultDisplay: '既定ディスプレイ',
    primaryTag: '[メイン]',
    displaysBtn: '画面再検出',
    refreshDisplaysAria: '外部ディスプレイを再検出',
    audienceShortBtn: '聴衆画面',
    launchAudienceWindow: '聴衆ウィンドウを開く',
    audienceConnected: '接続中',
    audienceDisconnected: '未接続',
    prev: '前へ',
    next: '次へ',
    prevSlideTooltip: '前へ (←)',
    nextSlideTooltip: '次へ (→)',
    cropFull: '全体表示',
    cropSplitHorizontal: '左右分割 L|R',
    cropSplitVertical: '上下分割 T|B',
    swapHalves: '分割の左右/上下を入替',
    blackoutBtn: '黒画面 (B)',
    whiteoutBtn: '白画面 (W)',
    freezeBtn: '画面固定 (F)',
    laserBtn: 'レーザー (L)',
    laserColorMenuTooltip: 'レーザー色切替 (赤 / 緑 / 青)',
    laserColorRed: '赤',
    laserColorGreen: '緑',
    laserColorBlue: '青',
    zoomBtn: '部分拡大・パン (Z)',
    zoomResetBtn: 'リセット (0)',
    qrBtn: 'Q&A 用 QR コード投影',
    qrModalTitle: 'Q&A 用 QR コード投影',
    qrModalDesc: '外部通信なしで URL の QR コードを生成し、聴衆画面へ即時投影します。',
    qrUrlLabel: 'リンク URL / テキスト',
    qrCaptionLabel: 'キャプション (任意)',
    qrCaptionPlaceholder: '例: 資料・リポジトリ',
    qrEmptyPreview: 'URL を入力すると QR コードをプレビューします。',
    qrShowOnAudience: '聴衆画面に表示',
    qrHideFromAudience: '聴衆画面から消す',
    qrActiveBadge: 'QR 投影中',
    progressBarToggle: '聴衆極薄プログレスバー (2px)',
    chimeLabel: 'チャイム',
    chimeToggleTooltip: '学会タイマー鈴を切替 (警告=1鈴, 終了=2鈴, +1分=3鈴)',
    chimeVolumeLabel: 'チャイム音量',
    chimeTest1Label: 'テスト 1鈴',
    chimeRing3Label: '手動 3鈴',
    penBtn: 'ペン (D)',
    spotlightBtn: 'スポットライト (S)',
    spotMinus: 'スポット半径 縮小 ([)',
    spotPlus: 'スポット半径 拡大 (])',
    spotlightSizeLabel: 'スポット半径 ([ / ])',
    penMinus: 'ペン細く (-)',
    penPlus: 'ペン太く (+)',
    penWidthLabel: 'ペン太さ (- / +)',
    inkColorsLabel: 'ペン色 (5色)',
    jumpInputTooltip: 'ページ番号移動 (数字 + Enter)',
    cropSelectTooltip: '画面分割モード切替',
    monitorSelectTooltip: '聴衆用の投影先ディスプレイ',
    audienceStatusTooltip: '聴衆画面との接続状態',
    slideTargetTooltip: 'このスライドの目標時間 (秒)',
    undoBtn: '直前の線を戻す',
    clearInkBtn: '手書きを消去 (C)',
    inkBtn: '手書きの表示切替 (H)',
    guardBtn: '誤リロード防止',
    statsBtn: 'リハーサル分析 (R)',
    gridBtn: 'スライド一覧 (G)',
    gridAria: '一覧サムネイル (G)',
    outlineBtn: '目次アウトライン (O)',
    helpBtn: 'ヘルプ・ショートカット (?)',
    uiGuideBtn: 'ボタン説明を一括表示 (I)',
    uiGuideHeaderTitle: 'ボタン説明オーバーレイ (I)',
    uiGuideRow1: '上部バー',
    uiGuideRow2: '操作・強調',
    uiGuideNotes: 'ノート欄',
    uiGuideCloseHint: '画面クリックまたは Esc / I で閉じる',
    uiGuideBlockDeckFiles: 'PDF 読み込み・サンプル・履歴・自動監視',
    uiGuideBlockAudienceDisplay: 'ディスプレイ選択・聴衆起動・QR・進捗バー',
    uiGuideBlockAppSettings: 'テーマ・言語・操作ガイド (I)・ヘルプ (?)',
    uiGuideBlockSlideNav: 'スライド前後移動・番号ジャンプ',
    uiGuideBlockSplitCrop: 'ノート分割クロップ・左右入替',
    uiGuideBlockStageCurtain: '黒画面 (B / .)・白画面 (W)・画面固定 (F)',
    uiGuideBlockPointerInk: 'レーザー (L)・ペン (D)・スポット (S)・拡大 (Z)',
    uiGuideBlockInkActions: '戻す・全消去 (C)・描線表示切替 (H)',
    uiGuideBlockViewsGuard: 'フォーカスガード・時間分析 (R)・一覧 (G)・目次 (O)',
    uiGuideBlockNotesFont: 'ノート文字サイズ (A- / A+)',
    uiGuideBlockNotesTarget: 'スライド目標秒数',
    uiGuideBlockNotesIo: 'ノート編集 (E)・取込・埋め込み読込・書出',
    quickGuideBtn: '使い方ガイド (?)',
    localeToggleTitle: '表示言語を切替 (JP / EN)',
    themeToLight: 'ライトモードへ切替',
    themeToDark: 'ダークモードへ切替',
    dismiss: '閉じる',
    close: '閉じる',
    closeEsc: '閉じる (Esc)',

    popupBlockedPrefix: 'ポップアップがブロックされました。次の URL を手動で開いてください:',
    copyUrl: 'URL をコピー',
    splitDetectedMessage:
      '横長分割 PDF（縦横比 2.4 超）を検出しました。左右分割 (Split L|R) を適用しますか？',
    applySplitLR: '左右分割を適用',
    blackoutActive: '黒画面中 (B)',
    whiteoutActive: '白画面中 (W)',

    onboardingDropTitle: 'Typst Presenter',
    onboardingDropDesc: 'スライド PDF をここへドロップ、またはクリックして選択します。',
    onboardingSupports:
      'Typst / Marp / Beamer / PowerPoint 出力 PDF、Markdown・pdfpc ノート、ローカル2画面同期に対応',
    choosePdfFile: 'PDF ファイルを選択',
    recentDecksTitle: '最近開いた資料',
    openRecent: '開く',
    deleteRecent: '削除',
    quickStartHeading: 'クイックスタート',
    quickStartStep1Title: '1. 資料を読み込む',
    quickStartStep1Desc: 'PDF（ノート同時可）をドロップするか、「サンプル読込」を押します。',
    quickStartStep2Title: '2. ノートと目安時間を準備',
    quickStartStep2Desc: '.md・Marp・.pdfpc・PDF注釈の取込、または E キーで直接編集します。',
    quickStartStep3Title: '3. 2画面で発表を開始',
    quickStartStep3Desc: '「聴衆画面」で投影ウィンドウを開き、L でレーザー・S でスポットが使えます。',

    nextSlide: '次のスライド',
    slideLabel: 'スライド',
    finalSlide: '最終スライド',
    endOfPresentation: 'プレゼン終了',
    clock: '現在時刻',
    elapsed: '経過時間',
    remaining: '残り時間',
    warn: '警告',
    slidePrefix: 'スライド:',
    autoStart: '自動開始',
    start: '開始',
    pause: '一時停止',
    reset: 'リセット',
    durationMin: '発表時間 (分)',
    warningMin: '警告残り (分)',
    endTimeLabel: '終了時刻',

    speakerNotesTitle: '発表者ノート',
    targetLabel: '目標',
    secondsUnit: '秒',
    fontDecreaseTooltip: '文字サイズ縮小 (A-)',
    fontIncreaseTooltip: '文字サイズ拡大 (A+)',
    editNotesBtn: 'ノート編集 (E)',
    saveNotesBtn: '保存',
    importNotesBtn: 'ノート取込',
    importEmbeddedBtn: '埋込ノート取込',
    exportNotesBtn: 'エクスポート',
    exportMdItem: 'Markdown (.md)',
    exportJsonItem: 'JSON (.json)',
    exportPdfpcItem: 'pdfpc (.pdfpc)',
    exportMdBtn: 'Export .md',
    exportJsonBtn: 'Export .json',
    exportPdfpcBtn: 'Export .pdfpc',
    notesEditorPlaceholder: 'このスライドの発表者ノートを Markdown で入力...',
    noNotesPlaceholder: 'このスライドにはまだ発表者ノートがありません。',
    quickImportHintBtn: 'ノートを取り込む...',
    quickEditHintBtn: 'ノートを書く (E)',

    notesImportTitle: '発表者ノートのインポート',
    notesImportSubtitle: '原稿ファイルを取り込むか、PDF 内の埋め込みノートを抽出します。',
    notesDropzoneTitle: 'ノートファイルをここへドロップ (.md, .markdown, .json, .pdfpc)',
    notesDropzoneHint: 'PDF とノートファイルを同時に画面へドロップしてまとめて読み込むこともできます。',
    chooseNotesFile: 'ノートファイルを選択',
    importEmbeddedSectionTitle: 'PDF 埋め込みノート（#pdf.attach / PDF 注釈）',
    importEmbeddedReadyDesc: '現在の PDF から埋め込みノートが検出されています。',
    importEmbeddedNoneDesc: '自動検出された埋め込みノートはありません（再スキャンできます）。',
    formatGuideTitle: '対応フォーマット',
    formatBulletMarkdown:
      'Markdown: --- でページ区切り、または <!-- slide: 1 --> でページ番号を指定します。',
    formatBulletExplicit:
      '目標秒数: ノート内に <!-- target: 45 --> を書くと、タイマー目安に反映されます。',
    formatBulletMarpSlidev:
      'Marp / Slidev .md: 書式指定を除外し、HTML コメント部分をスライド別に抽出します。',
    formatBulletPdfpc:
      'JSON / .pdfpc: pdfpc v2 ファイルと、本アプリで書き出した JSON をそのまま読み込めます。',
    formatBulletPairDrop:
      '同時ドロップ: slides.pdf と notes.md を選択して一度にドロップできます。',
    copyTemplateBtn: '.md テンプレートをコピー',
    copiedTemplateBtn: 'コピーしました',
    downloadTemplateBtn: '.md テンプレートを保存',

    helpModalTitle: '使い方ガイド ＆ ショートカット (?)',
    helpTabQuickStart: '使い方',
    helpTabShortcuts: 'ショートカット',
    helpTabFormats: 'ノート書式',
    helpQuickStep1Title: '1. スライド PDF を開く',
    helpQuickStep1Body:
      'PDF を選択またはドロップします（縦型・混在サイズ・Touying 分割に対応）。Chromium 系ブラウザでは「自動更新」で typst watch と連動し自動再読込できます。',
    helpQuickStep2Title: '2. ノートと目標時間を設定',
    helpQuickStep2Body:
      'ノート欄の取込ボタンから .md・Marp・Slidev・.pdfpc・PDF注釈を読み込むか、E キーで編集します。<!-- target: 45 --> でスライド別秒数を設定できます。',
    helpQuickStep3Title: '3. 聴衆ウィンドウを外部画面へ表示',
    helpQuickStep3Body:
      '上部の「聴衆画面」で別ウィンドウを開き、投影先へ移動して F キーまたはダブルクリックで全画面化します。状態はローカルで同期・保存されます。',
    helpQuickStep4Title: '4. 発表中のポインターと分析',
    helpQuickStep4Body:
      'レーザー (L)、ペン (D)、スポットライト (S：クリックで固定・ホイールや [ ] で拡縮)、黒/白カーテン (B/W)、画面固定 (F)、分析モーダル (R) を使えます。',

    shortcutNav: '次のスライド / 前のスライド',
    shortcutHomeEnd: '最初 / 最後のスライドへ移動',
    shortcutJump: '番号入力でスライドへジャンプ',
    shortcutBlackout: '黒画面カーテンの切替',
    shortcutWhiteout: '白画面カーテンの切替',
    shortcutEscClear: 'モーダルを閉じる / カーテン・ポインター解除',
    shortcutFreeze: '聴衆画面の一時固定（手元だけ移動）',
    shortcutLaser: 'レーザーポインターの切替',
    shortcutZoom: 'スライド部分拡大・パン (ホイール拡大 / ドラッグ移動)',
    shortcutZoomReset: 'スライド拡大のリセット',
    shortcutPen: 'フリーハンドペンの切替（+ / - で太さ調整）',
    shortcutSpotlight: 'スポットライト（クリック固定・ホイール / [ ] でサイズ変更）',
    shortcutClearInk: '現在のスライドの描線を消去',
    shortcutToggleInk: '描線の表示 / 非表示を切替',
    shortcutStats: 'リハーサル時間分析を開く',
    shortcutGrid: 'スライド一覧グリッドを開く',
    shortcutOutline: 'PDF 見出しアウトラインを開く',
    shortcutEditNotes: '発表者ノートを編集',
    shortcutUiGuide: '全ボタンの説明を一括オーバーレイ表示',

    helpFormatMarkdownTitle: 'Markdown ノート (--- / <!-- slide: N -->)',
    helpFormatMarkdownBody:
      '--- でスライドを区切るか、<!-- slide: 2 --> でページを指定します。<!-- target: 60 --> や YAML frontmatter（duration・lastMinutes・qrUrl）も認識します。',
    helpFormatMarpTitle: 'Marp / Slidev 原稿 Markdown',
    helpFormatMarpBody:
      '.md 原稿をそのまま読み込めます。paginate:・layout:・<!--fit--> などの設定行を除き、ノートコメントのみを抽出します。',
    helpFormatPdfpcTitle: '.pdfpc v2 と JSON バックアップ',
    helpFormatPdfpcBody:
      'Touying や Polylux 用の .pdfpc ファイルと、本アプリから書き出した JSON ファイルを読み込めます。',
    helpFormatEmbeddedTitle: 'Typst #pdf.attach と PDF 注釈',
    helpFormatEmbeddedBody:
      'PDF に添付された Presio / pdfpc ノート、およびテキスト注釈・フリーテキスト注釈を読込時に自動で抽出します。',

    gridOverviewTitle: 'スライド一覧 (G)',
    outlineTitle: '目次アウトライン (O)',
    noOutlineAvailable: 'この PDF には見出しアウトラインがありません。',
    untitledSection: '無題のセクション',

    rehearsalTitle: 'リハーサル時間分析',
    presentationFallback: 'プレゼンテーション',
    totalDeltaPrefix: '合計差分:',
    totalActual: '実測合計',
    totalTarget: '目標合計',
    noTargetsSet: '目標未設定',
    visitedSlides: '訪問スライド',
    coverageSuffix: '% 到達',
    noTimingData: 'まだスライド滞在時間の記録がありません。',
    visitSingular: '回',
    visitPlural: '回',
    applyActualAsTargets: '実測値を目標時間へ反映',
    exportReportMd: 'レポート保存 (.md)',
    exportReportCsv: 'レポート保存 (.csv)',

    audienceStandbyTitle: 'Typst Presenter — 聴衆用ディスプレイ',
    audienceStandbySubtitle: '待機中 — 発表者画面でスライドが開かれると表示されます。',
    fullscreenPrompt: 'クリックまたは F キーで全画面',

    msgWatchStopped: 'PDF の自動更新を停止しました。',
    msgNoEmbeddedNotes: 'この PDF には埋め込みノートが見つかりませんでした。',
    msgUnsupportedDrop:
      '未対応の形式です。.pdf またはノートファイル (.md, .markdown, .json, .pdfpc) をドロップしてください。',
    msgNotesNeedPdfFirst:
      '先に PDF を開くか、PDF とノートファイルを同時にドロップしてください。',
    msgSidecarNoNotesFound:
      'ノートを検出できなかったため、既存のノートを保持しました。',
    msgAudienceOpenFailed: 'エラー: 聴衆用ウィンドウを開けませんでした。',
    msgStoredDeckMissing: 'エラー: 保存されていた資料を読み込めませんでした。',
    msgEmptyPdf: 'エラー: 空の PDF ファイル (0 bytes) です。',

    openTypstBtn: '.typ を開く',
    typstDrawerTitle: 'Typst ライブコンパイル & 診断',
    typstCliStatusLabel: 'Typst CLI 状態',
    typstCliRecheck: '再確認',
    typstCliMissingGuide:
      'PATH 上に typst CLI が見つかりません。以下のいずれかでインストールしてください:',
    typstWatchedFileLabel: '監視中の .typ ファイル',
    typstNoFileSelected: '.typ ファイル未選択',
    typstRecompileBtn: '再コンパイル',
    typstStopWatchBtn: '監視停止',
    typstDiagnosticsTitle: 'コンパイル診断',
    typstLiveGuardNotice:
      'Live Compile Guard 作動中: 聴衆画面・現在ページ・描線は直前の正常状態のまま維持されています。',
    typstNoDiagnostics: 'コンパイルエラー・警告はありません。',
    typstOptionsTitle: 'コンパイルオプション',
    typstFontsTitle: '利用可能な Typst フォント',
    typstLoadFontsBtn: 'フォント一覧を取得',
    typstStatusOk: 'Typst 正常',
    typstStatusError: 'Typst エラー',
    typstStatusCompiling: 'コンパイル中…',
    logicalShareLabel: 'サブスライド間でノート共有',
    logicalInheritedFrom: '継承元: p.',
    overwriteNotesMdItem: '元の .md へ直接上書き',
    msgOverwriteMdSuccess: '元の Markdown ノートを上書き保存しました:',
    msgOverwriteMarpProtected:
      'Marp/Slidev 原稿の本文破壊を防ぐため、元の .md への直接上書きはブロックされました。別ファイルとして書き出してください。',
    closeGuardModalTitle: '誤終了ガードが有効です',
    closeGuardModalDesc:
      '発表中の誤操作防止ガードが ON になっています。このままアプリを終了しますか？',
    closeGuardKeepPresenting: '発表を続ける',
    closeGuardForceExit: 'ガードを解除して終了',
    formatBulletTypstSingle:
      '単一 .typ 原稿: typst/presenter-notes.typ（#speaker-note / #presenter-config）または Polylux/Touying の <pdfpc> に対応。',
    paneSplitHandleAria: 'スライドとノート領域の幅を調整',
    paneSplitHandleTitle: 'ドラッグで幅を調整（ダブルクリックで初期比率にリセット）',
  },
};
