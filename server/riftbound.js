// server/riftbound.js — Riftbound card data via the Riftcodex API, with a disk
// cache. The lookup surface the rest of the server uses:
//
//   searchCards(query, limit)   → Card[]        (name search, for the panel)
//   getCard(identifier)         → Card | null   (by Riftcodex id or exact name)
//   getCardsByNames(names)      → Map(normalizedName → Card)
//   resolveByDisplayName(name)  → { card, suggestions }
//   resolveImagePath(identifier)→ '/cards/<id>' | null
//
// Riftcodex (https://riftcodex.com) is a free, no-auth REST API for Riot's
// Riftbound TCG (fuzzy name lookup, full-text search, card images). Two things make this safe to run at a live event:
//
//   1. Everything is cached to disk (.cache/cards/*.json, .cache/img/*.png).
//      Once a card has been looked up it never needs the network again, so a
//      venue Wi-Fi drop mid-match cannot blank an overlay that already showed a
//      card. Seating a player and picking their legend/champion/battlefield
//      warms the cache the moment it happens.
//
//   2. Requests are serialised through a small queue with retry/backoff, so a
//      burst of lookups can't trip rate limiting or drop a card.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT       = join(__dirname, '..')
const CACHE_DIR  = join(ROOT, '.cache')
const CARDS_DIR  = join(CACHE_DIR, 'cards')
const IMG_DIR    = join(CACHE_DIR, 'img')

// Overridable so an operator can point at a mirror without editing code.
const API = process.env.RIFTBOUND_API ?? 'https://api.riftcodex.com'

const HEADERS = {
  'User-Agent': 'RiftboundStream/1.0 (broadcast overlay tool)',
  'Accept':     'application/json',
}

// Riftbound has no per-format card legality to check, so "format" is just a
// label for the UI and logs. Set it to the set you're covering, or leave it as
// the game name.
const FORMAT = process.env.RIFTBOUND_SET ?? 'Riftbound'
export function getFormat() { return FORMAT }

// ── Domains ──────────────────────────────────────────────────────
// Riftbound's six domains, each with a broadcast accent colour, used to tint
// each side of the overlays and the panel's card chips. A card in two domains
// is labelled "Multi". Keep in step with overlays/riftbound.js and the panel's
// control/src/riftbound.jsx.
export const DOMAIN_COLORS = {
  Fury:      '#e2413a',   // red
  Body:      '#f0902f',   // orange
  Mind:      '#3f8fd6',   // blue
  Calm:      '#3fae5a',   // green
  Chaos:     '#9b5cc7',   // purple
  Order:     '#e0b23a',   // yellow
  Multi:     '#c89b3c',   // gold
  Colorless: '#9aa3ab',
}

function domainLabel(domains) {
  if (!domains || domains.length === 0) return 'Colorless'
  if (domains.length > 1) return 'Multi'
  return domains[0]
}

// ── Rate-limited request queue ───────────────────────────────────
const MIN_GAP_MS = 80
let chain = Promise.resolve()
const sleep = ms => new Promise(r => setTimeout(r, ms))

function enqueue(fn) {
  const run = chain.then(fn)
  chain = run.then(() => sleep(MIN_GAP_MS), () => sleep(MIN_GAP_MS))
  return run
}

const MAX_RETRIES = 4

async function request(path) {
  return enqueue(async () => {
    let wait = 400
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let res
      try {
        res = await fetch(`${API}${path}`, { headers: HEADERS })
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err
        await sleep(wait); wait *= 2
        continue
      }

      if (res.status === 404) return null
      if (res.ok) return res.json()

      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt === MAX_RETRIES) {
        throw new Error(`Riftcodex ${res.status} on ${path}`)
      }
      const after = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : wait)
      wait *= 2
    }
  })
}

// Riftcodex list/search endpoints return { items, total, page, size, pages };
// the by-id endpoint returns a bare card object. Normalise both to an array.
function itemsOf(data) {
  if (!data) return []
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data)) return data
  return [data]
}

// ── Card normalisation ───────────────────────────────────────────
// Bump when the shape changes — cached JSON with an older version is ignored on
// load and silently refetched.
const CACHE_VERSION = 1

