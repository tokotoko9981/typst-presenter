#import "@preview/polylux:0.4.0": *

// LT用テーマ設定（mid_presentation と統一感のある配色・Polylux構成）
#let mainfont = ("UD Digi Kyokasho NK", "BIZ UDPGothic", "Meiryo", "Yu Gothic")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic")

#let bg-dark = eastern.darken(75%)
#let accent = rgb("#38bdf8")
#let card-bg = rgb("#0f172a").transparentize(25%)
#let card-border = white.darken(55%)

#set document(
  title: "Slide Presenter — Typst & 汎用PDF対応のローカル専用プレゼンアプリ",
  author: "Slide Presenter",
)
#set text(font: mainfont, lang: "ja", size: 19pt, fill: white)
#set page(paper: "presentation-16-9", fill: bg-dark, margin: (x: 18mm, y: 14mm))
#show link: underline
#show raw: set text(font: codefont, size: 0.85em)

// ページ番号を heading ではなく text にすることで、PDFアウトラインに空白行を混ぜない
#let slide_header(title) = {
  grid(
    columns: (1fr, auto),
    align: (horizon + left, horizon + right),
    heading(level: 1, title),
    text(size: 16pt, weight: "bold", fill: white.darken(25%))[#context counter(page).display("1")],
  )
  v(-0.2em)
  line(length: 100%, stroke: 1.2pt + white.darken(45%))
  v(0.35em)
}

#let info_card(title, body, stroke-col: accent) = block(
  width: 100%,
  inset: 10pt,
  radius: 5pt,
  fill: card-bg,
  stroke: 1.2pt + stroke-col,
  breakable: false,
  [
    #text(size: 0.92em, weight: "bold", fill: stroke-col)[#title]
    #v(0.25em)
    #text(size: 0.88em)[#body]
  ],
)

// ===== Slide 1: タイトル =====
#slide(
  align(horizon + center)[
    #text(size: 12pt, weight: "bold", fill: accent)[LIGHTNING TALK · 5 MIN]
    #v(0.3em)
    #heading(level: 1, [Slide Presenter])
    #v(0.2em)
    #text(size: 21pt, weight: "bold")[Typst & 汎用PDF対応のローカル専用プレゼンアプリ]
    #v(0.9em)
    #text(size: 14pt, fill: white.darken(20%))[
      Chrome標準PDFビューアの「発表しづらさ」を Web / PWA / デスクトップアプリで解消する
    ]
  ],
)

// ===== Slide 2: 背景と課題 =====
#slide[
  #slide_header("背景：Chrome PDF ビューアでの発表のつらみ")
  #v(0.2em)

  *Typst でスライドを作って PDF に出力したあと、どうやって発表していますか？*
  #v(0.3em)

  #grid(
    columns: (1fr, 1fr),
    gutter: 1em,
    info_card(
      "Chrome PDF プレゼンモードの限界",
      [
        - 発表者用の *原稿（カンペ）* が出せない
        - *経過時間・残り時間タイマー* がない
        - 聴衆に見せる画面と手元画面を *分離できない*
        - レーザーポインターや手書き強調ができない
      ],
      stroke-col: rgb("#f87171"),
    ),
    info_card(
      "これまでの妥協運用",
      [
        - 原稿を別ウィンドウや印刷用紙・スマホで横に並べる
        - ストップウォッチを別に起動する
        - 本番中に目線があちこち散り、ページ送りもズレやすい
      ],
      stroke-col: rgb("#fbbf24"),
    ),
  )
]

// ===== Slide 3: コンセプト =====
#slide[
  #slide_header("コンセプト：スライド PDF + Markdown 原稿の疎結合運用")
  #v(0.15em)

  #align(center)[
    #rect(inset: 10pt, stroke: 1.8pt + accent, radius: 5pt, fill: card-bg)[
      #text(size: 1.05em, weight: "bold")[
        スライドは任意のツール → PDF ／ 原稿は `.md`（または `.pdfpc` / `.json`）
      ]
    ]
  ]
  #v(0.45em)

  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 0.8em,
    info_card(
      "1. 作成ツールを選ばない",
      [Typst・Marp・Slidev・Beamer・PPT の PDF に対応。PDF 注釈や添付ノートも自動抽出。],
    ),
    info_card(
      "2. 柔軟な Markdown",
      [`<!-- slide: N -->` や `---` に加え、Marp / Slidev ソース `.md` からの自動ノート抽出にも対応。],
    ),
    info_card(
      "3. PWA & デスクトップ",
      [サーバー不要でローカル完結。PWA でオフライン化し、Tauri v2 デスクトップ版も利用可能。],
    ),
  )
]

