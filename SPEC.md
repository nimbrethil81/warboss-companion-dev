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
- **Scaling phase** — evaluate against three possible states, not a single target:
  1. *Single user* (current) — zero-cost, localStorage + one personal Sheet, no auth.
  2. *Small group* — a closed set of friends sharing the app; implies shared/multi-user Sheets access and some notion of identity, without public infrastructure.
  3. *Public release* — many thousands of users; implies real backend scaling (Apps Script quotas, hosting, auth, abuse prevention).

  Ask what breaks first at each phase boundary rather than assuming one generic "what if this scales" framing. No phase beyond (1) is committed — this is an evaluation lens, not a roadmap commitment.
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

**Workflow:** All changes are built and tested in the dev repo first. A GitHub Action copies changed files from dev to live, overwriting files of the same name. The deploy also triggers the Pages build. No change goes to live without passing in dev first.

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
│   ├── training.js         ← Training Ground mode logic (beta)
│   ├── resolver.js         ← ALL option/effect resolution + saved-army normalisation
│   ├── sheets.js           ← ALL Google Sheets read/write (single module)
│   └── storage.js          ← ALL localStorage read/write (single module)
│
├── data/
│   ├── systems/
│   │   ├── index.json      ← Manifest of all supported game systems
│   │   ├── kow.json        ← KoW turn sequence, phases, prompts, rules, artefact_rules
│   │   ├── kow-training.json ← Training Ground question bank + categories (beta)
│   │   ├── kow-artefacts.json ← Magic artefact catalogue (system-level)
│   │   └── kow-enums.json    ← Canonical unit type/size vocabulary (validated at load)
│   └── armies/
│       └── kow/
│           ├── index.json  ← Manifest of all KoW factions
│           └── goblins.json ← Goblin unit roster with stats
│
├── docs/
│   └── training-categories.md ← Question-authoring reference (not shipped)
│
└── assets/
    └── icons/              ← PWA icons (multiple sizes)
```

**Key structural decisions:**

- `sheets.js` is the only file that touches Google Sheets. When migrating to a new database, only this file changes.
- `storage.js` is the only file that touches localStorage. Centralises offline fallback.
- `resolver.js` is the only place effective profiles and effective points are computed. Given a unit, its selected option ids, and an optional equipped artefact, it produces the effective profile (stats, added special rules, added weapons, granted spells) and effective points; it also decides artefact eligibility (via `kow.json`'s `artefact_rules` plus each artefact's own restrictions) and normalises the saved-army `units` field into a consistent `{ unit_id, options, artefact }` shape. Both Muster (authoring/pricing) and Battle (roster build) consume it, so option/artefact logic is never duplicated. Pure logic — no DOM, localStorage, Sheets, or fetch. It also exposes `validateUnitEnums()`, which checks each unit's `type`/`size` against `kow-enums.json` at load (see *Enum validation* under Data Flow).
- `data/systems/kow.json` is the single source of truth for all KoW game rules, turn sequence, and prompts. Adding a new game system means adding a new JSON file alongside it — no code changes required.
- `data/armies/kow/goblins.json` holds static unit reference data. This belongs in version control, not in Sheets. Sheets stores game results and reflections.
- `data/armies/kow/index.json` is a manifest listing all available factions for KoW. The app reads this to discover armies without needing to enumerate directory contents (which browsers cannot do natively). Adding a new army means adding the file and one line to this manifest.
- `data/systems/index.json` is a manifest listing all supported game systems. Adding a new game system means adding a new systems JSON file, a new `armies/{system}/` folder, and one line to this manifest.
- `data/systems/kow-training.json` holds the Training Ground question bank and its category vocabulary. It is **not** part of the boot chain — `training.js` loads it lazily on first activation of the mode, and the `training_file` manifest field is optional. A missing or malformed bank degrades Training Ground to an empty/error state and cannot affect Muster, Battle, or Chronicle.
- `data/systems/kow-artefacts.json` holds the magic artefact catalogue at the system level (artefacts are core rules shared by every faction, not faction-specific — so they live here, never in `goblins.json`). The eligibility *rules* live separately in `kow.json`'s `artefact_rules` block; this file is the catalogue only. It is loaded via the optional `artefact_file` manifest field, in parallel with the army index and outside the blocking boot path: a missing/malformed catalogue leaves `WBC.artefactData` null and simply hides the artefact picker/chip, never affecting the core modes (Fail Gracefully — same isolation posture as the Training Ground bank).
- `data/systems/kow-enums.json` is the canonical `type`/`size` vocabulary for all factions. `resolver.js` validates every unit against it at load; a missing enum file *warns* that the guard is inactive rather than skipping silently, since it is WBC's only defence against faction-data drift as more armies are authored. Loaded via the optional `enum_file` manifest field, same non-blocking posture as the artefact catalogue.

### Data Flow

```
On app load
  └── app.js loads kow.json (turn sequence, prompts, artefact_rules)
  └── app.js loads kow-artefacts.json in parallel (if the system declares
      artefact_file) — non-blocking; on failure WBC.artefactData stays null
      and the app boots and runs normally without artefacts (Fail Gracefully)
  └── app.js loads kow-enums.json in parallel (if the system declares
      enum_file) — non-blocking; once both army data and enums resolve,
      resolver.js validateUnitEnums() checks every unit's type/size
  └── sheets.js fetches saved armies and past games (with localStorage fallback on failure)

