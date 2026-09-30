import React from 'react'
import { api } from '../store.js'
import { EnergyBadge, groupByType, typeColor, plural, sortDeckRows, mainDeckCount } from '../riftbound.jsx'

// Compact read-only view of a stored decklist. Clicking a card zooms it on the
// card-viewer overlay, which makes this the fastest path from "caster mentions
// a card" to "card is on screen".
export default function DeckSummary({ deck }) {
  if (!deck || (deck.main ?? []).length === 0) {
    return <div className="deck-empty">No decklist imported</div>
  }

  const zoom = (identifier) => api.overlay({ cardZoom: identifier }).catch(() => {})

  const mainCount = mainDeckCount(deck)
  const sideCount = (deck.side ?? []).reduce((n, r) => n + r.count, 0)
  const runeCount = (deck.runes ?? []).reduce((n, r) => n + r.count, 0)

  // The deck's identity cards, one line each, above the main deck. These are
  // the cards the matchup overlay shows, so they lead.
  const identity = [
    deck.legend   && ['Legend',   deck.legend],
    deck.champion && ['Champion', deck.champion],
    ...(deck.battlefields ?? []).map(c => ['Battlefield', c]),
  ].filter(Boolean)

  return (
    <div className="deck-summary">
      <div className="ds-counts">
        {mainCount} main{sideCount > 0 && ` · ${sideCount} side`}
        {deck.unresolved?.length > 0 && (
          <span className="warn"> · {deck.unresolved.length} unresolved</span>
        )}
      </div>

      <div className="ds-scroll">
        {identity.length > 0 && (
          <div className="ds-group">
            {identity.map(([label, c], i) => (
              <button key={i} className="ds-row" onClick={() => zoom(c.identifier)} title="Zoom on stream">
                <span className="ds-count" style={{ color: typeColor(c.type) }}>{label[0]}</span>
                <span className="ds-name">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {groupByType(deck.main).map(([type, rows]) => {
          const total = rows.reduce((n, r) => n + r.count, 0)
          return (
            <div key={type} className="ds-group">
              <div className="ds-group-title" style={{ color: typeColor(type) }}>
                {plural(type, total)} ({total})
              </div>
              {sortDeckRows(rows).map(r => (
                <button key={r.identifier} className="ds-row" onClick={() => zoom(r.identifier)} title="Zoom on stream">
                  <span className="ds-count">{r.count}</span>
                  <span className="ds-name">{r.name}</span>
                  <EnergyBadge energy={r.energy} size={11} />
                </button>
              ))}
            </div>
          )
        })}

        {runeCount > 0 && (
          <div className="ds-group">
            <div className="ds-group-title" style={{ color: typeColor('Rune') }}>
              Runes ({runeCount})
            </div>
            {sortDeckRows(deck.runes).map(r => (
              <button key={r.identifier} className="ds-row" onClick={() => zoom(r.identifier)} title="Zoom on stream">
                <span className="ds-count">{r.count}</span>
                <span className="ds-name">{r.name}</span>
              </button>
            ))}
          </div>
        )}

        {(deck.side ?? []).length > 0 && (
          <div className="ds-group">
            <div className="ds-group-title" style={{ color: 'var(--gold)' }}>
              Sideboard ({sideCount})
            </div>
            {sortDeckRows(deck.side).map(r => (
              <button key={r.identifier} className="ds-row" onClick={() => zoom(r.identifier)} title="Zoom on stream">
                <span className="ds-count">{r.count}</span>
                <span className="ds-name">{r.name}</span>
                <EnergyBadge energy={r.energy} size={11} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
