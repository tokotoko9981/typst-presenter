# Typst Presenter デスクトップアプリ（Tauri v2）ビルド ＆ リリースガイド

`typst-presenter`（アプリ表示名: **Typst Presenter**）は、Web / PWA 版に加えて **Tauri v2** によるネイティブデスクトップアプリ構成を備えています。
デスクトップ版では、OS ネイティブのマルチディスプレイ検出・聴衆ウィンドウ（`audience`）の物理モニタ自動配置・フルスクリーン制御が利用できます。

> **注記（ローカルビルド環境について）**
> 本リポジトリのアプリ開発は Node.js 22 環境だけでも完結しますが、Tauri デスクトップバイナリのローカルコンパイルには **Rust ツールチェイン（`rustc` / `cargo`）** と各 OS のネイティブビルド依存が必要です。
> ローカルマシンに Rust が未導入の場合は、GitHub Actions（[`.github/workflows/release-desktop.yml`](../.github/workflows/release-desktop.yml)）でクロスプラットフォームのビルドとリリース配布を行えます。

---

## 1. 各 OS のビルド前提条件

共通前提として **Node.js 22 以上** と **Rust stable（`rustup` / `rustc` / `cargo`）** が必要です。

### Windows

1. **Microsoft Visual Studio C++ Build Tools**
   - Visual Studio Installer で「C++ によるデスクトップ開発（Desktop development with C++）」ワークロード（MSVC および Windows SDK）を導入します。
2. **Microsoft Edge WebView2**
   - Windows 10 / 11 の標準環境では通常インストール済みです。未導入環境では Microsoft 公式の WebView2 Evergreen Bootstrapper を導入してください。
3. **Rust (`rustup`)**
   - `rustup-init.exe` 等から `stable` ツールチェイン（`x86_64-pc-windows-msvc`）を導入します。

### macOS

1. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```
2. **Rust (`rustup`)**
   - Apple Silicon / Intel 両対応でビルドする場合は、クロスコンパイル用ターゲットを追加します：
   ```bash
   rustup target add aarch64-apple-darwin
   rustup target add x86_64-apple-darwin
   ```

### Linux（Ubuntu 22.04 基準）

`libwebkit2gtk-4.1-dev` をはじめとするシステム依存パッケージを導入します（[`.github/workflows/release-desktop.yml`](../.github/workflows/release-desktop.yml) と同一構成）：

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev
```

---

## 2. ローカル開発 ＆ ローカルビルド手順

Rust / OS 依存が揃った環境でリポジトリルートから実行します。

```bash
# 1. フロントエンド依存のインストール（pdfjs-dist アセットコピーを含む）
npm ci

# 2. （アイコン SVG を変更した場合）PWA & Tauri アイコンの再生成
npm run icons:generate

# 3. Tauri デスクトップアプリをホットリロード付きで起動
npm run tauri:dev

# 4. 本番用デスクトップインストーラー / バイナリをビルド
npm run tauri:build
```

- `npm run tauri:dev` は [`scripts/run-tauri.mjs`](../scripts/run-tauri.mjs) 経由で `npx --yes @tauri-apps/cli@2 dev` を呼び出し、Windows の既存ターミナルで未反映になりがちな `~/.cargo/bin` を自動補完するとともに、`src-tauri/tauri.conf.json` の開発ポート（`5173`）が空き状態かを事前チェックしてから `beforeDevCommand`（`npm run dev`, `http://localhost:5173`）と Tauri ウィンドウを起動します。
- `npm run tauri:build` も同じく [`scripts/run-tauri.mjs`](../scripts/run-tauri.mjs) 経由で `npx --yes @tauri-apps/cli@2 build` を実行し、`beforeBuildCommand`（`npm run build`）で `dist/` を生成したあと、OS ごとのインストーラー・バンドルを `src-tauri/target/release/bundle/` 配下に出力します。
- フロントエンド（[`src/core/platform/DesktopBridge.ts`](../src/core/platform/DesktopBridge.ts)）は `@tauri-apps/api` パッケージへ静的依存せず `window.__TAURI_INTERNALS__?.invoke` 経由で Tauri コマンドを呼び出し、ブラウザ実行時は Web Window Management API（`getScreenDetails`）や `window.open()` へ自動フォールバックします。

---

## 3. `src-tauri/` 構成ファイルの概要