During Muster
  └── muster.js loads/saves armies via sheets.js; resolver.js normalises the
      saved units field and computes effective points per selected unit
      (including its equipped artefact); resolver.js also determines which
      artefacts each unit is eligible to equip

During Battle mode
  └── battle.js holds all game state in localStorage
  └── On start, resolver.js resolves each saved-army entry (options + artefact)
      into the effective profile snapshotted onto the roster (see localStorage
      schema below)
  └── No Sheets writes during play (offline-safe, fast)

On game end
  └── battle.js calls sheets.js to write game summary
  └── On Sheets write failure → user prompted to retry; local data preserved

On Chronicle load
  └── sheets.js fetches past games from Sheets
  └── On failure → displays locally cached games with error notice

On Training Ground open (first time only)
  └── training.js lazily loads kow-training.json (resolved via index.json → training_file)
  └── Outside the boot chain — on failure or malformed data it shows an empty/error state; core modes unaffected
```

**Enum validation — fail-loud validator, catch-and-surface caller.** `resolver.js`'s `validateUnitEnums()` *throws* on any unlisted `type`/`size` — a loud, located signal for the data author. The `app.js` call site (`_validateArmyEnums`, run once both army data and enums have resolved) deliberately reconciles that with Fail Gracefully: it catches the throw, logs the full located detail to `console.error`, and surfaces the first offending `unit_id`+field in the on-screen data notice — but never nulls `armyData` or blocks boot. An enum violation is an authoring bug, not a runtime condition; for a single-user app the right response is a visible warning plus one wrong value, not a bricked Battle/Chronicle mid-session. This is intentional, not an oversight. The same pure validator is reusable in a Node/CI pre-deploy step for the public-release phase (§2, Future Proofing), where rejecting bad data before ship is the correct posture.

### Google Sheets Schema

Four tabs. Each tab represents one entity type — no data duplicated across tabs.

**`armies` tab**
| Column | Type | Notes |
|---|---|---|
| army_id | string | UUID, generated on creation |
| army_name | string | e.g. "Goblin Raiding Party" |
| game_system | string | e.g. "kow" — matches JSON filename |
| units | JSON string | Serialised array of unit entries (see below) |
| created_at | timestamp | ISO 8601 |
| updated_at | timestamp | ISO 8601 |

**`armies.units` entry forms.** The serialised array may hold entries in any of
these shapes, freely mixed:

- **Legacy** — a bare `unit_id` string (`"goblin-rabble-regiment"`). Written by
  pre-Options-Consumption versions.
- **Options-era** — an object `{ "unit_id": "...", "options": ["opt-id", ...] }`.
- **Current** — an object `{ "unit_id": "...", "options": ["opt-id", ...], "artefact": "artefact-id" }`
  carrying the selected option ids and the single equipped artefact id for that
  unit. `options` may be absent or empty; `artefact` may be absent or `null`
  (a unit may equip at most one artefact, per the rulebook).

Rule: **readers accept all forms; writers always write the current object form**
(even for units with no options and no artefact). Existing legacy/options-era
armies load unchanged and migrate to the current form the next time they are
saved in Muster (Fail Gracefully). Id immutability (unit, option, and artefact
ids alike) is what makes stored references stable across saves. Normalisation to
a consistent `{ unit_id, options, artefact }` array happens in exactly one
place — `resolver.js` — never re-implemented per caller.

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
      "inst_id": "uuid",
      "unit_id": "wiz-hero",
      "name": "Wiz", "size": "1", "type": "Hero (Cav)",
      "sp": 10, "me": 5, "sh": 4, "de": 4, "att": 1, "ne": 11,
      "special_rules": ["…effective, post-options…"],
      "weapons": [{ "name": "Shortbows", "range": "18\"", "sh": 5, "att": 8 }],
      "spells":  [{ "spell": "Lightning Bolt", "power": 3 }],
      "selected_option_ids": ["wiz-fleabag", "wiz-lightning-bolt"],
      "option_labels": ["Mount on a fleabag", "Lightning Bolt"],
      "artefact_id": "inspiring-talisman",
      "artefact_label": "Inspiring Talisman",
      "routed": false,
      "damage": 0
    }
  ],
  "turn_log": []
}
```

