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

2. **発表者用スクリプト（Speaker Notes）表示・編集・自動抽出**
   - 発表者側にのみ Markdown 形式のカンペ（スクリプト）を整形表示（`react-markdown`）。
   - インライン編集（`E` キー）、文字サイズ調整（`A-` / `A+`）、スライドごとの目標時間（`目標 <秒>`）設定に対応し、`IndexedDB` に自動保存。
   - 外部ノートファイル（`.md` / `.markdown` / `.json` / `.pdfpc` v2）のインポート・エクスポートに対応。`Export .md` では `duration`・`lastMinutes`・`noteFontSize`・`endTime` の YAML frontmatter ラウンドトリップ出力にも対応しています。
   - **PDF 埋め込みノート抽出**: Typst の `#pdf.attach`（Presio 形式等）や PDF 注釈（`Text` および `FreeText`、リッチテキスト含む）からの自動取り込みに対応。
   - **Marp / Slidev ソース `.md` 直接読み込み**: Marp / Slidev 形式のフロントマターやディレクティブコメント（`paginate:`, `theme:`, `layout:`, `<!--fit-->` 等）を除外し、スピーカーノート用 HTML コメントや `<!-- note: ... -->`・`<!-- target: 秒 -->` を自動抽出します（通常の `---` 区切りノートとも競合しません）。

3. **プレゼンテーションタイマー ＆ リハーサル時間分析（`R` キー）**
   - 現在時刻（Wall Clock）、経過時間（Elapsed: `Start` / `Pause` / `Reset`）、残り時間カウントダウン（`Duration` 分指定または終了時刻 `HH:MM` 指定）を統合。
   - 残り時間警告（`Warning`）や時間超過時の赤色カウントアップ（`+MM:SS`）、スライドごとの目標時間に対するリアルタイムペース表示（`ahead` / `on-track` / `warning` / `overtime`）を備えています。
   - **リハーサル時間分析モーダル（`Stats (R)` / `R` キー）**: タイマー稼働中の各スライド滞在時間・訪問回数・目標との差分を可視化し、行クリックで該当スライドへジャンプできます。**Apply Actual as Targets** による実測値の目標時間一括反映や、`.md` / `.csv` 形式でのレポートダウンロードに対応しています。

4. **ポインター・スポットライト・拡張アノテーション・ステージ保護制御**
   - **レーザーポインター（`L`）**: 解像度やアスペクト比が異なる画面間でも `[0..1]` 正規化座標でリアルタイム同期し、視認性の高い残像トレイル（Laser trail）を描画します。
   - **スポットライト（`S`）**: 注目箇所以外を暗転して強調表示します。スライド上のクリックでスポット位置を固定／解除（click-to-pin）でき、マウスホイール・ツールバーの `Spot -` / `Spot +` ボタン・`[` / `]` キーでスポット半径を自在に調整できます。
   - **フリーハンドペン（`D`）**: 5 色カラー切替（Red `#ef4444` / Blue `#3b82f6` / Yellow `#facc15` / Green `#22c55e` / White `#ffffff`）、太さ調整（`+/-`）、`Undo`、全消去（`C`）、さらに描画を残したまま表示／非表示を切り替える **Ink (`H`)** に対応。
   - **ステージ保護制御**: Blackout（`B`：黒画面）、Whiteout（`W`：白画面）、Freeze（`F`：聴衆画面固定）、および発表中の誤リロード・誤タブ閉じを防ぐ **Guard**（`beforeunload` 保護トグル）。

5. **File System Access API による `Watch PDF` ホットリロード**
   - 対応ブラウザではツールバーの **Watch PDF** からローカル PDF ファイルを監視（デフォルト 1500ms ポーリング）できます。
   - `typst watch` や `marp -w` による再コンパイルを自動検知し、書き込み途中の 0 バイト状態をスキップしたうえで、現在のページ位置（新しいページ数でクランプ）・既存ノート・タイマー・ペン描線を保持したままシームレスに再読込して聴衆画面へ反映します。

6. **ナビゲーション・分割スライド対応・オフライン PWA**
   - スライド一覧サムネイルグリッド（`G` / `Tab`）、PDF 見出しアウトラインドロワー（`O`）、スライド内の PDF 内部リンク・外部 URL リンクのクリック遷移、数字キー + `Enter` 直接ジャンプに対応。
   - Touying の `show-notes-on-second-screen` などで生成された横長（アスペクト比 `> 2.4`）や縦分割の PDF を自動検出し、`Full` / `Split L|R` / `Split T|B` および `Swap Halves` に対応。
   - **PWA ＆ 静的配布**: `vite-plugin-pwa` と同梱 `pdfjs/` アセット（CJK CMap / 標準フォント / WASM / ICC）により完全オフラインで動作し、GitHub Pages（[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)）へ自動デプロイされます。

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

- [`examples/sample-deck.typ`](./examples/sample-deck.typ) / [`public/sample-deck.pdf`](./public/sample-deck.pdf): アプリ内 **Load Sample Deck** で読み込まれるサンプルスライド。
- [`examples/lt-typst-presenter.typ`](./examples/lt-typst-presenter.typ) / [`examples/lt-typst-presenter.pdf`](./examples/lt-typst-presenter.pdf) / [`examples/lt-typst-presenter-notes.md`](./examples/lt-typst-presenter-notes.md): Typst Presenter 紹介用の 5 分間 LT スライド ＆ 発表者ノート。

---

## Roadmap

- **Tauri v2 デスクトップ `.typ` 直接コンパイル（ローカルフォント対応）**: システムにインストール済みの `typst` CLI または Tauri Sidecar 経由で `.typ` ソースファイルを直接読み込み・監視コンパイルし、ローカルフォントを活用したシームレスなリアルタイムプレビュー＆発表ワークフローを提供する予定です。

---

## License

本プロジェクトは **MIT License** のもとで公開されています。詳細は [`LICENSE`](./LICENSE) を参照してください。
