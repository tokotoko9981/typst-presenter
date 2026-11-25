// Build: typst compile --root . examples/lt-typst-presenter.typ examples/lt-typst-presenter.pdf
#import "@preview/polylux:0.4.0": *
#import "../typst/presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note

// =============================================================================
// Typst Presenter 公式サンプル & LT デッキ（v0.4.1）
// - 完全モノクロ暗色基調・単一フォント・余白重視
// - typst/presenter-notes.typ による単一 PDF ノート埋め込み対応
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
  inset: (y: 0.56em, x: 0.55em),
  stroke: (x: none, y: 1pt + rule-color),
)
#show table.cell.where(y: 0): set text(fill: muted-color)

#show raw: set text(font: codefont)
#show raw.where(block: true): it => block(
  fill: rgb("#1d2433"),
  inset: 12pt,
  radius: 5pt,
  width: 100%,
  text(fill: rgb("#e6ebf2"), size: 14.5pt, it),
)

#show: enable-presenter-notes
#presenter-config(
  duration: 5,
  last-minutes: 1,
  qr-url: "https://github.com/tokotoko9981/typst-presenter",
  qr-label: "Typst Presenter Repository",
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
#slide[
  #align(horizon + center)[
    #text(size: 1.9em, weight: "bold")[Typst Presenter]
    #v(0.6em)
    #text(size: 1.15em)[Typst と汎用 PDF に対応したローカル完結 2 画面プレゼンアプリ]
    #v(1.2em)
    #text(size: 0.9em)[Web / PWA / Tauri v2 Desktop]
  ]
  #speaker-note(
    target: 20,
    "### オープニング（0:00 - 0:20）\n\n- こんにちは。本日はローカル完結型の 2 画面プレゼンアプリ **Typst Presenter** を 5 分間でご紹介します。\n- ブラウザ上の Web アプリに加え、オフライン PWA と Tauri デスクトップ版で動きます。\n- 右の開始ボタンと `Space` キーで発表を進められます。",
  )
]

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
  #speaker-note(
    target: 30,
    "### 課題：PDF ビューア単体での発表（0:20 - 0:50）\n\n- 結論から言うと、標準の PDF ビューアだけでは本番中の情報管理が分散してしまいます。\n- 手元で原稿を読むには別ウィンドウやスマホを並べる必要があり、タイマーも別アプリで計測しがちです。次のスライドの事前確認や聴衆画面の一時固定も行えません。\n- さらにレーザーや手書き強調も使えないため、発表中に視線があちこちへ散り、操作ミスや時間配分の崩れを招きます。",
  )
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
        任意のスライド PDF ＋ Markdown・pdfpc・単一 .typ 原稿 \
        ↓ \
        *外部送信なしのローカル 2 画面コンソールで統合表示*
      ]
    ]
  ]

  #v(0.9em)
  - Typst・Marp・Beamer・PowerPoint から出力した PDF をそのまま使える
  - 単一 .typ 原稿なら、PDF 内へのノート埋め込みと直接コンパイルにも対応する
  #speaker-note(
    target: 35,
    "### 解決策：PDF と Markdown 原稿の疎結合（0:50 - 1:25）\n\n- そこで本アプリでは、投影するスライドを PDF、手元で読む原稿を Markdown・pdfpc・単一 .typ 埋め込みとして統合しました。\n- Typst はもちろん、Marp や Beamer、PowerPoint など作成ツールを問わず、出力した PDF をそのままドラッグ＆ドロップで読み込めます。\n- 外部サーバーへ一切アップロードせず、ブラウザ・PWA・デスクトップ版で完結するため安心して運用できます。",
  )
]

