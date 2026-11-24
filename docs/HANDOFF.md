# Typst Presenter 開発引き継ぎ・Phase 3 着手ガイド

本書は、コンテキスト劣化を防ぎつつ別会話で **Phase 3（v0.4.0）** を円滑に開始するため、現在の実装状態・検証済みベースライン・モジュール構成・技術的制約・Phase 3 着手チェックリストを整理した引き継ぎ資料です。

---

## 1. 現状サマリー（v0.4.0 / Phase 1〜3 完了時点）

- **リポジトリ URL**: <https://github.com/tokotoko9981/typst-presenter>
- **ローカル作業フォルダ**: `C:\Users\tokot\Desktop\program\typst-presenter`（ブランチ `main`、ローカルコミットは未プッシュ）
- **完了済みマイルストーン**:
  - **Phase 1（`f14dd60`）**: `BlackoutScreenIcon` / `WhiteoutScreenIcon` 刷新、リモコン互換ショートカット（`.` / `ArrowUp` / `ArrowDown` / `Home` / `End` / `Esc`）、聴衆画面全画面ピル非表示・カーソル自動隠蔽、`UiGuideOverlay.tsx` パターン C（12 ブロック集約）再設計、未使用 `zustand` 削除
  - **Tauri v2 Windows 実機修正（`b5c9617`）**: 聴衆ウィンドウ起動時の WebView2 デッドロック回避（`async fn` 化）、黒背景初期化、本体ウィンドウ終了時の聴衆自動破棄、`is_audience_fullscreen` 追加
  - **Phase 2（`2ee9502` ＋ ズーム鮮明化修正）**: 学会形式チャイム SE（1/2/3 鈴、Web Audio API、デフォルト OFF）、スライド拡大・パン（`Z`＋ホイール＋ドラッグ、表示領域 1:1 ネイティブ DPR 詳細レイヤー＋HiDPI オーバーレイ）、レーザー色切替（赤/緑/青）、隣接ページ先読みキャッシュ（LRU 上限 4）、Q&A 用 QR コード即時オーバーレイ（`uqr@0.1.3`）、聴衆画面極薄 2px プログレスバー（デフォルト OFF）
  - **Phase 3（v0.4.0）**:
    - **付録 A（案 1 二段構え ＋ 由来管理ホットリロード）**: [`typst/presenter-notes.typ`](../typst/presenter-notes.typ)（`#speaker-note` / `#presenter-config` / `#enable-presenter-notes` で `#pdf.attach` JSON 自動埋め込み）＋ `typst query <pdfpc>` 補完抽出（[`src/core/typst/typstPdfpcParser.ts`](../src/core/typst/typstPdfpcParser.ts)）、`extractors.ts` の JSON `targetSeconds` / 添付 `.md` YAML frontmatter 保持、および `source: 'embedded' | 'sidecar' | 'manual'` による再コンパイル時自動追従（`mergeHotReloadNotesBundle`）
    - **付録 B（論理スライドノート共有）**: [`src/core/notes/logicalSlides.ts`](../src/core/notes/logicalSlides.ts) による `pageLabels` 重複ページのノート共有（`logical-slide-toggle` / 継承元バッジ）および [`RehearsalStatsModal.tsx`](../src/features/presenter/RehearsalStatsModal.tsx) の論理スライド合算表示
    - **付録 C（ローカル `.md` 直接上書き保存）**: [`src/core/files/NotesFileSaver.ts`](../src/core/files/NotesFileSaver.ts) による File System Access API / Tauri FS 直接上書き（Marp / Slidev 原稿保護ガード付き）
    - **付録 D ＆ Tauri v2 直接コンパイル・Live Compile Guard**: `src-tauri/src/commands/`（`typst.rs`, `files.rs`, `window.rs`）による CLI 引数起動、`typst` 監視・一時出力ビルド、`CREATE_NO_WINDOW` 適用、構文エラー時の直前 PDF/ページ/描線維持＋ [`TypstCompileDrawer.tsx`](../src/features/presenter/components/TypstCompileDrawer.tsx) 診断表示、および Tauri `CloseRequested` Guard 連動
- **対応ランタイム**:
  - **Web ブラウザ / オフライン PWA**: Vite + React 19 + Tailwind CSS v4 + `vite-plugin-pwa`
  - **デスクトップアプリ（Tauri v2）**: `src-tauri/`（Rust `1.100.0` / `tauri` v2 / `tauri-plugin-dialog` / `notify`）
  - **ローカル Typst CLI**: `typst 0.15.1 (9dfd3a08)` 導入済み

