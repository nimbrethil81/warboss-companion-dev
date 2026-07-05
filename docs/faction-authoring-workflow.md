# WBC — Faction Army Reference Authoring Workflow + Prompt

Author one faction at a time, in stages, with an Opus audit gate before acceptance. The enemy is hallucination (the "Goblin Blaster mistake" — a plausible-sounding unit/stat that was never in the source). Every mitigation below exists to force each value back to the printed army list.

---

## 1. Model / effort (per faction)
- **Authoring:** Opus + High (accuracy-critical transcription + judgement on options/availability).
- **Token-saving variant:** Stage 1–2 transcription on Sonnet + Medium or an external AI → **mandatory Opus + High audit (Stage 4) before the file is accepted.** The audit gate does not move.
- The audit is the safety net regardless of which model generated the draft.

## 2. One-faction-at-a-time, staged (mirrors the staged-builds discipline)
Do NOT attempt multiple factions in one pass, and do NOT author options before the stat table is verified.

**Prep.** Identify the faction's pages in the army list PDF. Have on hand: `kow-enums.json` (locked vocabulary), one authored faction as the gold shape (`goblins.json`), and this prompt.

**Stage 1 — Base stat table only.** Transcribe every unit's base profile (unit_id, name, type, size, sp/me/sh/de/att/ne, pts, special_rules, traits, category) directly from the PDF. No options, no availability yet.
- Gate: unit count matches the source; every `type`/`size` is enum-valid; every `ne` is a single value; every single-model unit is `size:"1"`; each unit is tagged with the exact name as printed (hallucination check).

**Stage 2 — Options, availability, composition.** Add `options[]` (flat per-size costs, groups, effects), `availability` (`[U]`→unique, `[N]`→limited/battalion/max including 0), `commander_role`, and any `(AUX)` size-row overrides.
- Gate: every option cost traces to a printed value; mutually-exclusive upgrades share a `group`; mount options flip `type` via `set_field`, not a second base entry.

**Stage 3 — Emit full JSON + self-check report** (see prompt). Strict JSON, plus a verification table.

**Stage 4 — Opus audit (gate).** Rules-correctness at write time, not deferred: no invented units/stats, enum validity, one-entry-per-size, single-value ne, points cross-check, no `unit_id` collisions. Only after this passes is the file accepted.

**Stage 5 — Load test.** Add the faction to `data/armies/kow/index.json`; boot the app; confirm `validateUnitEnums()` passes and a list builds. Then SPEC/CHANGELOG (see §5 of chat).

---

## 3. Ready-to-paste prompt (self-contained)
Replace `{{FACTION}}` and attach/paste the faction's army-list pages as `{{SOURCE}}`. This prompt assumes no prior knowledge, so it works for a fresh Claude chat or another AI.

