# Training Ground: Question Authoring Workflow

Game-system-agnostic. Applies to KoW today; should hold unchanged if a second
system is ever added, because everything system-specific is isolated into
Phase 0 inputs rather than baked into the process.

This one document is both the **process reference** (what each phase is and why)
and the **prompts** (what to paste to run it). It replaces the earlier
two-file split.

---

## How to run this

- **One dedicated chat, start to finish.** Run the whole authoring workflow —
  scoping through integration — in a single chat. That chat is separate from
  code-implementation chats (question authoring is its own workstream), but
  within it there is *no* chat-per-phase: everything happens in the one place.
- **Continuous execution.** Paste the kickoff prompt once. Claude then works
  through the phases in sequence **without stopping between them**, pausing
  only at the decision gates below. It should not ask "shall I continue?"
  between phases that have no gate.
- **Pause only for a decision or a problem.** The gates are the *only* expected
  stopping points. Anything else (a genuine ambiguity, a source that won't
  verify, a schema gap) is a "problem" pause — surface it, don't guess.

**Required Project Sources for the run** (attach these in the chat, or make
them fetchable from the repo):
- this document
- the system's category guideline doc (e.g. `docs/training-categories.md`)
- the system's rules-of-record (rulebook / FAQ) as attached files, version-pinned
- the current data file being extended (e.g. `kow-training.json`)
- any army/system data files facts are checked against (e.g. `goblins.json`)

> **Note on the quoted prompt blocks below:** they are copy-paste templates
> for *you* to paste into the chat, with `<angle-bracket>` placeholders to
> replace. They are **not** instructions directed at whichever Claude happens
> to read this file as project-knowledge reference material.

---

## Decision gates — the only places Claude pauses

- **Gate A — Scope (conditional).** If the kickoff fully specifies categories,
  count and skew, Claude proceeds without pausing. It pauses only if scope was
  left open ("suggest from current balance") or if reading the current bank
  suggests a materially different split than requested — it surfaces the
  proposed split, then continues once you confirm.
- **Gate B — Verification blocker (as needed / a problem).** Claude pauses if
  any answer can't be confirmed from the attached sources, or a source
  conflict/ambiguity surfaces (the Nerve single-value-vs-`13/15` discrepancy
  was exactly this). It does not guess or quietly pick one reading.
- **Gate C — Review judgment call (conditional).** If the balance/overlap
  review turns up true duplicates or a skew needing a cut-or-keep decision,
  Claude pauses with the specifics. If the review is clean, it continues.
- **Gate D — Documentation sign-off (always).** Before editing `SPEC.md` or
  `CHANGELOG.md`, Claude always stops, states exactly what should change, and
  waits for your go-ahead. This is a standing rule, not a per-run choice.

Everything outside these gates runs straight through. Note that Claude can't
push to the repo, so "integrate" and "bump the cache" are produced as a
finished file plus instructions for you to apply — not actions Claude performs.

---

## Kickoff prompt (per batch — paste once to start the whole run)

> Run the Training Ground question-authoring workflow
> (`training-question-workflow.md`) for `<system>` in this chat, start to
> finish, pausing only at the workflow's decision gates. Batch scope:
> categories `<list, or "suggest from current balance">`, count `<n>`, skew
> `<e.g. "beginner mistakes" / "army-relevant situations">`.
>
> Work through scoping, drafting-with-write-time-verification, structural
> validation, and balance/overlap review without stopping between phases.
> Verify every answer against the attached rules as you write it (not from
> recall), cite sources by section heading, and cross-check every in-game fact
> against the attached data files. Then give me the complete updated data file
> (header + categories + questions — not just the new questions), run the
> app-level checks, and pause before any SPEC.md / CHANGELOG.md edit.
>
> Attached: `<rulebook/FAQ>`, `<category guideline doc>`,
> `<current system-training.json>`, `<army data files>`.

---

## Phase 0 — Per-system setup (one-time, not per batch)

Done once when a game system is first onboarded, revisited only if its category
set changes. Skip this for a normal batch run.

| Input | Example (KoW) | Notes |
|---|---|---|
| Locked category list | 10 ids in `kow-training.json` header | Categories co-located with questions, per Single Source of Truth |
| Category guideline doc | `docs/training-categories.md` | Scope + "not in scope" + boundary rules per category. Authoring reference only — not shipped in the bundle |
| Authoritative source(s) | Mini-rulebook + FAQ (v0.1 per its own header) | Whatever the system's rules-of-record are. Pin to the version the document *declares internally*, which may differ from its filename |
| Data file path | `data/systems/<system>-training.json` | Flat sibling pattern, consistent with `<system>.json` |
| Manifest entry | `training_file` field in `index.json` | Touched once per system, not per batch |

**Gate before batches can start:** the category guideline doc exists and is
current. Authoring against a stale or missing guideline is how mis-tagging
happens — the whole reason `training-categories.md` exists.

**Phase 0 kickoff prompt** (separate one-time task):

