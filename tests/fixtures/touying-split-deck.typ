#set page(width: 320mm, height: 90mm, margin: 0pt)
#set text(font: ("Meiryo", "Yu Gothic", "Segoe UI"), size: 14pt, lang: "ja")

#let split-slide(num, title-ja, title-en, left-body, notes-ja, notes-en, accent) = {
  grid(
    columns: (1fr, 1fr),
    rows: (100%,),
    gutter: 0pt,
    // Left half (0%..50%): Audience Slide (dark navy background)
    block(width: 100%, height: 100%, fill: rgb("#0f172a"), inset: 12mm)[
      #set text(fill: white)
      #rect(width: 100%, height: 4pt, fill: accent)
      #v(5mm)
      #text(size: 22pt, weight: "bold")[Slide #num: #title-ja]
      #linebreak()
      #text(size: 14pt, fill: rgb("#94a3b8"))[#title-en]
      #v(7mm)
      #left-body
    ],
    // Right half (50%..100%): Speaker Notes (warm amber background)
    block(width: 100%, height: 100%, fill: rgb("#fef3c7"), inset: 12mm)[
      #set text(fill: rgb("#1e293b"))
      #rect(width: 100%, height: 4pt, fill: rgb("#d97706"))
      #v(5mm)
      #text(size: 18pt, weight: "bold", fill: rgb("#92400e"))[SPEAKER NOTES — Slide #num]
      #v(5mm)
      #text(size: 14pt)[#notes-ja]
      #v(4mm)
      #text(size: 12pt, fill: rgb("#475569"))[#notes-en]
    ],
  )
}

#split-slide(
  1, "導入と背景", "Introduction & Motivation",
  [左半分コンテンツ1：聴衆向けプレゼンテーション画面（32:9分割PDF）],
  [右半分ノート1：冒頭30秒で聴衆の関心を引く質問を投げかける。],
  [Key talking point: introduce the Chrome PDF viewer limitations.],
  rgb("#38bdf8"),
)
#pagebreak()
#split-slide(
  2, "分割クロップ機構", "Split-Page Cropping",
  [左半分コンテンツ2：`w/h > 2.4` の自動検出と `Split L|R` 切り替え],
  [右半分ノート2：左半分を聴衆ウィンドウへ、右半分をノート確認用に使う。],
  [Demonstrate toggling Swap Halves to inspect right-side notes.],
  rgb("#34d399"),
)
#pagebreak()
#split-slide(
  3, "低遅延同期", "BroadcastChannel Sync",
  [左半分コンテンツ3：ポインター・ペン・カーテン状態の即時反映],
  [右半分ノート3：ブラックアウト(B)とフリーズ(F)の実演を行う。],
  [Highlight sub-frame BroadcastChannel state propagation.],
  rgb("#a78bfa"),
)
#pagebreak()
#split-slide(
  4, "結論と質疑応答", "Conclusion & Q&A",
  [左半分コンテンツ4：ご清聴ありがとうございました（End of Split Deck）],
  [右半分ノート4：想定質問（オフライン動作・CJKフォント）への回答メモ。],
  [Remind audience about local-first IndexedDB persistence.],
  rgb("#fb7185"),
)
