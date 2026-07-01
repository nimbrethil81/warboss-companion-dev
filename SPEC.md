# Warboss Companion — Full Specification

> Living document. Updated as decisions are made. Placeholders marked `[TBD]`.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Ways of Working](#2-ways-of-working)
3. [Architecture](#3-architecture)
4. [Data Structures](#4-data-structures)
5. [Modes](#5-modes)
6. [Game Systems](#6-game-systems)
7. [Roadmap](#7-roadmap)
8. [Open Questions](#8-open-questions)

---

## 1. Vision

### Problem Statement

Most wargaming apps are built for experienced players who want to optimise army lists. Nobody has seriously tackled the companion for the **learning or returning player** — someone who knows the game well enough to play it, but struggles to recall rules, tactical cues, and phase sequences during the pressure of an actual game.

The existing tools (BattleScribe, Mantic Companion) frame themselves as "list builders" — language that signals homework rather than adventure, and serves optimisers rather than players.

### What Warboss Companion Does

Warboss Companion guides a player through the complete arc of a Kings of War game:

- **Before the battle** — organise and review your army
- **During the game** — track turns, manage your roster, receive timely rule reminders at each phase
- **After the dust settles** — reflect on what happened and capture what to try next time

### Target User

**Primary:** Players who are new to a game system, returning after a long gap, or playing infrequently against more experienced opponents. They want a discreet helper at the table — not a tool that plays the game for them, but one that stops them forgetting it's turn 4 and their trolls regenerate.

**Initial user:** A single Goblin player using Kings of War v4, playing infrequently, building this tool for personal use first.

**Future users:** Other KoW players, then players of other tabletop wargame systems.

### Design Philosophy

- **Journey, not utility.** The app follows a natural arc — Muster, Battle, Chronicle — rather than presenting itself as a database tool.
- **Language matters.** Mode names, prompts, and copy should feel like they belong in the world of the game. "Muster" not "List Builder". "Chronicle" not "Post Mortem".
- **Opinionated defaults, not infinite options.** The app makes choices so the player doesn't have to. Complexity is revealed progressively.
- **Content is the product.** The rule reminders, phase prompts, and tactical tips are the core value — the UI exists to deliver them cleanly.
- **Table-ready.** The app must be usable with one hand at a gaming table, potentially in low light, against a time-pressured opponent.

---

## 2. Ways of Working

These principles govern every technical and structural decision. When a conflict arises, refer back here.

### Fail Gracefully
Every network call (Google Sheets fetch, any external API) must be wrapped in a try/catch block. On failure:
- Display a clear, human-readable message in the UI
- Never show a raw error, blank screen, or crash
- Where possible, fall back to locally cached data
- A failed Sheets write at game end must prompt the user: data is never silently lost

### Future Proofing
Before any structural decision — data schema, function design, file organisation — evaluate implications for:
- Multiple users
- Multiple game systems
- Migration away from Google Sheets to a proper database (e.g. Supabase)

If a shortcut now creates pain later, flag it explicitly before proceeding.

### Single Source of Truth
Data must not be duplicated across files or sheets. Specifically:
- Unit data lives in one place (the game system JSON file)
- Turn sequence and prompts live in one place (the game system JSON file)
- No stat values hardcoded in both HTML and JS
- If something is referenced in two places, it is imported/fetched from the one source

### Precise Code Placement
Every code instruction must include:
- The exact file (`app.js`, `index.html`, etc.)
- A literal anchor line already present in the file (e.g. "Insert directly after `const SHEET_URL = ...`")
- A closing anchor where relevant (e.g. "before the closing `</script>` tag")

Ambiguous instructions like "add this to your fetch logic" or "put this near the top" are not acceptable.

### No Magic Numbers or Hardcoded Strings in Logic
Game-specific values — number of turns, phase names, prompt text, unit stats — must live in the game system JSON config file, not scattered through `app.js` or `index.html`. When a rule changes or a new game system is added, only the JSON file changes.

---

## 3. Architecture

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla JS, HTML, CSS | No build toolchain, no dependencies, easy to maintain solo |
| App delivery | GitHub Pages | Free, version-controlled, zero infrastructure |
| App type | Progressive Web App (PWA) | Works offline during a game; installable without App Store |
| Database | Google Sheets (via API) | Free, zero infrastructure, sufficient for single-user MVP |
| Offline state | localStorage | Game state held locally during play; written to Sheets at game end only |
| Game content | JSON files in `/data/` | Static, version-controlled, works offline, easy to extend |

### Repositories & Deployment

| Repo | URL | Purpose |
|---|---|---|
| Live | https://nimbrethil81.github.io/warboss-companion/ | Production — stable, tested releases only |
| Development | https://nimbrethil81.github.io/warboss-companion-dev/ | Active development and testing |

**Workflow:** All changes are built and tested in the dev repo first. A GitHub Action copies changed files from dev to live, overwriting files of the same name. No change goes to live without passing in dev first.

### Repository & File Structure

```
warboss-companion/
│
├── README.md
├── SPEC.md
├── CHANGELOG.md
│
├── index.html              ← App shell, navigation, PWA boilerplate
├── manifest.json           ← PWA manifest (name, icons, theme colour)
├── service-worker.js       ← Offline caching strategy
│
├── css/
│   └── style.css
│
├── js/
│   ├── app.js              ← App init, routing between modes
│   ├── muster.js           ← Muster mode logic
│   ├── battle.js           ← Battle mode logic
│   ├── chronicle.js        ← Chronicle mode logic
│   ├── sheets.js           ← ALL Google Sheets read/write (single module)
│   └── storage.js          ← ALL localStorage read/write (single module)
│
├── data/
│   ├── systems/
│   │   ├── index.json      ← Manifest of all supported game systems
│   │   └── kow.json        ← KoW turn sequence, phases, prompts, rules
│   └── armies/
│       └── kow/
│           ├── index.json  ← Manifest of all KoW factions
│           └── goblins.json ← Goblin unit roster with stats
│
└── assets/
    └── icons/              ← PWA icons (multiple sizes)
```

**Key structural decisions:**

- `sheets.js` is the only file that touches Google Sheets. When migrating to a new database, only this file changes.
- `storage.js` is the only file that touches localStorage. Centralises offline fallback.
- `data/systems/kow.json` is the single source of truth for all KoW game rules, turn sequence, and prompts. Adding a new game system means adding a new JSON file alongside it — no code changes required.
- `data/armies/kow/goblins.json` holds static unit reference data. This belongs in version control, not in Sheets. Sheets stores game results and reflections.
- `data/armies/kow/index.json` is a manifest listing all available factions for KoW. The app reads this to discover armies without needing to enumerate directory contents (which browsers cannot do natively). Adding a new army means adding the file and one line to this manifest.
- `data/systems/index.json` is a manifest listing all supported game systems. Adding a new game system means adding a new systems JSON file, a new `armies/{system}/` folder, and one line to this manifest.

### Data Flow

```
On app load
  └── app.js loads kow.json (turn sequence, prompts)
  └── sheets.js fetches saved armies and past games (with localStorage fallback on failure)

During Battle mode
  └── battle.js holds all game state in localStorage
  └── No Sheets writes during play (offline-safe, fast)

On game end
  └── battle.js calls sheets.js to write game summary
  └── On Sheets write failure → user prompted to retry; local data preserved

On Chronicle load
  └── sheets.js fetches past games from Sheets
  └── On failure → displays locally cached games with error notice
```

### Google Sheets Schema

Four tabs. Each tab represents one entity type — no data duplicated across tabs.

**`armies` tab**
| Column | Type | Notes |
|---|---|---|
| army_id | string | UUID, generated on creation |
| army_name | string | e.g. "Goblin Raiding Party" |
| game_system | string | e.g. "kow" — matches JSON filename |
| units | JSON string | Serialised array of unit objects |
| created_at | timestamp | ISO 8601 |
| updated_at | timestamp | ISO 8601 |

**`games` tab**
| Column | Type | Notes |
|---|---|---|
| game_id | string | UUID |
| date | timestamp | ISO 8601 |
| army_id | string | FK → armies.army_id |
| opponent_army | string | Free text |
| result | string | "win" / "loss" / "draw" |
| turns_played | integer | 1–7 |
| notes | string | General free text |

**`game_log` tab**
| Column | Type | Notes |
|---|---|---|
| log_id | string | UUID |
| game_id | string | FK → games.game_id |
| turn_number | integer | 1–7 |
| phase | string | "movement" / "ranged" / "combat" / "opponent" |
| note | string | Player's free text for that turn/phase |

**`reflections` tab**
| Column | Type | Notes |
|---|---|---|
| reflection_id | string | UUID |
| game_id | string | FK → games.game_id — one reflection per game |
| what_worked | string | Free text |
| what_didnt | string | Free text |
| next_time | string | Single tip for next game |
| created_at | timestamp | ISO 8601 |

### localStorage Schema

localStorage is the source of truth **during an active game only**. On game end, data is written to Sheets and local state is cleared.

| Key | Value | Purpose |
|---|---|---|
| `wbc_active_game` | JSON object | Full state of current game in progress |
| `wbc_armies_cache` | JSON array | Cache of armies fetched from Sheets |
| `wbc_games_cache` | JSON array | Cache of past games fetched from Sheets |
| `wbc_system_config` | JSON object | Cached kow.json content |

**`wbc_active_game` structure:**
```json
{
  "game_id": "uuid",
  "started_at": "ISO8601",
  "army_id": "uuid",
  "opponent_army": "",
  "current_turn": 1,
  "current_phase": "movement",
  "active_player": "you",
  "units": [
    {
      "unit_id": "uuid",
      "name": "Goblin Rabble",
      "routed": false
    }
  ],
  "turn_log": []
}
```

### PWA & Offline Strategy

- `service-worker.js` caches `index.html`, `style.css`, all JS files, and all JSON files in `/data/`
- The app is fully functional offline for Battle mode (no Sheets required during play)
- Muster and Chronicle modes degrade gracefully — cached data is shown with a notice if Sheets is unreachable
- On reconnection, any pending Sheets writes are retried automatically

---

## 4. Data Structures

### `kow.json` — Game System Config

This file is the single source of truth for all Kings of War game rules, turn structure, and in-game prompts. No game-specific values appear in JavaScript.

```json
{
  "system_id": "kow",
  "system_name": "Kings of War",
  "version": "v4",
  "max_turns": 7,
  "phases": [
    {
      "phase_id": "movement",
      "phase_name": "Movement phase",
      "turn": "yours",
      "prompts": [
        {
          "prompt_id": "regeneration",
          "text": "Resolve Regeneration for any eligible units before moving",
          "priority": "high",
          "detail": "Regeneration is declared at the start of the Movement phase, before any orders are issued."
        },
        {
          "prompt_id": "commands",
          "text": "Issue Command Orders before units move",
          "priority": "high",
          "detail": "Commands can be issued at any point during a unit's move, but declaring them first avoids forgetting."
        },
        {
          "prompt_id": "chaff_angles",
          "text": "Are vulnerable units protected? Check chaff unit angles",
          "priority": "medium",
          "detail": "Angle chaff units in front of valuable shooting units to prevent enemy charges fitting in gaps."
        },
        {
          "prompt_id": "pivot_clear",
          "text": "Pivoting: you can pivot through units — but must end clear",
          "priority": "medium",
          "detail": "Units can pivot through friendly and enemy units and all terrain types, but the entire move must end clear."
        },
        {
          "prompt_id": "charge_blocking",
          "text": "Charging units treat all friendlies as Blocking Terrain",
          "priority": "high",
          "detail": "You cannot charge through friendly units. Exception: other units simultaneously charging the same target."
        },
        {
          "prompt_id": "wild_charge",
          "text": "Wild Charge units: measure first, declare, then roll",
          "priority": "high",
          "detail": "Measure to target first. If in range of [Sp×2 + max Wild Charge], declare the charge, then roll. If roll fails, give a different order — you cannot select a new charge target."
        }
      ]
    },
    {
      "phase_id": "ranged",
      "phase_name": "Ranged phase",
      "turn": "yours",
      "prompts": [
        {
          "prompt_id": "check_all_shooters",
          "text": "Check every unit — heroes, spellcasters, ranged weapons",
          "priority": "high",
          "detail": "Individual heroes, spellcasters, and units with ranged special rules are easy to forget. Go through the full roster."
        },
        {
          "prompt_id": "cover",
          "text": "Cover check: -1 to hit unless height difference is 3+ levels",
          "priority": "medium",
          "detail": "Target is in cover if you cannot draw a line to at least half its facing without obstruction, or its centre-point is in Difficult Terrain. Ignore if intervening unit/terrain is 3+ height levels smaller than both shooter and target."
        },
        {
          "prompt_id": "ranged_nerve",
          "text": "Ranged attacks cause Wavering only — not Rout (unless target is Devastated)",
          "priority": "high",
          "detail": "A failed Nerve test from ranged fire results in Wavering, not removal. Exception: Devastated units treat Wavering as Rout."
        },
        {
          "prompt_id": "terrain_shooting",
          "text": "Shooting from within Difficult Terrain: no penalty to the shooter",
          "priority": "medium",
          "detail": "A unit with its centre-point inside Difficult Terrain can ignore that terrain when determining its own LOS."
        }
      ]
    },
    {
      "phase_id": "combat",
      "phase_name": "Combat phase",
      "turn": "yours",
      "prompts": [
        {
          "prompt_id": "hindered",
          "text": "Hindered charge? -1 to hit for this combat",
          "priority": "high",
          "detail": "A charge is Hindered if the charging unit's move went through or ended over any Difficult Terrain or Obstacle. Units ordered to Reform are never Hindered."
        },
        {
          "prompt_id": "brutal",
          "text": "Any units with Brutal? Apply modifier to damage rolls",
          "priority": "medium",
          "detail": "Brutal adds to the damage roll result. Multiple sources of Brutal are cumulative."
        },
        {
          "prompt_id": "elite_vicious",
          "text": "Elite or Vicious? Re-roll misses / re-roll 1s to damage",
          "priority": "medium",
          "detail": "Elite: re-roll all failed to-hit dice. Vicious: re-roll all dice that score a natural unmodified 1 when rolling to damage."
        },
        {
          "prompt_id": "iron_resolve",
          "text": "Iron Resolve? If Steady, regain (n) damage points (max 3)",
          "priority": "medium",
          "detail": "If the unit passes its Nerve test (is Steady), it regains n points of previously suffered damage, up to a maximum of 3."
        },
        {
          "prompt_id": "magic_items",
          "text": "Check magic items on this unit before rolling",
          "priority": "medium",
          "detail": "Review artefacts on the attacking unit. Apply any combat modifiers before rolling to hit."
        }
      ]
    },
    {
      "phase_id": "opponent_turn",
      "phase_name": "Opponent's turn",
      "turn": "opponent",
      "prompts": [
        {
          "prompt_id": "your_defence",
          "text": "Know your Defence stat when being damaged",
          "priority": "high",
          "detail": "Your opponent needs to match or beat your De value when rolling to damage. Know it before they roll."
        },
        {
          "prompt_id": "your_nerve",
          "text": "Know your Nerve stat — check if you're at risk before the roll",
          "priority": "high",
          "detail": "Add current damage to the 2D6 roll. If the total meets or exceeds your Ne value, you fail."
        },
        {
          "prompt_id": "wavering_status",
          "text": "Any of your units Wavering? They can only Halt!, Change Facing!, or Back!",
          "priority": "high",
          "detail": "Wavering units cannot charge, shoot, or use most orders. Wavering is removed at the end of the unit's own next Turn."
        },
        {
          "prompt_id": "inspiring_check",
          "text": "Inspiring nearby? Failed Nerve test must be re-rolled",
          "priority": "medium",
          "detail": "If a friendly Inspiring unit is within 6\" (or 9\" for Very Inspiring), re-roll the failed Nerve test. Second result stands."
        }
      ]
    }
  ],
  "quick_reference": [
    {
      "rule_id": "withdraw",
      "title": "Withdrawing",
      "body": "Take a Nerve test first. Pass: face enemy, move 2D6\" directly backward — terrain does not affect this movement. Touch an enemy unit = Routed. Touch Blocking Terrain = stop and Wavering. Can move through friendlies; if you cannot clear them, keep going until clear then Wavering."
    },
    {
      "rule_id": "devastated",
      "title": "Devastated units",
      "body": "When damage exceeds the unit's Nerve value, it is Devastated. Halve Attacks (round down). Any failed Nerve test now causes Rout — no more Wavering results."
    },
    {
      "rule_id": "double_six",
      "title": "We Are Doomed (double 6)",
      "body": "Ranged: unit Wavers even if it would have passed. Combat or Withdraw: unit takes D6 extra damage (no further Nerve test triggered). Double 1 always passes regardless of damage."
    },
    {
      "rule_id": "flank_rear",
      "title": "Flank and rear charges",
      "body": "Attacks directed at a flank are doubled before rolling to hit. Attacks directed at a rear are tripled. Determined by where the charging unit's front facing mid-point sits at time of declaration."
    }
  ]
}
```

### `data/systems/index.json` — Game System Manifest

Allows the app to discover all supported game systems without hardcoding them in JS.

```json
{
  "systems": [
    { "id": "kow", "name": "Kings of War", "version": "v4", "file": "kow.json" }
  ]
}
```

### `data/armies/kow/index.json` — Army Manifest

Allows the app to discover all available factions for a given game system.

```json
{
  "system": "kow",
  "armies": [
    { "id": "goblins", "name": "Goblins", "file": "goblins.json" }
  ]
}
```

### `data/armies/kow/goblins.json` — Army Reference Data

Static reference for the Goblin army. Used in Muster to build rosters and in Battle to populate the unit list with relevant stats and special rules.

```json
{
  "army_id": "goblins",
  "army_name": "Goblins",
  "game_system": "kow",
  "units": [
    {
      "unit_id": "goblin-rabble-regiment",
      "name": "Goblin Rabble",
      "size": "Regiment",
      "type": "Infantry",
      "sp": 5,
      "me": "5+",
      "sh": "-",
      "de": "3+",
      "att": 15,
      "ne": "14/16",
      "pts": 80,
      "special_rules": ["Rabble"],
      "traits": ["Goblin"]
    }
  ]
}
```

> **Note:** Unit roster to be completed. Stats taken from the official Kings of War army lists. This file is reference data only — it does not duplicate anything stored in Google Sheets.

---

## 5. Modes

### 5.1 Muster

**Purpose:** Allow the player to build and save a named army list before a game. The army list is then loaded into Battle mode.

**MVP scope:**
- Add units by name and size (Troop / Regiment / Horde)
- Assign a points value
- Save army to Google Sheets
- Load a saved army into Battle mode

**Deferred to later versions:**
- Full stat lookup from `goblins.json`
- Points validation against an army limit
- Multiple army slots
- Sharing armies with other users

**UI notes:**
- Simple add/remove unit interface
- Minimal input — unit name, size, and points only at MVP
- Saved armies listed on a home screen for quick selection

---

### 5.2 Battle

**Purpose:** The primary mode. Guides the player through a Kings of War game turn by turn, phase by phase. Reduces cognitive load during play.

**MVP scope:**

*Turn tracking*
- Turn counter displaying current turn (1–7) and max turns
- Active player toggle (You / Opponent)
- Phase display (Movement / Ranged / Combat)
- Manual advance through phases and turns

*Unit roster*
- Displays all units in the loaded army
- One-tap "Routed" toggle per unit — routed units are visually marked and moved to a collapsed section
- Units not yet engaged remain prominent

*Phase prompts*
- At the start of each phase, display relevant prompts from `kow.json`
- Prompts are dismissible but not permanently hidden
- Priority: "high" prompts shown first

*Quick notes*
- A single free-text field per turn for quick observations
- Saved automatically as the player types — no manual save action
- Stored in `wbc_active_game` in localStorage; flushed to Sheets on game
  end as the game payload's `notes` field

*Game end*
- Triggered manually by the player or automatically at end of turn 7
- Prompt to record result (Win / Loss / Draw)
- Write game summary to Sheets
- Offer to proceed directly to Chronicle

*Abandon*
- Available both mid-game (in the scroll footer, alongside End Game) and
  when resuming a game left in progress (resume card)
- Confirms before acting, then discards the active game with no Sheets
  write and no Chronicle entry
- Distinct from Game end: no result is recorded, nothing reaches Chronicle
- Exists to recover from setup mistakes (e.g. wrong player selected to go
  first) or to walk away from a game that isn't worth logging

**Deferred to later versions:**
- Per-unit damage tracking
- Special rule lookup per unit mid-game
- Opponent unit tracking
- Timer

**UI notes:**
- Designed for one-handed use at a table
- Large tap targets
- Minimal text entry during play — taps and toggles only
- Phase prompts must not obscure the roster

---

### 5.3 Chronicle

**Purpose:** Capture structured reflection immediately after a game, and browse the history of past games over time.

**Two states:**

*Logging (immediately post-game)*
- Triggered from Battle mode on game end, or accessible manually
- Pre-populated with date, army used, and result from the active game
- Fields:
  - What worked? (free text)
  - What didn't? (free text)
  - One thing to try next time (free text)
- Rotating prompt shown as a reflection catalyst — prompts are not data labels, all text feeds the same underlying field
- Quick to complete — target under two minutes

*Browsing (past games)*
- List of past games in reverse chronological order
- Each entry shows: date, result, army used, one-line preview of "next time" tip
- Tap to expand full reflection
- [TBD: filtering and search]

**Rotating reflection prompts (examples — full list TBD):**
- "Was there a moment you felt you had the upper hand? What caused it?"
- "Which unit surprised you — for better or worse?"
- "If you could replay one turn, which would it be and why?"
- "What did your opponent do that you didn't expect?"
- "Was there a rule you were unsure about mid-game?"

**Deferred to later versions:**
- Unit tagging within reflections (to surface reminders in Battle mode)
- Rule-flagging that creates prompts in future games
- Opponent tracking across games
- Win/loss statistics and trends
- Surface Battle mode quick notes (`turn_log`, saved as the game payload's
  `notes` field) somewhere in Chronicle — currently written to Sheets but
  never displayed. Candidates: prefill the reflection form as a
  memory-jogger, or show alongside reflection fields in the expanded entry.

---

## 6. Game Systems

### Currently Supported

| System | Version | Status |
|---|---|---|
| Kings of War | v4 | Active development |

### How to Add a New Game System

Adding a second game system requires no changes to application code. The process is:

1. Create `data/systems/{system_id}.json` following the schema defined in section 4
2. Add the new system to `data/systems/index.json`
3. Create `data/armies/{system_id}/` folder
4. Create `data/armies/{system_id}/index.json` listing available factions
5. Create `data/armies/{system_id}/{faction}.json` for at least one army
6. Test that all prompts and quick reference rules render correctly in Battle mode

The app's JS reads the game system dynamically from the JSON manifests — there are no hardcoded references to Kings of War in `battle.js`, `muster.js`, or `chronicle.js`.

---

## 7. Roadmap

### Now — v0.1 (MVP)
Target: functional at the table within 3 weeks

- [x] Battle mode: turn tracker, phase display, unit roster with Routed toggle
- [x] Battle mode: phase prompts from `kow.json`
- [x] Battle mode: quick note per turn
- [x] Battle mode: game end flow → write to Sheets
- [x] Chronicle mode: post-game logging form
- [x] PWA setup: installable, works offline in Battle mode
- [x] `kow.json`: full turn sequence and prompts
- [x] `goblins.json`: Goblin unit roster

### Next — v0.2
- [x] Chronicle mode: past games browser
- [x] Muster mode: army builder with save/load
- [x] Battle mode: load army from Muster into roster
- [ ] Rotating Chronicle prompts (full set)
- [x] UI polish and mobile optimisation

### Later — v0.3+
- [ ] Per-unit damage tracking in Battle mode
- [ ] Quick reference rule cards accessible mid-game
- [ ] Reflection tagging — link units and rules to Chronicle entries
- [ ] Win/loss statistics in Chronicle
- [ ] Surface Battle mode quick notes in Chronicle (see §5.3)

### Icebox — Maybe one day
- [ ] Second game system support
- [ ] Opponent unit tracking
- [ ] Multiplayer / shared game view
- [ ] App Store wrapper (Capacitor)
- [ ] User accounts (migration from Google Sheets to Supabase)
- [ ] Community army lists

---

## 8. Open Questions

Reviewed and updated each working session.

| # | Question | Context | Status |
|---|---|---|---|
| 1 | What is the Google Sheets authentication approach? | Sheets API requires OAuth or an API key. For single-user MVP, a published Sheet with Apps Script web app may be simpler than full OAuth. | Open |
| 2 | How are armies shared between users? | Current approach: each user connects their own Sheet. A URL parameter carries the Sheet ID. Not elegant but functional for MVP. | Provisional |
| 3 | What happens to Muster mode long-term? | If the Mantic Companion improves, does Warboss Companion need a full army builder, or does it focus on Battle and Chronicle? | Open |
| 4 | Full Goblin unit roster | `goblins.json` audited against the Mantic Companion PDF (source of truth) — 28 units, 3 flagged `"retired": true` rather than deleted to preserve saved-army compatibility. | Done |
| 5 | Full Chronicle rotating prompt list | A full set of reflection prompts needs to be written. Target: 20–30 prompts. | In progress |
| 6 | Will some players object to a helper app? | Concern that experienced players may consider rule-recall part of the skill of the game. Assessment: not our audience; app is a notepad, not an autopilot. | Low priority |
| 7 | When/whether to pursue App Store distribution | PWA first. App Store only if user demand is clear and sustained. | Deferred |