All stat fields on a roster instance are the **effective** values from
`resolver.js`, snapshotted once at game start and never re-resolved — mid-game
state is stable even if `goblins.json` changes before the game ends. `inst_id`
is unique per instance so duplicate units (e.g. 6× Goblin Rabble) track routed/
damage state independently. `weapons`, `spells`, `selected_option_ids`,
`option_labels`, and the singular `artefact_id`/`artefact_label` are **omitted
entirely when empty/absent**, so instances built from legacy (no-option,
no-artefact) armies are byte-identical in spirit to earlier snapshots and the
resume path needs no migration (absent fields render nothing). The artefact is
stored as its own singular pair (a unit carries at most one), kept separate from
the plural `option_labels`.

### PWA & Offline Strategy

- `service-worker.js` caches `index.html`, `style.css`, all JS files, and all JSON files in `/data/`
- The app is fully functional offline for Battle mode (no Sheets required during play)
- The Training Ground question bank (`kow-training.json`) is precached in the shell, so the quiz works offline; if the file is ever absent, the mode degrades gracefully and the rest of the app is unaffected
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
    { "id": "kow", "name": "Kings of War", "version": "v4", "file": "kow.json", "training_file": "kow-training.json", "artefact_file": "kow-artefacts.json", "enum_file": "kow-enums.json" }
  ]
}
```

The optional `training_file` field points to a system's Training Ground question bank (see below). It is read only by `training.js`; its absence simply means that system has no Training Ground data yet, and the mode handles that gracefully.

The optional `artefact_file` field points to a system's magic artefact catalogue (see below). `app.js` loads it in parallel with the army index; its absence, or a load failure, simply means Muster/Battle show no artefacts, and everything else works unchanged (Fail Gracefully).

The optional `enum_file` field points to the system's canonical unit type/size vocabulary (see below). `app.js` loads it in parallel with the army index; unlike the other optional files, its absence is *warned about loudly* — it disables the only guard against faction-data drift — though it still never blocks boot (Fail Gracefully).

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
      "me": 5,
      "sh": "-",
      "de": 4,
      "att": 12,
      "ne": "14",
      "pts": 80,
      "special_rules": ["Rabble"],
      "traits": ["Goblin"]
    }
  ]
}
```

> **Note:** Unit roster to be completed. Stats taken from the official Kings of War army lists. This file is reference data only — it does not duplicate anything stored in Google Sheets.

**Unit type & size (controlled vocabulary).** `type` and `size` are orthogonal axes and must never be conflated: `type` is what kind of model the unit is (its rules profile, base footprint, height); `size` is how many models it fields. A Titan's Titan-ness lives in `type`, never in `size`; a single model's single-ness lives in `size` (`"1"`), never duplicated into `type`.

