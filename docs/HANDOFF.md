# Typst Presenter 開発引き継ぎ・Phase 4 着手ガイド

本書は、コンテキスト劣化を防ぎつつ別会話で **Phase 4（v0.4.x 〜 v0.5.0+）** を円滑に開始するため、現在の実装状態・検証済みベースライン・モジュール構成・技術的制約・Phase 4 着手チェックリストを整理した引き継ぎ資料です。

---

## 1. 現状サマリー（v0.4.0 / Phase 1〜3 完了時点）

- **リポジトリ URL**: <https://github.com/tokotoko9981/typst-presenter>
- **ローカル作業フォルダ**: `C:\Users\tokot\Desktop\program\typst-presenter`（ブランチ `main`、最新ローカルコミット `633ad92`・未プッシュ）
- **完了済みマイルストーン**:
  - **Phase 1（`f14dd60`）**: `BlackoutScreenIcon` / `WhiteoutScreenIcon` 刷新、リモコン互換ショートカット（`.` / `ArrowUp` / `ArrowDown` / `Home` / `End` / `Esc`）、聴衆画面全画面ピル非表示・カーソル自動隠蔽、`UiGuideOverlay.tsx` パターン C（12 ブロック集約）再設計、未使用 `zustand` 削除
  - **Tauri v2 Windows 実機修正（`b5c9617`）**: 聴衆ウィンドウ起動時の WebView2 デッドロック回避（`async fn` 化）、黒背景初期化、本体ウィンドウ終了時の聴衆自動破棄、`is_audience_fullscreen` 追加
  - **Phase 2（`2ee9502` ＋ `bedf729`）**: 学会形式チャイム SE（1/2/3 鈴、Web Audio API、デフォルト OFF）、スライド拡大・パン（`Z`＋ホイール＋ドラッグ、表示領域 1:1 ネイティブ DPR 詳細レイヤー＋HiDPI オーバーレイ）、レーザー色切替（赤/緑/青）、隣接ページ先読みキャッシュ（LRU 上限 4）、Q&A 用 QR コード即時オーバーレイ（`uqr@0.1.3`）、聴衆画面極薄 2px プログレスバー（デフォルト OFF）
  - **Phase 3（`8ca2ba5`）＋ 手動テスト用ファイル（`bc63488`）＋ 仕様調整（`633ad92`）**:
    - **付録 A（案 1 二段構え ＋ 由来管理ホットリロード）**: [`typst/presenter-notes.typ`](../typst/presenter-notes.typ)（`#speaker-note` / `#presenter-config` / `#enable-presenter-notes` で `#pdf.attach` JSON 自動埋め込み）＋ `typst query <pdfpc>` 補完抽出（[`src/core/typst/typstPdfpcParser.ts`](../src/core/typst/typstPdfpcParser.ts)）、`extractors.ts` の JSON `targetSeconds` / 添付 `.md` YAML frontmatter 保持、および `source: 'embedded' | 'sidecar' | 'manual'` による再コンパイル時自動追従（`mergeHotReloadNotesBundle`）
    - **付録 B（論理スライドノート共有 ＆ 方式 C タイマー継続）**: [`src/core/notes/logicalSlides.ts`](../src/core/notes/logicalSlides.ts) による `pageLabels` 重複ページのノート共有（`logical-slide-toggle` / 継承元バッジ）、[`RehearsalStatsModal.tsx`](../src/features/presenter/RehearsalStatsModal.tsx) の論理スライド合算表示、および `isSameLogicalSlide` による同一論理スライド内サブスライド移動時のスライドタイマー継続（別論理スライド移動または共有 OFF で `00:00` リセット）
    - **付録 C（ローカル `.md` 直接上書き保存）**: [`src/core/files/NotesFileSaver.ts`](../src/core/files/NotesFileSaver.ts) による File System Access API / Tauri FS 直接上書き（Marp / Slidev 原稿保護ガード付き）
    - **付録 D ＆ Tauri v2 直接コンパイル・Live Compile Guard**: `src-tauri/src/commands/`（`typst.rs`, `files.rs`, `window.rs`）による CLI 引数起動、`typst` 監視・一時出力ビルド、`CREATE_NO_WINDOW` 適用、構文エラー時の直前 PDF/ページ/描線維持＋ [`TypstCompileDrawer.tsx`](../src/features/presenter/components/TypstCompileDrawer.tsx) 診断表示、および Tauri `CloseRequested` Guard 連動
    - **終了時刻（`End Time`）UI 廃止（`633ad92`）**: `PresenterConsole.tsx` / `TimerEngine.ts` / `useChimeAlerts.ts` から壁時計ベースの終了時刻上書きを廃止し、タイマー設定を「発表時間 (分)」と「警告残り (分)」の 2 列に整理（外部 `.md` / `.pdfpc` の旧 `endTime` 記述はエラーにせず無視）
    - **独立した手動テスト用ファイル一式（`bc63488` / `633ad92`）**: [`examples/phase3-manual-test/`](../examples/phase3-manual-test/README.md) に単一 `.typ` / `<pdfpc>` / サブスライド `pageLabels` / 直接上書き `.md` / Marp 保護 `.md` を配置（アプリ本体へは未組み込み）
