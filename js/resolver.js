/**
 * resolver.js — shared option/effect/artefact resolver
 *
 * Single source of truth for turning "base unit + selected option ids +
 * optional artefact" into an effective profile, for determining artefact
 * eligibility, and for normalising the saved-army units field into a
 * consistent shape. Consumed by muster.js (authoring) and battle.js
 * (roster build) — see SPEC.md §4, Options Consumption + Artefacts design.
 *
 * Pure logic only: no DOM, no localStorage, no Sheets, no fetch.
 * Never mutates the unit objects it is given (WBC.armyData is shared
 * state — every caller gets a fresh deep copy of the profile).
 *
 * Dependencies: none
 */

window.WBCResolver = (() => {

  // ─── ARMY UNITS NORMALISATION ────────────────────────────────────────────────

  /**
   * Normalise the armies.units field (Sheets) into a consistent array of
   * { unit_id, options, artefact } entries, regardless of source shape.
   *
   * Accepts:
   *   - a JSON string (as stored in Sheets), or an already-parsed array
   *   - entries that are bare unit_id strings (legacy form — pre options)
   *   - entries that are { unit_id, options } objects (Options Consumption)
   *   - entries that are { unit_id, options, artefact } objects (current)
   *
   * `artefact` is a single artefact id (string) or absent/null — a unit may
   * carry at most one (rulebook: "each unit can have a single artefact").
   *
   * Never throws. Malformed JSON returns []. Malformed individual entries
   * are skipped with a console warning rather than aborting the whole army
   * (Fail Gracefully — one bad entry must not blank the roster).
   *
   * @param {string|Array} rawUnitsField
   * @returns {Array<{unit_id: string, options: string[], artefact: string|null}>}
   */
  function normalizeArmyUnits(rawUnitsField) {
    let raw = rawUnitsField;

    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (err) {
        console.warn('[Resolver] normalizeArmyUnits: failed to parse units JSON:', err);
        return [];
      }
    }

    if (!Array.isArray(raw)) {
      if (raw !== undefined && raw !== null) {
        console.warn('[Resolver] normalizeArmyUnits: expected array, got', typeof raw);
      }
      return [];
    }

    const entries = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        entries.push({ unit_id: item, options: [], artefact: null });
      } else if (item && typeof item === 'object' && typeof item.unit_id === 'string') {
        const options = Array.isArray(item.options)
          ? item.options.filter((id) => typeof id === 'string')
          : [];
        const artefact = typeof item.artefact === 'string' ? item.artefact : null;
        entries.push({ unit_id: item.unit_id, options, artefact });
      } else {
        console.warn('[Resolver] normalizeArmyUnits: skipping malformed entry:', item);
      }
    }
    return entries;
  }

  // ─── OPTION / EFFECT / ARTEFACT RESOLUTION ────────────────────────────────────

  /**
   * Apply a single structured effect onto the working profile/weapons/spells,
   * shared by both option and artefact resolution so the effect vocabulary is
   * interpreted in exactly one place.
   *
   * @param {Object} effect
   * @param {Object} ctx — { profile, weapons, spells, warnings, sourceId }
   */
  function _applyEffect(effect, ctx) {
    const { profile, weapons, spells, warnings, sourceId } = ctx;

    switch (effect.type) {
      case 'add_special_rule':
        profile.special_rules.push(effect.rule);
        break;

      case 'set_field':
        profile[effect.field] = effect.value;
        break;

      case 'modify_field': {
        // Delta application that preserves the field's original JS type.
        // Some fields (e.g. `ne`) are stored as strings even though they
        // are numeric values (SPEC-locked Nerve format) — parse, apply the
        // delta and optional min/max clamp, then cast back to the original
        // type so the effective profile stays shape-compatible with the
        // base unit data.
        const current = profile[effect.field];
        const wasString = typeof current === 'string';
        const num = wasString ? parseInt(current, 10) : current;

        if (typeof num !== 'number' || Number.isNaN(num)) {
          warnings.push(
            `modify_field on "${effect.field}" (source "${sourceId}") could not parse ` +
            `current value "${current}" as a number — skipped.`
          );
          break;
        }

        let result = num + effect.delta;
        if (typeof effect.min === 'number') result = Math.max(result, effect.min);
        if (typeof effect.max === 'number') result = Math.min(result, effect.max);

        profile[effect.field] = wasString ? String(result) : result;
        break;
      }

      case 'add_weapon':
        weapons.push({
          name: effect.name,
          range: effect.range,
          sh: effect.sh,
          att: effect.att,
          // Optional — e.g. War-Bow of Kaba's Piercing (1). Omitted when absent.
          ...(Array.isArray(effect.special_rules) ? { special_rules: effect.special_rules.slice() } : {}),
        });
        break;

      case 'grant_spell':
        spells.push({ spell: effect.spell, power: effect.power });
        break;

      default:
        warnings.push(
          `Unknown effect type "${effect.type}" (source "${sourceId}") — skipped.`
        );
    }
  }

  /**
   * Resolve a unit's effective profile given selected option ids and,
   * optionally, a single equipped artefact.
   *
   * `resolve(unit, [])` is the universal path — a unit with no options array,
   * or no ids selected, and no artefact, returns exactly the base profile at
   * base points. Callers never need to branch on "does this unit have options".
   *
   * Eligibility (which units/classes may take which artefacts) is NOT this
   * function's job — that lives in kow.json's artefact_rules and is applied
   * by the caller (Muster) before an artefact ever reaches here. This function
   * only applies whatever artefact object it is given.
   *
   * @param {Object} unit — a unit object from goblins.json (may be retired;
   *   resolution does not care about the `retired` flag, only availability
   *   filtering for new selection does, and that's the caller's job)
   * @param {string[]} [selectedOptionIds]
   * @param {Object|null} [artefact] — a full entry from kow-artefacts.json
   *   (the caller looks it up by id; the resolver stays pure — no fetch)
   * @returns {{
   *   profile: Object,
   *   pts: number,
   *   weapons: Array<{name, range, sh, att, special_rules?}>,
   *   spells: Array<{spell, power}>,
   *   applied: Array<{id, label}>,
   *   artefact: {id, label}|null,
   *   warnings: string[]
   * }}
   */
  function resolve(unit, selectedOptionIds, artefact) {
    const selected = Array.isArray(selectedOptionIds) ? selectedOptionIds : [];
    const warnings = [];

    // Deep-copy the base profile fields we know about — never mutate `unit`.
    const profile = {
      name: unit.name,
      size: unit.size,
      type: unit.type,
      sp: unit.sp,
      me: unit.me,
      sh: unit.sh,
      de: unit.de,
      att: unit.att,
      ne: unit.ne,
      special_rules: Array.isArray(unit.special_rules) ? unit.special_rules.slice() : [],
    };

    let pts = typeof unit.pts === 'number' ? unit.pts : 0;
    const weapons = [];
    const spells = [];
    const applied = [];
    const seenGroups = new Set();

    const availableOptions = Array.isArray(unit.options) ? unit.options : [];
    const availableIds = new Set(availableOptions.map((o) => o.id));

    // Flag selected ids that don't exist on this unit at all.
    for (const id of selected) {
      if (!availableIds.has(id)) {
        warnings.push(`Unknown option id "${id}" for unit "${unit.unit_id}" — ignored.`);
      }
    }

    // Walk options in authored order (deterministic result regardless of
    // selection order), applying any that were selected.
    for (const option of availableOptions) {
      if (!selected.includes(option.id)) continue;

      if (option.group) {
        if (seenGroups.has(option.group)) {
          warnings.push(
            `Multiple options selected in group "${option.group}" on unit ` +
            `"${unit.unit_id}" — applying all selected (Muster should prevent this).`
          );
        }
        seenGroups.add(option.group);
      }

      // Cost: self-scope options should carry a cost (0 is valid = free);
      // battalion-scope options legitimately omit it (cost attaches to the
      // target unit, per SPEC).
      if (typeof option.cost === 'number') {
        pts += option.cost;
      } else if (option.scope === 'self') {
        warnings.push(
          `Option "${option.id}" on unit "${unit.unit_id}" has no cost — treated as 0.`
        );
      }

      const effects = Array.isArray(option.effects) ? option.effects : [];
      for (const effect of effects) {
        _applyEffect(effect, { profile, weapons, spells, warnings, sourceId: option.id });
      }

      applied.push({ id: option.id, label: option.label });
    }

    // Artefact (at most one per unit — enforced by Muster/kow.json rules,
    // not here). Applied the same way as an option, through the same
    // effect vocabulary, so it is never a parallel code path.
    let artefactResult = null;
    if (artefact && typeof artefact === 'object') {
      if (typeof artefact.cost === 'number') {
        pts += artefact.cost;
      } else {
        warnings.push(`Artefact "${artefact.id}" has no cost — treated as 0.`);
      }

      const effects = Array.isArray(artefact.effects) ? artefact.effects : [];
      for (const effect of effects) {
        _applyEffect(effect, { profile, weapons, spells, warnings, sourceId: artefact.id });
      }

      artefactResult = { id: artefact.id, label: artefact.name };
    }

    return { profile, pts, weapons, spells, applied, artefact: artefactResult, warnings };
  }

  // ─── ARTEFACT ELIGIBILITY ──────────────────────────────────────────────────

  /**
   * Whether a given unit may equip a given artefact, per kow.json's
   * artefact_rules (global exclusions + class gates) and the artefact's own
   * restrictions (kow-artefacts.json). Pure function — takes the rules block
   * and artefact as data, no fetch, no knowledge of WBC globals.
   *
   * This does NOT check max_per_unit / unique_per_army — those are
   * army-level (does this OTHER unit already have it) rather than
   * unit-level, and are the caller's job (Muster) since they require
   * looking across the whole draft, not just this one unit.
   *
   * @param {Object} unit
   * @param {Object} artefact — a full entry from kow-artefacts.json
   * @param {Object} artefactRules — kow.json.artefact_rules
   * @returns {boolean}
   */
  function isArtefactEligibleForUnit(unit, artefact, artefactRules) {
    if (!unit || !artefact || !artefactRules) return false;

    const type = unit.type || '';
    const ge = artefactRules.global_exclusions || {};

    // 1. Outright-excluded types (e.g. War Engine).
    if (Array.isArray(ge.exclude_types) && ge.exclude_types.includes(type)) {
      return false;
    }

    // 2. Excluded types unless the unit's type string starts with "Hero"
    //    (e.g. plain "Monster" is barred, but "Hero (Mon)" is not).
    if (Array.isArray(ge.exclude_types_unless_hero_prefix)
        && ge.exclude_types_unless_hero_prefix.includes(type)
        && !type.startsWith('Hero')) {
      return false;
    }

    // 3. Unique [U] units are barred outright, regardless of type.
    if (unit.availability
        && Array.isArray(ge.exclude_if_availability_type)
        && ge.exclude_if_availability_type.includes(unit.availability.type)) {
      return false;
    }

    // 4. Class gate — heroic artefacts require a type prefix (normally "Hero").
    const gate = (artefactRules.class_gates || {})[artefact.class];
    if (gate && gate.requires_type_prefix && !type.startsWith(gate.requires_type_prefix)) {
      return false;
    }

    // 5. Per-artefact restrictions narrow further on top of the above.
    const restrictions = artefact.restrictions || {};
    if (Array.isArray(restrictions.allowed_types) && !restrictions.allowed_types.includes(type)) {
      return false;
    }
    if (Array.isArray(restrictions.forbid_special_rules)) {
      const unitRules = Array.isArray(unit.special_rules) ? unit.special_rules : [];
      const hasForbidden = restrictions.forbid_special_rules.some((r) => unitRules.includes(r));
      if (hasForbidden) return false;
    }

    return true;
  }

  /**
   * All artefacts from a catalogue that a given unit is eligible to equip,
   * per isArtefactEligibleForUnit(). Does not filter for army-level
   * uniqueness (already-taken-elsewhere) — that's the caller's job.
   *
   * @param {Object} unit
   * @param {Array} artefactCatalogue — kow-artefacts.json.artefacts
   * @param {Object} artefactRules — kow.json.artefact_rules
   * @returns {Array} filtered subset of artefactCatalogue
   */
  function getEligibleArtefacts(unit, artefactCatalogue, artefactRules) {
    if (!Array.isArray(artefactCatalogue)) return [];
    return artefactCatalogue.filter((a) => isArtefactEligibleForUnit(unit, a, artefactRules));
  }

  // ─── ENUM VALIDATION (type / size) ────────────────────────────────────────

  /**
   * Validate every unit's `type` and `size` against the canonical enums in
   * kow-enums.json (G1 §5). Pure — takes the enum data as an argument rather
   * than fetching it, keeping resolver.js free of I/O.
   *
   * Fails loudly rather than warning: an unlisted type/size is a data-authoring
   * bug (typo, unnormalized PDF value, ad-hoc invention in a faction file),
   * not a runtime condition the app can degrade gracefully around — better to
   * surface it immediately at load than have it silently break rules logic
   * later. Throws a single Error listing every located violation (unit_id +
   * field + offending value) so multiple bad entries surface at once rather
   * than one-at-a-time across repeated fixes.
   *
   * @param {Array} units — an army's units array (e.g. goblins.json.units)
   * @param {Object} enums — kow-enums.json contents ({ unit_types, unit_sizes, ... })
   * @throws {Error} if any unit has a type or size not present in the enums
   */
  function validateUnitEnums(units, enums) {
    if (!Array.isArray(units)) {
      throw new Error('[Resolver] validateUnitEnums: expected an array of units.');
    }
    if (!enums || !Array.isArray(enums.unit_types) || !Array.isArray(enums.unit_sizes)) {
      throw new Error('[Resolver] validateUnitEnums: enums must include unit_types and unit_sizes arrays.');
    }

    const validTypes = new Set(enums.unit_types);
    const validSizes = new Set(enums.unit_sizes);
    const errors = [];

    for (const unit of units) {
      const uid = unit && unit.unit_id ? unit.unit_id : '(missing unit_id)';
      if (!validTypes.has(unit.type)) {
        errors.push(`unit "${uid}": type "${unit.type}" is not in kow-enums.json unit_types`);
      }
      if (!validSizes.has(unit.size)) {
        errors.push(`unit "${uid}": size "${unit.size}" is not in kow-enums.json unit_sizes`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `[Resolver] Unit enum validation failed (${errors.length} issue(s)):\n` +
        errors.map((e) => `  - ${e}`).join('\n')
      );
    }
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  return {
    normalizeArmyUnits,
    resolve,
    isArtefactEligibleForUnit,
    getEligibleArtefacts,
    validateUnitEnums,
  };

})();
