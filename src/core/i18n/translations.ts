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
  loadSampleDeck: string;
  recentDecksBtn: string;
  watchPdf: string;
  stopWatch: string;
  defaultDisplay: string;
  primaryTag: string;
  displaysBtn: string;
  refreshDisplaysAria: string;
  launchAudienceWindow: string;
  audienceConnected: string;
  audienceDisconnected: string;
  prev: string;
  next: string;
  cropFull: string;
  cropSplitHorizontal: string;
  cropSplitVertical: string;
  swapHalves: string;
  blackoutBtn: string;
  whiteoutBtn: string;
  freezeBtn: string;
  laserBtn: string;
  penBtn: string;
  spotlightBtn: string;
  spotMinus: string;
  spotPlus: string;
  penMinus: string;
  penPlus: string;
  undoBtn: string;
  clearInkBtn: string;
  inkBtn: string;
  guardBtn: string;
  statsBtn: string;
  gridBtn: string;
  outlineBtn: string;
  helpBtn: string;
  quickGuideBtn: string;
  localeToggleTitle: string;
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
  editNotesBtn: string;
  saveNotesBtn: string;
  importNotesBtn: string;
  importEmbeddedBtn: string;
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
  shortcutJump: string;
  shortcutBlackout: string;
  shortcutWhiteout: string;
  shortcutFreeze: string;
  shortcutLaser: string;
  shortcutPen: string;
  shortcutSpotlight: string;
  shortcutClearInk: string;
  shortcutToggleInk: string;
  shortcutStats: string;
  shortcutGrid: string;
  shortcutOutline: string;
  shortcutEditNotes: string;
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
}

