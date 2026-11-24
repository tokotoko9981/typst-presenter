# Typst Presenter 開発引き継ぎ・次期拡張メモ

本書は、`Personal/typst-presenter` から独立リポジトリ **`C:\Users\tokot\Desktop\program\typst-presenter`** へ作業環境を完全に移行するにあたり、現在の実装状態・テスト基盤・技術的制約・次フェーズの改修予定を整理した引き継ぎ資料です。

---

## 1. 現状サマリー（v0.2.0 / コミット `15cad1e` 時点）

- **リポジトリ URL**: <https://github.com/tokotoko9981/typst-presenter>
- **公開 URL（Web / PWA）**: <https://tokotoko9981.github.io/typst-presenter/>
- **ローカル作業フォルダ**: `C:\Users\tokot\Desktop\program\typst-presenter`
- **対応ランタイム**:
  - **Web ブラウザ / オフライン PWA**: Vite + React 19 + Tailwind CSS v4 + `vite-plugin-pwa`
  - **デスクトップアプリ（Tauri v2）**: `src-tauri/`（Rust `1.100.0` / `tauri` v2 / Visual Studio 2022 MSVC で実機起動・コンパイル確認済み）

### 直近の検証済みベースライン（コミット `15cad1e`）
- **型チェック (`npm run typecheck`)**: `tsc --noEmit` エラー 0 件
- **ユニットテスト (`npm test`)**: **11 ファイル / 97 件すべてパス**
- **本番ビルド (`npm run build`)**: `dist/` 生成成功
- **Playwright E2E (`npx playwright test --workers=1`)**: **7 ファイル（`*.spec.ts`） / 100 件すべてパス**
- **1280×800 / 1024×680 UI 監査**: JP/EN × Dark/Light 全条件でツールバー 2 段固定（`headerHeight: 77px`）・ステージ高さ一致（1280×800 時 `644px`）・ノート欄ヘッダ 1 行（`36px`）・横オーバーフローなし・`AudienceView` 純黒背景（`rgb(0, 0, 0)`）を確認済み

### 新しいワークスペースでの開発・テスト手順（Windows PowerShell 5.1）

```powershell
# 1. Web 開発サーバー起動 (http://localhost:5173)
npm run dev

# 2. Tauri v2 デスクトップアプリ起動 (Vite 5173 + ネイティブウィンドウ)
npm run tauri:dev

# 3. 型チェック & ユニットテスト
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
| [`src/index.css`](../src/index.css) | Tailwind v4 設定、`@custom-variant dark`、横スワイプ履歴戻り防止（`overscroll-behavior-x: none`） |
| [`src/features/presenter/PresenterConsole.tsx`](../src/features/presenter/PresenterConsole.tsx) | 発表者コンソール本体（2 段ツールバー、スライド制御、タイマー、ノート表示/編集、各種モーダル呼出） |
| [`src/features/presenter/UiGuideOverlay.tsx`](../src/features/presenter/UiGuideOverlay.tsx) | ボタン説明一括オーバーレイ（`I` キー / タグボタン、2 パス DOM 計測＋重複回避リード線） |
| [`src/features/presenter/HelpModal.tsx`](../src/features/presenter/HelpModal.tsx) | 使い方ガイド・ショートカット・ノート書式ヘルプ（`?` キー） |
| [`src/features/presenter/NotesImportModal.tsx`](../src/features/presenter/NotesImportModal.tsx) | 原稿ファイル取込（`.md`, Marp/Slidev, `.json`, `.pdfpc`）、埋め込みノート抽出、テンプレート取得 |
| [`src/features/presenter/RehearsalStatsModal.tsx`](../src/features/presenter/RehearsalStatsModal.tsx) | リハーサル滞在時間分析（`R` キー）、実測値の目標秒数反映、`.md` / `.csv` 出力 |
| [`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) | 聴衆用プロジェクター画面（テーマに関わらず背景純黒 `#000000` 固定、リロード復旧対応） |
| [`src/components/SlideStage.tsx`](../src/components/SlideStage.tsx) | メインスライド描画（PDF.js Canvas＋リンクオーバーレイ＋レーザー/ペン/スポットライト/カーテン） |
| [`src/components/ThumbnailCanvas.tsx`](../src/components/ThumbnailCanvas.tsx) | 次のスライド予習・一覧グリッド用サムネイル描画 |
| [`src/core/pdf/PdfEngine.ts`](../src/core/pdf/PdfEngine.ts) | `pdfjs-dist` ラッパー（CMap / 標準フォント / WASM ローカル完結、メモリ解放・ページレンダリング） |
| [`src/core/pdf/extractors.ts`](../src/core/pdf/extractors.ts) | PDF 添付（`#pdf.attach` / Presio JSON）および PDF 注釈からのノート抽出、アウトライン/ページラベル解決 |
| [`src/core/pdf/viewportMath.ts`](../src/core/pdf/viewportMath.ts) | `Full` / `Split L|R` / `Split T|B` クロップ領域計算・正規化リンク座標変換 |
| [`src/core/notes/NotesManager.ts`](../src/core/notes/NotesManager.ts) | Markdown・YAML frontmatter・Marp/Slidev コメント・`.pdfpc` v2 のパースとエクスポート |
| [`src/core/sync/SyncBridge.ts`](../src/core/sync/SyncBridge.ts) | `BroadcastChannel` 同期・ハートビート接続検出・スナップショット同期 |
| [`src/core/storage/StorageService.ts`](../src/core/storage/StorageService.ts) | IndexedDB（PDF 本体 / ノート / セッション復旧 / 直近 5 デッキ履歴）および設定永続化 |
| [`src/core/timer/TimerEngine.ts`](../src/core/timer/TimerEngine.ts) | 経過・カウントダウン・終了時刻モード・スライド別目標秒数・ペース判定 |
| [`src/core/timer/RehearsalTracker.ts`](../src/core/timer/RehearsalTracker.ts) | スライド別の実測滞在時間・訪問回数計測とレポート生成 |
| [`src/core/files/FileWatchService.ts`](../src/core/files/FileWatchService.ts) | File System Access API による PDF 変更検知ポーリング |
| [`src/core/platform/DesktopBridge.ts`](../src/core/platform/DesktopBridge.ts) | Tauri v2 IPC（`window.__TAURI_INTERNALS__`）とブラウザ Web API の環境抽象化 |
| [`src/core/theme/ThemeContext.tsx`](../src/core/theme/ThemeContext.tsx) | OS `prefers-color-scheme` 追従＋`localStorage` 永続化によるライト/ダーク切替 |
| [`src/core/i18n/translations.ts`](../src/core/i18n/translations.ts) | 日本語 / 英語（`ja` / `en`）辞書・ロケール判定 |