### 直近の検証済みベースライン（Phase 3 完了時点）
- **型チェック (`npm run typecheck`)**: `tsc --noEmit` エラー 0 件
- **ユニットテスト (`npm test`)**: **15 ファイル / 124 件すべてパス**（`typst 0.15.1` 実コンパイル往復検証含む）
- **Rust ユニットテスト (`cargo test --manifest-path src-tauri/Cargo.toml`)**: **3 件すべてパス**
- **本番ビルド (`npm run build`)**: `dist/` 生成成功
- **Playwright E2E (`npx playwright test --workers=1`)**: **10 ファイル（`*.spec.ts`） / 112 件すべてパス**
- **視覚検証**: 1280×800（JP Dark / Tauri `TypstCompileDrawer`）および 1024×680（EN Light）で `headerHeight: 77px`・横オーバーフローなしを確認済み

### 開発・テスト手順（Windows PowerShell 5.1）

```powershell
# 1. Web 開発サーバー起動 (http://localhost:5173)
npm run dev

# 2. Tauri v2 デスクトップアプリ起動 (Vite 5173 + ネイティブウィンドウ)
npm run tauri:dev

# 3. 型チェック & ユニットテスト（大文字ドライブレター起点）
npm run typecheck; if ($LASTEXITCODE -eq 0) { npm test }

# 4. 本番ビルド & Playwright E2E（直列実行）
npm run build; if ($LASTEXITCODE -eq 0) { npx playwright test --workers=1 }
```

---

## 2. ディレクトリ・主要モジュール構成

### フロントエンド（`src/`）

