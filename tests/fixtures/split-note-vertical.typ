#set page(width: 254mm, height: 285.75mm, margin: 12mm)
#set text(font: ("BIZ UDPGothic", "Yu Gothic", "DejaVu Sans Mono"), size: 16pt)

#grid(
  rows: (1fr, 1fr),
  gutter: 24mm,
  [
    = Split Vertical Slide 1
    Top half contains the audience slide content.
    #v(0.5em)
    #link("https://top.example.com")[Top External Link]
  ],
  [
    = Speaker Notes (Page 1)
    Bottom half contains private presenter notes.
    #v(0.5em)
    #link("https://bottom.example.com")[Bottom External Link]
  ],
)

#pagebreak()

#grid(
  rows: (1fr, 1fr),
  gutter: 24mm,
  [
    = Split Vertical Slide 2
    Second slide top panel.
  ],
  [
    = Speaker Notes (Page 2)
    Second slide bottom panel.
  ],
)
