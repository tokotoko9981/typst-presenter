#set page(width: 160mm, height: 90mm, margin: 12mm, numbering: "1")
#set text(font: ("Meiryo", "Yu Gothic", "Segoe UI"), size: 15pt, lang: "ja")

#pdf.attach(
  "embedded-notes.json",
  relationship: "supplement",
  mime-type: "application/json",
  description: "Presio-style embedded speaker notes JSON",
)

= Presio Embedded Notes Slide 1
PDF内部にJSONノートを添付したスライド（1 / 3）。
#pagebreak()
= Presio Embedded Notes Slide 2
`getAttachments()` による埋め込みノート抽出の検証（2 / 3）。
#pagebreak()
= Presio Embedded Notes Slide 3
最終スライド（3 / 3）。