- **対応ランタイム**:
  - **Web ブラウザ / オフライン PWA**: Vite + React 19 + Tailwind CSS v4 + `vite-plugin-pwa`
  - **デスクトップアプリ（Tauri v2）**: `src-tauri/`（Rust `1.100.0` / `tauri` v2 / `tauri-plugin-dialog` / `notify`）
  - **ローカル Typst CLI**: `typst 0.15.1 (9dfd3a08)` 導入済み

### 直近の検証済みベースライン（コミット `633ad92` 時点）
- **型チェック (`npm run typecheck`)**: `tsc --noEmit` エラー 0 件
- **ユニットテスト (`npm test`)**: **15 ファイル / 126 件すべてパス**（`typst 0.15.1` 実コンパイル往復検証・`isSameLogicalSlide`・`computeTimerSnapshot` 含む）
- **Rust ユニットテスト (`cargo test --manifest-path src-tauri/Cargo.toml`)**: **3 件すべてパス**
- **本番ビルド (`npm run build`)**: `dist/` 生成成功
- **Playwright E2E (`npx playwright test --workers=1`)**: **10 ファイル（`*.spec.ts`） / 113 件すべてパス**
- **視覚検証**: 1280×800（JP Light 2 列タイマー UI・JP Dark・Tauri `TypstCompileDrawer`）および 1024×680（EN Light）で `headerHeight: 77px`・横オーバーフローなしを確認済み

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

### フロントエンド（`src/`）・Typst ヘルパー（`typst/`）

