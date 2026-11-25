# Typst Presenter (`typst-presenter`)

Typst で作成した発表用 PDF スライド（Touying / Polylux / Presio など）を軸に、Marp・Slidev・LaTeX Beamer・PowerPoint / Keynote などの汎用 PDF スライドにも対応するローカル完結型プレゼンテーションコンソール（Web / PWA / Tauri v2 デスクトップ対応）です。

- **Repository**: <https://github.com/tokotoko9981/typst-presenter>
- **Web / PWA (GitHub Pages)**: <https://tokotoko9981.github.io/typst-presenter/>

---

## 主な機能

1. **デュアルウィンドウ同期 ＆ マルチディスプレイ対応（発表者コンソール `&` 聴衆用ディスプレイ）**
   - 発表者画面（`#/`）と聴衆用画面（`#/audience?session=<id>`）を同一オリジンの `BroadcastChannel` と `IndexedDB` でリアルタイム同期。
   - **Tauri v2 デスクトップアプリ**実行時はネイティブのマルチディスプレイ検出（`monitor-select` / `Displays` 更新）により、外部プロジェクターや非プライマリディスプレイへ聴衆ウィンドウを自動配置して全画面投影できます。
   - ブラウザ実行時は Web Window Management API（`getScreenDetails`）に対応し、未対応ブラウザでも標準ポップアップ（`window.open`）へ自動フォールバックします。ポップアップがブロックされた場合は URL コピー付きバナーおよび 1 画面モードで発表を継続できます。
   - 聴衆画面・発表者画面を `F5` リロードしても直近のスライド位置・クロップ設定・カーテン状態を自動復元し、オンボーディング画面の **Recent Decks** から直近開いた最大 5 デッキのワンクリック復元・削除が可能です。

2. **発表者用スクリプト（Speaker Notes）表示・編集・自動抽出・目標時間見積もり**
   - 発表者側にのみ Markdown 形式のカンペ（スクリプト）を整形表示（`react-markdown`）。
   - インライン編集（`E` キー）、文字サイズ調整（`A-` / `A+`）、スライドごとの目標時間（`目標 <秒>`）設定、および原稿文字数からの自動目標時間見積もり（日本語/英語速度プリセット対応）に対応し、`IndexedDB` に自動保存。
   - 外部ノートファイル（`.md` / `.markdown` / `.json` / `.pdfpc` v2）のインポート・エクスポート、およびローカル `.md` への直接上書き保存（Marp/Slidev 原稿保護付き）に対応。`Export .md` では `duration`・`lastMinutes`・`noteFontSize`・`qrUrl`・`qrLabel` の YAML frontmatter ラウンドトリップ出力にも対応しています。
   - **PDF 埋め込みノート抽出 ＆ 単一 `.typ` 対応**: [`typst/presenter-notes.typ`](./typst/presenter-notes.typ)（`#speaker-note` / `#presenter-config`）による `#pdf.attach` JSON 埋め込みや、PDF 注釈（`Text` / `FreeText`）、Tauri での `typst query <pdfpc>` 補完抽出に対応。
   - **Marp / Slidev ソース `.md` 直接読み込み**: Marp / Slidev 形式のフロントマターやディレクティブコメント（`paginate:`, `theme:`, `layout:`, `<!--fit-->` 等）を除外し、スピーカーノート用 HTML コメントや `<!-- note: ... -->`・`<!-- target: 秒 -->` を自動抽出します。

3. **プレゼンテーションタイマー ＆ 学会チャイム SE ＆ リハーサル分析（`R` キー）**
   - 現在時刻（Wall Clock）、経過時間（Elapsed: `Start` / `Pause` / `Reset`）、残り時間カウントダウン（`Duration` 分・`Warning` 分指定）を統合。
   - 残り時間警告（`Warning`）や時間超過時の赤色カウントアップ（`+MM:SS`）、スライドごとの目標時間に対するリアルタイムペース表示（`ahead` / `on-track` / `warning` / `overtime`）、および学会形式チャイム SE（1/2/3 鈴、Web Audio API、デフォルト OFF）を備えています。
   - **リハーサル時間分析モーダル（`Stats (R)` / `R` キー）**: タイマー稼働中の各スライド滞在時間・訪問回数・目標との差分を可視化し、論理スライド合算切替や **Apply Actual as Targets** による実測値の目標時間一括反映、`.md` / `.csv` 形式のレポート出力に対応しています。

