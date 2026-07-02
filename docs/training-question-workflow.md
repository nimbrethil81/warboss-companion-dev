# Training Ground: E2E Workflow for Adding Questions

Game-system-agnostic. Applies to KoW today; should hold unchanged if a second
system is ever added, because everything system-specific is isolated into
Phase 0 inputs rather than baked into the process.

See also: `docs/training-question-workflow-prompts.md` — copy-paste starter
prompts for each phase below, kept in a separate file so this doc stays pure
process reference.

---

## Phase 0 — Per-system setup (one-time, not per batch)

Done once when a game system is first onboarded to Training Ground, and
revisited only if the system's category set changes.

| Input | Example (KoW) | Notes |
|---|---|---|
| Locked category list | 10 ids in `kow-training.json` header | Categories co-located with questions, per Single Source of Truth |
| Category guideline doc | `docs/training-categories.md` | Scope + "not in scope" + boundary rules per category. Not shipped in the bundle — authoring reference only |
| Authoritative source(s) | Mini-rulebook + FAQ v1.0 + KoW army list extract | Whatever the system's rules-of-record are. Must be pinned to a version (e.g. "FAQ v1.0") since these get revised |
| Data file path | `data/systems/<system>-training.json` | Flat sibling pattern, consistent with `<system>.json` |
| Manifest entry | `training_file` field in `index.json` | Only touched once per system, not per batch |

**Gate before Phase 1 can start:** category guideline doc exists and is
current. Authoring against a stale or missing guideline is how mis-tagging
happens — this was the whole point of writing `training-categories.md` in
the first place.

---

## Phase 1 — Scope the batch

Before generating anything, fix in writing:
- Which categories this batch targets (spread, not concentration — unless
  deliberately backfilling a thin category, as happened here with `morale`)
- Approximate count (20–30 worked well as a batch size — big enough to be
  worth a session, small enough to fully verify in one pass)
- Any skew requirement (e.g. "goblin-relevant situations" — army/system
  flavour, not just rules coverage)

This is a 2-minute step but skipping it is how you end up with an
accidentally lopsided set.

---

## Phase 2 — Draft in a side chat

Per established practice: content authoring happens in a chat separate from
architecture/implementation sessions. Draft against the fixed schema:

```json
{
  "id": "q_<category>_NNN",
  "category": "<locked id>",
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "answer": 0,
  "explanation": "...",
  "source": "..."
}
```

Distractor quality matters more than question count: wrong options should be
*plausible common misplays*, not obviously-wrong filler. A question with
three throwaway distractors doesn't build recall.

---

## Phase 3 — Verify at write time, not as a deferred audit

**This is the step that changes the most between "looks right" and "is
right," and it should happen *during* authoring, not as a separate audit
afterward.**

The earlier plan for this project had "rules-correctness audit" as a
pre-ship step, done later, over an already-drafted batch. In practice,
folding verification into the drafting pass itself worked better: every
answer gets checked against the actual source document, sentence by
sentence, with a page/section citation captured as the `source` field at
the moment the question is written — not recalled from training data, not
back-filled after the fact.

Concretely, for each question:
1. Locate the specific source passage the answer depends on.
2. Confirm the "correct" option matches the source exactly.
3. Confirm each distractor is wrong *for a reason a real player would fall
   for* — not confirm it's merely different from the right answer.
4. Cross-check any fact drawn from live app data (unit names, stat values,
   army-list types) against the actual current data file — don't trust a
   remembered unit name. This session's Goblin Blaster mistake happened
   exactly because a plausible-sounding unit name went unverified against
   `goblins.json` at authoring time.

Deferring this to a later "audit" pass creates a backlog of unverified
content and makes mistakes more likely to slip through, not less — a big
undifferentiated pile is harder to check carefully than each question
checked as it's written.

---

## Phase 4 — Automated structural validation

Cheap, mechanical, catches a different class of error than Phase 3. Run a
script that asserts, per question:

