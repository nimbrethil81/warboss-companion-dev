# Training Ground — Category Guidelines for Question Generation

These guidelines are written to be handed to an AI generating multiple-choice
questions against the `categories` schema. Each category includes its scope,
what belongs in it, what commonly gets *mistaken* for belonging in it, and a
worked example. Boundary rules that apply across multiple categories are
called out explicitly, since these are where mis-tagging actually happens.

General instruction for the generator: **tag by which rule is the crux of the
question — the rule you'd need to look up to answer it — not by which phase
or stat the effect happens to land on.**

---

## movement — `id: movement`

**Scope:** the core Movement Phase orders (Halt!, Change Facing!, Back!,
Sidestep!, Advance!, At the Double!, Charge!, Withdraw!/Reform!) and their
base mechanics — distances, pivots, facing, engagement state requirements.
Also covers unit-type movement exceptions that the rulebook itself files
under a "Movement" sub-heading (e.g. War Engines cannot Charge! or move At
the Double!; Individuals may pivot for free unless Engaged).

**Not in scope:**
- Any question where the *reason* movement is restricted or modified is a
  terrain rule → `terrain` (e.g. "can you move At the Double through
  Difficult Terrain" is a terrain question, not a movement question).
- Any question where the modifier comes from a scenario objective marker →
  `scenario` (e.g. Loot Counters capping Speed).
- Facing/arc rules used specifically to determine shooting eligibility →
  `ranged`.

**Example:** "What is the maximum distance a unit can move using an Advance!
order?" → `movement`.

---

## ranged — `id: ranged`

**Scope:** the Ranged Phase — to-hit rolls, Nerve triggers from shooting,
Cover, war-engine/monster ranged exceptions, and Line of Sight / Arcs as used
to determine what can be shot at. Cover is always `ranged`, even when the
question involves terrain, because Cover is a targeting-and-to-hit mechanic
defined within the Ranged Phase, not a terrain-classification question.

**Not in scope:**
- Terrain type identification, or how terrain affects movement/combat rather
  than shooting → `terrain`.
- Arcs/LOS used specifically to determine charge eligibility → `melee`.
- A unit's Ranged stat value itself (the number on the profile) → `unit_stats`.

**Boundary rule — Arcs & LOS:** LOS is one rulebook topic that gates two
different actions (shooting and charging). Default general "how is LOS
drawn" questions to `ranged`, since that's LOS's primary context. If a
question is specifically about LOS/arc in the context of declaring a charge,
tag `melee` instead.

**Example:** "Your archers are in a wood shooting at an enemy in the open
with no other intervening terrain — does the enemy gain cover?" → `ranged`
(tests the Cover rule: cover depends on the target's terrain, not the
shooter's).

---

## melee — `id: melee`

**Scope:** the Combat Phase — Engagement, flank/rear bonuses, combat
resolution, and unit-type combat exceptions filed under a "Combat"
sub-heading (e.g. attacks against a War Engine always count as Rear attacks;
Individuals don't double/treble their own flank/rear attacks).

Named `melee` rather than `combat` deliberately, since `combat` collides with
the app's own turn-phase id — keep these vocabularies distinct.

**Not in scope:**
- Nerve tests triggered by combat losses → `morale` (Nerve is a distinct
  mechanic with its own rulebook chapter, even though it's usually resolved
  immediately after a combat).
- Terrain effects on combat (e.g. Height differences, fighting in Difficult
  Terrain) → `terrain`.

**Example:** "Combat attacks directed against a War Engine always count as
attacking to the ___?" → `melee`.

---

## morale — `id: morale` (displayed as "Nerve")

**Scope:** Nerve tests — Waver/Rout thresholds, when a Nerve test is
triggered, Nerve rerolls/bonuses from special rules, the Fearless mechanic.

id is `morale` (not `nerve`) to stay portable to other wargames' morale
systems by convention, even though the in-game term is "Nerve" — that's what
the `name` field is for.

**Not in scope:**
- The circumstances that *cause* a Nerve test (e.g. taking damage in the
  Ranged Phase) belong to the phase that caused it for scene-setting, but the
  Nerve mechanic itself — thresholds, what happens on a fail — is `morale`.
- A unit's Nerve stat value on its profile (e.g. "13/15") → `unit_stats`.

**Example:** "If a Fearless unit withdraws from combat and has to pass
through a friendly unit, is it Wavered?" → `morale`.

---

## magic — `id: magic`

**Scope:** the Magic Phase subsystem — casting, Surge, Channelling, dispel,
and any named spell's mechanics (what it does, its range, when it's cast).

**Not in scope:**
- A named ability that is a **Special Rule**, not a cast spell, even if it
  sounds magical in flavour (auras, passive bonuses, triggered effects) →
  `special_rules`.

**Boundary rule — magic vs. special_rules:** the deciding question is "is
this cast during the Magic Phase using the casting mechanic, or is it always
active / triggered by something other than a Magic Phase action?" Cast →
`magic`. Passive/triggered → `special_rules`. Don't decide by flavour text —
"Radiance of Life" sounds magical but is a Special Rule, so it's
`special_rules`, not `magic`.

**Example:** "What do you roll to generate Power for casting spells?" →
`magic`.

---

## command — `id: command`

**Scope:** the Command Orders subsystem (its own "Advanced Kings of War"
rulebook subsection) — who can issue a Command Order, how many dice are
rolled, range/timing restrictions (e.g. cannot be issued mid-pivot), and
generic procedural rules that apply regardless of which army's specific
command is being used.

**Not in scope:**
- What a *specific named* Command Order does for a specific army (e.g. "For
  the Glory of the Hegemon") — this is arguably still `command` since it's
  still part of the Command Orders subsystem, but if in doubt and the
  question is really testing recall of an army-specific ability rather than
  the subsystem's procedural rules, prefer `special_rules`.

**Boundary rule — command vs. special_rules:** this mirrors the magic vs.
special_rules split. Command Orders got their own rulebook subsection and
their own procedural mechanic (dice rolled, timing), the same way Magic did
— so it earns its own category rather than folding into the general-purpose
`special_rules` bucket.

**Example:** "How many dice does a Warlord roll when issuing a Command
Order?" → `command`.

---

## special_rules — `id: special_rules`

**Scope:** named special rules a unit or army possesses — Vicious, Aura(n),
Fearless, Elite, Lifeleech, Traits, and any other keyword ability that isn't
governed by the Magic or Command Orders subsystems. This is the catch-all for
"what does keyword X do" questions.

**Not in scope:**
- Cast spells → `magic`.
- Command Orders → `command`.
- A unit-type's *built-in* behavioural exception to a phase (War Engines,
  Individuals, Monsters) where the rulebook itself files the exception under
  a Movement/Ranged/Combat sub-heading → tag the relevant phase instead, not
  `special_rules`. These aren't "special rules" the unit chose to have —
  they're baked-in exceptions for that unit type, and the rulebook's own
  structure tells you which phase owns them.

**Example:** "What does the Aura(n) special rule do to friendly units within
6 inches?" → `special_rules`.

---

## unit_stats — `id: unit_stats`

**Scope:** the unit profile block only — Speed, Melee, Ranged, Defense,
Attacks, Nerve, Height, unit type (Infantry/Cavalry/etc.), and base-size
conventions. Also covers reading/interpreting stat notation itself (e.g. what
"D6+8" or "13/15" mean).

This category is narrower than it sounds — resist the pull to tag it for any
question that involves a number.

**Not in scope:**
- A unit type's behavioural exception in a specific phase (e.g. "War Engines
  have a default range of 48 inches" reads like a stat, but the rulebook
  files it under that unit type's "Ranged" exceptions, so it's `ranged`, not
  `unit_stats`).
- A stat's value being temporarily modified by terrain or a scenario
  mechanic → tag the rule causing the modification (`terrain` / `scenario`),
  not `unit_stats`.

**Example:** "What is the Height of a Chariot?" → `unit_stats`.

---

## terrain — `id: terrain`

**Scope:** terrain classification (Blocking, Difficult, Obstacle) and any
question where a terrain rule is the crux of the answer — even when the
effect lands on movement, combat, or LOS. This category exists precisely
*because* terrain cuts across every phase; if terrain-effect questions
defaulted to whichever phase they touched, this category would be nearly
empty and duplicate half of `movement`/`melee`.

**Not in scope:**
- Cover, specifically — Cover is `ranged` (see the `ranged` section above),
  because it's defined as part of the Ranged Phase's to-hit mechanic, not as
  a terrain-classification rule.
- Scenario-specific terrain effects tied to a mission or objective marker →
  `scenario`.

**Example:** "Can a unit move At the Double! through Difficult Terrain?" →
`terrain` (the crux is what Difficult Terrain restricts, not the base
mechanics of the At the Double! order).

---

## scenario — `id: scenario`

**Scope:** game setup and mission structure — terrain placement, deployment,
who takes the first Turn, game length/Round 7 roll-off, victory conditions,
and mission-specific objective mechanics (e.g. Loot Counters, Objective
Markers) including their side effects on stats, even when those side effects
land on a phase mechanic elsewhere.

**Not in scope:**
- Army-building/list-construction rules (points, allies, unit selection) —
  out of scope for Training Ground entirely; that's handled by Muster.

**Boundary rule — scenario vs. the phase a scenario mechanic modifies:**
same convention as terrain. If a rule only exists because of a specific
mission/objective (Loot Counters, Pillage, garrisons), tag `scenario`, even
though the effect might read as a movement or combat modifier.

**Example:** "A unit with Speed 8 picks up a Loot Counter — what is its
Speed now?" → `scenario` (5 — the crux is the Loot Counter rule, not the base
Speed stat or movement mechanic).

---

## Cross-cutting rules for the generator (summary)

1. **Tag by the rule you'd look up, not by the stat/phase the effect lands
   on.** Terrain, scenario, magic, and command mechanics all modify things
   that "belong" to other categories — tag the source rule.
2. **Unit-type phase exceptions (War Engines, Individuals, Monsters) go to
   the phase they modify**, not to `unit_stats` or `special_rules` — this
   matches how the rulebook itself organizes that chapter.
3. **Cover is always `ranged`**, never `terrain`, regardless of how much
   terrain is described in the question.
4. **Cast = `magic`. Passive/triggered = `special_rules`. Procedural
   subsystem with its own dice/timing rules = `command`.** Don't decide by
   flavour text.
5. Every question should map to exactly **one** category. If a question
   seems to require two tags, it's usually testing two rules at once and
   should be split into two separate questions instead.
