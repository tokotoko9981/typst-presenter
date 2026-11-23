#import "@preview/polylux:0.4.0": *

// =============================================================================
// Typst Presenter 公式サンプル & LT デッキ
// - 完全モノクロ暗色基調・単一フォント・余白重視
// =============================================================================

#let mainfont = ("UD Digi Kyokasho NK", "BIZ UDPGothic", "Meiryo", "Yu Gothic")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic", "UD Digi Kyokasho NK")

#let bg-color = eastern.darken(75%)
#let fg-color = white
#let muted-color = white.darken(35%)
#let rule-color = white.darken(50%)

#set document(
  title: "Typst Presenter — Typst & 汎用PDF対応のローカル2画面プレゼンアプリ",
  author: "Typst Presenter",
)
#set text(font: mainfont, lang: "ja", size: 20pt, fill: fg-color)
#set par(leading: 0.68em)
#set page(
  paper: "presentation-16-9",
  margin: (x: 1.8cm, y: 1.3cm),
  fill: bg-color,
)
#set list(spacing: 0.65em)
#show link: underline

#set table(
  inset: (y: 0.6em, x: 0.55em),
  stroke: (x: none, y: 1pt + rule-color),
)
#show table.cell.where(y: 0): set text(fill: muted-color)

#show raw: set text(font: codefont)
#show raw.where(block: true): it => block(
  fill: rgb("#1d2433"),
  inset: 12pt,
  radius: 5pt,
  width: 100%,
  text(fill: rgb("#e6ebf2"), size: 15pt, it),
)

#let slide_header(body) = {
  grid(
    columns: (1fr, auto),
    align: (horizon + left, horizon + right),
    heading(level: 1, text(size: 0.95em, body)),
    text(size: 0.95em, fill: muted-color)[#context counter(page).display("1")],
  )
  v(-0.25em)
  line(length: 100%, stroke: 1pt + rule-color)
  v(0.45em)
}

// ===== Slide 1: 表紙 =====
#slide(
  align(horizon + center)[
    #text(size: 1.9em, weight: "bold")[Typst Presenter]
    #v(0.6em)
    #text(size: 1.15em)[Typst と汎用 PDF に対応したローカル完結 2 画面プレゼンアプリ]
    #v(1.2em)
    #text(size: 0.9em)[Web / PWA / Tauri v2 Desktop]
  ],
)

// ===== Slide 2: 課題 =====
#slide[
  #slide_header("課題: PDF ビューア単体で発表するときの制約")

  標準の PDF ビューアだけでは本番運営の情報が分断される。
  #v(0.5em)

  - 発表者用の原稿やタイマーを別ウィンドウ・別端末へ分ける必要がある
  - 次のスライドの事前確認や、聴衆画面の一時固定ができない
  - レーザーポインターや手書きで注目箇所を強調できない

  #v(0.9em)
  #align(center)[
    #rect(
      inset: (x: 1.3em, y: 0.75em),
      stroke: 1.5pt + white.darken(20%),
      radius: 5pt,
    )[
      視線と操作が複数画面へ分散 → *進行のズレや時間配分の崩れを招く*
    ]
  ]
]

// ===== Slide 3: 解決策 =====
#slide[
  #slide_header("解決策: スライド PDF と発表者原稿の疎結合")
  #v(0.3em)

  #align(center)[
    #rect(
      width: 92%,
      inset: (x: 1.2em, y: 0.85em),
      stroke: 1.5pt + white.darken(20%),
      radius: 5pt,
    )[
      #align(center)[
        任意のスライド PDF ＋ Markdown・pdfpc 原稿 \
        ↓ \
        *外部送信なしのローカル 2 画面コンソールで統合表示*
      ]
    ]
  ]

  #v(0.9em)
  - Typst・Marp・Beamer・PowerPoint から出力した PDF をそのまま使える
  - サーバーへ一切アップロードせず、ブラウザ・PWA・デスクトップ版で完結する
]