- `id` matches convention and is unique across the *combined* file (not just
  the new batch — check against what's already shipped)
- `category` is a member of the system's locked category list
- `options` has exactly 4 entries
- `0 <= answer < 4`
- all required fields present
- (optional but recommended) no stray references to unit/rule names that
  don't exist in the current army/system data file

This is fast enough to run after every edit, so there's no excuse to skip
it before Phase 5.

---

## Phase 5 — Distractor, balance, and overlap review

Three separate checks, all easy to miss if only reading questions top to
bottom:

- **Answer-position skew.** If the correct answer clusters on 1–2 options
  across the batch, a player can learn the pattern instead of the rules.
  Check the distribution of `answer` indices across the *combined* file and
  rebalance if skewed — this is a static-data fix, independent of whether
  the app also shuffles options at render time (see Phase 7).
- **Boundary correctness.** Spot-check questions that sit near a category
  boundary rule (the guideline doc's "not in scope" sections exist
  precisely because these are where mis-tagging happens) against the
  guideline doc one more time, now that the question's final wording is
  locked.
- **Overlap with the existing bank.** Training Ground is stateless in v1 —
  no spaced repetition, no "seen this" tracking — so overlap can't corrupt
  an algorithm the way it would in an SRS tool. It's a content-quality
  check, not an engine-correctness one, but it still matters:
  - Compare each new question against the *combined* bank (existing +
    new) on three axes: same category, same crux rule, same core scenario.
    All three matching = a true duplicate — cut or substantially re-scope
    it. Only the rule matching is fine, often good: testing one rule via
    genuinely different scenarios reinforces recall rather than padding
    the count.
  - Watch for **distractor collision** even when the scenario differs — if
    two questions share the same wrong-answer set for the same rule, a
    player starts pattern-matching the shape of the question instead of
    recalling the rule, which undermines the "plausible common misplay"
    distractor design goal.
  - Watch for overlap **quietly concentrating in one category** while
    others stay thin — nominal counts can look balanced while effective
    coverage doesn't.

---

## Phase 6 — Integrate into the data file

- Merge into `data/systems/<system>-training.json`, appended under the
  existing `questions` array — exact anchor point specified per Precise
  Code Placement, not "somewhere in the file"
- No duplication of category definitions — they stay in the header, questions
  only reference the id

---

## Phase 7 — App-level checks

- If content is added to an **existing, already-precached** training file,
  the service worker cache version still needs a bump — the cache is by
  response, so editing a precached file's *content* without bumping the
  version means users keep the stale copy even though the file path didn't
  change.
- If a **new** system's training file is added for the first time, it also
  needs a `SHELL_FILES` entry in addition to the version bump.
- Confirm the new content doesn't affect core-mode boot (Fail Gracefully:
  Training Ground is isolated from Muster/Battle/Chronicle, so this should
  normally be a non-issue, but worth a smoke test after any schema-adjacent
  change).
- If answer-position shuffling is implemented at render time, confirm it
  shuffles into state on question load (not inside render) and remaps the
  answer index using the correct option's *value* as the anchor — not its
  original index.

---

## Phase 8 — Documentation and sign-off

- **SPEC.md**: only if this batch changed the *schema or category set* —
  e.g. added a category, changed a field. Pure content additions using the
  existing schema don't need a SPEC.md touch.
- **CHANGELOG.md**: once the batch actually ships, not before.
- Both require your sign-off before I make the edit — I'll identify what's
  needed and ask, not edit silently.

---

## Suggested model/effort by phase

Extending the existing discipline (Opus+Max architecture, Opus+High
roadmap/SPEC, Sonnet+Medium implementation, Sonnet+Low fixes) to content
work, which wasn't previously covered by it:

| Phase | Suggested |
|---|---|
| 0 — per-system setup | Opus + High (it's schema/architecture-adjacent) |
| 1 — scoping | Sonnet + Low |
| 2 — drafting | Sonnet + Medium |
| 3 — source verification | Sonnet + Medium, but budget real time — this is the phase where effort spent directly buys correctness, more than model choice does |
| 4 — structural validation | Sonnet + Low (mechanical, scriptable) |
| 5 — distractor/balance/overlap review | Sonnet + Low, but the overlap check needs a full read against the existing bank, not just the new batch |
| 6–7 — integration/app checks | Sonnet + Medium |
| 8 — docs | Opus + High for SPEC changes, Sonnet + Low for CHANGELOG entries |

---

## One-page checklist

- [ ] Category guideline doc current for this system
- [ ] Batch scoped (categories, count, flavour skew) before drafting
- [ ] Every answer verified against a cited source passage at write time
- [ ] Every in-game fact (unit names, stats) checked against the live data file
- [ ] Structural validation script passes (ids, schema, category membership)
- [ ] Answer-index distribution checked across the *combined* file
- [ ] Boundary-rule spot-check against guideline doc on final wording
- [ ] New questions checked against existing bank for true duplicates (same category + crux rule + scenario) and distractor collision
- [ ] Data file updated at the correct anchor point
- [ ] Cache version bumped (+ SHELL_FILES entry if new file)
- [ ] SPEC.md reviewed for schema/category changes — confirmed with you if needed
- [ ] CHANGELOG.md entry drafted once shipped — confirmed with you
