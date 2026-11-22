#set page(width: 508mm, height: 142.875mm, margin: 12mm)
#set text(font: ("BIZ UDPGothic", "Yu Gothic", "DejaVu Sans Mono"), size: 16pt)

#grid(
  columns: (1fr, 1fr),
  gutter: 24mm,
  [
    = Split Horizontal Slide 1
    Left half contains the audience slide content.
    #v(0.5em)
    #link("https://left.example.com")[Left External Link]
  ],
  [
    = Speaker Notes (Page 1)
    Right half contains private presenter notes.
    #v(0.5em)
    #link("https://right.example.com")[Right External Link]
  ],
)

#pagebreak()

#grid(
  columns: (1fr, 1fr),
  gutter: 24mm,
  [
    = Split Horizontal Slide 2
    Second slide left panel.
  ],
  [
    = Speaker Notes (Page 2)
    Second slide right panel.
  ],
)