function normalizeCard(raw) {
  if (!raw) return null
  const cls    = raw.classification ?? {}
  const attr   = raw.attributes ?? {}
  const domains = cls.domain ?? []

  return {
    _v:          CACHE_VERSION,
    identifier:  raw.id,                     // Riftcodex id — stable, unique
    riftboundId: raw.riftbound_id ?? '',
    name:        raw.name ?? '',

    type:        cls.type ?? '',             // Legend | Unit | Spell | Gear | Battlefield | Rune …
    supertype:   cls.supertype ?? '',
    rarity:      cls.rarity ?? '',
    domains,                                 // ['Fury', 'Body']
    domain:      domainLabel(domains),       // single label the overlays tint by
    domainColor: DOMAIN_COLORS[domainLabel(domains)] ?? DOMAIN_COLORS.Colorless,

    energy:      attr.energy ?? null,        // resource cost
    might:       attr.might  ?? null,
    power:       attr.power  ?? null,

    setName:     raw.set?.label  ?? '',
    setCode:     raw.set?.set_id ?? '',
    number:      raw.collector_number ?? null,
    orientation: raw.orientation ?? 'portrait',   // battlefields are 'landscape'

    text:        raw.text?.plain ?? '',
    flavour:     raw.text?.flavour ?? '',
    artist:      raw.media?.artist ?? '',

    imageUrl:    raw.id ? `/cards/${raw.id}` : null,   // served from our cache
    _img:        raw.media?.image_url ?? null,
  }
}

// ── Disk cache ───────────────────────────────────────────────────
const memCards  = new Map()  // id → Card
const memByName = new Map()  // normalized name → Card