Both fields draw from the fixed vocabulary in `data/systems/kow-enums.json` (below) and are validated against it at load. Mapping from the army-list PDF is mechanical: `size` ← the SIZES column verbatim (`Troop`/`Regiment`/`Horde`/`Legion`, or `"1"` for any single-model unit); `type` ← the TYPE column normalised (`LRG INF` → `Large Infantry`, `HERO/CAV` → `Hero (Cav)`, `MON/CHT` → `Monster/Chariot`, title-cased).

- **`"1"` is the canonical single-model size** — every hero, war engine, monster, titan, and mon/cht. The PDF prints `1` (one model); we store it verbatim. There is no `"Individual"` size.
- **`Individual` is a *special rule*, not a size** — it lives in `special_rules` on units that carry it (many single-model heroes do; war engines do not), entirely separate from the `size` field.
- **`Heavy Infantry` and `Monstrous Infantry` are distinct (legacy-labelled) types**, kept separate from `Infantry`/`Large Infantry`: they sit on larger bases but otherwise follow the same rules. The `type_inheritance` map in `kow-enums.json` records this so rules logic can treat `Heavy Infantry` as `Infantry` and `Monstrous Infantry` as `Large Infantry` where a rule keys off the parent type.
- **Mounted heroes** are authored at their on-foot type; a "Mount on X" option flips `type` via a `set_field`/`modify_field` effect (e.g. → `Hero (Cav)`), never a second base entry.

**Unit options (upgrades).** Units may carry an `options` array. Absence is fully tolerated — Muster renders and points-costs whatever is present, and a unit with no `options` shows no upgrades. Example (real Goblin options):

```json
"options": [
  { "id": "fleabag-riders-maniacs", "label": "Maniacs",
    "description": "Gains Thunderous Charge (+1).",
    "scope": "self", "cost": 5,
    "effects": [ { "type": "add_special_rule", "rule": "Thunderous Charge (+1)" } ] },
  { "id": "wiz-fleabag", "label": "Mount on a fleabag",
    "scope": "self", "cost": 15,
    "effects": [ { "type": "set_field", "field": "sp", "value": 10 },
                 { "type": "set_field", "field": "type", "value": "Hero (Cav)" } ] }
]
```

Each option's `cost` is the flat points for that unit's single size — because units are split per size, the same option appears on each size's entry with its own value (Maniacs above is `5` on the Troop entry; the Regiment entry carries it at `10`).

Field contract (per option):

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within the unit. Immutable — saved armies reference selected option ids (same contract as `unit_id`). |
| `label` | yes | Short display name shown in Muster. |
| `description` | recommended | Human-readable effect text; the sole representation for battalion-scope options. |
| `scope` | yes | `"self"` modifies the carrying unit; `"battalion"` affects/unlocks *other* units — informational in Muster v1, no cross-unit enforcement. |
| `group` | no | Absent = independent toggle. A string = mutually-exclusive choose-one group (at most one selected per group). |
| `cost` | yes (self-scope) | Integer points added when the option is selected. Omitted for battalion-scope (cost attaches to the target unit, stated in `description`); free options use `0`. Units are split per size, so each size's cost lives on its own unit object — no size-keyed map. |
| `effects` | recommended (self-scope) | Array of structured effects (below). Drives stat/rule application; absence still leaves display + points correct. |

Effect objects:

| `type` | Payload | Meaning |
|---|---|---|
| `add_special_rule` | `rule` | Adds the named special rule to the profile. |
| `set_field` | `field`, `value` | Sets a top-level profile field to an absolute value (e.g. `sp`, `type`) — covers stat and mount type changes. |
| `modify_field` | `field`, `delta`, optional `min`/`max` | Adds a delta to a numeric top-level field (e.g. `sp +1`, `de -1`), with optional clamp. Preserves the field's original JS type — fields stored as strings (e.g. the SPEC-locked `ne`) are parsed, adjusted, and cast back — so the effective profile stays shape-compatible with the base data. |
| `add_weapon` | `name`, `range`, `sh`, `att`, optional `special_rules` | Adds a weapon profile to the unit; `special_rules` (e.g. `["Piercing (1)"]`) is carried when present. |
| `grant_spell` | `spell`, `power` | Adds an inline caster spell offered by the unit — distinct from the shared Arcane Library pool. |

