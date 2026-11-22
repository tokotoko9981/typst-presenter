// Built-in Demo Deck for typst-presenter
// Compile: typst compile examples/sample-deck.typ public/sample-deck.pdf

#let mainfont = ("BIZ UDPGothic", "Yu Gothic", "Meiryo", "Noto Sans JP")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic")

#let accent = rgb("#1d4ed8")
#let accent-soft = rgb("#eff6ff")
#let ink = rgb("#0f172a")
#let muted = rgb("#475569")
#let border = rgb("#cbd5e1")

#set document(
  title: "typst-presenter Demo Deck",
  author: "typst-presenter",
)

#set page(
  paper: "presentation-16-9",
  margin: (x: 20mm, top: 15mm, bottom: 15mm),
  numbering: "1 / 1",
  footer: context {
    let p = counter(page).get().first()
    if p > 1 {
      set text(size: 9pt, fill: muted)
      stack(
        dir: ttb,
        spacing: 4pt,
        line(length: 100%, stroke: 0.5pt + border),
        [#text(weight: "bold", fill: accent)[typst-presenter] — Built-in Sample Deck #h(1fr) #counter(page).display("1 / 1", both: true)],
      )
    }
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

#show heading.where(level: 2): it => {
  block(below: 0.6em, sticky: true, stack(
    dir: ttb,
    spacing: 0.25em,
    text(size: 19pt, weight: "bold", fill: accent, it.body),
    line(length: 100%, stroke: 0.8pt + border),
  ))
}

#show raw: set text(font: codefont, size: 10.5pt)
#show raw.where(block: true): it => block(
  width: 100%,
  inset: 0.75em,
  radius: 4pt,
  fill: rgb("#f8fafc"),
  stroke: 0.6pt + border,
  breakable: false,
  it,
)

#let card(title, body, fill-color: accent-soft, stroke-color: accent) = block(
  width: 100%,
  inset: 0.8em,
  radius: 5pt,
  fill: fill-color,
  stroke: 0.8pt + stroke-color,
  breakable: false,
  [
    #text(weight: "bold", size: 13.5pt, fill: stroke-color)[#title]
    #v(0.25em)
    #body
  ],
)

// ============================================================
// Slide 1: Title Slide
// ============================================================
#align(left + horizon)[
  #block(
    inset: (left: 14pt, y: 8pt),
    stroke: (left: 4pt + accent),
    [
      #text(size: 11pt, weight: "bold", fill: accent)[BUILT-IN SAMPLE DECK · TYPST 0.15.1]
      #v(0.2em)
      #heading(level: 1, numbering: none)[typst-presenter] <sec-title>
      #v(-0.4em)
      #text(size: 18pt, weight: "bold", fill: ink)[
        Typst スライドのための専用ローカルプレゼン Web アプリ
      ]
      #v(0.35em)
      #text(size: 13pt, fill: muted)[
        Dual-Window Presenter Console & Audience Display with Speaker Notes, Timers, and Synced Overlays
      ]
    ],
  )
  #v(1.2em)
  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 12pt,
    card("Private Notes", [Markdown / `.pdfpc` / `#pdf.attach` / Touying 分割スライドに対応。]),
    card("Synced Dual View", [`BroadcastChannel` + IndexedDB により別ウィンドウへ低遅延同期。]),
    card("100% Local-First", [外部サーバー送信なし。オフライン CJK フォント・CMap 同梱。]),
  )
]

#pagebreak()

// ============================================================
// Slide 2: Outline / Agenda
// ============================================================
= 1. アジェンダ / Agenda

#v(0.4em)
#grid(
  columns: (1.2fr, 1fr),
  gutter: 18pt,
  [
    #text(size: 13pt, fill: muted)[本サンプルデッキの構成（項目をクリックすると該当スライドへ移動します）：]
    #v(0.4em)
    #block(
      width: 100%,
      inset: 1em,
      radius: 6pt,
      fill: rgb("#f8fafc"),
      stroke: 0.6pt + border,
      outline(title: none, indent: 1.4em, depth: 2),
    )
  ],
  [
    #card("このデモで確認できる機能", [
      + *PDF Outline (TOC)*: `O` キーで見出しツリーから直接ジャンプ
      + *Clickable Links*: 目次・外部 URL・スライド内アンカー遷移
      + *Math & Code*: 日本語・数式・シンタックスハイライト描画
      + *Speaker Notes*: 右側の発表者ノートとタイマーの連動
    ])
  ],
)

#pagebreak()

// ============================================================
// Slide 3: Dual-Window Architecture & Links
// ============================================================
== 1.1 デュアルウィンドウ同期アーキテクチャ / Dual-Window Architecture

Chrome の標準 PDF ビューアーには、発表者のみが見られるスクリプト表示・タイマー・投影制御がありません。
*`typst-presenter`* は同一オリジン上の 2 つのウィンドウをリアルタイムに同期します。

