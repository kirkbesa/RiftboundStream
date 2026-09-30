import React, { useState } from 'react'
import { api } from '../store.js'
import DecklistImport from './DecklistImport.jsx'
import DeckSummary from './DeckSummary.jsx'
import CardPicker from './CardPicker.jsx'
import { identityOptions } from '../mtg.jsx'

const POINTS_TO_WIN = 8
const GAMES_TO_WIN  = 2

export default function PlayerCard({ player: p, mi, pi }) {
  const [importing, setImporting] = useState(false)

  const patch  = (patch) => api.patchPlayer(mi, pi, patch).catch(() => {})
  const bump   = (counter, delta) => api.adjustCounter(mi, pi, counter, delta).catch(() => {})
  const setVal = (counter, value) => api.setCounter(mi, pi, counter, value).catch(() => {})

  const rec  = p.record ?? { w: 0, l: 0, d: 0 }
  const deck = p.decklist
  const opts = identityOptions(deck)
  const pts  = p.points ?? 0
  const games = p.gameScore ?? 0

  return (
    <div className="card player-card">
      <div className="pc-head">
        <span className="pc-role">Player {pi + 1}</span>
        <span className="pc-score">
          Games
          <button className="tiny" onClick={() => patch({ gameScore: Math.max(0, games - 1) })}>−</button>
          <b>{games} / {GAMES_TO_WIN}</b>
          <button className="tiny" onClick={() => patch({ gameScore: Math.min(GAMES_TO_WIN, games + 1) })}>+</button>
        </span>
      </div>

      <input
        className="pc-name"
        placeholder="Player name"
        value={p.name ?? ''}
        onChange={e => patch({ name: e.target.value })}
      />

      <div className="row">
        <label className="field">
          <span>Handle</span>
          <input value={p.handle ?? ''} onChange={e => patch({ handle: e.target.value })} placeholder="@handle" />
        </label>
        <label className="field">
          <span>Pronouns</span>
          <input value={p.pronouns ?? ''} onChange={e => patch({ pronouns: e.target.value })} placeholder="they/them" />
        </label>
      </div>

      <div className="row">
        <label className="field sm">
          <span>W</span>
          <input type="number" value={rec.w} onChange={e => patch({ record: { ...rec, w: +e.target.value } })} />
        </label>
        <label className="field sm">
          <span>L</span>
          <input type="number" value={rec.l} onChange={e => patch({ record: { ...rec, l: +e.target.value } })} />
        </label>
        <label className="field grow">
          <span>Deck / Archetype</span>
          <input
            value={p.deckName ?? ''}
            onChange={e => patch({ deckName: e.target.value })}
            placeholder="Fury Aggro"
          />
        </label>
      </div>

      {/* ── Race to 8 points ─────────────────────────────────────
          The live win condition — first to 8 conquers the match. This is the
          headline counter and drives the top-center track on the overlay. */}
      <div className="points">
        <div className={`points-val${pts >= POINTS_TO_WIN ? ' win' : ''}`}>
          <button className="life-btn" onClick={() => bump('points', -1)}>−1</button>
          <div className="points-num"><b>{pts}</b><span>/ {POINTS_TO_WIN}</span></div>
          <button className="life-btn" onClick={() => bump('points', +1)}>+1</button>
        </div>
        <div className="points-track">
          {Array.from({ length: POINTS_TO_WIN }, (_, i) => (
            <button
              key={i}
              className={`pt-dot${i < pts ? ' on' : ''}`}
              title={`Set to ${i + 1}`}
              onClick={() => setVal('points', i + 1 === pts ? i : i + 1)}
            />
          ))}
        </div>
      </div>

      {/* ── Champion / Battlefield / Showcase ────────────────────── */}
      <div className="pickers">
        <CardPicker
          label="Legend"
          value={p.legend ?? null}
          typeFilter="Legend"
          options={opts.legends}
          placeholder="Set legend"
          onPick={(card) => patch({ legend: card })}
        />
        <CardPicker
          label="Champion Unit"
          value={p.champion ?? null}
          placeholder="Set champion"
          options={opts.champions}
          onPick={(card) => patch({ champion: card })}
        />
        <CardPicker
          label="Battlefield"
          value={p.battlefield ?? null}
          typeFilter="Battlefield"
          options={opts.battlefields}
          placeholder="Set battlefield"
          onPick={(card) => patch({ battlefield: card })}
        />
        <CardPicker
          label="Showcase"
          value={p.showcase ?? null}
          placeholder="Feature a card"
          onPick={(card) => patch({ showcase: card })}
        />
      </div>

      {/* ── Decklist ────────────────────────────────────────────── */}
      <div className="deck-block">
        <div className="deck-head">
          <span>Decklist</span>
          <button className="btn sm" onClick={() => setImporting(v => !v)}>
            {importing ? 'Cancel' : deck ? 'Re-import' : 'Import…'}
          </button>
        </div>

        {importing ? (
          <DecklistImport
            onDone={(resolved) => {
              // A deck names its own Legend and Champion, so importing one sets
              // them. Battlefield only fills an empty slot — it's the one the
              // operator changes game to game, and a re-import shouldn't undo that.
              patch({
                decklist: resolved,
                ...(resolved.legend   && { legend:   resolved.legend }),
                ...(resolved.champion && { champion: resolved.champion }),
                ...(!p.battlefield && resolved.battlefields?.[0] && { battlefield: resolved.battlefields[0] }),
              })
              setImporting(false)
            }}
            onCancel={() => setImporting(false)}
          />
        ) : (
          <DeckSummary deck={deck} />
        )}
      </div>
    </div>
  )
}