This effect vocabulary is shared verbatim by unit options and magic artefacts (see below) — the resolver interprets it in exactly one place. New types are additive and require a SPEC bump. Battalion-scope options carry no self effects in v1; the future composition system will action them.

**Unit availability (composition caps).** A unit may carry an `availability` object recording how many times it can be taken. Two kinds, with different scopes:

```json
"availability": { "type": "limited", "scope": "battalion", "max": 2 }
```
```json
"availability": { "type": "unique" }
```

`[N]` after a unit name in the army list = **Limited** (`type: "limited"`), max `N` selections *per Battalion*. `[U]` = **Unique** (`type: "unique"`), max 1 in the entire *army*. Absent `availability` = unconstrained.

| Field | Required | Notes |
|---|---|---|
| `type` | yes | `"limited"` or `"unique"`. |
| `scope` | limited only | `"battalion"` — the only scope the rulebook defines for limited units. |
| `max` | limited only | Integer cap per Battalion (the `N` in `[N]`). |

Like `options.scope: "battalion"`, this is capture-only in v1: Muster stores the true rule but does not yet enforce per-Battalion or per-army counts — that lands with the future army-composition system. Recording it now means the roster never needs re-reading when that system is built.

**Unit category (composition role).** Every unit carries a `category` — its composition role, used by the future composition system to validate Battalion structure. Values match the rulebook's unlock categories: `"Core"`, `"Auxiliary"`, `"Specialist"`, `"Support"`, `"Commander"`.

Category is **per size**, not per family: the same unit at different sizes can sit in different categories (e.g. Fleabag Riders are `"Auxiliary"` as a Troop, `"Core"` as a Regiment), so it lives on each size-specific `unit_id`.

Commander units additionally carry `commander_role` (`"champion"` or `"warlord"`), preserving the rulebook's two distinct constraints without a hardcoded grouping: the Commander unlock (1-4/Battalion) keys off `category == "Commander"`, the Warlord cap (1/Battalion) off `commander_role == "warlord"`. Absent on non-Commanders.

| Field | Required | Notes |
|---|---|---|
| `category` | yes | One of `Core`, `Auxiliary`, `Specialist`, `Support`, `Commander`. Per size-specific `unit_id`. |
| `commander_role` | Commanders only | `"champion"` or `"warlord"`. Absent otherwise. |

Like `availability`, capture-only in v1 — stored now, not yet enforced.

### `data/systems/kow-training.json` — Training Ground Question Bank

Hand-authored multiple-choice question bank for Training Ground, plus the category vocabulary the questions are tagged against. Co-located in one file (Single Source of Truth): the `categories` block is the only definition of the category ids, and each question references one of them.

```json
{
  "system_id": "kow",
  "version": "v4",
  "categories": [
    { "id": "movement", "name": "Movement" },
    { "id": "morale",   "name": "Nerve" }
  ],
  "questions": [
    {
      "id": "q_morale_001",
      "category": "morale",
      "question": "You have damaged an enemy unit and now test its Nerve. What do you roll, and what do you add?",
      "options": ["Roll 2D6 only", "Roll D6 and add the damage", "Roll 2D6 and add current damage", "Roll 3D6"],
      "answer": 2,
      "explanation": "You roll 2D6 and add the unit's current total damage, then compare the total to its Nerve value.",
      "source": "Rulebook p.33"
    }
  ]
}
```

**Field contract (per question):**

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, convention `q_<category>_NNN`. Immutable once authored — a future per-question history/SRS layer will key on it. |
| `category` | yes | Must match a `categories[].id` in the same file. |
| `question` | yes | Self-contained stem. v1 is text-only; legal-move scenarios describe the whole board situation in text. |
| `options` | yes | Array of answer strings (v1 authors exactly 4). Length is not hardcoded in logic — the renderer handles whatever is present. |
| `answer` | yes | 0-based index into `options` **in authored order**. Options are shuffled at render, so this index is remapped, never rendered directly. |
| `explanation` | recommended | Shown after answering — the recall payoff. |
| `source` | recommended | Citation into the rulebook/FAQ, for maintenance and audit. |

