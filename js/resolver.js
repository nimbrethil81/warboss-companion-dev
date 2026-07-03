/**
 * resolver.js — shared option/effect resolver
 *
 * Single source of truth for turning "base unit + selected option ids"
 * into an effective profile, and for normalising the saved-army units
 * field into a consistent shape. Consumed by muster.js (authoring) and
 * battle.js (roster build) — see SPEC.md §4, Options Consumption design.
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
   * { unit_id, options } entries, regardless of source shape.
   *
   * Accepts:
   *   - a JSON string (as stored in Sheets), or an already-parsed array
   *   - entries that are bare unit_id strings (legacy form)
   *   - entries that are { unit_id, options } objects (current form)
   *
   * Never throws. Malformed JSON returns []. Malformed individual entries
   * are skipped with a console warning rather than aborting the whole army
   * (Fail Gracefully — one bad entry must not blank the roster).
   *
   * @param {string|Array} rawUnitsField
   * @returns {Array<{unit_id: string, options: string[]}>}
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
        entries.push({ unit_id: item, options: [] });
      } else if (item && typeof item === 'object' && typeof item.unit_id === 'string') {
        const options = Array.isArray(item.options)
          ? item.options.filter((id) => typeof id === 'string')
          : [];
        entries.push({ unit_id: item.unit_id, options });
      } else {
        console.warn('[Resolver] normalizeArmyUnits: skipping malformed entry:', item);
      }
    }
    return entries;
  }

  // ─── OPTION / EFFECT RESOLUTION ──────────────────────────────────────────────

  /**
   * Resolve a unit's effective profile given a set of selected option ids.
   *
   * `resolve(unit, [])` is the universal path — a unit with no options array,
   * or no ids selected, returns exactly the base profile at base points.
   * Callers never need to branch on "does this unit have options".
   *
   * @param {Object} unit — a unit object from goblins.json (may be retired;
   *   resolution does not care about the `retired` flag, only availability
   *   filtering for new selection does, and that's the caller's job)
   * @param {string[]} [selectedOptionIds]
   * @returns {{
   *   profile: Object,
   *   pts: number,
   *   weapons: Array<{name, range, sh, att}>,
   *   spells: Array<{spell, power}>,
   *   applied: Array<{id, label}>,
   *   warnings: string[]
   * }}
   */
  function resolve(unit, selectedOptionIds) {
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
        switch (effect.type) {
          case 'add_special_rule':
            profile.special_rules.push(effect.rule);
            break;
          case 'set_field':
            profile[effect.field] = effect.value;
            break;
          case 'add_weapon':
            weapons.push({
              name: effect.name,
              range: effect.range,
              sh: effect.sh,
              att: effect.att,
            });
            break;
          case 'grant_spell':
            spells.push({ spell: effect.spell, power: effect.power });
            break;
          default:
            warnings.push(
              `Unknown effect type "${effect.type}" on option "${option.id}" ` +
              `(unit "${unit.unit_id}") — skipped.`
            );
        }
      }

      applied.push({ id: option.id, label: option.label });
    }

    return { profile, pts, weapons, spells, applied, warnings };
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  return {
    normalizeArmyUnits,
    resolve,
  };

})();