export const TRANSLATIONS: Record<Locale, TranslationDict> = {
  en: {
    appTitle: 'Typst Presenter',
    openPdf: 'Open PDF',
    loadSampleDeck: 'Load Sample Deck',
    recentDecksBtn: 'Recent Decks',
    watchPdf: 'Watch PDF',
    stopWatch: 'Stop Watch',
    defaultDisplay: 'Default Display',
    primaryTag: '[Primary]',
    displaysBtn: 'Displays',
    refreshDisplaysAria: 'Refresh displays',
    launchAudienceWindow: 'Launch Audience Window',
    audienceConnected: 'Audience Connected',
    audienceDisconnected: 'Audience Disconnected',
    prev: 'Prev',
    next: 'Next',
    cropFull: 'Full',
    cropSplitHorizontal: 'Split L|R',
    cropSplitVertical: 'Split T|B',
    swapHalves: 'Swap Halves',
    blackoutBtn: 'Blackout (B)',
    whiteoutBtn: 'Whiteout (W)',
    freezeBtn: 'Freeze (F)',
    laserBtn: 'Laser (L)',
    penBtn: 'Pen (D)',
    spotlightBtn: 'Spotlight (S)',
    spotMinus: 'Spot -',
    spotPlus: 'Spot +',
    penMinus: 'Pen -',
    penPlus: 'Pen +',
    undoBtn: 'Undo',
    clearInkBtn: 'Clear Ink (C)',
    inkBtn: 'Ink (H)',
    guardBtn: 'Guard',
    statsBtn: 'Stats (R)',
    gridBtn: 'Grid (G)',
    outlineBtn: 'Outline (O)',
    helpBtn: 'Help (?)',
    quickGuideBtn: 'Quick Guide (?)',
    localeToggleTitle: 'Switch language (JP / EN)',
    dismiss: 'Dismiss',
    close: 'Close',
    closeEsc: 'Close (Esc)',

    popupBlockedPrefix: 'Popup blocked by browser! Open Audience URL manually:',
    copyUrl: 'Copy URL',
    splitDetectedMessage:
      'Wide Touying split-page PDF detected (aspect ratio > 2.4). Apply Split L|R cropping?',
    applySplitLR: 'Apply Split L|R',
    blackoutActive: 'Blackout Active (B)',
    whiteoutActive: 'Whiteout Active (W)',

    onboardingDropTitle: 'Typst Presenter',
    onboardingDropDesc: 'Drag & drop your PDF slide deck here, or click to select a file',
    onboardingSupports:
      'Supports Typst, Marp, Beamer, PowerPoint/Keynote PDFs, paired Markdown/pdfpc notes, and dual-window sync',
    choosePdfFile: 'Choose PDF File',
    recentDecksTitle: 'Recent Decks',
    openRecent: 'Open',
    deleteRecent: 'Delete',
    quickStartHeading: 'Quick Start (3 Steps)',
    quickStartStep1Title: '1. Load PDF (or Watch)',
    quickStartStep1Desc: 'Drop a PDF + notes file together, or try the built-in Sample Deck.',
    quickStartStep2Title: '2. Notes & Timing',
    quickStartStep2Desc: 'Import .md / Marp / .pdfpc / PDF annotations, or press E to edit.',
    quickStartStep3Title: '3. Present Dual-Window',
    quickStartStep3Desc: 'Click Launch Audience Window for projector view, Laser (L), & Spotlight (S).',

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
    editNotesBtn: 'Edit Notes (E)',
    saveNotesBtn: 'Save',
    importNotesBtn: 'Import Notes',
    importEmbeddedBtn: 'Import Embedded Notes',
    exportMdBtn: 'Export .md',
    exportJsonBtn: 'Export .json',
    exportPdfpcBtn: 'Export .pdfpc',
    notesEditorPlaceholder: 'Enter Markdown speaker notes for this slide...',
    noNotesPlaceholder: 'No speaker notes for this slide.',
    quickImportHintBtn: 'Import Notes...',
    quickEditHintBtn: 'Edit Notes (E)',

    notesImportTitle: 'Import Speaker Notes',
    notesImportSubtitle: 'Load external script files or extract embedded PDF notes.',
    notesDropzoneTitle: 'Drop a notes file here (.md, .markdown, .json, .pdfpc)',
    notesDropzoneHint: 'You can also drag & drop a PDF and notes file together anywhere in the app.',
    chooseNotesFile: 'Choose Notes File',
    importEmbeddedSectionTitle: 'Embedded PDF Notes (#pdf.attach / Annotations)',
    importEmbeddedReadyDesc: 'Embedded notes are detected in the current PDF.',
    importEmbeddedNoneDesc: 'No embedded notes were detected on load (you can still re-scan).',
    formatGuideTitle: 'Supported Formats & Syntax',
    formatBulletMarkdown:
      'Markdown (---): Separate slides with ---, or specify pages with <!-- slide: 1 -->.',
    formatBulletExplicit:
      'Slide Target Time: Add <!-- target: 45 --> inside a slide note to set target seconds.',
    formatBulletMarpSlidev:
      'Marp / Slidev .md: Source Markdown can be loaded directly (directives are stripped cleanly).',
    formatBulletPdfpc:
      'JSON / .pdfpc: Standard pdfpc v2 files and exported DeckNotesBundle JSON are supported.',
    formatBulletPairDrop:
      'Pair Drop: Drop both slides.pdf and notes.md onto the window in one action.',
    copyTemplateBtn: 'Copy .md Template',
    copiedTemplateBtn: 'Copied!',
    downloadTemplateBtn: 'Download Template (.md)',

    helpModalTitle: 'Guide & Shortcuts (?)',
    helpTabQuickStart: 'Quick Start',
    helpTabShortcuts: 'Shortcuts',
    helpTabFormats: 'Notes Format',
    helpQuickStep1Title: '1. Open Your Slide PDF',
    helpQuickStep1Body:
      'Click Open PDF or drag & drop a PDF (portrait, mixed aspect ratios, or Touying split slides all fit cleanly). Use Watch PDF on Chromium to auto-reload on typst watch.',
    helpQuickStep2Title: '2. Add Speaker Notes & Targets',
    helpQuickStep2Body:
      'Click Import Notes for Markdown, Marp/Slidev, .pdfpc, or embedded #pdf.attach / PDF annotations, or press E to write notes per slide.',
    helpQuickStep3Title: '3. Launch Audience Window',
    helpQuickStep3Body:
      'Click Launch Audience Window and move/fullscreen it on your projector (F). Both windows stay synced offline via BroadcastChannel + IndexedDB.',
    helpQuickStep4Title: '4. Deliver & Review Timing',
    helpQuickStep4Body:
      'Use Laser (L), Pen (D), Spotlight (S, click to pin / wheel or [ ] to resize), curtains (B/W), Freeze (F), and Stats (R) for rehearsal pacing.',

    shortcutNav: 'Next / Previous Slide',
    shortcutJump: 'Direct Slide Jump',
    shortcutBlackout: 'Toggle Blackout Curtain',
    shortcutWhiteout: 'Toggle Whiteout Curtain',
    shortcutFreeze: 'Toggle Freeze Audience Display',
    shortcutLaser: 'Toggle Laser Pointer',
    shortcutPen: 'Toggle Freehand Pen Tool (+/- size)',
    shortcutSpotlight: 'Toggle Spotlight (click to pin, wheel or [ / ] size)',
    shortcutClearInk: 'Clear Ink on Current Slide',
    shortcutToggleInk: 'Toggle Ink Visibility',
    shortcutStats: 'Toggle Rehearsal Stats',
    shortcutGrid: 'Toggle Slide Grid Overview',
    shortcutOutline: 'Toggle PDF Outline Drawer',
    shortcutEditNotes: 'Edit Speaker Notes Inline',

    helpFormatMarkdownTitle: 'Markdown Notes (--- / <!-- slide: N -->)',
    helpFormatMarkdownBody:
      'Use --- between slides, or explicit <!-- slide: 2 --> markers with optional <!-- target: 60 --> and YAML frontmatter (duration, lastMinutes, endTime).',
    helpFormatMarpTitle: 'Marp & Slidev Source Markdown',
    helpFormatMarpBody:
      'Drop your .md source directly. Slide directives (paginate:, layout:, <!--fit-->) are ignored and HTML speaker comments are extracted per slide.',
    helpFormatPdfpcTitle: '.pdfpc v2 & JSON',
    helpFormatPdfpcBody:
      'Compatible with pdfpc metadata exported by Typst Touying/Polylux scripts as well as Typst Presenter JSON backups.',
    helpFormatEmbeddedTitle: 'Typst #pdf.attach & PDF Sticky/FreeText Notes',
    helpFormatEmbeddedBody:
      'Notes attached in PDF (Presio JSON, pdfpc attachments, or Text/FreeText annotations) are imported automatically on load.',

    gridOverviewTitle: 'Slide Grid Overview (G)',
    outlineTitle: 'Outline / Table of Contents (O)',
    noOutlineAvailable: 'No outline available in this PDF.',
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
    audienceStandbySubtitle: 'Standby mode — Waiting for Presenter deck...',
    fullscreenPrompt: 'Click or press F for Fullscreen',

    msgWatchStopped: 'Stopped watching PDF file.',
    msgNoEmbeddedNotes: 'No embedded notes found in this PDF.',
    msgUnsupportedDrop:
      'Unsupported file format. Please drop a .pdf file or notes (.md, .markdown, .json, .pdfpc).',
    msgNotesNeedPdfFirst:
      'Open a PDF first, or drag & drop a PDF and notes file together.',
    msgSidecarNoNotesFound:
      'No speaker notes were found in that file. Existing notes were preserved.',
    msgAudienceOpenFailed: 'Error: Failed to open Audience display window.',
    msgStoredDeckMissing: 'Error: Stored deck is no longer available.',
    msgEmptyPdf: 'Error: Invalid or empty PDF file (0 bytes).',
  },

  ja: {
    appTitle: 'Typst Presenter',
    openPdf: 'PDFを開く',
    loadSampleDeck: 'サンプル読込',
    recentDecksBtn: '最近の資料',
    watchPdf: 'PDF監視',
    stopWatch: '監視停止',
    defaultDisplay: '既定ディスプレイ',
    primaryTag: '[メイン]',
    displaysBtn: '画面更新',
    refreshDisplaysAria: 'ディスプレイ一覧を更新',
    launchAudienceWindow: '聴衆ウィンドウを開く',
    audienceConnected: '聴衆画面 接続中',
    audienceDisconnected: '聴衆画面 未接続',
    prev: '前へ',
    next: '次へ',
    cropFull: '全体',
    cropSplitHorizontal: '左右分割 L|R',
    cropSplitVertical: '上下分割 T|B',
    swapHalves: '左右/上下入替',
    blackoutBtn: '黒画面 (B)',
    whiteoutBtn: '白画面 (W)',
    freezeBtn: '画面固定 (F)',
    laserBtn: 'レーザー (L)',
    penBtn: 'ペン (D)',
    spotlightBtn: 'スポット (S)',
    spotMinus: '縮小 -',
    spotPlus: '拡大 +',
    penMinus: '細く -',
    penPlus: '太く +',
    undoBtn: '戻す',
    clearInkBtn: '描線消去 (C)',
    inkBtn: '描線表示 (H)',
    guardBtn: '誤操作防止',
    statsBtn: '計測分析 (R)',
    gridBtn: '一覧 (G)',
    outlineBtn: '目次 (O)',
    helpBtn: 'ヘルプ (?)',
    quickGuideBtn: '使い方ガイド (?)',
    localeToggleTitle: '表示言語を切替 (JP / EN)',
    dismiss: '閉じる',
    close: '閉じる',
    closeEsc: '閉じる (Esc)',

    popupBlockedPrefix: 'ポップアップがブロックされました。次の URL を手動で開いてください:',
    copyUrl: 'URL をコピー',
    splitDetectedMessage:
      'Touying 等の横長分割 PDF（縦横比 > 2.4）を検出しました。左右分割 (Split L|R) を適用しますか？',
    applySplitLR: '左右分割を適用',
    blackoutActive: '黒画面中 (B)',
    whiteoutActive: '白画面中 (W)',

    onboardingDropTitle: 'Typst Presenter',
    onboardingDropDesc: 'ここにスライド PDF をドラッグ＆ドロップ、またはクリックして選択',
    onboardingSupports:
      'Typst / Marp / Beamer / PowerPoint 出力 PDF、Markdown・pdfpc ノート、2画面同期に対応',
    choosePdfFile: 'PDF ファイルを選択',
    recentDecksTitle: '最近開いた資料',
    openRecent: '開く',
    deleteRecent: '削除',
    quickStartHeading: 'クイックスタート（3ステップ）',
    quickStartStep1Title: '1. PDF を読み込む',
    quickStartStep1Desc: 'PDF とノートを同時ドロップ、または「サンプル読込」でお試し。',
    quickStartStep2Title: '2. ノート・目安を設定',
    quickStartStep2Desc: 'Import Notes から .md / Marp / .pdfpc 取込、または E キーで編集。',
    quickStartStep3Title: '3. 2画面で発表',
    quickStartStep3Desc: '「聴衆ウィンドウを開く」で外部出力。レーザー(L)・スポット(S)対応。',

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
    editNotesBtn: 'ノート編集 (E)',
    saveNotesBtn: '保存',
    importNotesBtn: 'ノート取込',
    importEmbeddedBtn: '埋込ノート取込',
    exportMdBtn: 'Export .md',
    exportJsonBtn: 'Export .json',
    exportPdfpcBtn: 'Export .pdfpc',
    notesEditorPlaceholder: 'このスライドの発表者ノートを Markdown で入力...',
    noNotesPlaceholder: 'このスライドにはまだ発表者ノートがありません。',
    quickImportHintBtn: 'ノートを取り込む...',
    quickEditHintBtn: 'ノートを編集 (E)',

    notesImportTitle: '発表者ノートのインポート',
    notesImportSubtitle: '外部スクリプトファイルの読み込み、または PDF 埋め込みノートを抽出します。',
    notesDropzoneTitle: 'ここにノートファイルをドロップ (.md, .markdown, .json, .pdfpc)',
    notesDropzoneHint: '画面全体へ PDF とノートファイルを同時にドロップして読み込むこともできます。',
    chooseNotesFile: 'ノートファイルを選択',
    importEmbeddedSectionTitle: 'PDF 埋め込みノート（#pdf.attach / PDF 注釈）',
    importEmbeddedReadyDesc: '現在の PDF から埋め込みノートが検出されています。',
    importEmbeddedNoneDesc: '自動検出された埋め込みノートはありません（再スキャンも可能です）。',
    formatGuideTitle: '対応フォーマットと記法',
    formatBulletMarkdown:
      'Markdown (---): --- でページ区切り、または <!-- slide: 1 --> でページ指定します。',
    formatBulletExplicit:
      'スライド目標秒数: <!-- target: 45 --> を書くとタイマーの目標秒数に反映されます。',
    formatBulletMarpSlidev:
      'Marp / Slidev .md: 原稿 .md をそのまま読込可能（ディレクティブを自動除外しコメントを抽出）。',
    formatBulletPdfpc:
      'JSON / .pdfpc: pdfpc v2 形式や本アプリで Export した JSON ファイルを読み込めます。',
    formatBulletPairDrop:
      '同時ドロップ: slides.pdf と notes.md を選択してまとめてドロップできます。',
    copyTemplateBtn: '.md テンプレートをコピー',
    copiedTemplateBtn: 'コピーしました！',
    downloadTemplateBtn: 'テンプレートを保存 (.md)',

    helpModalTitle: '使い方ガイド ＆ ショートカット (?)',
    helpTabQuickStart: '使い方',
    helpTabShortcuts: 'ショートカット',
    helpTabFormats: 'ノート書式',
    helpQuickStep1Title: '1. スライド PDF を開く',
    helpQuickStep1Body:
      '「PDFを開く」またはドラッグ＆ドロップで読み込みます（縦型・混在サイズ・Touying 分割にも対応）。Chromium 系では「PDF監視」で typst watch と自動連動します。',
    helpQuickStep2Title: '2. スクリプトと目標時間を設定',
    helpQuickStep2Body:
      '「ノート取込」から Markdown / Marp / Slidev / .pdfpc / #pdf.attach を取り込むか、E キーでその場編集できます。',
    helpQuickStep3Title: '3. 聴衆ウィンドウを外部画面へ配置',
    helpQuickStep3Body:
      '「聴衆ウィンドウを開く」を押し、プロジェクター側で F キーまたはダブルクリックで全画面化します。同じブラウザ内でオフライン低遅延同期します。',
    helpQuickStep4Title: '4. 発表中のポインター ＆ リハーサル分析',
    helpQuickStep4Body:
      'レーザー (L)、ペン (D)、スポットライト (S：クリック固定・ホイール / [ ] でサイズ調整)、黒/白カーテン (B/W)、静止 (F)、計測分析 (R) が使えます。',

    shortcutNav: '次のスライド / 前のスライド',
    shortcutJump: '番号入力でスライドへ直接ジャンプ',
    shortcutBlackout: '黒画面 (Blackout) の切替',
    shortcutWhiteout: '白画面 (Whiteout) の切替',
    shortcutFreeze: '聴衆画面の一時固定 (Freeze)',
    shortcutLaser: 'レーザーポインターの切替',
    shortcutPen: 'フリーハンドペンの切替（+/- で太さ調整）',
    shortcutSpotlight: 'スポットライト（クリック固定、ホイール / [ ] でサイズ変更）',
    shortcutClearInk: '現在のスライドの描線を消去',
    shortcutToggleInk: '描線の表示 / 非表示を切替',
    shortcutStats: 'リハーサル時間分析 (Stats) を開く',
    shortcutGrid: 'スライド一覧グリッド (Grid) を開く',
    shortcutOutline: 'PDF 見出しアウトライン (Outline) を開く',
    shortcutEditNotes: '発表者ノートを編集',

    helpFormatMarkdownTitle: 'Markdown ノート (--- / <!-- slide: N -->)',
    helpFormatMarkdownBody:
      '--- でスライド区切り、または <!-- slide: 2 --> と <!-- target: 60 --> や YAML frontmatter（duration・lastMinutes・endTime）を指定できます。',
    helpFormatMarpTitle: 'Marp / Slidev 原稿 Markdown',
    helpFormatMarpBody:
      '.md ソースをそのまま取り込めます。paginate:・layout:・<!--fit--> 等の設定を除外し、ノートコメントのみを抽出します。',
    helpFormatPdfpcTitle: '.pdfpc v2 ＆ JSON バックアップ',
    helpFormatPdfpcBody:
      'Touying / Polylux が出力する `.pdfpc` ファイルや、本アプリから Export した `.json` ファイルを読み込めます。',
    helpFormatEmbeddedTitle: 'Typst #pdf.attach ＆ PDF 注釈',
    helpFormatEmbeddedBody:
      'PDF に添付された Presio / pdfpc ノートや、PDF 内のテキスト・フリーテキスト注釈を自動抽出します。',

    gridOverviewTitle: 'スライド一覧グリッド (G)',
    outlineTitle: '目次 / アウトライン (O)',
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
    visitSingular: '回訪問',
    visitPlural: '回訪問',
    applyActualAsTargets: '実測値を目標時間へ反映',
    exportReportMd: 'レポート保存 (.md)',
    exportReportCsv: 'レポート保存 (.csv)',

    audienceStandbyTitle: 'Typst Presenter — 聴衆用ディスプレイ',
    audienceStandbySubtitle: '待機中 — 発表者画面からのスライド読込を待っています...',
    fullscreenPrompt: 'クリックまたは F キーで全画面表示',

    msgWatchStopped: 'PDF ファイルの監視を停止しました。',
    msgNoEmbeddedNotes: 'この PDF には埋め込みノートが見つかりませんでした。',
    msgUnsupportedDrop:
      '未対応のファイル形式です。.pdf またはノートファイル (.md, .markdown, .json, .pdfpc) をドロップしてください。',
    msgNotesNeedPdfFirst:
      '先に PDF を開くか、PDF とノートファイルを同時にドロップしてください。',
    msgSidecarNoNotesFound:
      'このファイルからは発表者ノートを検出できませんでした（既存のノートは保持されました）。',
    msgAudienceOpenFailed: 'エラー: 聴衆用ディスプレイウィンドウを開けませんでした。',
    msgStoredDeckMissing: 'エラー: 保存されていた資料が見つかりませんでした。',
    msgEmptyPdf: 'エラー: 空の PDF ファイル (0 bytes) です。',
  },
};