| パス | 主な役割 |
| --- | --- |
| [`typst/presenter-notes.typ`](../typst/presenter-notes.typ) | Typst 0.12–0.15+ 対応単一ファイルノート埋め込みヘルパー（`#speaker-note`, `#presenter-config`, `#enable-presenter-notes`） |
| [`src/App.tsx`](../src/App.tsx) | ハッシュルーター（`#/` 発表者画面、`#/audience` 聴衆画面）、`ThemeProvider`・`I18nProvider` 統合 |
| [`src/index.css`](../src/index.css) | Tailwind v4 設定、`@custom-variant dark`、横スワイプ履歴戻り防止 |
| [`src/features/presenter/PresenterConsole.tsx`](../src/features/presenter/PresenterConsole.tsx) | 発表者コンソール本体（2 段ツールバー、スライド制御、タイマー、ノート表示/編集、各種モーダル呼出） |
| [`src/features/presenter/components/CurtainIcons.tsx`](../src/features/presenter/components/CurtainIcons.tsx) | 黒画面・白画面アイコン（形状差別化デザイン） |
| [`src/features/presenter/components/QrOverlayModal.tsx`](../src/features/presenter/components/QrOverlayModal.tsx) | Q&A 用 QR コード投影モーダル |
| [`src/features/presenter/components/TypstCompileDrawer.tsx`](../src/features/presenter/components/TypstCompileDrawer.tsx) | Typst ライブコンパイル状態・コンパイルオプション・診断エラー・フォント一覧ドロワー |
| [`src/features/presenter/hooks/usePresenterShortcuts.ts`](../src/features/presenter/hooks/usePresenterShortcuts.ts) | 発表者コンソール・リモコン互換・ズーム等のキーボードショートカット管理フック |
| [`src/features/presenter/hooks/useChimeAlerts.ts`](../src/features/presenter/hooks/useChimeAlerts.ts) | 残り時間・終了・超過に応じたチャイム自動鳴動フック |
| [`src/features/presenter/hooks/useTypstLiveCompile.ts`](../src/features/presenter/hooks/useTypstLiveCompile.ts) | Tauri `.typ` 監視・Live Compile Guard・`<pdfpc>` クエリ統合・由来管理ホットリロード制御 |
| [`src/features/presenter/UiGuideOverlay.tsx`](../src/features/presenter/UiGuideOverlay.tsx) | ボタン説明一括オーバーレイ（パターン C：12 機能ブロック集約コールアウト） |
| [`src/features/presenter/HelpModal.tsx`](../src/features/presenter/HelpModal.tsx) | 使い方ガイド・ショートカット・ノート書式ヘルプ（`?` キー） |
| [`src/features/presenter/NotesImportModal.tsx`](../src/features/presenter/NotesImportModal.tsx) | 原稿ファイル取込（`.md`, Marp/Slidev, `.json`, `.pdfpc`）、埋め込みノート抽出 |
| [`src/features/presenter/RehearsalStatsModal.tsx`](../src/features/presenter/RehearsalStatsModal.tsx) | リハーサル滞在時間分析（`R` キー）、論理スライド合算切替、実測値の目標秒数反映、`.md` / `.csv` 出力 |
| [`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) | 聴衆用プロジェクター画面（背景 `#000000` 固定、全画面状態追従、QR 投影、極薄 2px 進捗バー） |
| [`src/components/SlideStage.tsx`](../src/components/SlideStage.tsx) | メインスライド描画（1x ベース＋表示領域 1:1 DPR ズーム詳細レイヤー＋HiDPI 注釈オーバーレイ＋リンク） |
| [`src/components/ThumbnailCanvas.tsx`](../src/components/ThumbnailCanvas.tsx) | 次のスライド予習・一覧グリッド用サムネイル描画 |
| [`src/core/audio/ChimeEngine.ts`](../src/core/audio/ChimeEngine.ts) | Web Audio API ベル合成エンジン・二重鳴動防止ラッチ |
| [`src/core/zoom/zoomMath.ts`](../src/core/zoom/zoomMath.ts) | カーソル中心拡大・パン・相対変換計算 |
| [`src/core/qr/qrSvg.ts`](../src/core/qr/qrSvg.ts) | `uqr` ベースのオフライン SVG QR コード生成 |
| [`src/core/pdf/PdfEngine.ts`](../src/core/pdf/PdfEngine.ts) | `pdfjs-dist` ラッパー（CMap / 標準フォント / WASM ローカル完結、隣接ページ LRU 先読み） |
| [`src/core/pdf/extractors.ts`](../src/core/pdf/extractors.ts) | PDF 添付（`#pdf.attach` / Presio JSON / 添付 `.md`）および PDF 注釈からのノート・設定抽出、アウトライン解決 |
| [`src/core/pdf/viewportMath.ts`](../src/core/pdf/viewportMath.ts) | クロップ領域計算・`zoomView` 用ネイティブ DPR オフセット計算・正規化リンク座標変換 |
| [`src/core/notes/NotesManager.ts`](../src/core/notes/NotesManager.ts) | Markdown・YAML frontmatter（`qrUrl` / `qrLabel` 対応）・Marp/Slidev・`.pdfpc` v2 の解析、出力、`mergeHotReloadNotesBundle` |
| [`src/core/notes/logicalSlides.ts`](../src/core/notes/logicalSlides.ts) | `pageLabels` による論理スライドグルーピング・ノート継承解決・`isSameLogicalSlide`（方式 C 判定） |
| [`src/core/typst/typstPdfpcParser.ts`](../src/core/typst/typstPdfpcParser.ts) | `typst query <pdfpc>` JSON 解析および `#pdf.attach` との二段マージ |
| [`src/core/typst/typstDiagnostics.ts`](../src/core/typst/typstDiagnostics.ts) | `typst compile --diagnostic-format short` のエラー・警告パーサー |
| [`src/core/sync/SyncBridge.ts`](../src/core/sync/SyncBridge.ts) | `BroadcastChannel` 同期・ハートビート接続検出・スナップショット同期 |
| [`src/core/storage/StorageService.ts`](../src/core/storage/StorageService.ts) | IndexedDB（PDF 本体 / ノート / セッション復旧 / 直近 5 デッキ履歴）および設定永続化 |
| [`src/core/timer/TimerEngine.ts`](../src/core/timer/TimerEngine.ts) | 経過・カウントダウン（発表時間ベース）・スライド別目標秒数・ペース判定 |
| [`src/core/timer/RehearsalTracker.ts`](../src/core/timer/RehearsalTracker.ts) | スライド別の実測滞在時間・訪問回数計測・論理スライド別集計・レポート生成 |
| [`src/core/files/FileWatchService.ts`](../src/core/files/FileWatchService.ts) | File System Access API による PDF 変更検知ポーリング |
| [`src/core/files/NotesFileSaver.ts`](../src/core/files/NotesFileSaver.ts) | ローカル `.md` 直接上書き保存（File System Access API / Tauri FS）と Marp/Slidev 保護判定 |
| [`src/core/platform/DesktopBridge.ts`](../src/core/platform/DesktopBridge.ts) | Tauri v2 IPC（`window.__TAURI_INTERNALS__`）とブラウザ Web API の環境抽象化 |
| [`src/core/theme/ThemeContext.tsx`](../src/core/theme/ThemeContext.tsx) | OS `prefers-color-scheme` 追従＋`localStorage` 永続化によるライト/ダーク切替 |
| [`src/core/i18n/translations.ts`](../src/core/i18n/translations.ts) | 日本語 / 英語（`ja` / `en`）辞書・ロケール判定 |

### デスクトップ・ビルド・サンプル

- [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) / `src-tauri/src/commands/`（`mod.rs`, `window.rs`, `files.rs`, `typst.rs`） / [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json): Tauri v2 コマンド群（ウィンドウ・モニター制御、`typst` CLI 監視・一時ビルド、`tauri-plugin-dialog`、ファイル読み書き、`CloseRequested` Guard）、通常 `1440x900`・最小 `1024x680`。
- [`scripts/run-tauri.mjs`](../scripts/run-tauri.mjs): `~/.cargo/bin` 自動補完・ポート `5173` 重複事前検知。
- [`examples/lt-typst-presenter.typ`](../examples/lt-typst-presenter.typ) / [`examples/lt-typst-presenter-notes.md`](../examples/lt-typst-presenter-notes.md): 公式サンプル（**Phase 4 で改修予定**）。
- [`examples/phase3-manual-test/`](../examples/phase3-manual-test/README.md): Phase 3 手動動作確認用の独立ファイル一式（アプリ本体非組み込み）。
- `tests/`: ユニットテスト 15 本（`tests/unit/`）、E2E テスト 10 本（`tests/e2e/`）、Typst PDF フィクスチャ（`tests/fixtures/`）。

---

## 3. 開発・テスト上の技術的制約（重要）

1. **Windows PowerShell 5.1 のコマンド規約**:
   - コマンド連結に `&&` / `||` は使わず、`;` と `$LASTEXITCODE` を使用すること。
   - **Vitest**: 大文字 `C:\Users\tokot\Desktop\program\typst-presenter` を起点に `npm test` を実行すること（小文字 `c:\...` だとファイル検出が失敗する場合がある）。
   - **Playwright**: 引数区切り消費を防ぐため `npm run` を通さず **`npx playwright test --workers=1`** を直接実行すること。
2. **Tauri v2 Windows 固有ルール（`src-tauri/src/`）**:
   - **WebView2 デッドロック回避**: `WebviewWindowBuilder::build()` を呼ぶ Tauri コマンドは必ず **`async fn`** にすること（同期 `fn` だと Windows WebView2 のメインスレッドと競合しフリーズする）。
   - **`rustc 1.100+` の `#[tauri::command]` ルール**: `lib.rs` 直下で `#[tauri::command] pub fn ...` とすると `E0255` になるため、非公開 `fn` または `commands` サブモジュール配下へ置くこと。
   - `std::process::Command` で `typst` / `where` 等を起動する際は、Windows コンソールウィンドウの点滅を防ぐため **`CREATE_NO_WINDOW`（`0x08000000`）** を付与すること。
3. **Typst 0.15.1 ＆ CLI 制約**:
   - Typst 0.15 では `type(x) == "string"` が常に `false` になるため、必ず `type(x) == str` を使用すること（`@preview/polylux:0.4.0` の `toolbox.pdfpc.speaker-note` も同不具合でパニックするため、`presenter-notes.typ` または直接 `#metadata(...) <pdfpc>` を使用する）。
   - `typst compile` で `--root` を指定しない場合、`.typ` ファイルの親ディレクトリ外への相対 `#import` は拒否される。単体配布用 `.typ` は同階層に `presenter-notes.typ` を置くか `--root` を指定すること。
4. **UI レイアウト・操作仕様の制約**:
   - ヘッダーは 2 段固定（`headerHeight: 77px`、`1024×680` で Row 2 が高密度）。ポップオーバー類は Row 2 の `overflow-y-hidden` で切られないよう `fixed` 配置すること。
   - [`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) の背景は常時 `#000000` を維持すること。
   - **Guard（`guard-toggle`）**: Web 版の `beforeunload` と Tauri 版の `CloseRequested` Guard（`set_close_guard` + `CloseGuardModal`）の双方に連動済み。
   - **ローカル `.md` 直接上書き**: ドラッグ＆ドロップではブラウザ仕様上書き込みハンドルを取得できないため、必ず「ノート取込 → ノートファイルを選択」経由で開いた場合のみエクスポートメニューに「元の .md へ直接上書き」を表示する。
   - **QR オーバーレイ**: 現在はツールバーボタン（`qr-overlay-button`）からのみ開閉でき、キーボードショートカット（例: `Q`）は未割り当て。
5. **E2E テストが依存する UI セレクタ / `aria-label` 契約**:
   - Phase 1 以前: `Previous (←)` / `Next (→)`, `Thumbnail Overview (G)`, `Pen (D)`, `Spotlight (S)`, `Pen size -` / `Pen size +`, `data-testid="spotlight-size-down"` / `spotlight-size-up`, `data-testid="watch-pdf-button"`, `Edit Notes (E)` / `Save` / `Write Note (E)`, `data-testid="guard-toggle"`。
   - Phase 2 追加: `UiGuideOverlay`, `zoom-toggle-button` / `zoom-hud` / `slide-zoom-layer` / `slide-zoom-detail-canvas`, `laser-color-menu-button` / `laser-color-popover`, `qr-overlay-button` / `qr-overlay-modal`, `audience-progress-toggle` / `audience-progress-bar`, `chime-toggle` / `chime-controls`。
   - Phase 3 追加: `open-typst-button`, `typst-status-badge`, `typst-compile-drawer`, `typst-diagnostic-item`, `logical-slide-toggle`, `logical-inherited-badge`, `rehearsal-logical-toggle`, `overwrite-notes-md-button`, `close-guard-modal`, `close-guard-force-exit`, `slide-target-seconds-input`。

---

## 4. Phase 4（v0.4.x 〜 v0.5.0+）着手チェックリスト

詳細は [**docs/ROADMAP.md**](./ROADMAP.md) のセクション 3（Phase 4）を参照してください。新しい会話の開始時はまず以下の方針・スコープ確認から着手します。

1. **公式サンプルスライド（`examples/lt-typst-presenter.typ`）の改修（HANDOFF #6）**:
   - Phase 1〜3 で実装した機能（単一 `.typ` 埋め込み、`typst` 直接ライブコンパイル、Live Compile Guard、サブスライド共有・方式 C タイマー、チャイム SE、Zoom、QR 等）を反映（終了時刻 UI 削除も反映）。
   - 既存 Slide 5 左カラム等の微小な自動改行を調整し、`public/sample-deck.pdf` / `public/sample-notes.md` へ同期したうえで全ページ PNG レンダリングによる視覚確認を実施。
2. **原稿文字数からの自動目標時間見積もり**:
   - 日本語（300〜350 字/分）・英語（130〜150 語/分）の読み上げ速度目安から各スライドの推奨目標秒数を算出し、ワンクリックで反映できる補助機能。
3. **発表者画面のペイン分割比率ドラッグ調整**:
   - 現行固定の `7:5` カラム比率（`lg:col-span-7` / `lg:col-span-5`）をドラッグハンドルで可変にし、`PresenterPrefs` に永続化。
4. **ローカル LAN スマホリモコン**:
   - Tauri 内蔵の軽量 WebSocket サーバー＋QR ペアリングにより、外部サーバーなしで同一 Wi-Fi 上のスマホからスライド送り・タイマー確認・手元ノート閲覧を可能にする。
5. **デスクトップ版コード署名・自動アップデート検討**:
   - [`README.md`](../README.md) に記載の未署名バイナリ警告対策（コード署名）および `tauri-plugin-updater` 導入の検討。
6. **任意の確認・整理事項**:
   - QR オーバーレイへのショートカット（`Q` キー等）追加の要否、`examples/phase3-manual-test/` のリリース前扱い（保持／統合／整理）、未プッシュローカルコミットの `git push` タイミング。

### 次スレッド開始用プロンプト例

```text
@[docs/HANDOFF.md] と @[docs/ROADMAP.md] を参照し、Phase 4 の対象スコープと優先順位の確認から開始してください。
```