#v(0.4em)
#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  card("Presenter Console (#/)", [
    - 現在スライド（レーザー・ペン操作可能）＋ 次スライドプレビュー
    - 発表者専用 Markdown スクリプト（`E` でインライン編集）
    - 経過・カウントダウン・スライド別ペース配分タイマー
    - `B`（Blackout）/ `W`（Whiteout）/ `F`（Freeze）制御
  ]),
  card("Audience Display (#/audience)", [
    - 聴衆向けのクリーンな `#000000` 全画面キャンバス
    - IndexedDB（`SHA-256` `deckId`）による `F5` リロード自動復旧
    - 正規化座標 `[0, 1]` による解像度非依存のレーザー・手書き同期
    - Touying 2画面分割 PDF（`show-notes-on-second-screen`）の自動切り出し
  ], fill-color: rgb("#f0fdf4"), stroke-color: rgb("#15803d")),
)

#v(0.5em)
#text(size: 12.5pt)[
  関連リンク: #link("https://typst.app/docs/")[Typst Official Documentation] ｜
  内部ジャンプテスト: #link(<sec-summary>)[まとめスライド（Slide 6）へ移動 →]
]

#pagebreak()

// ============================================================
// Slide 4: Math & Coordinate Normalization
// ============================================================
== 1.2 数式と座標正規化 / Math & Coordinate Normalization

解像度の異なる発表者画面と聴衆プロジェクター間でポインター位置を一致させるため、スライド矩形基準の正規化座標系を採用しています。

#v(0.3em)
#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  card("正規化ポインター座標 / Normalized Pointer", [
    スクリーン座標 $(p_x, p_y)$ を矩形 $r = (r_"left", r_"top", r_"width", r_"height")$ で正規化：
    $ hat(p) = ( (p_x - r_"left") / r_"width", (p_y - r_"top") / r_"height" ) in [0, 1]^2 $
    線の太さもスライド幅 $r_"width"$ に対する比率 $w_"norm" = w_"px" / r_"width"$ で同期します。
  ]),
  card("HiDPI キャンバスの安全上限 / HiDPI Clamping", [
    4K 環境での GPU メモリ枯渇を防ぐため、実効倍率 $s_"eff"$ を上限クランプします：
    $ "dpr"_"eff" = min("devicePixelRatio", 2.5) $
    $ s_"eff" = min(s_"css" dot "dpr"_"eff", 4096 / max(w_0, h_0)) $
  ], fill-color: rgb("#faf5ff"), stroke-color: rgb("#7e22ce")),
)

#pagebreak()

// ============================================================
// Slide 5: Implementation Highlights (Code Blocks)
// ============================================================
= 2. 実装ハイライト / Implementation Highlights

#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  [
    #text(weight: "bold", size: 12.5pt, fill: accent)[Typst: 発表用ページ設定と埋め込みノート]
    ```typ
    // 16:9 スライド設定（PDF PageLabels を自動生成）
    #set page(paper: "presentation-16-9", numbering: "1 / 1")

    // Presio 等と同様に JSON ノートを PDF に添付可能
    #pdf.attach(
      "notes.json",
      bytes(json.encode((slides: ("1": "導入トーク")))),
      mime-type: "application/json",
    )
    ```
  ],
  [
    #text(weight: "bold", size: 12.5pt, fill: accent)[TypeScript: PdfEngine 型契約]
    ```ts
    export interface RenderOptions {
      targetWidth: number;
      targetHeight: number;
      dpr: number; // min(dpr, 2.5) でクランプ
      cropRegion: 'full' | 'left-half' | 'right-half'
                | 'top-half' | 'bottom-half';
      signal?: AbortSignal; // 高速ページ送りの競合キャンセル
    }
    ```
  ],
)

#pagebreak()

// ============================================================
// Slide 6: Summary & Q&A
// ============================================================
= 3. まとめ・Q&A / Summary & Q&A <sec-summary>

#grid(
  columns: (1.1fr, 1fr),
  gutter: 16pt,
  [
    #card("まとめ / Key Takeaways", [
      + *Zero Setup*: Typst PDF をドロップするだけで即座に発表開始
      + *Multi-Workflow*: Markdown / `.pdfpc` / `#pdf.attach` / Touying 分割に対応
      + *Offline & Private*: ローカル完結で学会・社内発表でも安心
    ])
    #v(0.5em)
    #text(size: 13pt)[
      ご清聴ありがとうございました。質問があればどうぞ！
      #linebreak()
      #link(<sec-title>)[← タイトルスライド（Slide 1）へ戻る]
    ]
  ],
  [
    #text(weight: "bold", size: 12.5pt, fill: accent)[主なショートカット / Keyboard Shortcuts]
    #v(0.2em)
    #set text(size: 11.5pt)
    #table(
      columns: (auto, 1fr),
      inset: (x: 8pt, y: 5pt),
      stroke: 0.5pt + border,
      table.header([*Key*], [*Action*]),
      [`→` / `Space`], [次のスライドへ / Next Slide],
      [`B` / `W` / `F`], [Blackout / Whiteout / Freeze],
      [`L` / `D` / `C`], [レーザー / ペン描画 / インク消去],
      [`G` / `O` / `E`], [一覧グリッド / 目次 / ノート編集],
      [`?`], [ショートカットヘルプ表示],
    )
  ],
)
