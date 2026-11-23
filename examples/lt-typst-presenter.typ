#import "@preview/polylux:0.4.0": *

// =============================================================================
// Typst Presenter 公式サンプル & LT デッキ
// - モノクロ暗色基調 + 最大 1 色アクセント、単一フォント、余白重視
// =============================================================================

#let mainfont = ("UD Digi Kyokasho NK", "BIZ UDPGothic", "Meiryo", "Yu Gothic")
#let codefont = ("BIZ UDGothic", "Consolas", "DejaVu Sans Mono", "Meiryo")

#let bg-color = eastern.darken(75%)
#let fg-color = white
#let muted-color = white.darken(30%)
#let accent-color = eastern.lighten(65%)
#let rule-color = white.darken(50%)
#let border-color = white.darken(35%)

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
#show link: underline

#let slide_header = body => {
  grid(
    columns: (1fr, auto),
    align: (horizon + left, horizon + right),
    heading(level: 1, text(size: 0.95em, body)),
    text(size: 0.8em, fill: muted-color)[#context counter(page).display("1")],
  )
  v(-0.25em)
  line(length: 100%, stroke: 1pt + rule-color)
}

// ===== Slide 1: 表紙 =====
#slide(
  align(horizon + center)[
    #text(size: 1.9em, weight: "bold")[Typst Presenter]
    #v(0.55em)
    #text(size: 1.15em)[Typst と汎用 PDF に対応したローカル完結 2 画面プレゼンアプリ]
    #v(1.0em)
    #text(size: 0.88em, fill: muted-color)[
      発表者コンソール・聴衆用ディスプレイ・発表原稿・タイマーを 1 つに統合
    ]
    #v(0.35em)
    #text(size: 0.8em, fill: accent-color)[Web / PWA / Tauri v2 Desktop]
  ],
)

// ===== Slide 2: 課題 =====
#slide[
  #slide_header("課題：PDF ビューア単体で発表するときの制約")
  #v(0.55em)

  *標準の PDF ビューアだけでは本番運営の情報が分断される*
  #v(0.45em)

  - 発表者用の原稿や残り時間タイマーを別ウィンドウ・別端末へ逃がす必要がある
  - 次のスライドの事前確認や、聴衆画面の一時固定が行えない
  - レーザーポインターや手書きでの注目箇所の強調ができない

  #v(0.9em)
  #align(center)[
    #rect(
      inset: (x: 1.3em, y: 0.75em),
      stroke: 1.6pt + accent-color,
      radius: 5pt,
    )[
      #text(size: 1.05em)[
        視線と操作が複数の画面へ分散  →  *進行のズレや時間配分の崩れを招く*
      ]
    ]
  ]
]

// ===== Slide 3: 解決策 =====
#slide[
  #slide_header("解決策：スライド PDF と発表者原稿の疎結合")
  #v(0.55em)

  #align(center)[
    #rect(
      width: 92%,
      inset: (x: 1.2em, y: 0.85em),
      stroke: 1.6pt + white.darken(20%),
      radius: 5pt,
    )[
      #align(center)[
        #text(size: 1.02em)[
          任意のスライド PDF ＋ Markdown・pdfpc 原稿 \
          ↓ \
          *外部送信なしのローカル 2 画面コンソールで統合表示*
        ]
      ]
    ]
  ]

  #v(0.85em)
  - Typst・Marp・Beamer・PowerPoint から出力した PDF をそのまま利用できる
  - サーバーへ一切アップロードせず、ブラウザ PWA・デスクトップ版で完結する
]

// ===== Slide 4: 機能1 2画面同期 =====
#slide[
  #slide_header("機能 1：2 画面リアルタイム同期とリロード復旧")
  #v(0.6em)

  #set text(size: 17pt)
  #table(
    columns: (0.95fr, 1.95fr),
    inset: (y: 0.7em, x: 0.55em),
    align: (left + horizon, left + horizon),
    stroke: (x: none, y: 1pt + rule-color),
    table.header([*構成要素*], [*役割と特徴*]),
    [発表者コンソール], [現在スライド、次スライド予測、原稿、タイマー、強調ツールを集約],
    [聴衆用ディスプレイ], [純黒背景にスライドのみを表示（F キー全画面化、外部画面選択可）],
    [BroadcastChannel 同期], [ページ遷移・カーテン・レーザー・手書き描線を低遅延で即時反映],
    [IndexedDB 履歴保存], [PDF 本体と現在ページを保持し、F5 更新や履歴から即座に復旧],
  )
]

