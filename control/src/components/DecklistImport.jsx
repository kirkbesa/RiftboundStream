import React, { useState } from 'react'
import { api } from '../store.js'
import { ManaCost, mainDeckCount } from '../mtg.jsx'

const PLACEHOLDER = `Paste a decklist — labelled sections, or a plain "count name" list:

Legend: Azir, Emperor of the Sands
Champion: Azir, Sovereign
Main Deck:
3 Arise!
3 B.F. Sword
Battlefields:
1 Hall of Legends
Runes:
6 Calm Rune
6 Order Rune
Sideboard:
2 Wind Wall`

export default function DecklistImport({ onDone, onCancel }) {
  const [text, setText]       = useState('')
  const [result, setResult]   = useState(null)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  async function resolve() {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try {
      setResult(await api.resolveDeck(text))
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  const mainCount = result ? mainDeckCount(result) : 0
  const runeCount = result ? (result.runes ?? []).reduce((n, r) => n + r.count, 0) : 0
  const sideCount = result ? result.side.reduce((n, r) => n + r.count, 0) : 0
  const illegal   = result ? [...result.main, ...result.side].filter(r => r.legal === false) : []

  return (
    <div className="import">
      {!result && (
        <>
          <textarea
            className="import-ta"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            autoFocus
          />
          <div className="row">
            <button className="btn primary" onClick={resolve} disabled={busy || !text.trim()}>
              {busy ? 'Resolving cards…' : 'Resolve'}
            </button>
            <button className="btn" onClick={onCancel}>Cancel</button>
            {error && <span className="err">{error}</span>}
          </div>
        </>
      )}

      {result && (
        <>
          {/* Review before committing. Scryfall's fuzzy matcher is forgiving,
              which is what makes messy player-submitted lists importable — but
              it also means a typo can resolve to the WRONG card rather than
              failing. Showing every resolved name is how that gets caught
              before it hits the deck reveal on air. */}
          <div className="import-summary">
            <b>{mainCount}</b> main · <b>{runeCount}</b> runes · <b>{sideCount}</b> sideboard
            {result.unresolved.length > 0 && (
              <span className="warn"> · {result.unresolved.length} unresolved</span>
            )}
            {illegal.length > 0 && (
              <span className="warn"> · {illegal.length} not format-legal</span>
            )}
          </div>

          <div className="import-review">
            {result.unresolved.length > 0 && (
              <div className="rev-section bad">
                <div className="rev-title">Unresolved — these will be missing</div>
                {result.unresolved.map((u, i) => (
                  <div key={i} className="rev-row">
                    <span className="rev-count">{u.count}</span>
                    <span className="rev-name">{u.rawName}</span>
                    <span className="rev-sugg">
                      {u.suggestions.length ? `Did you mean: ${u.suggestions.join(', ')}` : 'No match'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Legend / Champion / Battlefields first — these become the
                player's overlay cards when the list is used, so a wrong one
                here is a wrong card on air. */}
            {(result.legend || result.champion || result.battlefields?.length > 0) && (
              <div className="rev-section">
                <div className="rev-title">Identity</div>
                {[
                  ['Legend', result.legend],
                  ['Champion', result.champion],
                  ...(result.battlefields ?? []).map(c => ['Battlefield', c]),
                ].map(([label, c], i) => (
                  <div key={i} className="rev-row">
                    <span className="rev-count">{label[0]}</span>
                    <span className="rev-name">{c ? c.name : <span className="warn">none found</span>}</span>
                    <span className="rev-type">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {[['Main deck', result.main], ['Runes', result.runes ?? []], ['Sideboard', result.side]].map(([label, rows]) =>
              rows.length > 0 && (
                <div key={label} className="rev-section">
                  <div className="rev-title">{label}</div>
                  {rows.map((r, i) => (
                    <div key={i} className={`rev-row${r.legal === false ? ' illegal' : ''}`}>
                      <span className="rev-count">{r.count}</span>
                      <span className="rev-name">{r.name}</span>
                      <ManaCost cost={r.manaCost} size={13} />
                      <span className="rev-type">{r.typeLine}</span>
                      {r.legal === false && <span className="rev-flag">not legal</span>}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <div className="row">
            <button className="btn primary" onClick={() => onDone(result)}>
              Use this decklist
            </button>
            <button className="btn" onClick={() => setResult(null)}>Back to paste</button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}