// ===== Slide 4: 機能 1 2 画面同期とコンソール配置 =====
#slide[
  #slide_header("機能 1: 2 画面リアルタイム同期とコンソール配置")

  #set text(size: 18pt)
  #table(
    columns: (0.9fr, 2.0fr),
    align: (left + horizon, left + horizon),
    table.header([構成要素], [役割と特徴]),
    [発表者コンソール], [現在・次スライド、原稿、タイマーを集約し左右比率を調整],
    [聴衆用ディスプレイ], [純黒背景にスライドのみ映し、進捗バーや外部全画面に対応],
    [BroadcastChannel 同期], [ページ遷移・カーテン・拡大・QR 投影・描線を低遅延同期],
    [IndexedDB 履歴・保護], [PDF と現在位置を保持して復旧し、誤終了・誤更新を抑止],
  )
  #speaker-note(
    target: 35,
    "### 機能 1：2 画面リアルタイム同期とコンソール配置（1:25 - 2:00）\n\n- 1 つ目の機能は、発表者コンソールと聴衆用ディスプレイのリアルタイム同期です。\n- 手元画面のスライドとノート領域は中央のハンドルをドラッグして好みの比率に調整でき、設定も自動保存されます。\n- BroadcastChannel で低遅延に同期し、PDF 本体と現在ページを IndexedDB に保持するため、誤更新してもすぐ復旧できます。",
  )
]

// ===== Slide 5: 機能 2 発表者ノートと目標時間管理 =====
#slide[
  #slide_header("機能 2: 発表者ノートと目標時間管理")

  #grid(
    columns: (1.02fr, 0.98fr),
    gutter: 1.1em,
    align(left + horizon)[
      - 単一 .typ 埋め込みとライブ編集 \
        A+ / A- で文字#box[拡縮]、E キーで編集、元 .md へ直接上書き

      - 多様な原稿とサブスライド共有 \
        Markdown・Marp・Slidev・pdfpc・重複ページ番号共有に対応

      - 原稿文字数からの自動目標見積もり \
        日英の読み上げ速度から推奨秒数を算出して一括反映
    ],
    align(left + horizon)[
      単一 .typ ノート埋め込み例
      #v(0.3em)
      #raw(
        block: true,
        "#import \"presenter-notes.typ\": *\n#show: enable-presenter-notes\n#presenter-config(\n  duration: 5, last-minutes: 1,\n  qr-url: \"https://example.com\",\n)\n#speaker-note(target: 20)[\n  - 結論を先に述べる\n]",
      )
    ],
  )
  #speaker-note(
    target: 35,
    "### 機能 2：発表者ノートと目標時間管理（2:00 - 2:35）\n\n- 2 つ目は、発表者ノートと目標時間の管理機能です。\n- Typst の `presenter-notes.typ` を使えば 1 つの PDF に原稿と目標秒数を埋め込め、外部 `.md` も `E` キー編集から直接上書き保存できます。\n- 原稿の文字数と英単語数から推奨秒数を自動見積もりして未設定スライドへ一括反映する補助機能も備えました。",
  )
]

// ===== Slide 6: 機能 3 ステージ制御・強調 =====
#slide[
  #slide_header("機能 3: 発表中の強調とステージ制御")

  #set text(size: 18pt)
  #table(
    columns: (0.48fr, 0.65fr, 1.87fr),
    inset: (y: 0.48em, x: 0.45em),
    align: (center + horizon, left + horizon, left + horizon),
    table.header([キー], [機能], [発表中の活用場面]),
    [B / . / W], [黒・白画面], [質疑時に投影を隠し、リモコン操作にも対応],
    [F], [画面固定], [投影中のスライドを止めたまま手元だけ先送り],
    [L / D / S], [強調ツール], [3 色レーザー・5 色ペン（H 非表示 / C 消去）・スポット],
    [Z / 0], [部分拡大], [カーソル中心に最大 4 倍まで高精細拡大し図表を強調],
    [Q], [QR 投影], [配布資料やリポジトリ URL をオフライン QR で即時投影],
  )

  #v(0.4em)
  - *誤操作ガード*: 本番中のタブ閉じ・F5 更新・アプリ終了を確認ダイアログで抑止
  #speaker-note(
    target: 40,
    "### 機能 3：強調ツールとステージ制御（2:35 - 3:15）\n\n- 3 つ目は、本番中の説明を助けるステージ制御と強調ツールです。\n- `B` / `.` の黒画面や `W` の白画面、`F` の画面固定に加え、`L` の 3 色レーザー、`D` の 5 色ペン、`S` のスポットライトを使えます。\n- さらに `Z` キーで数式や図表を最大 4 倍まで鮮明に拡大でき、質疑応答では `Q` キーからオフライン生成した QR コードを即座に投影できます。",
  )
]

