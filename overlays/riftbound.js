// overlays/riftbound.js — Riftbound rendering primitives shared by the overlays
// and the commentator page.
//
// Loaded the same way as ws.js:
//   <script src="/overlays/riftbound.js"></script>
//
// Exposes window.RB with:
//   DOMAIN_COLORS    domain → accent hex (keep in step with server/riftbound.js)
//   TYPE_ORDER       the order a decklist groups card types in
//   typeColor(t)     accent colour for a card type
//   domainColor(d)   accent colour for a domain label
//   curve(rows)      decklist rows → energy-curve buckets
//   domainBreakdown(rows) → card counts per domain across a decklist
//   groupByType(rows), sortRows(rows), plural(type, n)
//   displayName(n)   "Azir - Sovereign" → "Azir, Sovereign" (as printed)
//   mainCount(deck)  main deck size, counting the chosen champion (40)
//   MAX_COPIES       copies of one card a deck may run — the "core" highlight

;(function () {
  const DOMAIN_COLORS = {
    Fury:      '#e2413a',
    Body:      '#f0902f',
    Mind:      '#3f8fd6',
    Calm:      '#3fae5a',
    Chaos:     '#9b5cc7',
    Order:     '#e0b23a',
    Multi:     '#d4af37',
    Colorless: '#9aa3ab',
  }

  // The main deck's card types, in the order a decklist reads. Legend, Champion,
  // Battlefields and Runes are never in `main` — a resolved decklist keeps them
  // in their own fields (server/decklist.js) — but they're coloured here too.
  const TYPE_ORDER = ['Unit', 'Spell', 'Gear', 'Token']

  const TYPE_COLORS = {
    Legend:      '#e0b23a',
    Champion:    '#e0902f',
    Unit:        '#c9704f',
    Spell:       '#3b82c4',
    Gear:        '#9aa3ab',
    Rune:        '#7c8b9a',
    Battlefield: '#3f9b52',
    Token:       '#8b6f47',
  }

  const MAX_COPIES = 3

  const typeColor   = (type) => TYPE_COLORS[type] ?? '#9aa3ab'
  const domainColor = (d)    => DOMAIN_COLORS[d]  ?? DOMAIN_COLORS.Colorless

  // Energy curve over the main deck. 7+ is one bucket, as deckbuilders show it.
  function curve(rows) {
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0]   // index = energy, 7 = "7+"
    for (const r of rows) {
      const e = Math.max(0, Math.round(r.energy ?? 0))
      buckets[Math.min(e, 7)] += r.count
    }
    return buckets
  }

  // Cards per domain. A dual-domain card counts toward its "Multi" label rather
  // than twice, so the slices always add up to the deck size.
  function domainBreakdown(rows) {
    const out = {}
    for (const r of rows) {
      const d = r.domain || 'Colorless'
      out[d] = (out[d] ?? 0) + r.count
    }
    return out
  }

  // Group decklist rows by type, in TYPE_ORDER; anything unexpected goes last.
  function groupByType(rows) {
    const groups = new Map()
    for (const r of rows) {
      const t = r.type || 'Other'
      if (!groups.has(t)) groups.set(t, [])
      groups.get(t).push(r)
    }
    const ordered = []
    for (const t of TYPE_ORDER) {
      if (groups.has(t)) { ordered.push([t, groups.get(t)]); groups.delete(t) }
    }
    for (const [t, rows] of groups) ordered.push([t, rows])
    return ordered
  }

  // How a player reads their own list: the 3-ofs that define the deck first,
  // then up the energy curve.
  const sortRows = (rows) =>
    [...rows].sort((a, b) =>
      b.count - a.count || (a.energy ?? 0) - (b.energy ?? 0) || a.name.localeCompare(b.name))

  const plural = (type, n) => (n === 1 ? type : `${type}s`)

  const displayName = (name) => String(name ?? '').replace(/\s+[-–—]\s+/, ', ')

  // main (39) + the chosen champion (1) = 40.
  const mainCount = (deck) =>
    (deck?.main ?? []).reduce((n, r) => n + r.count, 0) + (deck?.champion ? 1 : 0)

  window.RB = {
    DOMAIN_COLORS, TYPE_ORDER, TYPE_COLORS, MAX_COPIES,
    typeColor, domainColor, curve, domainBreakdown, groupByType, sortRows,
    plural, displayName, mainCount,
  }
})()