| ファイル | 役割 |
| --- | --- |
| [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) | クレート名 `typst-presenter`（`v0.2.0`, MIT）、ライブラリ `typst_presenter_lib`（`staticlib`, `cdylib`, `rlib`）、`tauri` v2・`serde`・`serde_json`・`tauri-build` v2 の依存定義 |
| [`src-tauri/build.rs`](../src-tauri/build.rs) | `tauri_build::build()` によるビルド時スキーマ・リソース生成 |
| [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) | Tauri v2 設定。`productName: "Typst Presenter"`, `identifier: "io.github.tokotoko9981.typst-presenter"`, メインウィンドウ `main`（`1440x900`・最小 `1024x680`）、`frontendDist: "../dist"`、アイコン 5 ファイル構成 |
| [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) | `main` および `audience` ウィンドウに対する最小権限セット（`core:default`, `core:window:default`, `allow-set-fullscreen`, `allow-set-position`, `allow-set-size`, `allow-set-focus`, `allow-close`, `core:webview:allow-create-webview-window`） |
| [`src-tauri/src/main.rs`](../src-tauri/src/main.rs) | エントリーポイント。Release ビルド時の Windows コンソール非表示設定と `typst_presenter_lib::run()` 呼び出し |
| [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) | Rust バックエンドコマンドの実装・登録 |
| `src-tauri/icons/*` | `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`（`npm run icons:generate` で生成） |

### `src-tauri/src/lib.rs` の登録コマンド

- `list_monitors`: `app.available_monitors()` と `app.primary_monitor()` を参照し、各ディスプレイの `index`, `name`, `x`, `y`, `width`, `height`, `scaleFactor`, `isPrimary` を返却します。
- `open_audience_window`: セッション ID を含む `index.html#/audience?session=<id>` で `audience` ウィンドウを作成（既存時は再利用）します。`monitor_index` が省略された場合は非プライマリディスプレイ（存在しない場合はプライマリ）を自動選択し、物理座標・サイズを合わせたうえで `fullscreen` 設定とフォーカスを行います。
- `close_audience_window`: 開いている `audience` ウィンドウを閉じます。
- `set_audience_fullscreen`: `audience` ウィンドウのフルスクリーン状態を動的に切り替えます。
- `get_platform_info`: `runtime`（`"tauri"`）、`os`、`arch`、`version` を返却します。

---

## 4. GitHub Actions によるリリース自動化

### デスクトップ版クロスプラットフォームリリース（`.github/workflows/release-desktop.yml`）

[`.github/workflows/release-desktop.yml`](../.github/workflows/release-desktop.yml) は `v*` タグの push（または Actions タブからの `workflow_dispatch`）で起動し、以下の 4 ターゲットを並列ビルドして GitHub Release にアップロードします：

- **Windows**: `windows-latest`
- **Linux**: `ubuntu-22.04`（`libwebkit2gtk-4.1-dev` 等を自動インストール）
- **macOS (Apple Silicon)**: `macos-latest` (`--target aarch64-apple-darwin`)
- **macOS (Intel)**: `macos-latest` (`--target x86_64-apple-darwin`)

ワークフロー内では `npx --yes @tauri-apps/cli@2 icon public/icon-512.png` を実行して各 OS 向けアイコン（macOS `.icns` 等を含む）を生成し、`tauri-apps/tauri-action@v0`（`projectPath: '.'`）で `Typst Presenter v__VERSION__` のリリースを作成・添付します。

#### `releaseDraft: true` による安全な初回検証フロー

初回 CI 検証時の誤公開を防ぐため、ワークフローのデフォルトは **`releaseDraft: true`** に設定されています。

1. [`package.json`](../package.json)・[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json)・[`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) の `version`（例: `0.2.0`）が公開したいバージョンと一致していることを確認し、必要なら更新してコミットします。
2. 対応する `v*` タグを作成してプッシュします（または Actions タブから `workflow_dispatch` を手動実行します）：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. GitHub の **Actions** タブで `Release Desktop App`（`publish-tauri`）の 4 ターゲットすべてが成功したことを確認します。
4. **Releases** ページに作成された **Draft（下書き）リリース** を開き、Windows / macOS（arm64 & x64）/ Linux のインストーラーが揃っていること・実機で起動できることを確認したうえで、**Publish release** をクリックして公開します。
5. 自動公開へ切り替えたい場合は、初回検証の完了後に `.github/workflows/release-desktop.yml` の `releaseDraft: true` を `releaseDraft: false` へ変更してください。

---

## 5. GitHub Pages への Web / PWA 自動デプロイ（`.github/workflows/deploy.yml`）

Web ブラウザ版およびオフラインインストール可能な PWA 版は、[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) によって GitHub Pages（<https://tokotoko9981.github.io/typst-presenter/>）へ静的ホスティングされます。

- **トリガー**: `main` ブランチへの push、および手動実行（`workflow_dispatch`）。
- **ビルド処理**: リポジトリルートで `npm ci` → `npm run build`（`vite.config.ts` の `base: './'` と `vite-plugin-pwa` により、`pdfjs/` アセットとサンプルデッキを含む自己完結型の `dist/` を生成）を実行し、`actions/upload-pages-artifact`（`path: dist`）と `actions/deploy-pages` で `github-pages` 環境へ公開します。
- **初回設定**: GitHub リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定しておく必要があります。

---

## 6. 継続的インテグレーション（`.github/workflows/ci.yml`）

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) は `main` ブランチへの push および Pull Request ごとに `ubuntu-latest`（Node.js 22）上で `npm ci` → `npm run typecheck` → `npm test` → `npm run build` を自動実行し、型整合性・ユニットテスト・ビルドの健全性を検証します。
