// Local copy of ../../typst/presenter-notes.typ for standalone compilation without `--root`.
// =============================================================================
// Typst Presenter — Single-file speaker notes & config helper
// Compatible with Typst 0.12 - 0.15+ (uses `type(x) == str`, not `"string"`).
//
// Usage:
//   #import "presenter-notes.typ": enable-presenter-notes, presenter-config, speaker-note
//   #show: enable-presenter-notes
//   #presenter-config(duration: 10, last-minutes: 2, qr-url: "https://example.com")
//   #speaker-note(target: 30)[Opening remarks]
// =============================================================================

#let _extract-note-text(body) = {
  if type(body) == str {
    return body
  }
  if type(body) != content {
    return repr(body)
  }
  if body.func() == raw {
    return body.text
  }
  if body.has("text") and type(body.text) == str {
    return body.text
  }
  if body.has("children") {
    return body.children.map(_extract-note-text).join("")
  }
  if body.has("body") {
    return _extract-note-text(body.body)
  }
  if body.func() == linebreak or body.func() == parbreak {
    return "\n"
  }
  if body.func() == [ ].func() {
    return " "
  }
  ""
}

#let presenter-config(
  duration: none,
  last-minutes: none,
  end-time: none,
  note-font-size: none,
  qr-url: none,
  qr-label: none,
) = {
  [#metadata((
    duration: duration,
    lastMinutes: last-minutes,
    endTime: end-time,
    noteFontSize: note-font-size,
    qrUrl: qr-url,
    qrLabel: qr-label,
  )) <typst-presenter-config>]
}

#let speaker-note(body, target: none) = {
  let text-body = _extract-note-text(body).trim()
  [#metadata((markdown: text-body, targetSeconds: target)) <typst-presenter-note>]
}

#let enable-presenter-notes(doc) = {
  // Emit pdf.attach BEFORE `doc` so Polylux/Touying slide counters and pages are unaffected.
  context {
    let notes = query(<typst-presenter-note>)
    let configs = query(<typst-presenter-config>)
    let slides = (:)

    for item in notes {
      let p = str(item.location().page())
      let val = item.value
      let existing = slides.at(p, default: none)
      let md = if existing != none and existing.markdown != "" and val.markdown != "" {
        existing.markdown + "\n\n" + val.markdown
      } else if val.markdown != "" {
        val.markdown
      } else if existing != none {
        existing.markdown
      } else {
        ""
      }

      let target = if val.targetSeconds != none {
        val.targetSeconds
      } else if existing != none {
        existing.at("targetSeconds", default: none)
      } else {
        none
      }

      let entry = (markdown: md)
      if target != none {
        entry.insert("targetSeconds", target)
      }
      slides.insert(p, entry)
    }

    let payload = (version: 1, slides: slides)
    for cfg-item in configs {
      let c = cfg-item.value
      if c.duration != none { payload.insert("globalTargetSeconds", c.duration * 60) }
      if c.lastMinutes != none { payload.insert("lastMinutesWarning", c.lastMinutes) }
      if c.endTime != none { payload.insert("endTimeHHMM", c.endTime) }
      if c.noteFontSize != none { payload.insert("noteFontSizePx", c.noteFontSize) }
      if c.qrUrl != none { payload.insert("qrUrl", c.qrUrl) }
      if c.qrLabel != none { payload.insert("qrLabel", c.qrLabel) }
    }

    if slides.len() > 0 or configs.len() > 0 {
      pdf.attach("typst-presenter-notes.json", bytes(json.encode(payload)))
    }
  }
  doc
}
