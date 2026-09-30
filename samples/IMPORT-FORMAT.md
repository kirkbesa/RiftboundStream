# Roster import format

The spec for a registration site exporting its field to the broadcast tool.

**CSV or JSON — either works.** The format is detected from the file's contents,
not its extension. Pick whichever is easier to produce; there is no advantage to
one over the other.

Working examples sit next to this file — both import cleanly, so they're a good
thing to diff an export against:

- `registration-template.csv`
- `registration-template.json` — its three players deliberately use the three
  different decklist shapes, so you can see which one best fits your data.

---

## The fields

Only the player's name is required.

| Field       | Required | Contents                                         |
|-------------|----------|--------------------------------------------------|
| Player      | **yes**  | Player's name. A row with no name is skipped.    |
| Deck        | no       | Archetype — "Azir", "Master Yi". Defaults to the Legend's champion. |
| Decklist    | no       | The deck: Legend, Champion, main deck, Battlefields, Runes. One card per line. |
| Sideboard   | no       | Sideboard. One card per line.                    |
| Pronouns    | no       | Shown on the overlays with the player's name.    |

**Leave placement out.** There is a `Place` field, but it's only for re-importing
an already-finished tournament. At a live event nobody has a placement yet, and
standings are edited in the panel as the event plays out.

---

## CSV

Standard CSV. **Header row required.** One row per player.

```csv
Player,Deck,Decklist,Sideboard
Kestrel,Azir,"Legend: Azir, Emperor of the Sands
Champion: Azir, Sovereign
Main Deck:
3 Arise!
3 Guards!
Battlefields:
1 Hall of Legends
1 Seat of Power
1 Trifarian War Camp
Runes:
6 Calm Rune
6 Order Rune","2 Wind Wall"
```

The decklist is a normal multi-line cell: wrapped in double quotes, real
newlines inside. This is standard CSV — any serializer does it correctly, and no
special handling is needed. A literal double quote inside a cell is escaped by
doubling it (`""`), per spec.

### Column names

Matched loosely — case, spaces and punctuation are ignored, and each column
accepts several spellings:

| Column      | Also accepted                                      |
|-------------|----------------------------------------------------|
| `Player`    | `Player Name`, `Name`, `Full Name`, `Display Name` |
| `Deck`      | `Deck Name`, `Archetype`                           |
| `Decklist`  | `Main Deck`, `Maindeck`, `Main`                    |
| `Sideboard` | `Side`, `SB`                                       |
| `Pronouns`  | `Pronoun`                                          |

**Do not put the decklist in a column called `Deck`.** That's the archetype
column; a decklist there is read as a deck *name*. Use `Decklist`.

---

## JSON

An array of players — or an object wrapping one under `players`, `roster` or
`data`.

The decklist may be **a string** (exactly the text a CSV cell would hold):

```json
[
  {
    "name": "Kestrel",
    "deck": "Azir",
    "decklist": "Legend: Azir, Emperor of the Sands\nChampion: Azir, Sovereign\nMain Deck:\n3 Arise!\n3 Guards!\nBattlefields:\n1 Hall of Legends\n1 Seat of Power\n1 Trifarian War Camp\nRunes:\n6 Calm Rune\n6 Order Rune",
    "sideboard": "2 Wind Wall"
  }
]
```

...**or a structured array**, which is usually the natural shape if the site
already stores decks as records:

```json
[
  {
    "name": "Marlowe",
    "deck": "Master Yi",
    "decklist": [
      { "count": 1, "name": "Master Yi, Wuju Bladesman" },
      { "count": 1, "name": "Master Yi, Honed" },
      { "count": 3, "name": "Lonely Poro" },
      { "count": 1, "name": "Vilemaw's Lair" },
      { "count": 6, "name": "Body Rune" }
    ],
    "sideboard": [
      { "count": 3, "name": "Akshan, Mischievous" }
    ]
  }
]
```

A plain array of strings (`["3 Lonely Poro", "6 Body Rune"]`) works too.

### Key names

Matched with the same loose rules as CSV columns, so `playerName`, `player_name`
and `Player Name` are all the player.

| Field     | Keys accepted                                          |
|-----------|--------------------------------------------------------|
| Player    | `name`, `player`, `playerName`, `fullName`, `displayName` |
| Deck      | `deck`, `deckName`, `archetype`                        |
| Decklist  | `decklist`, `mainboard`, `maindeck`, `main`, `cards`   |
| Sideboard | `sideboard`, `side`, `sb`                              |
| Pronouns  | `pronouns`, `pronoun`                                  |

In a structured decklist, each card's count may be `count`, `quantity`, `qty` or
`n`, and its name may be `name`, `card` or `cardName`.

---

## Deck layout

A Riftbound deck is a **Legend**, a chosen **Champion** unit, a **main deck**
(40 cards counting the Champion), three **Battlefields**, twelve **Runes**, and
an optional **sideboard** of up to 8.

The clearest export labels each section, the way deckbuilders do:

```
Legend: Azir, Emperor of the Sands
Champion: Azir, Sovereign
Main Deck:
3 Arise!
3 B.F. Sword
Battlefields:
1 Hall of Legends
1 Seat of Power
1 Trifarian War Camp
Runes:
6 Calm Rune
6 Order Rune
Sideboard:
2 Wind Wall
```

A label can sit on its own line (`Legend:`) or carry its card inline
(`Legend: Azir, Emperor of the Sands`). Accepted labels: `Legend`, `Champion`
(or `Champion Unit`), `Main Deck` (or `Main`, `Deck`), `Battlefields`, `Runes`
(or `Rune Pool`), `Sideboard`.

**Unlabelled lists work too.** A plain `count name` list is sorted out by card
type: the Legend, Battlefields and Runes are recognised as what they are. The
Champion is the one thing type can't tell apart from any other unit — without a
`Champion` label, the importer picks the main-deck unit that shares the
Legend's champion name (an Azir deck's "Azir, Sovereign"). Label it if you can.

The Legend, Champion and first Battlefield become the player's cards on the
matchup overlay as soon as they're seated.

---

## Card lines

Each card line is `<count> <name>`:

```
3 Arise!
6 Calm Rune
```

Also accepted:

- `3x Arise!` — the `x` is optional
- `3 Arise! (OGN) 146` — set code and collector number are ignored
- `SB: 2 Wind Wall` — per-line sideboard prefix
- `// comment` and blank lines — ignored

### Sideboard

Either give it its own `Sideboard` field, **or** put it inside the decklist under
a `Sideboard` line — not both.

### Card names

Names are resolved against [Riftcodex](https://riftcodex.com), which is
forgiving about punctuation and casing — `Azir, Sovereign` and
`Azir - Sovereign` both resolve.

Matching is fuzzy, which is what makes messy player-submitted lists importable —
but it also means a badly mangled line can resolve to the *wrong* card rather
than failing outright. **Export the decklist exactly as the player submitted it.**
A well-meaning cleanup pass (stripping punctuation, re-casing) is more likely to
turn a good name into a subtly wrong one than to help. Anything that can't be
resolved at all is reported with suggestions, not silently dropped.

---

## Encoding

**UTF-8.** Player names can contain accents, and Latin-1 will mangle them.
Either line ending (LF or CRLF) is fine.
