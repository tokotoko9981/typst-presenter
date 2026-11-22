---
duration: 6
lastMinutes: 1
---

<!-- slide: 1 -->
<!-- target: 45 -->
### 導入 / Opening

> ⏱ **目安 / Target:** 45s

- こんにちは。本日は Typst 発表スライド専用のローカル Web アプリ **`typst-presenter`** をご紹介します。
- これまで Chrome の PDF プレゼンテーションモードでは「発表者用スクリプト」「タイマー」「2画面制御」が不足していました。
- このサンプルデッキ自体も `typst 0.15.1` でコンパイルされており、ネットワーク送信ゼロ・ローカル完結で動作します。

<!-- slide: 2 -->
<!-- target: 45 -->
### アジェンダ / Agenda

> ⏱ **目安 / Target:** 45s

- 本日の流れは **アーキテクチャ → 数式・座標正規化 → 実装ハイライト → まとめ** の4部構成です。
- **操作ヒント**: `O` キーを押すと左側の PDF アウトライン（見出しツリー）が開き、任意のセクションへ即座に移動できます。
- スライド上の目次項目もクリック可能な PDF 内部リンクになっています。

<!-- slide: 3 -->
<!-- target: 75 -->
### デュアルウィンドウ同期 / Dual-Window Architecture

> ⏱ **目安 / Target:** 75s

- 右上の **Launch Audience Window** から聴衆用ウィンドウ（`#/audience`）を開けます。
- 同一オリジンの `BroadcastChannel` と IndexedDB（PDF バイト列を `SHA-256` でキャッシュ）により、聴衆側で `F5` リロードしても現在のページや状態が自動復元されます。
- スライド下部の **Typst Official Documentation**（外部リンク）や **まとめスライドへ移動**（内部リンク）のクリック動作も確認できます。

<!-- slide: 4 -->
<!-- target: 75 -->
### 座標正規化と HiDPI 制御 / Math & Coordinate Normalization

> ⏱ **目安 / Target:** 75s

- 発表者画面とプロジェクターは解像度やアスペクト比が異なるため、レーザー（`L`）やペン（`D`）の座標はスライド矩形基準の `[0, 1]` に正規化して送信します。
- また、`pdfjs-dist` の高解像度描画では `min(dpr, 2.5)` と長辺 `4096px` 上限クランプを入れ、4K 環境での GPU メモリ枯渇を防いでいます。

<!-- slide: 5 -->
<!-- target: 60 -->
### 実装ハイライト / Implementation Highlights

> ⏱ **目安 / Target:** 60s

- 左側は Typst 側の設定例です。`#set page(numbering: "1 / 1")` を指定すると PDF の `PageLabels` が自動生成され、`#pdf.attach` を使うと JSON ノートを PDF 内部に埋め込めます。
- 右側は `PdfEngine` の描画契約です。`AbortSignal` と `RenderTask.cancel()` により、矢印キー連打時のレースコンディションを防止します。

<!-- slide: 6 -->
<!-- target: 60 -->
### まとめ・Q&A / Summary & Q&A

> ⏱ **目安 / Target:** 60s

- **Drop & Present**: お手持ちの Typst PDF をドラッグ＆ドロップするだけで即座に発表を開始できます。
- **実演おすすめ操作**: `B`（Blackout）、`W`（Whiteout）、`F`（Freeze）、`G`（一覧グリッド）、`E`（このノートのインライン編集）をぜひお試しください。
- ご清聴ありがとうございました。ご質問があればどうぞ！