### デスクトップ・ビルド・サンプル（その他ルート配下）

- [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) / [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json): Tauri v2 コマンド（`list_monitors`, `open_audience_window`, `close_audience_window`, `set_audience_fullscreen`, `get_platform_info`）とウィンドウ設定（通常 `1440x900`・最小 `1024x680`）。
- [`scripts/run-tauri.mjs`](../scripts/run-tauri.mjs): Windows の既存ターミナルで `~/.cargo/bin` を `PATH` へ自動補完し、`dev` 起動前に開発ポート（`5173`）の重複を事前検知する Tauri ラッパー。
- [`examples/lt-typst-presenter.typ`](../examples/lt-typst-presenter.typ) ＆ [`examples/lt-typst-presenter-notes.md`](../examples/lt-typst-presenter-notes.md): 公式サンプル＆ 5 分間 LT デッキ（9 枚構成・300 秒台本）。[`public/sample-deck.pdf`](../public/sample-deck.pdf) / [`public/sample-notes.md`](../public/sample-notes.md) と同期する運用。
- `tests/`: ユニットテスト 11 本（`tests/unit/`）、E2E テスト 7 本（`tests/e2e/`）、Typst PDF フィクスチャ（`tests/fixtures/`）。

---

## 3. 開発・テスト上の技術的制約（重要）

1. **Windows PowerShell 5.1 のコマンド規約**:
   - コマンド連結に `&&` / `||` は使わず、`;` と `$LASTEXITCODE` を使用すること。
   - **Vitest**: カレントディレクトリのドライブレターが小文字（`c:\...`）だとファイル検出が失敗する事象があるため、大文字 `C:\Users\tokot\Desktop\program\typst-presenter` を起点に `npm test` を実行すること。
   - **Playwright**: `npm run test:e2e -- --workers=1` のように `npm run` 経由で `--` を渡すと PowerShell に引数区切りが消費されて `workers: 4` のまま並列起動する。2 画面同時レンダリング時の競合を避けるため、必ず **`npx playwright test --workers=1`** を直接実行すること。
2. **`AudienceView` の背景制約**:
   - ライトモード切替時でも会場プロジェクター投影時の暗部視認性を保つため、[`src/features/audience/AudienceView.tsx`](../src/features/audience/AudienceView.tsx) の背景は常時 `#000000`（純黒）を維持すること。