// ===== Slide 4: 機能 1 2 画面同期 =====
#slide[
  #slide_header("機能 1: 2 画面リアルタイム同期とリロード復旧")

  #set text(size: 18.5pt)
  #table(
    columns: (0.95fr, 1.95fr),
    align: (left + horizon, left + horizon),
    table.header([構成要素], [役割と特徴]),
    [発表者コンソール], [現在スライド、次スライド、原稿、タイマー、強調ツールを集約],
    [聴衆用ディスプレイ], [純黒背景にスライドのみを表示（F キー全画面化、外部画面選択可）],
    [BroadcastChannel 同期], [ページ遷移・カーテン・レーザー・描線を低遅延で即時反映],
    [IndexedDB 履歴保存], [PDF 本体と現在ページを保持し、F5 更新や履歴から即座に復旧],
  )
]

// ===== Slide 5: 機能 2 発表者ノート =====
#slide[
  #slide_header("機能 2: 発表者ノートとスライド別目標時間")

  #grid(
    columns: (1.05fr, 0.95fr),
    gutter: 1.2em,
    align(left + horizon)[
      - 整形表示とライブ編集 \
        A+ / A- で文字#box[拡縮]、E キーでその場編集

      - 多様な原稿フォーマット \
        Markdown・Marp・Slidev・pdfpc・Typst 注釈に対応

      - スライド別の目標秒数 \
        各ページの目安を設定し、進行の余裕と超過を判定
    ],
    align(left + horizon)[
      Markdown ノート記述例
      #v(0.3em)
      #raw(
        block: true,
        "---\nduration: 5\nlastMinutes: 1\n---\n\n<!-- slide: 1 -->\n<!-- target: 20 -->\n### オープニング\n- 結論を先に述べる\n- **重要数値**を強調",
      )
    ],
  )
]

// ===== Slide 6: 機能 3 ステージ制御・強調 =====
#slide[
  #slide_header("機能 3: 発表中の強調とステージ制御")

  #set text(size: 18pt)
  #table(
    columns: (0.48fr, 0.72fr, 1.8fr),
    inset: (y: 0.52em, x: 0.45em),
    align: (center + horizon, left + horizon, left + horizon),
    table.header([キー], [機能], [発表中の活用場面]),
    [B / W], [黒画面・白画面], [質疑や口頭補足時に投影を隠し、視線を話者へ戻す],
    [F], [画面固定], [投影中のスライドを止めたまま、手元だけで他ページを確認],
    [L], [レーザー], [解像度の異なる聴衆画面へ正規化座標で赤点を同期],
    [D / H / C], [5 色ペンと描線], [赤青黄緑白で書き込み、H で一時非表示、C で消去],
    [S / \[ \]], [スポットライト], [周辺を暗くして図表を強調し、ホイールや \[ \] で半径調整],
  )

  #v(0.45em)
  - *誤リロード防止*: 本番中のタブ閉じや F5 更新を警告ダイアログで抑止
]

// ===== Slide 7: 機能 4 リハーサル分析 =====
#slide[
  #slide_header("機能 4: リハーサル分析（R キー）")
  #v(0.3em)

  練習時の滞在時間を自動で記録し、本番の時間配分へ反映できる。
  #v(0.6em)

  - 全スライドの実測滞在時間・訪問回数・目標差分を一覧化
  - 計測した実測値を目標秒数へ#box[ワンクリック]で一括反映
  - 計測結果を Markdown・CSV レポートとして出力
]

// ===== Slide 8: 機能 5 Watch 連動と多様な PDF 対応 =====
#slide[
  #slide_header("機能 5: Watch 自動更新と多様な PDF 対応")
  #v(0.3em)

  コンパイル環境やスライド作成ツールを問わず、そのまま本番運用できる。
  #v(0.6em)

  - typst watch の出力変化を検知し、現在のページと#box[状態]を保ったまま自動更新
  - Touying などの横長分割 PDF（縦横比 2.4 超）を自動で検出
  - 縦型やサイズ混在の PDF も歪みなく描画#box[領域]へ収めて表示
]

// ===== Slide 9: まとめ =====
#slide[
  #slide_header("まとめ: Typst と汎用 PDF の発表体験を 1 つに")

  - PDF と発表原稿をローカルで統合し、*発表中の視線分散と操作ミスを解消*
  - 2 画面同期・強調ツール・誤リロード防止・リハーサル分析を一貫提供
  - Web ブラウザ即試用、オフライン PWA、デスクトップ版を用意

  #v(1.8em)
  #align(center)[
    #text(size: 1.3em, weight: "bold")[ご清聴ありがとうございました]
    #v(0.4em)
    お手元のスライド PDF をドロップしてすぐにお試しいただけます
  ]
]