// ===== Slide 4: 機能1 2画面同期 =====
#slide[
  #slide_header("機能1：発表者コンソール ＆ 聴衆用ディスプレイの2画面同期")
  #v(0.15em)

  #table(
    columns: (0.95fr, 1.4fr),
    inset: 0.45em,
    align: (left, left),
    stroke: (x: none, y: 1pt + card-border),
    table.header([*画面 / 経路*], [*役割と仕組み*]),
    [*Presenter Console* (`#/`)], [現在スライド、次スライド予測、発表者スクリプト、タイマー、操作バーを集約],
    [*Audience Display* (#box[`#/audience`])], [純黒背景 `#000000` にスライドのみを表示（`F` で全画面・マルチモニタ指定対応）],
    [*リアルタイム同期*], [`BroadcastChannel` でページ遷移・カーテン・ポインター・手書きを即時同期],
    [*リロード耐性 ＆ 履歴*], [`IndexedDB`（直近5デッキ保存＆*Recent Decks* 一覧復元）で `F5` 時も即復旧],
  )
]

// ===== Slide 5: 機能2 発表者スクリプト =====
#slide[
  #slide_header("機能2：自分だけに表示できる発表者スクリプト")
  #v(0.15em)

  #grid(
    columns: (1.05fr, 0.95fr),
    gutter: 1em,
    [
      *Markdown ノートをスライドに連動表示*
      - `react-markdown` で見出し・太字・箇条書き・コードを整形表示
      - `A-` / `A+` ボタンで会場の距離に合わせて文字サイズ変更
      - 本番直前の言い回し修正も `E` キーでその場編集（自動保存）
      - Marp / Slidev ソース・`<!-- note: -->`・PDF 注釈抽出、`.md` / `.markdown` / `.json` / `.pdfpc` 入出力に対応
    ],
    info_card(
      "サンプル `.md` 記述例",
      [
        ```md
        <!-- slide: 1 -->
        <!-- target: 20 -->
        ### オープニング
        - まずは結論から話す
        - **重要ポイント**を強調
        ```
      ],
    ),
  )
]

// ===== Slide 6: 機能3 タイマーとリハーサル分析 =====
#slide[
  #slide_header("機能3：タイマー統合 ＆ リハーサル時間分析")
  #v(0.2em)

  #grid(
    columns: (1fr, 1fr),
    gutter: 1em,
    info_card(
      "全体の時間管理 ＆ ペース判定",
      [
        - 現在時刻（Wall Clock）＋ 経過時間（`Start` / `Pause` / `Reset`）
        - 残り時間カウントダウン（`Duration` 分指定 or `End Time HH:MM`）
        - `Warning` 警告・超過 `+MM:SS` 表示、スライド別ペース判定
      ],
    ),
    info_card(
      "リハーサル時間分析モーダル (R)",
      [
        - `R` キーで各スライドの滞在時間・訪問回数・目標差分を可視化
        - *Apply Actual as Targets* で実測値を目標秒数へ一括反映
        - 分析結果を `.md` / `.csv` レポートとして出力可能
      ],
      stroke-col: rgb("#34d399"),
    ),
  )
]

