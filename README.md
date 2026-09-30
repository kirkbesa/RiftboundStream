# RiftboundStream

A local broadcast production tool for **Riftbound** (Riot's TCG) tournaments.
Card data and images come live from the **[Riftcodex API](https://riftcodex.com)**
— a free, no-auth card database — and are cached to disk, so no card assets ship
with this app.

Built around how a Riftbound match reads on stream: each player's Legend and
Champion, their battlefield, a race-to-8 points track, and a Bo3 game score.

---

## Requirements

**Node.js 18 or higher** — download from https://nodejs.org (choose the LTS version).
An internet connection is needed the first time a card is looked up; after that
it's served from the local cache.

---

## Setup & running

- **Mac**: double-click `start.command` (first time: right-click → Open)
- **Windows**: double-click `start.bat`

On first launch the script installs dependencies (~30 seconds). The control panel
opens at **http://localhost:3001**.

For panel development with hot-reload (panel on :5173, server on :3001):

```
npm start      # terminal 1 — server
npm run dev    # terminal 2 — Vite panel with HMR
```

After editing anything under `control/`, rebuild the panel: `npm run build`.
Overlays are plain HTML and hot-reload in OBS automatically on save.

---

## OBS Browser Sources

All at 1920×1080, transparent background:

| Overlay      | URL                                        | What it is |
|--------------|--------------------------------------------|------------|
| **Matchup**  | http://localhost:3001/overlays/matchup     | **The full-frame layout** — per player: name, Legend + Champion art, cam slot, battlefield + Bo3 circles, and card showcase, with the race-to-8 track up top. The centre is transparent for the table feed. |
| Card Viewer  | http://localhost:3001/overlays/cardviewer  | Full card zoom (from the Cards tab or the commentator page) |
| Decklist     | http://localhost:3001/overlays/decklist    | One player's list as a text sidebar, right of screen |
| Deck Reveal  | http://localhost:3001/overlays/deckreveal  | Full-screen deck reveal — card grid, energy curve, type + domain breakdown |
| Standings    | http://localhost:3001/overlays/standings   | Top-8 standings table |
| Timer        | http://localhost:3001/overlays/timer       | Round timer |
| Broadcaster  | http://localhost:3001/overlays/broadcaster | Caster lower-third |
| Panelists    | http://localhost:3001/overlays/panelists   | Panel / desk lower-third |
| Bracket      | http://localhost:3001/overlays/bracket     | Top-8 single-elim bracket |

`OBS/RiftboundStream-scene-collection.json` has all of these set up as one
scene: in OBS, **Scene Collection → Import**, pick the file, then select it from
the Scene Collection menu.

The **Matchup** overlay reserves a `P1 Cam` / `P2 Cam` box in each rail — put your
player video sources *behind* the overlay and line them up with those cut-outs.
No player cams? Switch **Player cams** off in the panel's On-air bar and the
rails close up.

Share these over the venue LAN with commentators (the panel header shows the IP):

| Page           | Who for                          |
|----------------|----------------------------------|
| `/commentator` | Casters — both decklists, points, games, card zoom |
| `/table`       | Players & judge — tap points and games from the table |

---

## Setting up a match

On the **Match tab**, for each player:

- **Name / handle / pronouns / record / deck name** — typed directly.
- **Legend** — the player's Legend card.
- **Champion Unit** — the champion unit that pairs with the Legend.
- **Battlefield** — the active battlefield (the card, its name and the Bo3 circles show on the overlay).

  Once the player has a decklist, these three are dropdowns of the cards in
  their deck — switching battlefield between games is one click — with
  **Search all cards…** for anything else.
- **Showcase** — feature any single card in the player's rail.
- **Points** — the race-to-8 win condition (the top-center track). `+1 / −1`,
  clamped to 8. Adjustable from the panel or the table page.
- **Games** — Bo3 game wins (0–2), shown as the two circles under the battlefield.

Every card picker resolves against Riftcodex and stores the card *fully resolved*
(name, type, domain, image) — so once it's set, the overlay keeps rendering it
even if the venue Wi-Fi drops.

**New Game** resets points and the initiative marker, keeping names, champions,
decklists, records and the game score. **Reset Match** clears the slot entirely.

---

## Decklists & roster

Paste a decklist per player (Match tab → **Import**), or bulk-import a whole
tournament field on the **Roster tab** (CSV / JSON / text — format auto-detected).
Every card line is resolved against Riftcodex before it goes live and shown for
review.

Decklists can label their sections — `Legend:`, `Champion:`, `Main Deck:`,
`Battlefields:`, `Runes:`, `Sideboard:` — or be a plain `<count> <card name>`
list, which is sorted out by card type. Either way the deck's Legend, Champion
and first Battlefield are set on the player when they're seated. See
`samples/IMPORT-FORMAT.md`.

---

## Changing the card API / set

Card data comes from Riftcodex. Two env vars override the defaults (see
`server/riftbound.js`):

```
RIFTBOUND_API=https://api.riftcodex.com   # point at a mirror if needed
RIFTBOUND_SET=Riftbound                    # label shown in the panel/logs
```

Any Riftbound card API with `/cards/name?fuzzy=` and `/cards/{id}` endpoints
can be dropped in by editing `server/riftbound.js`.

---

## Card cache

Card JSON and images are cached in `.cache/` (`cards/*.json`, `img/*.png`) on
first lookup. Once a card has been seen it never needs the network again — so
setting up both players' champions/battlefields and importing decklists *before*
the event warms the cache and makes the broadcast resilient to venue Wi-Fi
dropping. Deleting `.cache/` is always safe; it just re-downloads.

---

## Folder structure

```
RiftboundStream/
├── .cache/         ← Riftcodex card + image cache (auto-created)
├── events/         ← Saved event files (auto-created)
├── autosave/       ← 5-min rolling + 30-min timestamped auto-saves
├── samples/        ← Roster import spec + templates
├── server/
│   ├── riftbound.js  Riftcodex client, rate limiting, disk cache
│   ├── decklist.js   Decklist parsing → Legend / Champion / main / Battlefields / Runes / side
│   ├── roster.js     Bulk tournament import
│   ├── state.js      Broadcast state + event persistence
│   └── index.js      HTTP + WebSocket
├── overlays/       ← OBS overlay pages (matchup is the main one)
├── commentator/    ← Casters' page
├── table/          ← Players' & judge's scoring page
├── control/        ← Control panel source (React)
├── dist/control/   ← Built control panel — run `npm run build` after editing
├── OBS/            ← Importable OBS scene collection
├── start.command   ← Mac launcher
└── start.bat       ← Windows launcher
```

---

## Stopping the server

Press **Ctrl+C** in the terminal window, or close it.