// control/src/riftbound.jsx — Riftbound display primitives for the control
// panel. These mirror the accent colours in server/riftbound.js and
// overlays/riftbound.js so the panel's preview of a card matches what goes to air.

// Riftbound's six domains + their broadcast accent colours. Keep in step with
// DOMAIN_COLORS in server/riftbound.js.
export const DOMAIN_COLORS = {
  Fury:      '#e2413a',
  Body:      '#f0902f',
  Mind:      '#3f8fd6',
  Calm:      '#3fae5a',
  Chaos:     '#9b5cc7',
  Order:     '#e0b23a',
  Multi:     '#c89b3c',
  Colorless: '#9aa3ab',
}

export const domainColor = (d) => DOMAIN_COLORS[d] ?? DOMAIN_COLORS.Colorless

// The main deck's card types, in the order a decklist reads. Legend, Champion,
// Battlefields and Runes are never in `main` — a resolved decklist keeps them in
// their own fields (server/decklist.js) — but they're coloured below too.
export const TYPE_ORDER = ['Unit', 'Spell', 'Gear', 'Token']

export const TYPE_COLORS = {
  Legend:      '#e0b23a',
  Champion:    '#e0902f',
  Unit:        '#c9704f',
  Spell:       '#3b82c4',
  Gear:        '#9aa3ab',
  Rune:        '#7c8b9a',
  Battlefield: '#3f9b52',
  Token:       '#8b6f47',
}

export const typeColor = (t) => TYPE_COLORS[t] ?? '#9aa3ab'

export const plural = (type, n) =>
  n === 1 ? type : `${type}s`

// Small numeric energy badge — a card's resource cost.
export function EnergyBadge({ energy, size = 15 }) {
  if (energy == null) return null
  return (
    <span
      className="energy-badge"
      style={{
        width: size + 4, height: size + 4, fontSize: Math.round(size * 0.72),
      }}
    >
      {energy}
    </span>
  )
}

export function groupByType(rows) {
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
  for (const entry of groups) ordered.push(entry)
  return ordered
}

// Sort a section the way a player reads their list: the 3-ofs that define the
// deck first, then up the energy curve.
export const sortDeckRows = (rows) =>
  [...rows].sort((a, b) =>
    b.count - a.count || (a.energy ?? 0) - (b.energy ?? 0) || a.name.localeCompare(b.name)
  )

// A Riftbound main deck is 40 cards counting the chosen champion, but a resolved
// decklist keeps the champion in its own field (server/decklist.js) — so the 40
// is main + 1. Decklists imported before that split have no champion field and
// count as they are.
export const mainDeckCount = (deck) =>
  (deck?.main ?? []).reduce((n, r) => n + r.count, 0) + (deck?.champion ? 1 : 0)

// "Azir - Emperor of the Sands" / "Azir, Sovereign" → "azir". A Legend and the
// champion Units that pair with it share the champion's name before the title
// (mirrors championKey in server/decklist.js).
export const championKey = (name) =>
  String(name ?? '').split(/,|\s[-–—]\s/)[0].toLowerCase().replace(/[^a-z0-9]/g, '')

// The cards a player's own decklist offers for each identity slot, so the
// operator picks from a short dropdown instead of searching the whole card pool
// mid-match. Decklists imported before the parser understood sections kept
// their Legend and Battlefields in `main`, so those are read back out by type.
export function identityOptions(deck) {
  const main = deck?.main ?? []
  const card = ({ count, ...c }) => c          // a list row → a plain card
  const uniq = (cards) => {
    const seen = new Set()
    return cards.filter(c => c && !seen.has(c.identifier) && seen.add(c.identifier))
  }

  const legends = uniq([deck?.legend, ...main.filter(r => r.type === 'Legend').map(card)])
  const key     = championKey(legends[0]?.name)

  return {
    legends,
    // The chosen champion, plus any main-deck Unit of the same champion — the
    // deck can run a second version of them.
    champions: uniq([
      deck?.champion,
      ...main.filter(r => key && r.type === 'Unit' && championKey(r.name) === key).map(card),
    ]),
    battlefields: uniq([
      ...(deck?.battlefields ?? []),
      ...main.filter(r => r.type === 'Battlefield').map(card),
    ]),
  }
}