**Category vocabulary (10, locked):** `movement`, `ranged`, `melee`, `morale` (displayed "Nerve"), `magic`, `command`, `special_rules`, `unit_stats`, `terrain`, `scenario`. Ids are portable by convention: an overlapping concept in a future system reuses the same id. Full authoring guidance and boundary rules live in `docs/training-categories.md`.

**Randomisation:** question order is shuffled once per session; option order is re-shuffled on **every** presentation of a question, so a repeat can't be answered from remembered position. Both use Fisher–Yates on copies — the source arrays are never mutated.

### `data/systems/kow-artefacts.json` — Magic Artefact Catalogue

System-level catalogue of magic artefacts (core rules shared by every faction, so they live here, not in any army file). Source: Rulebook, Magic — Magical Artefacts. Loaded via the optional `artefact_file` manifest field; absence/failure is fully tolerated (Fail Gracefully).

```json
{
  "system_id": "kow",
  "version": "v4",
  "artefacts": [
    {
      "id": "brew-of-haste",
      "name": "Brew of Haste",
      "class": "common",
      "cost": 20,
      "description": "The unit increases its Speed stat by +1.",
      "effects": [ { "type": "modify_field", "field": "sp", "delta": 1 } ]
    },
    {
      "id": "wings-of-honeymaze",
      "name": "Wings of Honeymaze",
      "class": "heroic",
      "cost": 25,
      "description": "The hero gains Fly but decreases its Defence by 1, to a minimum of 2+.",
      "effects": [
        { "type": "add_special_rule", "rule": "Fly" },
        { "type": "modify_field", "field": "de", "delta": -1, "min": 2 }
      ],
      "restrictions": { "allowed_types": ["Hero (Inf)"] }
    }
  ]
}
```

**Field contract (per artefact):**

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, immutable — saved armies reference it (same contract as `unit_id`/option id). |
| `name` | yes | Display name (used for the Muster label and the Battle chip). |
| `class` | yes | `"common"` (any eligible unit) or `"heroic"` (Heroes only). |
| `cost` | yes | Integer points added to the equipping unit. |
| `description` | yes | Human-readable rules text. Always shown; the sole representation for artefacts whose effect is conditional/bespoke. |
| `effects` | no | Array of structured effects (same vocabulary as options). Present **only** for artefacts making an *unconditional* profile change (always-active named rule, base-stat delta, granted spell/weapon). Conditional, once-per-game, and in-play-modifier artefacts carry no `effects` — they are description-only, so the effective profile never shows a modifier that is not always active. |
| `restrictions` | no | Per-artefact narrowing on top of the class/global rules. `allowed_types` — a whitelist of exact `type` strings (e.g. `["Hero (Inf)", "Hero (Cav)"]` for "Infantry and Cavalry only"). `forbid_special_rules` — bars units carrying any listed rule (e.g. `["Individual", "Fly"]`). |

**Eligibility rules — `kow.json` `artefact_rules` block.** The *rules* for who may equip what live in `kow.json` (data, not JS), keeping game values out of code. The catalogue above holds only per-artefact class/restrictions.

```json
"artefact_rules": {
  "max_per_unit": 1,
  "unique_per_army": true,
  "global_exclusions": {
    "exclude_types": ["War Engine"],
    "exclude_types_unless_hero_prefix": ["Monster", "Monster/Chariot"],
    "exclude_if_availability_type": ["unique"]
  },
  "class_gates": {
    "common": { "requires_type_prefix": null },
    "heroic": { "requires_type_prefix": "Hero" }
  }
}
```

Global exclusions apply to every unit before class gates: War Engines are barred; `Monster`/`Monster/Chariot` are barred *unless* the unit's `type` begins `"Hero"` (so `Hero (Mon)` is eligible, plain Monsters are not); and Unique `[U]` units (those whose `availability.type` is `"unique"`) are barred outright. Class gates then narrow heroic-class artefacts to units whose `type` begins `"Hero"`. Each artefact's own `restrictions` narrow further still. `max_per_unit` (1) and `unique_per_army` (each artefact at most once across the army) are enforced by Muster at selection time, since they require looking across the whole draft. All eligibility logic is implemented once in `resolver.js` (`isArtefactEligibleForUnit`, `getEligibleArtefacts`) and consumed by Muster — never re-implemented.