4. **ポインター・スポットライト・ズーム・QR 投影・ステージ保護制御**
   - **レーザーポインター（`L`）**: 赤 / 緑 / 青の 3 色切替に対応し、解像度やアスペクト比が異なる画面間でも `[0..1]` 正規化座標でリアルタイム同期します。
   - **スポットライト（`S`）**: 注目箇所以外を暗転して強調表示（クリック固定、`[` / `]`・ホイールで半径調整）。
   - **スライド拡大・パン（`Z`）**: カーソル中心に最大 4 倍まで拡大・ドラッグパンでき、拡大領域を高解像度再描画して数式や図表を鮮明に表示します（`0` / `Esc` / ページ送りで解除）。
   - **フリーハンドペン（`D`）**: 5 色カラー切替、太さ調整（`+/-`）、`Undo`、全消去（`C`）、表示／非表示切替（`H`）。
   - **Q&A 用 QR コード投影（`Q`）**: オフライン生成の SVG QR コードを聴衆画面へ即時投影。
   - **ステージ保護制御**: Blackout（`B` / `.`）、Whiteout（`W`）、Freeze（`F`）、聴衆画面 2px プログレスバー（デフォルト OFF）、および誤リロード・誤終了を防ぐ **Guard**（ブラウザ `beforeunload` / Tauri `CloseRequested` 連動）。

5. **ライブコンパイル ＆ ホットリロード**
   - **Tauri デスクトップ版（`.typ を開く`）**: `typst` CLI で `.typ` ファイルを直接監視・一時ビルド（Live Compile Guard：構文エラー時は直前の正常 PDF・ページ・描線を維持したまま診断ドロワーへエラーを表示）。
   - **Web 版（`Watch PDF`）**: Chromium 系ブラウザの File System Access API でローカル PDF 更新を自動検知し、ページ位置やノートを保ったまま再読込します。

6. **ナビゲーション・分割スライド・ペイン比率調整・オフライン PWA**
   - スライド一覧サムネイルグリッド（`G` / `Tab`）、PDF 見出しアウトライン（`O`）、PDF 内部リンク／外部 URL クリック、数字キー + `Enter` 直接ジャンプ、発表者画面の左右ペイン分割比率ドラッグ調整に対応。
   - Touying / Polylux の横長分割 PDF 自動検出（`Full` / `Split L|R` / `Split T|B` / `Swap Halves`）や、同一 `pageLabels` のサブスライド間ノート共有・タイマー継続に対応。
   - **PWA ＆ 静的配布**: `vite-plugin-pwa` と同梱 `pdfjs/` アセットにより完全オフラインで動作し、GitHub Pages（[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)）へ自動デプロイされます。

---

## ブラウザ互換性 ＆ デスクトップ版起動時の注意

### ブラウザ機能対応表

| 機能 | Chromium 系（Chrome / Edge / Brave 等） | Firefox / Safari | Tauri v2 デスクトップ版 |
| --- | --- | --- | --- |
| 基本プレゼン機能（PDF 表示・ノート・タイマー・レーザー・スポットライト・ペン・PWA） | 対応 | 対応 | 対応 |
| `Watch PDF` ホットリロード（File System Access API） | 対応 | 非対応（手動ファイル再読込にフォールバック） | WebView 実装に準拠（将来ネイティブ監視へ拡張予定） |
| マルチディスプレイ自動配置 | 対応（Window Management API `getScreenDetails`） | 標準ポップアップ（`window.open`）へ自動フォールバック | ネイティブ OS API で自動配置・全画面制御 |

