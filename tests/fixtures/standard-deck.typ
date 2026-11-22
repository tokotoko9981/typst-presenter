#set page(
  width: 254mm,
  height: 142.875mm,
  margin: (x: 18mm, y: 14mm),
  numbering: "1",
)
#set text(font: ("Meiryo", "Yu Gothic", "Segoe UI"), size: 15pt, lang: "ja")
#set heading(outlined: true)

#let slide-banner(accent, tag) = {
  rect(width: 100%, height: 4pt, fill: accent)
  v(3mm)
  text(size: 11pt, weight: "bold", fill: accent)[#tag]
  v(2mm)
}

// Slide 1
#slide-banner(rgb("#2563eb"), "SLIDE 1 / TITLE")
= Typstプレゼンテーション発表テスト (Standard Deck) <sec-title>
#v(6mm)
#text(size: 20pt)[日本語・英語混在スライドのレンダリング検証]
#v(4mm)
- Offline CJK Font & CMap Verification (Meiryo / Yu Gothic / Segoe UI)
- Dual-Window BroadcastChannel Synchronization
- Interactive Outline, Page Labels, and Hyperlinks

#pagebreak()

// Slide 2
#slide-banner(rgb("#059669"), "SLIDE 2 / OVERVIEW & LINKS")
= はじめに: ナビゲーションとリンク <sec-intro>
#v(5mm)
スライド内のハイパーリンクと外部URL遷移のテスト。
#v(6mm)
- Internal Link: #box(fill: rgb("#dbeafe"), inset: 6pt, radius: 4pt)[#link(<sec-summary>)[Jump to Slide 6]]
- External Link: #box(fill: rgb("#dcfce7"), inset: 6pt, radius: 4pt)[#link("https://example.com")[https://example.com]]

#pagebreak()

// Slide 3
#slide-banner(rgb("#7c3aed"), "SLIDE 3 / MATH & JAPANESE")
= 数式と日本語組版 (Typesetting & Math) <sec-math>
== ガウス積分と正規化座標 (Sub-outline A) <sec-math-sub>
#v(4mm)
レーザーポインタおよびペン描画の正規化座標 $[0, 1]^2$ と面積分：
$ integral_(-infinity)^(+infinity) e^(-x^2) dif x = sqrt(pi) $
日本語の長文テキストでも文字化けやレイアウト崩れが発生しないことを確認する。

#pagebreak()

// Slide 4
#slide-banner(rgb("#dc2626"), "SLIDE 4 / ARCHITECTURE")
= システム構成 (System Architecture) <sec-arch>
#v(5mm)
#table(
  columns: (1fr, 2fr),
  inset: 8pt,
  [*Component*], [*Responsibility*],
  [Presenter Console], [Speaker notes, timer pacing, slide grid, ink/laser controls],
  [Audience Window], [Clean `#000000` viewport synced via BroadcastChannel + IndexedDB],
)

#pagebreak()

// Slide 5
#slide-banner(rgb("#d97706"), "SLIDE 5 / EVALUATION")
= 性能評価と回復性 (Evaluation & Recovery) <sec-eval>
== F5リロード復旧とLRUキャッシュ (Sub-outline B) <sec-eval-sub>
#v(5mm)
- IndexedDB stores up to 5 recent PDFs keyed by `SHA-256` `deckId`.
- Audience `F5` reload triggers `HELLO -> STATE_SNAPSHOT` handshake.
- HiDPI canvas clamping prevents memory exhaustion on 4K displays.

#pagebreak()

// Slide 6
#slide-banner(rgb("#0f172a"), "SLIDE 6 / SUMMARY")
= まとめ (Summary & Q&A) <sec-summary>
#v(6mm)
ご清聴ありがとうございました (Thank you for listening).
#v(6mm)
- Return Link: #box(fill: rgb("#e2e8f0"), inset: 6pt, radius: 4pt)[#link(<sec-intro>)[Back to Slide 2]]