### `data/systems/kow-enums.json` — Canonical Unit Type/Size Vocabulary

The controlled vocabulary for every unit's `type` and `size`, shared by all factions at the system level (like the artefact catalogue, these are core rules, not faction-specific — so they live here, never in `goblins.json`).

```json
{
  "unit_types": ["Infantry", "Heavy Infantry", "Large Infantry", "Monstrous Infantry",
                 "Cavalry", "Large Cavalry", "Chariot", "Monster", "Titan", "War Engine",
                 "Hero (Inf)", "Hero (Cav)", "Hero (Lrg Inf)", "Hero (Lrg Cav)",
                 "Hero (Cht)", "Hero (Mon)", "Hero (Titan)", "Monster/Chariot"],
  "unit_sizes": ["Troop", "Regiment", "Horde", "Legion", "1"],
  "type_inheritance": { "Heavy Infantry": "Infantry", "Monstrous Infantry": "Large Infantry" }
}
```

| Field | Notes |
|---|---|
| `unit_types` | Every legal `type` value across all factions. New combined/unusual forms are added here by decision, never invented ad hoc in a faction file. |
| `unit_sizes` | `Troop`/`Regiment`/`Horde`/`Legion`, plus `"1"` for single-model units. `Legion` ships only via a Horde upgrade but is a valid produced size. |
| `type_inheritance` | Records that `Heavy Infantry` and `Monstrous Infantry` follow `Infantry`/`Large Infantry` rules respectively (larger bases only). |

Loaded via the optional `enum_file` manifest field, in parallel with the army index and outside the blocking boot path (same posture as the artefact catalogue). `resolver.js`'s `validateUnitEnums()` checks every unit's `type`/`size` against these lists at load — the sole guard against a typo'd or unnormalised value silently entering a faction JSON and drifting the faction files apart. Because that guard is pure and takes its data as arguments, the identical function runs unchanged in a Node/CI build step — the phase-3 pre-deploy check that rejects bad faction data before it ships (see §3, *Enum validation*).

---

## 5. Modes

### 5.1 Muster

**Purpose:** Allow the player to build and save a named army list before a game. The army list is then loaded into Battle mode.

**MVP scope:**
- Add units by name and size (Troop / Regiment / Horde)
- Assign a points value
- Save army to Google Sheets
- Load a saved army into Battle mode

**Options authoring (v0.3 — Options Consumption):**
- The draft is an **index-addressed** array of `{ unit_id, options, artefact }` entries, not a flat `unit_id` list, so two copies of the same unit can carry different options/artefact. Removal and per-row editing address a row by its array index.
- Each selected unit with options and/or eligible artefacts shows an expand control (⚙ + fitted-count badge, counting options + artefact) opening an inline panel:
  - **Independent options** (no `group`) render as toggles.
  - **Grouped options** (shared `group` string) render as single-select with deselection — picking one clears any other in the group; re-picking the selected one clears the group (all group options are optional upgrades).
  - **Battalion-scope options** (`scope: "battalion"`) render as **informational** rows (label + description, no control, nothing stored) — no cross-unit enforcement in v1.
- Points recompute live from the resolver as options toggle (free = 0; battalion-scope options carry no cost on the unit, per their description).
- The picker groups available units by **`category`** in rulebook order (Core, Auxiliary, Specialist, Support, Commander), surfaces `availability` caps as display-only badges (Limited: max N per Battalion / Unique — 1 per army), and marks units that carry options.
- **Saved format:** always written as object-form `{ unit_id, options, artefact }` entries (see §4, `armies.units`).

