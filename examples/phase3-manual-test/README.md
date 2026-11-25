# Phase 3 手動テスト用ファイル一式

Phase 3（v0.4.0）の各機能を Web/PWA および Tauri デスクトップアプリで手動確認するためのテスト用ファイルです。アプリ本体の機能や既存サンプルには組み込んでいません。

## ファイル一覧

| ファイル | 用途 |
| --- | --- |
| [presenter-notes.typ](presenter-notes.typ) | `typst/presenter-notes.typ` のローカルコピー（`--root` なしで単体コンパイルするため配置） |
| [01-single-file-live.typ](01-single-file-live.typ) / [01-single-file-live.pdf](01-single-file-live.pdf) | 単一ファイル埋め込みノート（`#pdf.attach`）、Live Compile Guard、Provenance Hot-Reload、`--input`、QR、Close Guard テスト |
| [02-pdfpc-query-fallback.typ](02-pdfpc-query-fallback.typ) | `#pdf.attach` なしの `<pdfpc>` メタデータ `typst query` フォールバックテスト |
| [03-subslides-pagelabels.typ](03-subslides-pagelabels.typ) / [03-subslides-pagelabels.pdf](03-subslides-pagelabels.pdf) | 同一 `pageLabels`（`1, 2, 2, 2, 3`）でのサブスライドノート共有 & Rehearsal Stats 論理スライド集計テスト |
| [04-notes-direct-save.md](04-notes-direct-save.md) | 純粋サイドカー Markdown の直接上書き保存テスト |
| [05-marp-protected.md](05-marp-protected.md) | Marp スライド原稿の上書き保護ガードテスト |

## 確認チェックリスト

1. **Web/PWA 単一 PDF 読み込み（Appendix A）**
   - `01-single-file-live.pdf` をドロップまたは開く。
   - ノート 4 ページ分、全体時間 5:00、残り 1 分警告、終了時刻 `15:00`、フォントサイズ 18px、QR（`Q` キー）が自動復元されることを確認。

2. **Tauri `.typ` 直接コンパイル & Live Compile Guard & Provenance Hot-Reload（Appendix A / D）**
   - `npm run tauri:dev` で起動し、`01-single-file-live.typ` を開く。
   - Slide 2 のノートを Presenter UI で編集（`manual` 化）したあと、`.typ` 側の Slide 3 の `#speaker-note` を編集して保存する。
   - Slide 2 の手動編集は保護され、Slide 3 だけ自動更新されることを確認。
   - Slide 3 にある `// #broken-syntax-for-live-guard(` のコメントを外して保存し、直前の正常な PDF が保持されたまま診断エラー（行・列番号付き）が表示されること、コメントを戻して保存すると即時復帰することを確認。
   - Typst Compile Drawer の `--input` に `mode=rehearsal` を指定して再コンパイルし、Slide 1 右上のバッジが `mode: rehearsal` に変わることを確認。

3. **Tauri `<pdfpc>` クエリフォールバック（Appendix A Option 1）**
   - Tauri で `02-pdfpc-query-fallback.typ` を直接開く。
   - `#pdf.attach` なしでも `typst query` 経由で 3 ページ分のノート・目標時間（25s / 40s）・Duration(4m)・EndTime(`16:30`) が補完されることを確認。

4. **サブスライド共有 & 論理スライド集計（Appendix B）**
   - `03-subslides-pagelabels.pdf`（または `.typ`）を開く。
   - 物理 2〜4 ページ目で同じノート（`target: 60`）が共有表示され、バッジが `2 (1/3)` → `2 (2/3)` → `2 (3/3)` になることを確認。
   - ページ送りしながらリハーサル計測後、Rehearsal Stats モーダルで「論理スライド別」トグルを切り替え、論理スライド `2` の滞在時間が合算されることを確認。

5. **ローカル `.md` 直接上書き & Marp 保護（Appendix C）**
   - `01-single-file-live.pdf` を開いた状態で `04-notes-direct-save.md` をリンク読込し、ノート編集後に「Linked .md へ直接上書き保存」が動作することを確認。
   - 次に `05-marp-protected.md` を読み込み、ノート自体は取り込まれる一方、直接上書き保存は Marp/Slidev 保護によりブロックされることを確認。

6. **CLI 引数起動 & Close Guard（Appendix D）**
   - ビルド済みバイナリまたは `cargo run --manifest-path src-tauri/Cargo.toml -- examples/phase3-manual-test/01-single-file-live.typ` で起動時に自動読み込みされることを確認。
   - タイマー再生中にウィンドウを閉じようとし、Close Guard 確認ダイアログが出ることを確認。