export function normalize(str) {
  return String(str ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function cardPath(id) { return join(CARDS_DIR, `${id}.json`) }
function imgPath(id)  { return join(IMG_DIR,   `${id}.png`) }

function ensureDirs() {
  for (const d of [CACHE_DIR, CARDS_DIR, IMG_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
}

function remember(card) {
  if (!card) return card
  memCards.set(card.identifier, card)
  memByName.set(normalize(card.name), card)
  try {
    writeFileSync(cardPath(card.identifier), JSON.stringify(card), 'utf8')
  } catch (err) {
    console.warn('[riftbound] cache write failed:', err.message)
  }
  cacheImage(card)
  return card
}

export function loadCards() {
  ensureDirs()
  let n = 0, stale = 0
  for (const f of readdirSync(CARDS_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const card = JSON.parse(readFileSync(join(CARDS_DIR, f), 'utf8'))
      if (card._v !== CACHE_VERSION) { stale++; continue }
      memCards.set(card.identifier, card)
      memByName.set(normalize(card.name), card)
      n++
    } catch { /* skip a corrupt cache entry */ }
  }
  console.log(`[riftbound] ${n} cards warm from cache` +
              `${stale ? ` (${stale} stale, will refetch)` : ''} · ${FORMAT}`)
}

// ── Image caching ────────────────────────────────────────────────
const IMG_CONCURRENCY = 4
const imgInFlight = new Set()
const imgQueue = []
let imgActive = 0

function cacheImage(card) {
  const id = card.identifier
  if (!card._img || existsSync(imgPath(id)) || imgInFlight.has(id)) return
  imgInFlight.add(id)
  imgQueue.push(card)
  pumpImageQueue()
}

function pumpImageQueue() {
  while (imgActive < IMG_CONCURRENCY && imgQueue.length > 0) {
    const card = imgQueue.shift()
    imgActive++
    downloadImage(card).finally(() => {
      imgActive--
      imgInFlight.delete(card.identifier)
      pumpImageQueue()
    })
  }
}

async function downloadImage(card) {
  try {
    const res = await fetch(card._img, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
    if (!res.ok) return
    writeFileSync(imgPath(card.identifier), Buffer.from(await res.arrayBuffer()))
  } catch (err) {
    console.warn(`[riftbound] image cache failed for ${card.name}:`, err.message)
  }
}

export function getCachedImagePath(id) {
  const p = imgPath(id)
  return existsSync(p) ? p : null
}

export function getRemoteImageUrl(id) {
  return memCards.get(id)?._img ?? null
}

// ── Public lookup API ────────────────────────────────────────────
// The panel's card search resolves by NAME (that's what an operator types).
// Riftcodex's /cards/search is a full-text search over card RULES text, so name
// lookups use /cards/name?fuzzy instead.
export async function searchCards(query, limit = 40) {
  const q = String(query ?? '').trim()
  if (!q) return []

  try {
    const data = await request(`/cards/name?fuzzy=${encodeURIComponent(q)}&size=${limit}`)
    const cards = itemsOf(data).map(raw => remember(normalizeCard(raw)))
    return rankByName(cards, q).slice(0, limit)
  } catch (err) {
    console.warn('[riftbound] search failed:', err.message)
    // Offline fallback — substring match over the disk cache.
    const nq = normalize(q)
    const hits = [...memCards.values()].filter(c => normalize(c.name).includes(nq))
    return rankByName(hits, q).slice(0, limit)
  }
}

// Riftcodex fuzzy already ranks, but re-rank so an exact/word-start match wins
// when several cards share a champion name (e.g. every "Rengar - …").
function rankByName(cards, query) {
  const q = normalize(query)
  const wordStart = new RegExp(`\\b${escapeRe(query.trim())}`, 'i')
  const score = card => {
    const n = normalize(card.name)
    if (n === q)                   return 0
    if (wordStart.test(card.name)) return 1
    if (n.includes(q))             return 2
    return 3
  }
  return [...cards].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

const UUID_RE = /^[0-9a-f]{24,}$/i   // Riftcodex ids are 24-hex Mongo ObjectIds

export async function getCard(identifier) {
  if (!identifier) return null

  if (memCards.has(identifier)) return memCards.get(identifier)
  const byName = memByName.get(normalize(identifier))
  if (byName) return byName

  try {
    if (UUID_RE.test(identifier)) {
      const raw = await request(`/cards/${identifier}`)
      return remember(normalizeCard(itemsOf(raw)[0]))
    }
    const data = await request(`/cards/name?exact=${encodeURIComponent(identifier)}`)
    const hit  = itemsOf(data)[0]
    if (hit) return remember(normalizeCard(hit))
    // exact miss — try fuzzy
    const fuzzy = await request(`/cards/name?fuzzy=${encodeURIComponent(identifier)}&size=1`)
    return remember(normalizeCard(itemsOf(fuzzy)[0]))
  } catch (err) {
    console.warn(`[riftbound] getCard(${identifier}) failed:`, err.message)
    return null
  }
}

// Resolve many card names. Riftcodex has no batch endpoint, so this is
// cache-first with a per-name fuzzy fallback for the misses.
export async function getCardsByNames(names) {
  const found = new Map()
  const missing = []

  for (const name of names) {
    const key = normalize(name)
    if (!key) continue
    const hit = memByName.get(key)
    if (hit) found.set(key, hit)
    else if (!missing.some(n => normalize(n) === key)) missing.push(name)
  }

  for (const name of missing) {
    const { card } = await resolveByDisplayName(name)
    if (card) found.set(normalize(name), card)
  }

  return found
}

export async function resolveByDisplayName(rawName) {
  const name = String(rawName ?? '').trim()
  if (!name) return { card: null, suggestions: [] }

  const cached = memByName.get(normalize(name))
  if (cached) return { card: cached, suggestions: [] }

  try {
    const exact = await request(`/cards/name?exact=${encodeURIComponent(name)}`)
    const hit   = itemsOf(exact)[0]
    if (hit) return { card: remember(normalizeCard(hit)), suggestions: [] }

    const fuzzy = await request(`/cards/name?fuzzy=${encodeURIComponent(name)}&size=3`)
    const cards = itemsOf(fuzzy).map(raw => remember(normalizeCard(raw)))
    if (cards[0]) return { card: cards[0], suggestions: [] }
    return { card: null, suggestions: cards.map(c => c.name).slice(0, 3) }
  } catch (err) {
    console.warn(`[riftbound] resolve "${name}" failed:`, err.message)
    return { card: null, suggestions: [] }
  }
}

export function resolveImagePath(identifier) {
  if (!identifier) return null
  return memCards.get(identifier) ? `/cards/${identifier}` : null
}