| パス | 主な役割 |
| --- | --- |
| [`src/App.tsx`](../src/App.tsx) | ハッシュルーター（`#/` 発表者画面、`#/audience` 聴衆画面）、`ThemeProvider`・`I18nProvider` 統合 |
| [`src/index.css`](../src/index.css) | Tailwind v4 設定、`@custom-variant dark`、横スワイプ履歴戻り防止 |
| [`src/features/presenter/PresenterConsole.tsx`](../src/features/presenter/PresenterConsole.tsx) | 発表者コンソール本体（2 段ツールバー、スライド制御、タイマー、ノート表示/編集、各種モーダル呼出） |
| [`src/features/presenter/components/CurtainIcons.tsx`](../src/features/presenter/components/CurtainIcons.tsx) | 黒画面・白画面アイコン（形状差別化デザイン） |
| [`src/features/presenter/components/QrOverlayModal.tsx`](../src/features/presenter/components/QrOverlayModal.tsx) | Q&A 用 QR コード投影モーダル |
| [`src/features/presenter/hooks/usePresenterShortcuts.ts`](../src/features/presenter/hooks/usePresenterShortcuts.ts) | 発表者コンソール・リモコン互換・ズーム等のキーボードショートカット管理フック |
| [`src/features/presenter/hooks/useChimeAlerts.ts`](../src/features/presenter/hooks/useChimeAlerts.ts) | 残り時間・終了・超過に応じたチャイム自動鳴動フック |
| [`src/features/presenter/UiGuideOverlay.tsx`](../src/features/presenter/UiGuideOverlay.tsx) | ボタン説明一括オーバーレイ（パターン C：12 機能ブロック集約コールアウト） |
| [`src/features/presenter/HelpModal.tsx`](../src/features/presenter/HelpModal.tsx) | 使い方ガイド・ショートカット・ノート書式ヘルプ（`?` キー） |
| [`src/features/presenter/NotesImportModal.tsx`](../src/features/presenter/NotesImportModal.tsx) | 原稿ファイル取込（`.md`, Marp/Slidev, `.json`, `.pdfpc`）、埋め込みノート抽出 |
| [`src/features/presenter/RehearsalStatsModal.tsx`](../src/features/presenter/RehearsalStatsModal.tsx) | リハーサル滞在時間分析（`R` キー）、実測値の目標秒数反映、`.md` / `.csv` 出力 |
| [`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) | 聴衆用プロジェクター画面（背景 `#000000` 固定、全画面状態追従、QR 投影、極薄 2px 進捗バー） |
| [`src/components/SlideStage.tsx`](../src/components/SlideStage.tsx) | メインスライド描画（1x ベース＋表示領域 1:1 DPR ズーム詳細レイヤー＋HiDPI 注釈オーバーレイ＋リンク） |
| [`src/components/ThumbnailCanvas.tsx`](../src/components/ThumbnailCanvas.tsx) | 次のスライド予習・一覧グリッド用サムネイル描画 |
| [`src/core/audio/ChimeEngine.ts`](../src/core/audio/ChimeEngine.ts) | Web Audio API ベル合成エンジン・二重鳴動防止ラッチ |
| [`src/core/zoom/zoomMath.ts`](../src/core/zoom/zoomMath.ts) | カーソル中心拡大・パン・相対変換計算 |
| [`src/core/qr/qrSvg.ts`](../src/core/qr/qrSvg.ts) | `uqr` ベースのオフライン SVG QR コード生成 |
| [`src/core/pdf/PdfEngine.ts`](../src/core/pdf/PdfEngine.ts) | `pdfjs-dist` ラッパー（CMap / 標準フォント / WASM ローカル完結、隣接ページ LRU 先読み） |
| [`src/core/pdf/extractors.ts`](../src/core/pdf/extractors.ts) | PDF 添付（`#pdf.attach` / Presio JSON）および PDF 注釈からのノート抽出、アウトライン解決 |
| [`src/core/pdf/viewportMath.ts`](../src/core/pdf/viewportMath.ts) | クロップ領域計算・`zoomView` 用ネイティブ DPR オフセット計算・正規化リンク座標変換 |
| [`src/core/notes/NotesManager.ts`](../src/core/notes/NotesManager.ts) | Markdown・YAML frontmatter（`qrUrl` / `qrLabel` 対応）・Marp/Slidev・`.pdfpc` v2 の解析と出力 |
| [`src/core/sync/SyncBridge.ts`](../src/core/sync/SyncBridge.ts) | `BroadcastChannel` 同期・ハートビート接続検出・スナップショット同期 |
| [`src/core/storage/StorageService.ts`](../src/core/storage/StorageService.ts) | IndexedDB（PDF 本体 / ノート / セッション復旧 / 直近 5 デッキ履歴）および設定永続化 |
| [`src/core/timer/TimerEngine.ts`](../src/core/timer/TimerEngine.ts) | 経過・カウントダウン・終了時刻モード・スライド別目標秒数・ペース判定 |
| [`src/core/timer/RehearsalTracker.ts`](../src/core/timer/RehearsalTracker.ts) | スライド別の実測滞在時間・訪問回数計測とレポート生成 |
| [`src/core/files/FileWatchService.ts`](../src/core/files/FileWatchService.ts) | File System Access API による PDF 変更検知ポーリング |
| [`src/core/platform/DesktopBridge.ts`](../src/core/platform/DesktopBridge.ts) | Tauri v2 IPC（`window.__TAURI_INTERNALS__`）とブラウザ Web API の環境抽象化 |
| [`src/core/theme/ThemeContext.tsx`](../src/core/theme/ThemeContext.tsx) | OS `prefers-color-scheme` 追従＋`localStorage` 永続化によるライト/ダーク切替 |
| [`src/core/i18n/translations.ts`](../src/core/i18n/translations.ts) | 日本語 / 英語（`ja` / `en`）辞書・ロケール判定 |

### デスクトップ・ビルド・サンプル

- [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) / [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json): Tauri v2 コマンド（`list_monitors`, `open_audience_window`, `close_audience_window`, `set_audience_fullscreen`, `is_audience_fullscreen`, `get_platform_info`）、通常 `1440x900`・最小 `1024x680`。
- [`scripts/run-tauri.mjs`](../scripts/run-tauri.mjs): `~/.cargo/bin` 自動補完・ポート `5173` 重複事前検知。
- [`examples/lt-typst-presenter.typ`](../examples/lt-typst-presenter.typ) / [`examples/lt-typst-presenter-notes.md`](../examples/lt-typst-presenter-notes.md): 公式サンプル（Phase 4 で改修予定）。
- `tests/`: ユニットテスト 13 本（`tests/unit/`）、E2E テスト 9 本（`tests/e2e/`）、Typst PDF フィクスチャ（`tests/fixtures/`）。

---

## 3. 開発・テスト上の技術的制約（重要）

1. **Windows PowerShell 5.1 のコマンド規約**:
   - コマンド連結に `&&` / `||` は使わず、`;` と `$LASTEXITCODE` を使用すること。
   - **Vitest**: 大文字 `C:\Users\tokot\Desktop\program\typst-presenter` を起点に `npm test` を実行すること（小文字 `c:\...` だとファイル検出が失敗する場合がある）。
   - **Playwright**: 引数区切り消費を防ぐため `npm run` を通さず **`npx playwright test --workers=1`** を直接実行すること。
2. **Tauri v2 Windows 固有ルール（`src-tauri/src/lib.rs`）**:
   - **WebView2 デッドロック回避**: `WebviewWindowBuilder::build()` を呼ぶ Tauri コマンドは必ず **`async fn`** にすること（同期 `fn` だと Windows WebView2 のメインスレッドと競合しフリーズする）。
   - **`rustc 1.100+` の `#[tauri::command]` ルール**: `lib.rs` 直下で `#[tauri::command] pub fn ...` とすると `E0255` になるため、非公開 `fn` または `mod commands` 配下へ置くこと。
   - Phase 3 で `std::process::Command` により `typst` を起動する際は、Windows コンソールウィンドウの点滅を防ぐため **`CREATE_NO_WINDOW`（`0x08000000`）** を付与すること。
3. **UI レイアウト制約・`AudienceView` 背景**:
   - ヘッダーは 2 段固定（`headerHeight: 77px`、`1024×680` で Row 2 が高密度）。ポップオーバー類は Row 2 の `overflow-y-hidden` で切られないよう `fixed` 配置すること。
   - [`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) の背景は常時 `#000000` を維持すること。
   - **デスクトップ版の Guard（`guard-toggle`）**: 現状はブラウザの `beforeunload` イベントのみを制御しており、Tauri のウィンドウ閉じイベント（`CloseRequested`）には連動していない。Web/PWA 版および E2E（`P2-1`）では利用されるため、デスクトップ版で非表示にする場合は `isTauriRuntime()` での表示制御を検討すること。
4. **E2E テストが依存する UI セレクタ / `aria-label` 契約**:
   - 既存: `Previous (←)` / `Next (→)`, `Thumbnail Overview (G)`, `Pen (D)`, `Spotlight (S)`, `Pen size -` / `Pen size +`, `data-testid="spotlight-size-down"` / `spotlight-size-up`, `data-testid="watch-pdf-button"`, `Edit Notes (E)` / `Save` / `Write Note (E)`, `data-testid="guard-toggle"`。
   - Phase 1–2 追加: `UiGuideOverlay`（10〜14 ピル）、`zoom-toggle-button` / `zoom-hud` / `slide-zoom-layer` / `slide-zoom-detail-canvas`、`laser-color-menu-button` / `laser-color-popover`、`qr-overlay-button` / `qr-overlay-modal`、`audience-progress-toggle` / `audience-progress-bar`、`chime-toggle` / `chime-controls`。

---

## 4. Phase 3（v0.4.0）着手チェックリスト

詳細は [**docs/ROADMAP.md**](./ROADMAP.md) のセクション 3（Phase 3）および **セクション 4（付録 A〜D）** を参照してください。新しい会話の開始時は以下から着手します。

1. **未確定事項（付録 A〜D）の合意・確定**:
   - **付録 A**: 単一 `.typ` ファイル原稿の埋め込み・抽出方式（案 1: `#pdf.attach` + `typst query` 補完 / 案 2: `#pdf.attach` のみ / 案 3: `typst query` 主軸）および `hotReloadPdfBytes` の `source`（`embedded` / `sidecar` / `manual`）同期ポリシー。
   - **付録 B**: `meta.pageLabels` によるサブスライド間ノート共有。
   - **付録 C**: 編集ノートのローカル `.md` 直接上書き保存（Marp/Slidev ソース保護ガード含む）。
   - **付録 D**: Tauri CLI 引数起動（`typst-presenter slides.typ` / `deck.pdf`）。
2. **`extractors.ts` と `hotReloadPdfBytes` のギャップ解消**:
   - `parseNotesAttachments` が JSON 添付の `targetSeconds` や添付 `.md` 先頭 YAML frontmatter（`duration` / `lastMinutes` / `qrUrl`）を保持できるよう拡張する。
   - `PresenterConsole.tsx` の `hotReloadPdfBytes` で再コンパイル後の `loadedMeta.extractedNotes` 追従ルールを実装する。
3. **Tauri v2 直接コンパイル ＆ Live Compile Guard（`src-tauri/src/commands/`）**:
   - `tauri-plugin-dialog` およびファイル監視（`notify` 等）を導入。
   - `check_typst_cli`, `pick_typst_file`, `start_typst_watch`, `stop_typst_watch`, `list_typst_fonts` を実装（`CREATE_NO_WINDOW` 適用、重い I/O・ビルドは `async fn` 化）。
   - コンパイル失敗時は直前の正常 PDF・現在ページ・描線を維持し、発表者画面のステータスバッジ／ドロワーのみに行番号とエラーを表示する。
4. **Windows 実機（`typst 0.15.1`）での結合検証**:
   - `.typ` 直接読込 → 編集中に意図的構文エラー → Live Compile Guard で聴衆維持 → 修正保存で即時復帰を確認。
