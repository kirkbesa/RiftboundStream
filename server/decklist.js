// server/decklist.js — parse a pasted Riftbound decklist into resolved sections.
//
// A Riftbound deck isn't just main + sideboard. It's:
//
//   Legend        1 card   — the champion identity (Azir, Emperor of the Sands)
//   Champion      1 card   — the chosen champion Unit that pairs with it
//   Main deck     39 cards — 40 including the champion
//   Battlefields  3 cards
//   Runes         12 cards — the rune deck (Calm Rune ×6, Order Rune ×6)
//   Sideboard     up to 8
//
// Deckbuilders and tournament pages export these as labelled sections, so the
// parser reads the labels:
//
//   Legend:                 Legend: Azir, Emperor of the Sands   ← inline form
//   1 Azir, Emperor of…     Champion: Azir, Sovereign
//   Champion:               Main Deck:
//   1 Azir, Sovereign       3 Arise!
//   Main Deck:              …
//   3 Arise!
//   Battlefields:  /  Runes:  /  Sideboard:
//
// Lists that arrive WITHOUT labels (a plain "count name" dump) still come out
// right: after resolution, any main-deck card whose TYPE is Legend, Battlefield
// or Rune is moved to its section. The type is authoritative — a rune sitting
// under "Main Deck" is still a rune. The champion is the one thing type can't
// tell apart from any other Unit, so without a Champion label it's guessed (see
// guessChampion) — the overlay would rather show a likely champion than none.
//
// Sideboard detection, in priority order:
//   1. An explicit section header ("Sideboard", "SB:", "// Sideboard")
//   2. A per-line "SB:" prefix
//   3. Failing both, the first blank line after the main deck has started
//
// (3) is a heuristic and only fires when the list has no labels at all —
// otherwise a list that merely separates its sections (or groups units/spells)
// with blank lines would have everything after the first gap read as sideboard.

import { resolveByDisplayName, getCardsByNames, normalize } from './riftbound.js'

// "Legend", "Champion Unit", "Main Deck", "Battlefields", "Rune Pool",
// "Sideboard" — with an optional "//" in front, an optional ":" after, and for
// the single-card sections, an optional card inline ("Legend: Azir, …").
const SECTION_HEADERS = [
  ['legend',       /legends?/],
  ['champion',     /(?:chosen\s*)?champion(?:\s*units?)?/],
  ['battlefields', /battle\s*-?\s*fields?/],
  ['runes',        /runes?(?:\s*(?:pool|deck))?/],
  ['side',         /side\s*-?\s*board|side/],
  ['main',         /main\s*-?\s*(?:board|deck)?|deck/],
]
const RE_HEADER = new RegExp(
  `^(?:\\/\\/\\s*)?(${SECTION_HEADERS.map(([, re]) => `(${re.source})`).join('|')})\\b\\s*(?::\\s*(.*))?$`,
  'i',
)
// Headers we skip entirely — deckbuilder exports emit these but they aren't cards.
const RE_SKIP_HEADER = /^(\/\/\s*)?(about|name|format)\b\s*:?\s*$/i
const RE_SB_PREFIX   = /^SB:\s*/i

// "3 Arise! (OGN) 146" / "3x Arise! [OGN]" / "3 Arise!"
// Set code and collector number are captured only so they can be discarded —
// we always resolve by name and let the card API pick the printing.
const RE_LINE = /^(\d+)\s*x?\s+(.+?)\s*(?:[([][A-Za-z0-9_]{2,6}[)\]]\s*\S*)?\s*$/

// Which section a header line opens, plus any card written inline after it.
function matchHeader(line) {
  const m = line.match(RE_HEADER)
  if (!m) return null
  // Groups 2..n are the per-section alternatives; the first one that matched
  // names the section. The last group is the inline remainder.
  const section = SECTION_HEADERS.find((_, i) => m[i + 2] !== undefined)?.[0]
  return section ? { section, inline: (m[SECTION_HEADERS.length + 2] ?? '').trim() } : null
}

// A card line, or — inline after a header only — a bare name meaning 1 copy.
function parseEntry(body, { allowBare = false } = {}) {
  const m = body.match(RE_LINE)
  if (m) return { count: parseInt(m[1], 10), rawName: m[2].trim() }
  return allowBare && body ? { count: 1, rawName: body } : null
}