// ===== Slide 7: 機能 4 タイマー・チャイムとリハーサル分析 =====
#slide[
  #slide_header("機能 4: タイマー・チャイムとリハーサル分析")
  #v(0.25em)

  発表時間と警告残りの 2 項目設定で、本番のペースと振り返りを一貫管理できる。
  #v(0.55em)

  - 学会形式のチャイム SE（1 鈴・2 鈴・3 鈴）をタイマー連動または手動で鳴動
  - 同一論理スライド内のサブスライド移動ではスライドタイマーを継続計測
  - R キーで全スライドの実測滞在時間・訪問回数・目標差分を一覧化（論理合算対応）
  - 実測値を目標秒数へ#box[ワンクリック]で一括反映し、Markdown・CSV レポートを出力
  #speaker-note(
    target: 35,
    "### 機能 4：タイマー・チャイムとリハーサル分析（3:15 - 3:50）\n\n- 4 つ目は、タイマー・チャイム機能と `R` キーのリハーサル分析です。\n- 発表時間と警告残りの 2 項目でシンプルに設定でき、必要に応じて学会形式の 1・2・3 鈴チャイムを鳴らせます。\n- サブスライド間はタイマーを継続しつつ、練習後は `R` キーで論理スライド合算の滞在時間を確認し、実測値をそのまま次回の目標秒数へ反映できます。",
  )
]

// ===== Slide 8: 機能 5 Typst ライブコンパイルと多様な PDF 対応 =====
#slide[
  #slide_header("機能 5: Typst ライブコンパイルと多様な PDF 対応")
  #v(0.25em)

  制作中のライブ更新から本番の多様なレイアウトまでシームレスに扱える。
  #v(0.55em)

  - Tauri 版で .typ ファイルを直接監視コンパイルし、埋め込みノートも自動追従
  - *Live Compile Guard*: 構文エラー時も直前の正常状態（PDF・描線）を維持
  - Web 版は Watch PDF で再コンパイルを検知し、ページと状態を保って再読込
  - Touying などの横長分割 PDF 自動検出や、縦型・サイズ混在 PDF にも歪みなく対応
  #speaker-note(
    target: 40,
    "### 機能 5：Typst ライブコンパイルと多様な PDF 対応（3:50 - 4:30）\n\n- 5 つ目は、Tauri デスクトップ版の `.typ` 直接コンパイルと多様な PDF 対応です。\n- Live Compile Guard により、執筆中に構文エラーが起きても聴衆画面や手元のページ・描線は壊れず、診断ドロワーだけにエラーが表示されます。\n- Web 版でも Watch PDF による自動更新が使え、Touying の横長分割 PDF やサイズ混在 PDF も自動で最適化します。",
  )
]

// ===== Slide 9: まとめ =====
#slide[
  #slide_header("まとめ: Typst と汎用 PDF の発表体験を 1 つに")

  - 単一 .typ 原稿から汎用 PDF までローカル完結で統合し、*発表中の視線分散を解消*
  - 2 画面同期・拡大・QR・チャイム・自動見積もり・リハーサル分析を一貫提供
  - Web ブラウザ即試用、オフライン PWA、Tauri デスクトップ版を用意

  #v(1.6em)
  #align(center)[
    #text(size: 1.3em, weight: "bold")[ご清聴ありがとうございました]
    #v(0.4em)
    お手元のスライド PDF または .typ ファイルを読み込んですぐにお試しいただけます
  ]
  #speaker-note(
    target: 30,
    "### まとめ（4:30 - 5:00）\n\n- 最後にまとめです。Typst Presenter は、単一 `.typ` 原稿や汎用 PDF、発表原稿、タイマー、強調ツールをローカルの 1 画面へ統合しました。\n- 2 画面同期・ズーム・QR 投影・自動時間見積もり・リハーサル分析を一貫して提供し、Web・PWA・デスクトップ版で動作します。\n- ぜひお手元の PDF や `.typ` ファイルを読み込んで操作感をお試しください。ご清聴ありがとうございました。",
  )
]