// ===== Slide 7: 機能4 ステージ制御＆ポインター =====
#slide[
  #slide_header("機能4：ステージ制御（B / W / F / Guard）＆ 強調")
  #set text(size: 15pt)
  #v(0.05em)

  #table(
    columns: (0.42fr, 0.72fr, 1.86fr),
    inset: (y: 0.34em, x: 0.4em),
    align: (center, left, left),
    stroke: (x: none, y: 1pt + card-border),
    table.header([*キー*], [*機能*], [*発表中の活用シーン*]),
    [`B` / `W`], [Blackout / Whiteout], [質疑や口頭補足時に聴衆画面を黒・白で覆い、視線を話者へ誘導],
    [`F`], [Freeze], [聴衆画面を今のスライドで固定したまま、手元だけ別スライドを確認],
    [`L`], [レーザーポインター], [座標を `[0..1]` 正規化して聴衆画面へ赤色でリアルタイム同期],
    [`D` / `H` / `C`], [5色ペン ＆ インク切替], [赤・青・黄・緑・白の5色、太さ `+/-`、`H` で一時非表示、`C` で消去],
    [`S` / `[` `]`], [スポットライト], [周辺を暗くして図表を強調。`[` / `]` キーでスポット半径を段階調整],
    [`Guard`], [誤リロード防止], [発表中の意図しないタブ閉じや `F5` リロードを離脱確認で保護],
  )
]

// ===== Slide 8: 機能5 ナビゲーション＆分割対応 =====
#slide[
  #slide_header("機能5：ナビゲーション・分割対応・履歴復元")
  #set text(size: 18pt)
  #v(0.15em)

  - *一覧サムネイルグリッド (`G` / `Tab`)*: 全スライドを一覧表示し、質疑応答で該当ページへ1クリック移動
  - *PDF アウトライン (`O`)*: Typst の `#heading` から生成された目次ツリーでセクションジャンプ
  - *クリッカブルリンク*: Typst 内の `#link(<label>)`（内部遷移）や外部 URL をそのままクリック可能
  - *Touying 分割ページ自動検出*: アスペクト比 `> 2.4` の 2画面PDFを検出し、#box[`Split L|R`] / #box[`Split T|B`]・#box[`Swap Halves`] に対応
  - *Recent Decks 履歴復元*: 初期画面に直近開いた最大5デッキを表示し、1クリックで復元・削除が可能
]

// ===== Slide 9: 実際の運用フロー =====
#slide[
  #slide_header("運用フロー：Watch ホットリロード ＆ 選べる実行環境")
  #v(0.2em)

  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 0.9em,
    info_card(
      "Step 1: Watch 自動更新",
      [
        Typst / Marp 出力 PDF を *Watch PDF* で監視し、`typst watch` や `marp -w` の再ビルドを自動リロード。
      ],
    ),
    info_card(
      "Step 2: D&D ＆ 履歴復元",
      [
        PDF と `.md` を D&D（Marp / Slidev ソースも直接読込可）。開いた資料は *Recent Decks* から即復元。
      ],
    ),
    info_card(
      "Step 3: 最適な環境で発表",
      [
        Web / オフライン PWA に加え、Tauri v2 デスクトップ版で外部モニタを選択して全画面投影。
      ],
    ),
  )
  #v(0.45em)
  #align(center)[
    #text(size: 0.85em, fill: white.darken(15%))[
      ※ File System Access API の監視により、更新時も現在ページ・ノート・タイマー・ペン描線を保って反映
    ]
  ]
]

// ===== Slide 10: まとめ =====
#slide[
  #slide_header("まとめ：PDF スライドの発表体験を1つの画面に")
  #set text(size: 17pt)
  #v(0.15em)

  - *Typst ＆ 汎用 PDF の発表体験を統合*: 原稿・タイマー・分析（`R`）・5色ペン・スポットライト・保護（`Guard`）を完備
  - *柔軟なノート ＆ ライブ更新*: `.md` / `.markdown` / `.json` / `.pdfpc` に加え Marp / Slidev 抽出・PDF 注釈抽出と `Watch PDF` 自動更新に対応
  - *Web / PWA / Tauri v2 でどこでも動作*: ブラウザ即試用、オフライン PWA、マルチディスプレイ対応の Tauri デスクトップアプリとして提供

  #v(0.65em)
  #align(center)[
    #rect(inset: 10pt, stroke: 1.5pt + accent, radius: 5pt, fill: card-bg)[
      #text(size: 1.15em, weight: "bold")[ご清聴ありがとうございました！] \
      #text(size: 0.8em, fill: white.darken(20%))[Web / PWA / Tauri デスクトップアプリとして今すぐお試しいただけます]
    ]
  ]
]
