# Changelog

All notable changes to Warboss Companion are documented here.
Format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]
- Rules-accuracy audit of the original 35 Training Ground questions against
  the KoW 4E mini-rulebook and FAQ (structural validation done; rules-
  correctness pending)
- Training Ground: added 20 new questions to `data/systems/kow-training.json`
  (35 → 55), rebalancing category coverage — `command` and `unit_stats` were
  the thinnest categories going in
  - Verified at write time per `docs/training-question-workflow.md` Phase 3:
    each answer checked against the mini-rulebook/FAQ (plus a Full Rulebook
    citation for Radiance of Life), with section-name sourcing rather than
    page numbers; in-game unit references (Sharpstick Thrower, King on
    Chariot, Wiz) cross-checked against `goblins.json`
  - Phase 5 review against the combined 55-question bank: no true duplicates,
    no distractor collisions, answer-index distribution flat (14/14/14/13)
  - Category totals after merge: morale 9, movement 6, ranged 6, melee 6,
    scenario 6, magic 5, special_rules 5, terrain 5, unit_stats 4, command 3
  - No SPEC.md change required — schema and category set are unchanged, this
    is a pure content addition
  - Service worker cache bump handled manually (outside this change)

## [0.3.1] - 2026-07-03
### Added
- Options Consumption: unit options (upgrades) are now consumed by the app —
  authored in Muster and displayed in Battle
- `js/resolver.js`: new shared module — the single place effective profiles and
  effective points are computed. Given a unit and selected option ids it applies
  all four effect types (`add_special_rule`, `set_field`, `add_weapon`,
  `grant_spell`) and also normalises the saved-army `units` field. Pure logic;
  no DOM, localStorage, Sheets, or fetch. Consumed by both Muster and Battle so
  option logic is never duplicated (Way of Working #3)
- Muster: per-unit options panel — independent toggles, mutually-exclusive
  groups (single-select with deselection), and informational battalion-scope
  rows; live points recompute; picker now grouped by `category` (Core,
  Auxiliary, Specialist, Support, Commander) with display-only `availability`
  badges (Limited / Unique) and an options marker
- Battle: roster cards now show the **effective** profile (mounted/upgraded
  unit), with fitted-option chips under the unit name and any added weapons /
  granted spells as compact sub-lines. The effective profile is snapshotted onto
  each roster instance at game start and never re-resolved mid-game
### Changed
- Saved-army `units` field: entries may now be `{ unit_id, options }` objects as
  well as bare `unit_id` strings. Readers accept both; writers always write the
  object form. Legacy `unit_id`-only armies load unchanged and migrate on next
  save (Fail Gracefully)
- `service-worker.js`: cache bumped to `wbc-v22`; `js/resolver.js` added to the
  precached shell
### Fixed
- Muster: an army containing a `retired: true` unit no longer renders it as
  "(not found)" or silently drops its points when edited. Retired units resolve
  and count correctly for armies that already reference them; retirement only
  hides a unit from *new* selection in the picker (unit_id immutability protects
  the reference — Battle already handled this correctly)
### Notes
- `availability` caps and battalion-scope option effects are captured and shown
  but not yet enforced — per-Battalion / per-army composition validation lands
  with the future army-composition system


  an archery-target button beside Settings (top-right) — kept out of the bottom
  nav to signal experimental status
- `data/systems/kow-training.json`: hand-authored question bank (35 questions)
  plus the locked 10-category vocabulary block
- Optional `training_file` field on system entries in `data/systems/index.json`,
  so a system's question bank is discoverable via the manifest
- `docs/training-categories.md`: question-authoring guidelines (reference only;
  not shipped in the app bundle)
### Changed
- `service-worker.js`: cache bumped to `wbc-v20`; `js/training.js` and
  `data/systems/kow-training.json` added to the precached shell
### Notes
- Question order is shuffled per session; option order is re-shuffled on every
  presentation of a question. v1 is stateless — no progress or history is kept
- The mode loads its bank lazily, outside the boot chain, and fails gracefully
  to an empty/error state if the bank is missing or malformed — Muster, Battle,
  and Chronicle are unaffected either way

## [0.2.0] - YYYY-MM-DD
> Date to confirm. Entries reconstructed from SPEC.md §7 (items marked shipped).
### Added
- Chronicle mode: past-games browser (reverse-chronological, tap to expand)
- Muster mode: army builder with save/load
- Battle mode: load a saved army from Muster into the roster
### Changed
- UI polish and mobile optimisation

## [0.1.0] - YYYY-MM-DD
### Added
- Battle mode: turn tracker, phase display, unit roster with Routed toggle
- Battle mode: phase prompts from `kow.json`, quick note per turn, game-end flow
- Chronicle mode: post-game logging form
- PWA: installable, works offline in Battle mode
- `kow.json` full turn sequence and prompts; `goblins.json` unit roster
