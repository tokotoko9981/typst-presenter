#set page(paper: "presentation-16-9", margin: 16mm, numbering: "1 / 1")
#set text(font: ("BIZ UDPGothic", "Yu Gothic", "DejaVu Sans Mono"), size: 16pt)

#pdf.attach(
  "notes.json",
  bytes(json.encode((slides: ("1": "Page 1 embedded note", "2": "Page 2 embedded note")))),
  mime-type: "application/json",
  description: "Speaker notes",
)

= Embedded Notes Page 1 <p1>

Testing `#pdf.attach` extraction and links.

#link("https://example.com")[External] | #link(<p2>)[Go to 2]

#pagebreak()

= Embedded Notes Page 2 <p2>

Second page target for internal link test.