> I'm onboarding a new game system to Training Ground: `<system name>`.
> Following Phase 0, help me set up: (1) a locked category list grounded in
> `<attached rulebook/source>`, flagging whether it should mirror KoW's
> structure or needs its own; (2) a category guideline doc in the same style
> as `docs/training-categories.md` — scope, "not in scope", boundary rules,
> one worked example each; (3) the data file path and `index.json` manifest
> entry. Ground the categories in the attached source, not memory.

---

## Phase 1 — Scope the batch

Before generating anything, fix in writing:
- Which categories this batch targets (spread, not concentration — unless
  deliberately backfilling a thin category, as happened with `morale`).
- Approximate count (20–30 works well — big enough to be worth a session,
  small enough to fully verify in one pass).
- Any skew requirement (e.g. "goblin-relevant situations" — army/system
  flavour, not just rules coverage).

A 2-minute step, but skipping it is how you get an accidentally lopsided set.
**→ Gate A** if scope is open or the bank suggests a different split.

---

## Phase 2 — Draft

Draft against the fixed schema:

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
*plausible common misplays*, not obviously-wrong filler. A question with three
throwaway distractors doesn't build recall.

---

## Phase 3 — Verify at write time, not as a deferred audit

**The step that changes the most between "looks right" and "is right." It
happens *during* drafting, not as a separate audit afterward.**

Folding verification into the drafting pass works better than a later
audit-the-pile step: every answer is checked against the actual source as it's
written, with the `source` citation captured at that moment — not recalled from
training data, not back-filled.

Concretely, for each question:
1. Locate the specific source passage the answer depends on.
2. Confirm the correct option matches the source exactly.
3. Confirm each distractor is wrong *for a reason a real player would fall for*
   — not merely that it's different from the right answer.
4. Cross-check any fact drawn from live app data (unit names, stat values,
   army-list types) against the current data file — don't trust a remembered
   name. The Goblin Blaster mistake happened exactly because a
   plausible-sounding unit name went unverified against `goblins.json`.

**`source` field convention — cite the section, not the page.** Use the
section/subsection heading, e.g. `"Rulebook, The Combat Phase — Striking"`,
not `"Rulebook p.30"`. Page numbers drift across reprints, layouts, and PDF
extracts (the KoW reference was a text extract with no reliable pagination);
heading names don't. For FAQ/Errata items with no heading structure, cite the
topic, e.g. `"FAQ v0.1 — Command Order Timing"`.

Deferring verification to a later pass just creates a backlog of unverified
content and makes mistakes *more* likely to slip through — a big undifferentiated
pile is harder to check carefully than each question checked as it's written.
**→ Gate B** on anything that won't verify or where sources conflict.

---

## Phase 4 — Automated structural validation

Cheap, mechanical, catches a different class of error than Phase 3. A script
asserts, per question:

- `id` matches convention and is unique across the *combined* file (existing +
  new), not just within the batch
- `category` is a member of the system's locked category list
- `options` has exactly 4 entries
- `0 <= answer < 4`
- all required fields present
- (recommended) no stray unit/rule names absent from the current data file

Fast enough to run after every edit, so there's no excuse to skip it before
Phase 5.

---

## Phase 5 — Distractor, balance, and overlap review

Three checks, all easy to miss reading top-to-bottom:

- **Answer-position skew.** If the correct answer clusters on one or two option
  slots, a player learns the pattern instead of the rules. Check the
  distribution of `answer` indices across the *combined* file and rebalance if
  skewed — a static-data fix, independent of whether the app also shuffles
  options at render time (see Phase 7).
- **Boundary correctness.** Spot-check questions near a category boundary
  against the guideline doc's "not in scope" notes, now the wording is locked.
- **Overlap with the existing bank.** Training Ground is stateless in v1 — no
  spaced repetition, no "seen this" tracking — so overlap can't corrupt an
  algorithm the way it would in an SRS tool. It's a content-quality check, not
  an engine one, but it still matters:
  - Compare each new question against the *combined* bank on three axes: same
    category, same crux rule, same core scenario. All three matching = a true
    duplicate — cut or substantially re-scope. Only the rule matching is fine,
    often good: one rule tested via different scenarios reinforces recall
    rather than padding the count.
  - Watch for **distractor collision** even when scenarios differ — two
    questions sharing a wrong-answer set for the same rule let a player
    pattern-match the question's shape instead of recalling the rule.
  - Watch for overlap **quietly concentrating in one category** while others
    stay thin — nominal counts can look balanced while coverage isn't.

**→ Gate C** if this turns up true duplicates or a skew needing a cut/keep call.

---

## Phase 6 — Integrate into the data file

- Produce the **complete** `data/systems/<system>-training.json` — the full
  file including the `system_id` / `version` / `categories` header, not just the
  `questions` array. A bare array is only appropriate for a small batch you're
  comfortable hand-merging; a "ready" deliverable is the whole file.
- New questions appended under the existing `questions` array at the exact
  anchor point (per Precise Code Placement), not "somewhere in the file".
- No duplication of the category definitions — they stay in the header;
  questions only reference the id.

---

## Phase 7 — App-level checks

- Adding content to an **existing, already-precached** training file still needs
  a service worker cache version bump — the cache is keyed by response, so
  editing a precached file's *content* without bumping the version leaves users
  on the stale copy even though the path didn't change.
