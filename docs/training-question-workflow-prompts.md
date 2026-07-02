# Training Ground: Sample Prompts per Workflow Phase

Companion to `docs/training-question-workflow.md`. These are examples for
you to copy and adapt when starting a new chat — **they are not
instructions directed at whichever Claude is reading this file as project
reference material.** They only work as intended if, in the chat where you
paste them, the Project Sources include:

- `docs/training-question-workflow.md`
- the system's category guideline doc (e.g. `docs/training-categories.md`)
- the system's rules-of-record (rulebook/FAQ) as attached files
- the current data file(s) you're checking facts against (e.g.
  `goblins.json`), either attached or fetchable from the repo

Replace anything in `<angle brackets>`.

---

### Phase 0 — Per-system setup (one-time)

> I'm onboarding a new game system to Training Ground: `<system name>`.
> Following Phase 0 of `training-question-workflow.md`, help me set up:
> 1. A locked category list for this system — propose one grounded in
>    `<attached rulebook/source>`, and flag whether it should mirror KoW's
>    category structure or needs its own.
> 2. A category guideline doc in the same style as
>    `docs/training-categories.md` — scope, "not in scope", boundary rules,
>    and one worked example per category.
> 3. The data file path and `index.json` manifest entry this system needs.
>
> Ground the categories in the attached source, not from memory.

### Phase 1 — Scope the batch

> I want to add a new batch of Training Ground questions for `<system>`.
> Per Phase 1, help me scope it before drafting:
> - Categories to target: `<list, or "suggest based on current balance">`
> - Approximate count: `<n>`
> - Flavour/skew requirement: `<e.g. "beginner mistakes", "army-relevant">`
>
> Pull the current question bank first so the balance you propose reflects
> what's actually shipped, not an assumption.

### Phase 2 + 3 — Draft and verify (combined — verify at write time, not after)

> Draft `<n>` new Training Ground questions for `<system>`, categories:
> `<list>`. Follow the schema and guidelines in the category doc.
> Per Phase 3: verify every answer against `<attached rulebook/FAQ>` as you
> write it, citing the exact page/section as the `source` field — don't
> rely on recall. Cross-check any in-game facts (names, stats) against
> `<attached current data file>`. Distractors must be plausible common
> misplays, not obviously wrong filler.

### Phase 4 — Automated structural validation

> Run structural validation on this batch against the combined bank
> (existing + new), per Phase 4: unique ids, valid category ids against the
> locked list, exactly 4 options, answer index in range, all required
> fields present, and no stray unit/rule names absent from
> `<current data file>`. Show me the results before we continue.

### Phase 5 — Distractor, balance, and overlap review

> Per Phase 5, review this batch against the full combined bank:
> 1. Answer-index distribution across the combined file — flag and
>    rebalance if skewed.
> 2. Any question sitting near a category boundary — recheck against the
>    guideline doc's "not in scope" notes now the wording is locked.
> 3. Overlap — flag any new question matching an existing one on category
>    *and* crux rule *and* scenario (true duplicate), and separately flag
>    any distractor collision even where the scenario differs.

### Phase 6 — Integrate into the data file

> Merge this verified batch into `<data/systems/<system>-training.json>`
> at the correct anchor point — appended to the existing `questions`
> array. Don't duplicate the category definitions from the header. Give me
> the full updated file, not a diff.

### Phase 7 — App-level checks

> Per Phase 7: does this change need a service worker cache version bump?
> Is this an existing precached file (content-only change, still needs the
> bump) or a new file needing a `SHELL_FILES` entry too? Confirm this
> addition doesn't touch anything outside Training Ground's isolated data
> path.

### Phase 8 — Documentation and sign-off

> Per Phase 8: does this batch need a SPEC.md update (schema or
> category-set change) or just a CHANGELOG.md entry once shipped? Identify
> exactly what needs to change in each and ask me to confirm before
> editing either file.
