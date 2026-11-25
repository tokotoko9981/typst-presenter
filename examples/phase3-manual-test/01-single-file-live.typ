// Phase 3 Manual Test 01: Single-File Embedded Notes + Live Compile Guard + Provenance Hot-Reload
#import "presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note

#show: enable-presenter-notes
#presenter-config(
  duration: 5,
  last-minutes: 1,
  end-time: "15:00",
  note-font-size: 18,
  qr-url: "https://example.com/phase3-test",
  qr-label: "Phase 3 テスト資料",
)

#let build-mode = sys.inputs.at("mode", default: "default")

#let mainfont = ("BIZ UDPGothic", "Yu Gothic", "Meiryo", "Noto Sans JP")
#let codefont = ("Consolas", "DejaVu Sans Mono", "BIZ UDGothic")
#let accent = rgb("#1d4ed8")
#let accent-soft = rgb("#eff6ff")
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
      [#text(weight: "bold", fill: accent)[Phase 3 Test 01] — Single-File & Live Compile #h(1fr) #counter(page).display("1 / 1", both: true)],
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
#speaker-note(target: 30, "## Slide 1: 単一ファイル構成の確認

- 目標時間: 30 秒（全体 5 分 / 残り 1 分警告 / 終了時刻 15:00）
- ノート文字サイズ: 18px
- QR URL: `https://example.com/phase3-test`
- `--input mode=rehearsal` を指定して再コンパイルすると、右上のバッジが変化します。")

#grid(
  columns: (1fr, auto),
  align: (left, right),
  [
    #text(size: 11pt, weight: "bold", fill: accent)[PHASE 3 MANUAL TEST · 01]
  ],
  [
    #box(
      inset: (x: 8pt, y: 4pt),
      radius: 4pt,
      fill: accent-soft,
      stroke: 0.7pt + accent,
      text(size: 10.5pt, weight: "bold", fill: accent)[mode: #build-mode],
    )
  ],
)
#v(0.3em)
= 1. 単一ファイル動作テスト (`#pdf.attach`)
#v(0.5em)
#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  card("埋め込み設定 (#presenter-config)", [
    - `duration: 5`（全体 5:00）
    - `last-minutes: 1`（残り 1 分警告）
    - `end-time: "15:00"`
    - `note-font-size: 18`
  ]),
  card("確認ポイント", [
    - Web: `01-single-file-live.pdf` をドロップ
    - Tauri: `01-single-file-live.typ` を直接選択
    - `--input mode=rehearsal` で右上の `mode:` 表示が切り替わること
  ]),
)

#pagebreak()

// ============================================================
// Slide 2
// ============================================================
#speaker-note(target: 45, "## Slide 2: 手動編集（manual）保護テスト

1. Presenter UI でこのノートを少し編集して保存してください（provenance が `manual` になります）。
2. 次に `.typ` ファイルを編集・保存してホットリロードを走らせます。
3. このスライドの手動編集内容が上書きされずに残ることを確認します。")

= 2. Provenance Hot-Reload（手動編集の保護）
#v(0.5em)
#card("テスト手順（Slide 2）", [
  1. Presenter Console のノート欄で *Slide 2 のノートを編集* する（`manual` 状態にする）。
  2. エディタで `01-single-file-live.typ` を編集・保存してホットリロードを発生させる。
  3. *Slide 2 の手動編集は維持され*、次ページ（Slide 3）の `embedded` ノートだけが自動更新されることを確認する。
])

#pagebreak()

// ============================================================
// Slide 3
// ============================================================
#speaker-note(target: 60, "## Slide 3: 自動更新（embedded）& Live Compile Guard

- このテキストを `.typ` 側で書き換えて保存すると、Presenter UI 上に即座に反映されます（`embedded`）。
- 下のコメントアウトされた構文エラー行を外して保存すると、Live Compile Guard の挙動を確認できます。")

= 3. 自動更新 & Live Compile Guard
#v(0.5em)
#card("エラー耐性（Live Compile Guard）テスト", [
  1. 下の構文エラー行のコメント `//` を外して保存する。
  2. 直前の正常な PDF 表示・タイマーが維持され、Typst Drawer に行番号・列番号付き診断が出ることを確認する。
  3. コメントを戻して保存すると、即座に正常状態へ復帰する。
])

// Live Compile Guard テスト用（コメントを外して保存すると構文エラーになります）:
// #broken-syntax-for-live-guard(

#pagebreak()

// ============================================================
// Slide 4
// ============================================================
#speaker-note(target: 30, "## Slide 4: QR オーバーレイ & Close Guard

- `Q` キーで QR オーバーレイを表示し、`Phase 3 テスト資料` が表示されることを確認してください。
- タイマー再生中にアプリウィンドウを閉じようとすると Close Guard ダイアログが出ます。")

= 4. QR オーバーレイ & Close Guard テスト
#v(0.5em)
#grid(
  columns: (1fr, 1fr),
  gutter: 14pt,
  card("QR オーバーレイ (Q キー)", [
    - `#presenter-config` で指定した URL とラベルが Audience 側へ同期表示される。
    - URL: `https://example.com/phase3-test`
  ]),
  card("Close Guard (Tauri)", [
    - タイマー稼働中にウィンドウを閉じると確認ダイアログが表示される。
    - キャンセルで継続、確定でアプリ終了。
  ]),
)