> **Task.** You are authoring a single Kings of War 4th Edition **{{FACTION}}** army-reference file in JSON for the Warboss Companion app, transcribed faithfully from the official army list I provide. **Accuracy over completeness. Never invent.** If the source does not show a unit, stat, option, or cost, do not include it. Never guess a unit name, statistic, or points value. If anything is unclear or unreadable in the source, list it as an open question instead of fabricating.
>
> **Source of truth.** Use ONLY the army-list content I provide below/attached ({{SOURCE}}). Do not use prior memory of Kings of War or other editions.
>
> **Output shape.** One JSON object: `{ "army_id", "army_name", "game_system": "kow", "units": [ ... ] }`. Each unit object uses exactly these fields:
> - Required: `unit_id` (lowercase-kebab, unique, stable, includes the size, e.g. `"<name>-regiment"`), `name`, `size`, `type`, `sp`, `me`, `sh`, `de`, `att`, `ne`, `pts`, `special_rules` (array), `traits` (array), `category`.
> - Optional: `commander_role`, `options` (array), `availability` (object). (Do not add a `retired` flag — that's only for superseded units.)
>
> **Controlled vocabulary — `type` and `size` MUST be exactly one of these strings:**
> - `type` ∈ [Infantry, Heavy Infantry, Large Infantry, Monstrous Infantry, Cavalry, Large Cavalry, Chariot, Monster, Titan, War Engine, Hero (Inf), Hero (Cav), Hero (Lrg Inf), Hero (Lrg Cav), Hero (Cht), Hero (Mon), Hero (Titan), Monster/Chariot]
> - `size` ∈ [Troop, Regiment, Horde, Legion, "1"]
>
> **Mapping + encoding rules (follow exactly):**
> - `size` = the army-list SIZES column verbatim. Single-model units (heroes, war engines, monsters, titans) print `1` → store `"1"` (a string). There is NO `"Individual"` size — `Individual` is a *special rule* and belongs in `special_rules`.
> - `type` = the TYPE column normalised: `LRG INF`→`Large Infantry`, `LRG CAV`→`Large Cavalry`, `HERO/CAV`→`Hero (Cav)` (parenthesised), `MON/CHT`→`Monster/Chariot`, title-cased. `Heavy Infantry` and `Monstrous Infantry` are distinct — keep them, don't collapse to Infantry/Large Infantry.
> - **One entry per size.** Each size variant (Troop / Regiment / Horde) is its own unit object with its own `unit_id`, `pts`, and per-size option costs. Never use size-keyed cost maps.
> - `ne` = a single string value (the Rout threshold, e.g. `"14"`). Never a two-part `"13/15"`.
> - `me`/`sh` = `"-"` when the unit has none. `att` = an integer, or a string formula like `"D6+8"` for random attacks.
> - `pts` = integer, per this size entry.
> - `special_rules`/`traits` = arrays of strings copied from the source (e.g. `"Crushing Strength (2)"`).
> - `category` ∈ [Core, Auxiliary, Specialist, Support, Commander]; a `(AUX)` marker on a size row means that entry's `category` is `Auxiliary`. `commander_role` ∈ [champion, warlord] for units in the Champion/Warlord sections.
>
> **Options (`options[]`), each:** `{ "id" (kebab, unique within the unit), "label", "description"? , "scope": "self"|"battalion", "cost"? (flat integer; 0 = free; omit for battalion-scope), "effects"? , "group"? }`.
> - `effects[]` type is one of: `add_special_rule {rule}`, `set_field {field,value}` (absolute), `modify_field {field,delta,min?,max?}` (delta), `add_weapon {name,range,sh,att,special_rules?}`, `grant_spell {spell,power}`.
> - Mutually-exclusive upgrades ("choose one of…") share the same `group` string.
> - A "Mount on X" option flips type via `set_field type` → e.g. `Hero (Cav)` (and usually `set_field sp`). Never author a separate mounted base entry.
>
> **Availability:** `[U]` (Unique) → `{ "type": "unique" }`. `[N]` (limited to N per battalion, including `[0]`) → `{ "type": "limited", "scope": "battalion", "max": N }`. No marker → omit the field.
>
> **Anti-hallucination requirement.** Alongside the JSON, output a **verification table**: one row per unit → `unit_id | name-as-printed | type | size | pts | source location (page/section)`. If you cannot point to the source for a value, do not emit that unit — list it under "Open questions" instead.
>
> **Work in stages, pausing after each for my confirmation:**
> 1. Base stat table for ALL units (no options/availability) + the verification table.
> 2. Options, availability, commander_role, `(AUX)` overrides.
> 3. Final assembled JSON + a self-check confirming: unit count vs source; every type/size in the vocabulary; every `ne` single-valued; every single-model `size:"1"`; all `unit_id`s unique; points present for all; valid JSON (no trailing commas, no comments, no markdown inside the JSON).
>
> **Gold shape — mirror this exactly** (a multi-model unit with an option group, and a single-model hero with availability, commander_role, mount + spell options):
> ```json
> { "unit_id": "giant-titan", "name": "Giant", "size": "1", "type": "Titan",
>   "sp": 7, "me": 4, "sh": "-", "de": 5, "att": "D6+8", "ne": "20", "pts": 235,
>   "special_rules": ["Brutal (1)", "Crushing Strength (4)", "Height (6)", "Strider"],
>   "traits": [], "category": "Support",
>   "options": [
>     { "id": "giant-club", "label": "Giant Club", "scope": "self", "group": "giant-weapon", "cost": 0,
>       "effects": [{ "type": "add_special_rule", "rule": "Rampage (D6 - Combat)" }] },
>     { "id": "giant-cleaver", "label": "Giant Cleaver", "scope": "self", "group": "giant-weapon", "cost": 0,
>       "effects": [{ "type": "add_special_rule", "rule": "Slayer (D6 - Combat)" }] }
>   ] }
> ```
> ```json
> { "unit_id": "wiz-hero", "name": "Wiz", "size": "1", "type": "Hero (Inf)",
>   "sp": 5, "me": 5, "sh": "-", "de": 4, "att": 1, "ne": "11", "pts": 55,
>   "special_rules": ["Individual", "Yielding"], "traits": ["Spellcaster"],
>   "category": "Commander", "commander_role": "champion",
>   "availability": { "type": "limited", "scope": "battalion", "max": 2 },
>   "options": [
>     { "id": "wiz-fleabag", "label": "Mount on a fleabag", "description": "Increases Sp to 10 and changes to Hero (Cav).",
>       "scope": "self", "cost": 15,
>       "effects": [{ "type": "set_field", "field": "sp", "value": 10 },
>                   { "type": "set_field", "field": "type", "value": "Hero (Cav)" }] },
>     { "id": "wiz-hex", "label": "Hex (2)", "scope": "self", "group": "wiz-spell", "cost": 10,
>       "effects": [{ "type": "grant_spell", "spell": "Hex", "power": 2 }] }
>   ] }
> ```
>
> Begin with **Stage 1** now, using only {{SOURCE}}.

---

## 4. Using a non-Claude AI — does the prompt change?
The prompt above is deliberately self-contained (assumes zero KoW/WBC knowledge), so the **core is identical** across models. Four adaptations make it reliable on a non-Claude model:

1. **Source delivery.** Claude reads an attached PDF natively; some models read PDFs poorly or not at all. For those, paste the faction's stat lines as **text** (or confirm the model can see the attachment) and keep the "use ONLY this source" line. Garbled PDF extraction is a top hallucination cause.
2. **Smaller batches.** Weaker long-context models drift. Narrow Stage 1 to **5–8 units at a time** rather than the whole faction; concatenate after.
3. **Lean harder on the verification table.** The per-unit "name-as-printed + source location" row is the cross-model anti-hallucination device — keep it mandatory, and reject any unit whose row is vague.
4. **Restate JSON strictness.** Some models wrap JSON in prose or add trailing commas; the "no comments, no trailing commas, no markdown inside JSON, valid JSON only" line matters more, not less.

What does **not** change: the schema, the vocabulary, the encoding rules, and — critically — the **Opus + High audit gate (Stage 4)**. Whichever AI drafts, the draft is not accepted until it passes that audit and `validateUnitEnums()` at load. Treat any external-AI output as an unverified draft, never a finished file.
