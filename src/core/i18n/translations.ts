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
  gridAria: string;
  outlineBtn: string;
  helpBtn: string;
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
    penBtn: 'Pen (D)',
    spotlightBtn: 'Spotlight (S)',
    spotMinus: 'Smaller Spotlight ([)',
    spotPlus: 'Larger Spotlight (])',
    penMinus: 'Thinner Pen (-)',
    penPlus: 'Thicker Pen (+)',
    undoBtn: 'Undo Stroke',
    clearInkBtn: 'Clear Ink (C)',
    inkBtn: 'Toggle Ink Visibility (H)',
    guardBtn: 'Reload Guard',
    statsBtn: 'Rehearsal Stats (R)',
    gridBtn: 'Slide Grid (G)',
    gridAria: 'Thumbnail Overview (G)',
    outlineBtn: 'Outline (O)',
    helpBtn: 'Help & Shortcuts (?)',
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
    shortcutJump: 'Jump to Slide Number',
    shortcutBlackout: 'Toggle Blackout Curtain',
    shortcutWhiteout: 'Toggle Whiteout Curtain',
    shortcutFreeze: 'Freeze / Unfreeze Audience Display',
    shortcutLaser: 'Toggle Laser Pointer',
    shortcutPen: 'Toggle Freehand Pen (+ / - width)',
    shortcutSpotlight: 'Toggle Spotlight (click to pin, wheel or [ / ] radius)',
    shortcutClearInk: 'Clear Ink on Current Slide',
    shortcutToggleInk: 'Show / Hide Ink',
    shortcutStats: 'Open Rehearsal Stats',
    shortcutGrid: 'Open Slide Grid',
    shortcutOutline: 'Open PDF Outline',
    shortcutEditNotes: 'Edit Current Slide Notes',

    helpFormatMarkdownTitle: 'Markdown (--- or <!-- slide: N -->)',
    helpFormatMarkdownBody:
      'Separate slides with --- or explicit <!-- slide: 2 --> markers. Add <!-- target: 60 --> and YAML frontmatter (duration, lastMinutes, endTime) to configure the timer.',
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
  },

  ja: {
    appTitle: 'Typst Presenter',
    openPdf: 'PDFを開く',
    sampleShortBtn: 'サンプル',
    loadSampleDeck: 'サンプル読込',
    recentDecksBtn: '履歴',
    recentDecksTooltip: '最近開いた資料一覧へ戻る',
    watchPdf: '監視',
    watchPdfTooltip: 'PDF ファイルの変更を自動再読込する（Chromium 系ブラウザ）',
    stopWatch: '監視中',
    defaultDisplay: '既定ディスプレイ',
    primaryTag: '[メイン]',
    displaysBtn: '画面更新',
    refreshDisplaysAria: 'ディスプレイ一覧を更新',
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
    penBtn: 'ペン (D)',
    spotlightBtn: 'スポットライト (S)',
    spotMinus: 'スポット縮小 ([)',
    spotPlus: 'スポット拡大 (])',
    penMinus: 'ペン細く (-)',
    penPlus: 'ペン太く (+)',
    undoBtn: '描線を1つ戻す',
    clearInkBtn: '描線を消去 (C)',
    inkBtn: '描線の表示切替 (H)',
    guardBtn: '誤リロード防止',
    statsBtn: 'リハーサル分析 (R)',
    gridBtn: 'スライド一覧 (G)',
    gridAria: '一覧サムネイル (G)',
    outlineBtn: '目次アウトライン (O)',
    helpBtn: 'ヘルプ・ショートカット (?)',
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
      'PDF を選択またはドロップします（縦型・混在サイズ・Touying 分割に対応）。Chromium 系ブラウザでは「監視」で typst watch と連動し自動再読込できます。',
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
    shortcutJump: '番号入力でスライドへジャンプ',
    shortcutBlackout: '黒画面カーテンの切替',
    shortcutWhiteout: '白画面カーテンの切替',
    shortcutFreeze: '聴衆画面の一時固定（手元だけ移動）',
    shortcutLaser: 'レーザーポインターの切替',
    shortcutPen: 'フリーハンドペンの切替（+ / - で太さ調整）',
    shortcutSpotlight: 'スポットライト（クリック固定・ホイール / [ ] でサイズ変更）',
    shortcutClearInk: '現在のスライドの描線を消去',
    shortcutToggleInk: '描線の表示 / 非表示を切替',
    shortcutStats: 'リハーサル時間分析を開く',
    shortcutGrid: 'スライド一覧グリッドを開く',
    shortcutOutline: 'PDF 見出しアウトラインを開く',
    shortcutEditNotes: '発表者ノートを編集',

    helpFormatMarkdownTitle: 'Markdown ノート (--- / <!-- slide: N -->)',
    helpFormatMarkdownBody:
      '--- でスライドを区切るか、<!-- slide: 2 --> でページを指定します。<!-- target: 60 --> や YAML frontmatter（duration・lastMinutes・endTime）も認識します。',
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

    msgWatchStopped: 'PDF ファイルの監視を停止しました。',
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
  },
};