**Artefact authoring (v0.3 — Artefacts Consumption):**
- The same expand panel gains an **Artefact** section listing the artefacts this unit is eligible to equip (per `resolver.js` eligibility, from `kow.json`'s `artefact_rules` + each artefact's own restrictions). War Engines and other ineligible units show no Artefact section.
- Single-select with deselection — at most one artefact per unit (rulebook); picking a second replaces the first, re-picking clears it. Each row shows the artefact's cost, a Common/Heroic class badge, and its description.
- **Unique-per-army** is enforced at authoring time: an artefact already equipped by another unit in the draft renders disabled, with an "already equipped by …" note.
- Points recompute live including the artefact's cost. Artefacts that make an unconditional profile change (e.g. Brew of Haste's +1 Speed, via `modify_field`) feed the effective stats; conditional/bespoke artefacts are display-only.

**Retired-unit resolution:** a saved army referencing a `retired: true` unit still resolves and displays correctly (with a "retired" tag), counting its full points — retirement only hides a unit from *new* selection in the picker, it does not drop it from armies that already reference it. (This corrects an earlier bug where an edited army silently dropped retired units and their points.)

**Deferred to later versions:**
- Points validation against an army limit (enforcement; the limit is captured and displayed now)
- Per-Battalion / per-army composition enforcement of `availability` caps and battalion-scope option effects (the future army-composition system)
- Multiple army slots
- Sharing armies with other users

**UI notes:**
- Simple add/remove unit interface with inline per-unit options + artefact panel
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
- Each unit card reflects the **effective** profile from the resolver — the mounted/upgraded/artefact-bearing unit, not the base entry — with fitted options and the equipped artefact shown as chips under the unit name (the artefact chip visually distinct), and any added weapons / granted spells shown as compact sub-lines (v0.3, Options + Artefacts Consumption). Armies referencing a now-`retired` unit_id still resolve and display (unit_id immutability protects the reference).

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

### 5.4 Training Ground (beta)

**Purpose:** Practise instant recall of KoW 4E rules, scenarios, and unit stats between games — closing the gap Battle mode can't, since Battle only lowers lookup cost during play.

**Placement:** reached via an archery-target button top-right, beside the Settings gear — deliberately outside the bottom nav to signal an experimental utility rather than a core mode.

**Session flow:**
- Multiple-choice, 4 options per question
- Question order shuffled per session; option order re-shuffled on every presentation (repeats can't be answered from position)
- Answer is revealed with an explanation and a rulebook/FAQ source citation
- End-of-session score (correct / total), then start again

**Stateless (v1):** no per-question history, no spaced repetition, no progress saved. Score is in-memory only and resets each session. This is a confirmed v1 scope decision, not a limitation to work around.

**Isolation / Fail Gracefully:** the question bank loads lazily on first activation, entirely outside the boot chain. A missing/malformed bank, or a system with no `training_file`, degrades the mode to an empty/error state and never affects Muster, Battle, or Chronicle. `training.js` touches neither localStorage nor Sheets.

**Data:** see `data/systems/kow-training.json` in section 4.

**Deferred to later versions:**
- Progress tracking / spaced repetition
- Category filtering (the vocabulary is authored now to make this cheap later)
- Question-bank expansion and ongoing maintenance
- AI-generated questions (explicitly out of scope — a separate future concern)

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
7. *(Optional)* Add `data/systems/{system_id}-training.json` (question bank + categories) and a `training_file` entry on that system in `data/systems/index.json` to enable Training Ground for it

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
- [x] Training Ground (beta): multiple-choice rules-recall quiz mode
- [x] Options Consumption: unit options (upgrades) authored in Muster and shown in Battle; shared `resolver.js`; effective-profile roster; category grouping + availability badges (display-only); retired-unit resolution fix
- [x] Artefacts Consumption: magic artefact catalogue (`kow-artefacts.json`); `artefact_rules` eligibility in `kow.json`; per-unit artefact authoring in Muster with unique-per-army enforcement; artefact chip + effective profile in Battle; `modify_field` effect type
- [ ] Training Ground: rules-accuracy audit of the question bank against the KoW 4E mini-rulebook and FAQ (structural validation done; rules-correctness pending)
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
| 8 | Training Ground rules-accuracy audit | The 35 v1 questions passed structural validation and cite rulebook/FAQ pages, but each answer's correctness has not yet been independently verified against those sources. Recommended before promoting Training Ground beyond beta. | Open |
