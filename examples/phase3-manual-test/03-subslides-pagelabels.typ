// Phase 3 Manual Test 03: Repeated pageLabels Subslide Note Sharing & Logical Rehearsal Stats
#import "presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note

#show: enable-presenter-notes
#presenter-config(duration: 3, last-minutes: 1)

#let mainfont = ("BIZ UDPGothic", "Yu Gothic", "Meiryo", "Noto Sans JP")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic")
#let accent = rgb("#7c3aed")
#let accent-soft = rgb("#f5f3ff")
#let ink = rgb("#0f172a")
#let muted = rgb("#475569")
#let border = rgb("#cbd5e1")

#set page(
  paper: "presentation-16-9",
  margin: (x: 20mm, top: 16mm, bottom: 15mm),
  numbering: "1",
  footer: context {
    set text(size: 9pt, fill: muted)
    stack(
      dir: ttb,
      spacing: 4pt,
      line(length: 100%, stroke: 0.5pt + border),
      [#text(weight: "bold", fill: accent)[Phase 3 Test 03] — Subslides & Logical PageLabels #h(1fr) Slide #counter(page).display("1")],
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

#let step-box(label, active: false) = block(
  width: 100%,
  inset: 0.75em,
  radius: 5pt,
  fill: if active { accent-soft } else { rgb("#f8fafc") },
  stroke: if active { 1.2pt + accent } else { 0.7pt + border },
  breakable: false,
  text(weight: if active { "bold" } else { "regular" }, fill: if active { accent } else { muted })[#label],
)

// ============================================================
// Physical Page 1 -> Logical Slide 1 (PageLabel: "1")
// ============================================================
#speaker-note(target: 20, "## Logical Slide 1 (物理 1 ページ目)

- 導入スライドです（目標 20 秒）。
- 次へ進むと物理 2〜4 ページ目がすべて論理ページ `2`（サブスライド 1/3 〜 3/3）になります。")

#text(size: 11pt, weight: "bold", fill: accent)[PHASE 3 MANUAL TEST · 03]
#v(0.2em)
= 1. 導入（論理スライド 1 / PageLabel: "1"）
#v(0.5em)
#step-box("このデッキは 5 物理ページ / 3 論理スライド (PageLabels: 1, 2, 2, 2, 3) で構成されています。", active: true)

#pagebreak()

// ============================================================
// Physical Page 2 -> Logical Slide 2, Step 1/3 (PageLabel: "2")
// Note is ONLY attached to this primary physical page!
// ============================================================
#speaker-note(target: 60, "## Logical Slide 2 (サブスライド 1/3 〜 3/3 共有ノート)

- このノートと `target: 60` は **物理 2 ページ目のみ** に定義しています。
- 物理 3 ページ目・4 ページ目へ送っても、同じノートが共有表示され、バッジに `2 (1/3)` → `2 (2/3)` → `2 (3/3)` と表示されることを確認してください。")

= 2. 段階的表示（論理スライド 2 — Step 1/3）
#v(0.5em)
#stack(
  dir: ttb,
  spacing: 10pt,
  step-box("Step 1: 基本概念の提示（物理ページ 2 / PageLabel: 2）", active: true),
)

#pagebreak()
#counter(page).update(2)

// ============================================================
// Physical Page 3 -> Logical Slide 2, Step 2/3 (PageLabel: "2")
// Intentionally NO #speaker-note here.
// ============================================================
= 2. 段階的表示（論理スライド 2 — Step 2/3）
#v(0.5em)
#stack(
  dir: ttb,
  spacing: 10pt,
  step-box("Step 1: 基本概念の提示（表示済み）"),
  step-box("Step 2: 具体例の追加（物理ページ 3 / PageLabel: 2 / ノート未定義）", active: true),
)

#pagebreak()
#counter(page).update(2)

// ============================================================
// Physical Page 4 -> Logical Slide 2, Step 3/3 (PageLabel: "2")
// Intentionally NO #speaker-note here.
// ============================================================
= 2. 段階的表示（論理スライド 2 — Step 3/3）
#v(0.5em)
#stack(
  dir: ttb,
  spacing: 10pt,
  step-box("Step 1: 基本概念の提示（表示済み）"),
  step-box("Step 2: 具体例の追加（表示済み）"),
  step-box("Step 3: 結論の強調（物理ページ 4 / PageLabel: 2 / ノート未定義）", active: true),
)

#pagebreak()
#counter(page).update(3)

// ============================================================
// Physical Page 5 -> Logical Slide 3 (PageLabel: "3")
// ============================================================
#speaker-note(target: 30, "## Logical Slide 3 (物理 5 ページ目)

- リハーサル計測後に Rehearsal Stats モーダルを開き、「論理スライド別」集計トグルを切り替えると、物理 2〜4 ページ目が論理スライド `2` として合算されることを確認してください。")

= 3. まとめ（論理スライド 3 / PageLabel: "3"）
#v(0.5em)
#step-box("Rehearsal Stats で「論理スライド別」トグルを ON にすると、PageLabel 2 の 3 ページ分が 1 行に合算されます。", active: true)