### 未署名デスクトップバイナリの起動について（Windows / macOS）

GitHub Releases から配布される Tauri v2 デスクトップバイナリは現時点でコード署名（EV 証明書 / Apple Developer ID 公証）を行っていません。初回起動時に OS の保護機能が警告を表示する場合があります。

- **Windows（Microsoft Defender SmartScreen）**: 「Windows によって PC が保護されました」と表示された場合は、**「詳細情報」** → **「実行」** を選択してください。
- **macOS（Gatekeeper）**: 「開発元を検証できないため開けません」と表示された場合は、アプリを右クリック（または Control + クリック）して **「開く」** を選択するか、システム設定の **プライバシーとセキュリティ** から「このまま開く」を許可してください（必要に応じて `xattr -cr "/Applications/Typst Presenter.app"` を実行）。

---

## 起動・ビルド・テスト方法

### Web / PWA 開発 ＆ テスト

```bash
# 依存インストール（pdfjs-dist アセットを public/pdfjs/ へ自動コピー）
npm ci

# 開発サーバーの起動 (http://localhost:5173)
npm run dev

# 型チェック & 本番ビルド (dist/ 生成)
npm run typecheck
npm run build

# ユニットテストの実行 (Vitest)
npm test

# Playwright E2E テストの実行
npm run test:e2e

# PWA & Tauri 用アイコンの生成 (public/icon.svg -> PNG / ICO)
npm run icons:generate
```

### Tauri v2 デスクトップアプリ（開発 ＆ ビルド）

デスクトップバイナリのローカル開発・ビルドには Rust ツールチェイン（`rustc` / `cargo`）および各 OS のネイティブ依存が必要です。詳細な前提条件・`src-tauri/` 構成・GitHub Actions（[`.github/workflows/release-desktop.yml`](./.github/workflows/release-desktop.yml)）による `v*` タグでのクロスプラットフォーム自動リリース手順は [**docs/DESKTOP_RELEASE.md**](./docs/DESKTOP_RELEASE.md) を参照してください。

```bash
# Tauri デスクトップアプリのローカル開発起動
npm run tauri:dev

# Tauri デスクトップアプリのローカルビルド
npm run tauri:build
```

---

## サンプル資料（`examples/`）

- [`examples/lt-typst-presenter.typ`](./examples/lt-typst-presenter.typ) / [`examples/lt-typst-presenter.pdf`](./examples/lt-typst-presenter.pdf) / [`examples/lt-typst-presenter-notes.md`](./examples/lt-typst-presenter-notes.md): Typst Presenter 紹介用の 9 枚構成・5 分間 LT スライド ＆ 発表者ノート（アプリ内 **サンプル読込 / Load Sample Deck** で [`public/sample-deck.pdf`](./public/sample-deck.pdf) ＆ [`public/sample-notes.md`](./public/sample-notes.md) として読込可能）。

- **Phase 1 (v0.2.1)**: 黒画面アイコン改善、プレゼンターリモコン互換ショートカット、聴衆画面フルスクリーン時 UI 非表示、`UiGuideOverlay` 再設計、基盤整理
- **Phase 2 (v0.3.0)**: 発表チャイム SE（Web Audio API）、スライド部分拡大・パン（Zoom `Z`）、レーザー色切替、隣接ページ先読み、Q&A 用 QR コードオーバーレイ、極薄プログレスバー
- **Phase 3 (v0.4.0)**: Tauri v2 デスクトップ `.typ` 直接コンパイル ＆ Live Compile Guard、単一 `.typ` ファイル原稿対応
- **Phase 4 (v0.4.x〜v0.5.0+)**: 公式サンプル刷新、原稿文字数からの目標時間見積もり、ペイン分割比率調整、ローカル LAN スマホリモコン等

---

## License

本プロジェクトは **MIT License** のもとで公開されています。詳細は [`LICENSE`](./LICENSE) を参照してください。