3. **E2E テストが依存する UI セレクタ / `aria-label` 契約**:
   UI 改修時に下記を変更すると既存 100 本の E2E が失敗するため注意すること。
   - ナビゲーション・一覧: `Previous (←)` / `Next (→)`（`Jump to slide` の `/slide|page|jump/i` と衝突しない文言を維持）、`Thumbnail Overview (G)`（ダイアログ本体と区別するため）。
   - ポインター/太さ: `Pen (D)`, `Spotlight (S)`, `Pen size -` / `Pen size +`, `data-testid="spotlight-size-down"` / `spotlight-size-up`。
   - 監視ボタン: `data-testid="watch-pdf-button"`（`aria-label` に監視中ファイル名を入れるとページジャンプ入力検索に干渉するため、`title` のみへ出す）。
   - ノート編集・保存: ノートヘッダ編集 `Edit Notes (E)`・保存 `Save`、空ノート時ボタン `Write Note (E)`（`strict mode` 重複回避のため文言を分離済み）。
4. **Tauri v2（`rustc 1.100+`）の `#[tauri::command]` ルール**:
   - クレートルート（[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs)）直下で `#[tauri::command] pub fn ...` とすると `E0255`（マクロ名重複再エクスポートエラー）になるため、コマンド関数は非公開 `fn`（またはサブモジュール `mod commands` 内）に保つこと（コミット `76f2c14` で対応済み）。

---

## 4. 次期作業予定・設計メモ ＆ 追加機能提案

> **Note**: 本セクションの各項目を優先順位・フェーズ構成（Phase 1〜4）へ整理した実装ロードマップ、および Phase 3 検討項目の詳細比較メモは [**docs/ROADMAP.md**](./ROADMAP.md) に統合しています。

新しい会話でタスクとして個別に着手予定の項目と、実装に向けた設計メモです。

### 予定タスク一覧

1. **Typst 特化機能（直接コンパイル・プレビュー状態での発表）**
   - **目的**: 現在は `typst watch` 出力 PDF を File System Access API でポーリングしているが、Tauri デスクトップ版で `.typ` ファイルを直接指定・コンパイル・ライブ監視できるようにする（ローカルフォントの自動利用を含む）。
   - **設計ポイント**:
     - `src-tauri/Cargo.toml` に `tauri-plugin-dialog` / ファイル監視（`notify` クレートまたは軽量ポーリング）または `std::process::Command` でローカル `typst compile` / `typst watch` を実行するコマンドを追加（Windows コンソールウィンドウ抑制フラグ `CREATE_NO_WINDOW` に注意）。
     - **プレビュー状態での安全発表（「Live Compile Guard」）**: コンパイルエラー発生時は直前に成功していた PDF と現在ページ・描線を維持し、発表者画面の小さなステータスバッジ／ドロワーにのみコンパイルエラーの行番号とメッセージを表示する（聴衆画面にはエラー画面を出さない）。
     - `typst fonts` 一覧取得によるローカルフォント確認補助、あるいは `inputs`（`--input presentation=true` 等）の任意指定サポート。

2. **スライド ＆ スクリプトの単一ファイル対応**
   - **現状資産**: すでに [`src/core/pdf/extractors.ts`](../src/core/pdf/extractors.ts) に `#pdf.attach`（Presio 形式・`.pdfpc` 添付 JSON）・PDF 注釈抽出が実装済み。
   - **拡張案**:
     - Typst 用ヘルパー（最小スニペットまたはテンプレート：`#pdfpc.speaker-note(...)` / `#pdf.attach("notes.md", ...)` / `#metadata(...) <speaker-note>` 等）を用意し、**`.typ` 1 ファイルを書くだけでスライドと目標時間付き原稿を単一ソース管理**できるようにする。
     - Tauri 経由で `.typ` を直接開く場合は、`typst query <file.typ> "<speaker-note>"`（または PDF 埋め込み添付）からページ番号・目標秒数・Markdown 原稿を自動同期させ、ブラウザ版向けに生成された単一 PDF でもシームレスにノートが出るように統一する。