// ===== Slide 5: 機能2 発表者ノート =====
#slide[
  #slide_header("機能 2：発表者ノートとスライド別目標時間")
  #v(0.5em)

  #grid(
    columns: (1.08fr, 0.92fr),
    gutter: 1.2em,
    align(left + horizon)[
      #set text(size: 18pt)
      *整形表示とライブ編集* \
      見出しや箇条書きを見やすく表示し、A+ / A- で拡縮、E キーでその場編集。
      #v(0.55em)

      *多様な原稿フォーマット* \
      Markdown・Marp / Slidev ソース・pdfpc・Typst 埋め込み注釈を取り込み。
      #v(0.55em)

      *スライド別の目標秒数* \
      各ページの目安秒数を設定し、進行の余裕と超過を自動判定。
    ],
    align(left + horizon)[
      #rect(
        width: 100%,
        inset: (x: 0.9em, y: 0.75em),
        stroke: 1pt + border-color,
        fill: bg-color.darken(30%),
        radius: 5pt,
      )[
        #text(size: 0.78em, fill: accent-color, weight: "bold")[Markdown ノート記述例]
        #v(0.3em)
        #set text(font: codefont, size: 0.75em, fill: fg-color)
        #raw(
          block: true,
          "---\nduration: 5\nlastMinutes: 1\n---\n\n<!-- slide: 1 -->\n<!-- target: 20 -->\n### オープニング\n- 結論を先に述べる\n- **重要数値**を強調",
        )
      ]
    ],
  )
]

// ===== Slide 6: 機能3 ステージ制御・強調 =====
#slide[
  #slide_header("機能 3：発表中の強調とステージ制御")
  #v(0.45em)

  #set text(size: 16pt)
  #table(
    columns: (0.44fr, 0.74fr, 1.82fr),
    inset: (y: 0.55em, x: 0.45em),
    align: (center + horizon, left + horizon, left + horizon),
    stroke: (x: none, y: 1pt + rule-color),
    table.header([*キー*], [*機能*], [*発表中の活用場面*]),
    [B / W], [黒画面・白画面], [質疑や口頭補足時に投影を隠し、聴衆の視線を話者へ戻す],
    [F], [画面固定], [投影中のスライドを止めたまま、手元だけで他ページを確認する],
    [L], [レーザー], [正規化座標により解像度の異なる聴衆画面へ赤点を同期する],
    [D / H / C], [5 色ペンと描線], [赤青黄緑白で書き込み、H で一時非表示、C で消去する],
    [S / [ ]], [スポットライト], [周辺を暗くして図表を示し、ホイールや [ ] で半径を調整する],
    [Guard], [誤リロード防止], [本番中の意図しないタブ閉じや F5 更新を警告で確認する],
  )
]

// ===== Slide 7: 機能4 リハーサル分析・Watch =====
#slide[
  #slide_header("機能 4：リハーサル分析と Watch 自動更新")
  #v(0.6em)

  #set text(size: 18pt)
  #grid(
    columns: (1fr, 1fr),
    gutter: 1.2em,
    rect(
      width: 100%,
      inset: (x: 1em, y: 0.9em),
      stroke: 1.2pt + border-color,
      radius: 5pt,
    )[
      #text(size: 0.95em, weight: "bold", fill: accent-color)[リハーサル分析（R キー）]
      #v(0.45em)
      - 全スライドの実測滞在時間・訪問回数・目標差分を一覧化
      - 計測した実測値を目標秒数へワンクリックで一括反映
      - 計測結果を Markdown・CSV レポートとして出力
    ],
    rect(
      width: 100%,
      inset: (x: 1em, y: 0.9em),
      stroke: 1.2pt + border-color,
      radius: 5pt,
    )[
      #text(size: 0.95em, weight: "bold", fill: accent-color)[Watch 連動と分割 PDF 検出]
      #v(0.45em)
      - typst watch の出力変化を検知し、状態を保ち自動更新
      - Touying などの横長分割 PDF（縦横比 2.4 超）を自動検出
      - 縦型や混在サイズの PDF も歪みなく領域へ収めて描画
    ],
  )
]

// ===== Slide 8: まとめ =====
#slide[
  #slide_header("まとめ：Typst と汎用 PDF の発表体験を 1 つに")
  #v(0.6em)

  #set text(size: 19pt)
  - PDF と発表原稿をローカルで統合し、*発表中の視線分散と操作ミスを解消*
  - 2 画面同期・ポインター強調・誤リロード防止・リハーサル時間分析を一貫提供
  - Web ブラウザ即試用、オフライン PWA、マルチディスプレイ対応デスクトップ版を用意

  #v(1.0em)
  #align(center)[
    #rect(
      inset: (x: 1.4em, y: 0.75em),
      stroke: 1.6pt + accent-color,
      radius: 5pt,
    )[
      #align(center)[
        #text(size: 1.08em, weight: "bold")[ご清聴ありがとうございました] \
        #text(size: 0.85em, fill: muted-color)[
          お手元のスライド PDF をドロップしてすぐにお試しいただけます
        ]
      ]
    ]
  ]
]
