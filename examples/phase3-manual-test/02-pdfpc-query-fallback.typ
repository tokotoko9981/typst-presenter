// Phase 3 Manual Test 02: Legacy <pdfpc> Metadata Fallback (`typst query`)
// Note: Does NOT import presenter-notes.typ and does NOT emit #pdf.attach.
// Direct #metadata(...) <pdfpc> avoids Polylux 0.4.0's type(x) == "string" panic on Typst 0.15.

#metadata((t: "Duration", v: 4)) <pdfpc>
#metadata((t: "LastMinutes", v: 1)) <pdfpc>
#metadata((t: "NoteFontSize", v: 20)) <pdfpc>

#let mainfont = ("BIZ UDPGothic", "Yu Gothic", "Meiryo", "Noto Sans JP")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic")
#let accent = rgb("#0f766e")
#let accent-soft = rgb("#f0fdfa")
#let ink = rgb("#0f172a")
#let muted = rgb("#475569")
#let border = rgb("#cbd5e1")

#set page(
  paper: "presentation-16-9",
  margin: (x: 20mm, top: 16mm, bottom: 15mm),
  numbering: "1 / 1",
  footer: context {
    set text(size: 9pt, fill: muted)
    stack(
      dir: ttb,
      spacing: 4pt,
      line(length: 100%, stroke: 0.5pt + border),
      [#text(weight: "bold", fill: accent)[Phase 3 Test 02] — `<pdfpc>` Query Fallback #h(1fr) #counter(page).display("1 / 1", both: true)],
    )
  },
)

#set text(font: mainfont, lang: "ja", size: 14pt, fill: ink)
#set par(leading: 0.72em)

#show heading.where(level: 1): it => {
  block(below: 0.7em, sticky: true, stack(
    dir: ttb,
    spacing: 0.3em,
    text(size: 22pt, weight: "bold", fill: ink, it.body),
    line(length: 100%, stroke: 1.5pt + accent),
  ))
}

#show raw: set text(font: codefont, size: 11pt)

#let card(title, body) = block(
  width: 100%,
  inset: 0.85em,
  radius: 5pt,
  fill: accent-soft,
  stroke: 0.8pt + accent,
  breakable: false,
  [
    #text(weight: "bold", size: 13.5pt, fill: accent)[#title]
    #v(0.25em)
    #body
  ],
)

// ============================================================
// Slide 1
// ============================================================
#metadata((t: "Note", v: "<!-- target: 25 -->\nSlide 1: `<pdfpc>` クエリ経由で自動抽出されたノートです。")) <pdfpc>

#text(size: 11pt, weight: "bold", fill: accent)[PHASE 3 MANUAL TEST · 02]
#v(0.2em)
= 1. `<pdfpc>` メタデータフォールバック
#v(0.5em)
#card("このファイルの特徴", [
  - `presenter-notes.typ` も `#pdf.attach` も使用していない。
  - `#metadata((t: "Duration", v: 4)) <pdfpc>` 等を直接出力している。
  - Tauri でこの `.typ` を直接開くと `typst query <pdfpc>` によりノートと設定が自動抽出される。
])

#pagebreak()

// ============================================================
// Slide 2
// ============================================================
#metadata((t: "NewSlide")) <pdfpc>
#metadata((t: "Note", v: "<!-- target: 40 -->\nSlide 2: `#pdf.attach` なしでも Tauri 直接コンパイル時は `typst query` でノート・目標時間が補完されます。")) <pdfpc>

= 2. ページ遷移と目標時間 (`target: 40`)
#v(0.5em)
#card("期待される抽出結果", [
  - Duration: 4 分 / LastMinutes: 1 分 / NoteFontSize: 20px
  - Slide 1 target: 25 秒、Slide 2 target: 40 秒
  - PDF 単体にはノートが埋め込まれないため、Tauri 直接コンパイル時のみノートが表示される。
])

#pagebreak()

// ============================================================
// Slide 3
// ============================================================
#metadata((t: "NewSlide")) <pdfpc>
#metadata((t: "Note", v: "Slide 3: `<pdfpc>` メタデータ末尾スライドの確認。")) <pdfpc>

= 3. `<pdfpc>` 末尾スライド
#v(0.5em)
#card("確認完了チェック", [
  - 3 ページ分のノートがすべて Tauri の Presenter Console に表示されていること。
  - CLI でも `typst query 02-pdfpc-query-fallback.typ "<pdfpc>" --field value --format json` で JSON 出力を確認できる。
])