- A **new** system's training file, added for the first time, also needs a
  `SHELL_FILES` entry alongside the version bump.
- Confirm the change doesn't affect core-mode boot (Fail Gracefully: Training
  Ground is isolated from Muster/Battle/Chronicle, so normally a non-issue —
  but worth a smoke test after any schema-adjacent change).
- If answer-position shuffling is implemented at render time, confirm it
  shuffles into state on question load (not inside render) and remaps the answer
  index using the correct option's *value* as the anchor, not its original index.

---

## Phase 8 — Documentation and sign-off

- **SPEC.md**: only if the batch changed the *schema or category set* (added a
  category, changed a field). Pure content additions on the existing schema
  don't need a SPEC.md touch.
- **CHANGELOG.md**: once the batch actually ships, not before.
- **→ Gate D:** both require your sign-off before the edit — Claude identifies
  what's needed and asks, never edits silently.

---

## Suggested model/effort by phase

Extending the existing discipline (Opus+Max architecture, Opus+High
roadmap/SPEC, Sonnet+Medium implementation, Sonnet+Low fixes) to content work,
which wasn't previously covered by it. State the recommended model/effort at
kickoff for the run as a whole; the table is the per-phase breakdown behind it.

| Phase | Suggested |
|---|---|
| 0 — per-system setup | Opus + High (schema/architecture-adjacent) |
| 1 — scoping | Sonnet + Low |
| 2 — drafting | Sonnet + Medium |
| 3 — source verification | Sonnet + Medium, but budget real time — effort here buys correctness more than model choice does |
| 4 — structural validation | Sonnet + Low (mechanical, scriptable) |
| 5 — distractor/balance/overlap review | Sonnet + Low, but the overlap check needs a full read against the existing bank, not just the new batch |
| 6–7 — integration / app checks | Sonnet + Medium |
| 8 — docs | Opus + High for SPEC changes, Sonnet + Low for CHANGELOG entries |

Because the run is one continuous chat, it will usually sit on a single
model/effort for the whole session; the table shows where more or less care is
warranted if you split it.

---

## One-page checklist

- [ ] Category guideline doc current for this system
- [ ] Batch scoped (categories, count, flavour skew) before drafting
- [ ] Every answer verified against a cited source passage at write time
- [ ] `source` fields cite section/heading, not page number
- [ ] Every in-game fact (unit names, stats) checked against the live data file
- [ ] Structural validation script passes (ids, schema, category membership)
- [ ] Answer-index distribution checked across the *combined* file
- [ ] Boundary-rule spot-check against guideline doc on final wording
- [ ] New questions checked against existing bank for true duplicates (same category + crux rule + scenario) and distractor collision
- [ ] Deliverable is the **complete** data file (header + categories + questions), not just the array
- [ ] Data file updated at the correct anchor point
- [ ] Cache version bumped (+ SHELL_FILES entry if new file)
- [ ] SPEC.md reviewed for schema/category changes — confirmed with you if needed
- [ ] CHANGELOG.md entry drafted once shipped — confirmed with you

---

## Appendix — per-phase resume prompts

The kickoff prompt runs the whole pipeline. Use these only to **re-run or
resume a single phase** (e.g. picking up after a Gate pause, or redoing one
step) — they aren't the normal path, and using them as the default recreates
the chat-per-phase fragmentation this workflow is designed to avoid.

**Phase 1 — Scope**
> Per Phase 1, scope a batch for `<system>`: categories `<list or "suggest from
> current balance">`, count `<n>`, skew `<...>`. Pull the current bank first so
> the balance reflects what's shipped, not an assumption.

**Phase 2 + 3 — Draft and verify**
> Draft `<n>` questions for `<system>`, categories `<list>`, to schema and the
> category guideline doc. Verify every answer against `<rulebook/FAQ>` as you
> write it, citing the section heading in `source`. Cross-check in-game facts
> against `<data file>`. Distractors must be plausible common misplays.

**Phase 4 — Structural validation**
> Run Phase 4 structural validation on the batch against the combined bank:
> unique ids, valid category ids, exactly 4 options, answer in range, all
> fields present, no stray names absent from `<data file>`. Show results.

**Phase 5 — Distractor/balance/overlap**
> Per Phase 5, against the full combined bank: (1) answer-index distribution,
> flag and rebalance if skewed; (2) boundary recheck against the guideline
> doc's "not in scope" notes; (3) overlap — true duplicates (category + crux
> rule + scenario) and distractor collisions.

**Phase 6 — Integrate**
> Merge the verified batch into `<system>-training.json` at the correct anchor.
> Give me the complete file — header, categories and questions — not a diff and
> not just the array.

**Phase 7 — App-level checks**
> Per Phase 7: does this need a cache version bump? Existing precached file
> (content-only, still needs the bump) or a new file needing a `SHELL_FILES`
> entry too? Confirm nothing outside Training Ground's isolated data path is
> touched.

**Phase 8 — Docs**
> Per Phase 8: does this need a SPEC.md update (schema/category change) or just
> a CHANGELOG.md entry once shipped? Identify the exact changes and ask before
> editing either.