export function parseDecklist(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim())

  const hasExplicitSide = lines.some(l => matchHeader(l)?.section === 'side' || RE_SB_PREFIX.test(l))
  const hasAnyHeader    = lines.some(l => matchHeader(l))

  const sections = { legend: [], champion: [], main: [], battlefields: [], runes: [], side: [] }
  let section = 'main'
  let seenMain = false

  for (const line of lines) {
    if (!line) {
      // Blank-line sideboard split — only when the list gave us nothing better.
      if (!hasExplicitSide && !hasAnyHeader && seenMain) section = 'side'
      continue
    }

    const header = matchHeader(line)
    if (header) {
      section = header.section
      // "Legend: Azir, Emperor of the Sands" — the card rides on the header line.
      const inline = parseEntry(header.inline, { allowBare: true })
      if (inline) sections[section].push(inline)
      continue
    }
    if (RE_SKIP_HEADER.test(line)) continue
    if (line.startsWith('//'))     continue   // comment

    // Per-line "SB:" wins over the current section.
    const isSbLine = RE_SB_PREFIX.test(line)
    const entry = parseEntry(isSbLine ? line.replace(RE_SB_PREFIX, '') : line)
    if (!entry?.rawName || !Number.isFinite(entry.count)) continue   // unparseable — skip, don't fail

    const target = isSbLine ? 'side' : section
    sections[target].push(entry)
    if (target === 'main') seenMain = true
  }

  return sections
}

const toRow = (count, card) => ({
  count,
  identifier: card.identifier,
  name:       card.name,
  type:       card.type,
  domain:     card.domain,
  domainColor: card.domainColor,
  energy:     card.energy,
  might:      card.might,
  rarity:     card.rarity,
  imageUrl:   `/cards/${card.identifier}`,
})

// Resolve parsed entries to { count, card } using an already-fetched name→card
// map, falling back to a per-card fuzzy lookup for anything the batch missed (a
// typo, or a name only fuzzy matching can rescue).
//
// Cards that still don't resolve are kept in `unresolved` with suggestions
// rather than dropped: a silently-missing card in a deck reveal is worse than a
// visible error.
async function resolveEntries(entries, byName, section) {
  const found = []
  const unresolved = []

  for (const { count, rawName } of entries) {
    const card = byName.get(normalize(rawName))
    if (card) {
      found.push({ count, card })
      continue
    }

    const { card: fuzzy, suggestions } = await resolveByDisplayName(rawName)
    if (fuzzy) found.push({ count, card: fuzzy })
    else       unresolved.push({ count, rawName, section, suggestions })
  }

  return { found, unresolved }
}

// "Azir - Emperor of the Sands" / "Azir, Sovereign" → "azir". Legends and their
// champion units share the champion's name before the title.
const championKey = (name) => normalize(String(name ?? '').split(/,|\s[-–—]\s/)[0])

// No Champion label: take the first main-deck Unit named for the legend's
// champion (an Azir deck's "Azir, Sovereign"), and move ONE copy of it out of
// the main deck — an unlabelled list counts the chosen champion among its 40,
// and `main` is always the other 39 (see resolveDecklist).
function takeChampion(legend, main) {
  if (!legend) return null
  const key = championKey(legend.name)
  const i = main.findIndex(({ card }) => card.type === 'Unit' && championKey(card.name) === key)
  if (i < 0) return null

  const { card } = main[i]
  if (--main[i].count === 0) main.splice(i, 1)
  return card
}

// Returns the fully-resolved decklist that gets stored directly in state:
//
//   { legend, champion,        — full card objects (the same shape the panel's
//     battlefields,               card pickers store), or null / []
//     main, runes, side,       — { count, …card } rows for list display
//     unresolved }
//
// `main` never includes the chosen champion: a legal deck is main (39) +
// champion (1) = 40. Count it that way (mainDeckCount in the panel's riftbound.jsx).
//
// Every name in the list is fetched in ONE batched request before anything is
// resolved. Doing a request per card instead gets a bulk roster import
// rate-limited, and a throttled card is a card missing from the deck reveal.
export async function resolveDecklist(text) {
  const parsed = parseDecklist(text)

  const names  = Object.values(parsed).flat().map(e => e.rawName)
  const byName = await getCardsByNames(names)

  const res = {}
  const unresolved = []
  for (const [section, entries] of Object.entries(parsed)) {
    const r = await resolveEntries(entries, byName, section)
    res[section] = r.found
    unresolved.push(...r.unresolved)
  }

  // Route by card type: a Legend, Battlefield or Rune is never a main-deck card,
  // whatever section the list happened to put it in.
  const main = []
  for (const e of res.main) {
    if      (e.card.type === 'Legend')      res.legend.push(e)
    else if (e.card.type === 'Battlefield') res.battlefields.push(e)
    else if (e.card.type === 'Rune')        res.runes.push(e)
    else                                    main.push(e)
  }

  const legend   = res.legend[0]?.card ?? null
  const champion = res.champion[0]?.card ?? takeChampion(legend, main)

  return {
    legend,
    champion,
    battlefields: res.battlefields.map(e => e.card),
    main:         main.map(e => toRow(e.count, e.card)),
    runes:        res.runes.map(e => toRow(e.count, e.card)),
    side:         res.side.map(e => toRow(e.count, e.card)),
    unresolved,
  }
}