3. **黒画面アイコンの改善（現在 `B` が `D` に見える問題）**
   - **原因箇所**: [`src/features/presenter/PresenterConsole.tsx`](../src/features/presenter/PresenterConsole.tsx) L117–L124 の `BlackoutScreenIcon`。現在 `d="M6.4 5h1.9a1.15 1.15 0 0 1 .4 2.22A1.2 1.2 0 0 1 8.4 9.5h-2V5Z"` で外枠の弧のみ描いており、中央の横棒（腰のくびれと水平線）がないため 14×14px サイズで `D` に見えている。
   - **改善案**:
     - **案 1**: 外枠とは明確に分けた上段・下段の 2 つの丸みと中央横棒（`M6 4.8h2c.8 0 1.3.45 1.3 1.15S8.8 7.1 8 7.1H6Zm0 2.3h2.2c.85 0 1.4.48 1.4 1.25S9.05 9.6 8.2 9.6H6Z` 相当）で正しい `B` に修正。
     - **案 2（視認性優先）**: 文字 `B`/`W` を使わず、黒画面＝「真っ黒なモニター枠＋対角斜線または暗い塗り＋電源オフ風ドット」、白画面＝「白塗りモニター＋外周ハロー線」など形状差だけで見分ける案も比較可能。

4. **オーバーレイ型ヘルプ（`UiGuideOverlay.tsx`）のレイアウト再設計**
   - **現状課題**: ボタン 39 個分の全吹き出し＋直交リード線を一画面へ同時展開しているため、情報密度が高く視覚的に混雑している。
   - **試作・比較すべき 3 パターン**:
     - **パターン A（セクション限定切替型）**: オーバーレイ表示中の下部バーに「すべて / 上部バー / 舞台・描画 / ノート欄 / タイマー」フィルタピルを置き、選択中グループの解説だけを大きく余白たっぷりで表示する。
     - **パターン B（番号ピン＋サマリー一覧カード型）**: 各ボタン上には小さな丸型連番バッジ（`1`〜`28`）のみを浮かべ、リード線を全廃。中央の空き領域（スライド表示部）に整理された 3 カラムの番号対応リストカードを出す。視線移動が少なく最も混雑しない。
     - **パターン C（機能グループ単位の集約コールアウト）**: 細かい個別ボタン（`5色` / `ペン太さ` / `前後ページ` など）を機能ブロック単位でまとめて 1 枚の解説チップ（約 12〜14 個）に減らし、ショートカットキーを小さく添える。

5. **発表チャイム・SE（効果音）機能**
   - **仕様案**:
     - 外部音声ファイルに依存しない **Web Audio API（サイン波＋倍音減衰の簡易ベル合成）** で完全オフライン動作を実現。
     - 学会形式チャイム連動：残り警告時間到達で **1 鈴**、終了時刻到達（`00:00`）で **2 鈴**、タイムアップ超過（例: +1 分等）や手動ベルボタンで **3 鈴** を鳴動。
     - **安全配慮**: ツールバーまたはタイマー欄に明示的なミュート／音量トグルを用意し、リハーサル時のみ／本番時は会場スピーカーへ漏れないようデフォルト OFF（または明示有効化）＋テスト鳴動ボタンを配置。

6. **サンプルスライド（`examples/lt-typst-presenter.typ`）の改修**
   - Typst 特化機能・単一ファイル対応・SE チャイム等の追加に合わせて内容をブラッシュアップし、コンパイル後に `public/sample-deck.pdf` と `public/sample-notes.md` へ反映・全ページ PNG 目視確認を行う。
   - 既存 `.typ` 内の微小な自動改行（例: Slide 5 左カラム `1.05fr` の「その場編\n集」「余裕と超\n過」）も組版調整対象として見直す。

---

### 追加提案アイデア（優先度・工数別）

| 優先度 | 提案機能 | 概要とメリット |
| --- | --- | --- |
| 高 | **プレゼンターリモコン / 標準ショートカット互換** | ロジクール等の無線プレゼンターが送出する `.`（黒画面トグル）、`b`、`PageUp/PageDown`、`Esc` をフルサポートし、機材持ち込みなしでも即座に使えるようにする。 |
| 高 | **スライド部分拡大・パン（Zoom `Z`）** | 発表中に細かい表・数式・コードを `Z`＋ドラッグまたはホイールで聴衆画面ごと拡大表示。技術発表や論文紹介で特に効果が高い。 |
| 中 | **編集ノートのローカル `.md` 直接上書き保存** | 発表者コンソール上で `E` キー修正した原稿を、ブラウザダウンロードではなく既存の側付き `.md` ファイル（File System Access API / Tauri FS）へ直接書き戻せるようにする。 |
| 中 | **Q&A 用 QR コード即時オーバーレイ** | デッキメタ情報または一時入力の配布資料/リポジトリ URL からローカル完結 SVG の QR コードを生成し、最後のスライドや質疑時に聴衆画面へ大きく投影。 |
| 低 | **聴衆画面の極薄プログレスバー（任意 ON/OFF）** | 聴衆ディスプレイ最下端 2px に現在進捗を示す単色ラインを任意表示（デフォルト OFF、学会発表や LT で進行感を共有したい用途向け）。 |
