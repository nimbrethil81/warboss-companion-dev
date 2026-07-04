/**
 * muster.js — Muster mode logic for Warboss Companion (v0.3 — Options + Artefacts Consumption)
 *
 * Responsibilities:
 *   - Browse units from WBC.armyData (goblins.json) and add/remove them
 *     to build a named army list
 *   - Author unit options (upgrades) per selected unit — independent toggles,
 *     mutually-exclusive groups, and informational battalion-scope options
 *   - Author a single magic artefact per eligible unit (WBC.artefactData —
 *     kow-artefacts.json), gated by WBC.systemConfig.artefact_rules via the
 *     shared WBCResolver eligibility functions; enforces unique-per-army at
 *     selection time by disabling artefacts already equipped elsewhere in
 *     the draft
 *   - Display live points, resolved via the shared WBCResolver against each
 *     unit's selected options AND artefact — never computed locally
 *     (Single Source of Truth)
 *   - Save named armies to Sheets as { unit_id, options[], artefact } entries
 *     — options/artefact are id references only, never duplicated stat data
 *   - List all saved armies with load/delete actions
 *   - Armies are available to Battle mode via WBCStorage.saveSelectedArmy()
 *
 * Unit ID / option ID / artefact ID immutability rule (enforced at data
 * level, documented here):
 *   unit_id values in goblins.json, option `id` values within a unit's
 *   `options` array, and artefact `id` values in kow-artefacts.json, are all
 *   permanent keys. They must NEVER be renamed once an army has been saved,
 *   or saved armies will fail to resolve those units/options/artefacts. To
 *   retire a unit, add "retired": true to its goblins.json entry instead of
 *   deleting it.
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - resolver.js (WBCResolver) — all option/effect/artefact resolution +
 *                                 saved-army entry normalisation goes through this
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC — provides WBC.armyData, WBC.systemConfig,
 *                  WBC.artefactData, WBC.switchTab)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via WBCSheets
 *   - This file NEVER computes effective stats/points itself — always via WBCResolver
 *   - No unit stat values are hardcoded here — all data comes from WBC.armyData at runtime
 *   - DOM manipulation is scoped to #page-muster and its children only
 */

var WBCMuster = (function () {
  'use strict';

  // ─── Module state ─────────────────────────────────────────────────────────

  /**
   * _draft.entries: array of { unit_id: string, options: string[], artefact: string|null },
   * index-addressed. Two entries with the same unit_id are independent rows
   * that may carry different options/artefact — index, not unit_id, is
   * identity within a draft.
   */
  var _draft = {
    army_id:    null,       // null = new army; UUID = editing existing
    army_name:  '',
    entries:    [],
    pts_limit:  2000,
  };

  /** Indices (into _draft.entries) whose options panel is currently expanded. */
  var _expandedIndices = new Set();

  var CATEGORY_ORDER = ['Core', 'Auxiliary', 'Specialist', 'Support', 'Commander'];

  // ─── Utility ──────────────────────────────────────────────────────────────

  function _el(id) { return document.getElementById(id); }

  function _qs(sel, root) { return (root || document).querySelector(sel); }

  function _qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function _isoNow() { return new Date().toISOString(); }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _statDisplay(val) {
    if (val === null || val === undefined || val === '-') return '—';
    return String(val);
  }

  // ─── Data helpers ─────────────────────────────────────────────────────────

  /**
   * All units eligible for NEW selection from goblins.json — retired units
   * excluded. Used ONLY by the picker.
   * @returns {Array}
   */
  function _availableUnits() {
    var armyData = window.WBC && window.WBC.armyData;
    if (!armyData || !Array.isArray(armyData.units)) return [];
    return armyData.units.filter(function (u) { return !u.retired; });
  }

  /**
   * Look up a unit object by unit_id from WBC.armyData — searches ALL units,
   * including retired ones. Used everywhere an already-selected entry (in
   * the draft, or in a previously-saved army) needs to resolve: unit_id
   * immutability means a retired unit must still resolve correctly for
   * armies that reference it; retirement only hides it from the picker.
   *
   * Returns null only for a genuinely unknown/malformed unit_id.
   *
   * @param {string} unitId
   * @returns {Object|null}
   */
  function _resolveUnit(unitId) {
    var armyData = window.WBC && window.WBC.armyData;
    if (!armyData || !Array.isArray(armyData.units)) return null;
    for (var i = 0; i < armyData.units.length; i++) {
      if (armyData.units[i].unit_id === unitId) return armyData.units[i];
    }
    return null;
  }

  /**
   * The active system's artefact eligibility rules (kow.json.artefact_rules).
   * Absent config or absent block → {} (eligibility resolver treats a falsy
   * rules object as "nothing eligible", which is the safe default).
   * @returns {Object}
   */
  function _artefactRules() {
    var cfg = window.WBC && window.WBC.systemConfig;
    return (cfg && cfg.artefact_rules) || null;
  }

  /**
   * The full artefact catalogue (kow-artefacts.json.artefacts), or [] if the
   * catalogue never loaded (Fail Gracefully — the app boots and functions
   * without artefacts; Muster simply shows no artefact section).
   * @returns {Array}
   */
  function _artefactCatalogue() {
    var data = window.WBC && window.WBC.artefactData;
    return (data && Array.isArray(data.artefacts)) ? data.artefacts : [];
  }

  /**
   * Look up a single artefact by id from the catalogue.
   * @param {string} artefactId
   * @returns {Object|null}
   */
  function _resolveArtefact(artefactId) {
    if (!artefactId) return null;
    var catalogue = _artefactCatalogue();
    for (var i = 0; i < catalogue.length; i++) {
      if (catalogue[i].id === artefactId) return catalogue[i];
    }
    return null;
  }

  /**
   * Artefacts from the catalogue this unit is eligible to equip, per the
   * shared resolver logic. Empty array if the catalogue/rules haven't
   * loaded, or the unit has no eligible artefacts (e.g. a War Engine).
   * @param {Object} unit
   * @returns {Array}
   */
  function _eligibleArtefactsFor(unit) {
    var rules = _artefactRules();
    if (!rules) return [];
    return WBCResolver.getEligibleArtefacts(unit, _artefactCatalogue(), rules);
  }

  /**
   * If the given artefact id is already equipped by a DIFFERENT entry in the
   * current draft, return that entry's unit display name; otherwise null.
   * Enforces "each artefact is unique — once per army" (rulebook, p.54) at
   * authoring time.
   * @param {string} artefactId
   * @param {number} excludeIndex — the entry currently being edited
   * @returns {string|null}
   */
  function _artefactTakenElsewhere(artefactId, excludeIndex) {
    for (var i = 0; i < _draft.entries.length; i++) {
      if (i === excludeIndex) continue;
      if (_draft.entries[i].artefact === artefactId) {
        var u = _resolveUnit(_draft.entries[i].unit_id);
        return u ? u.name : _draft.entries[i].unit_id;
      }
    }
    return null;
  }

  /**
   * Effective points for one draft entry, via the shared resolver.
   * Unknown unit_id resolves to 0 (graceful degradation — matches the
   * "(not found)" row rendering).
   * @param {{unit_id: string, options: string[], artefact: string|null}} entry
   * @returns {number}
   */
  function _entryPts(entry) {
    var u = _resolveUnit(entry.unit_id);
    if (!u) return 0;
    var artefact = _resolveArtefact(entry.artefact);
    return WBCResolver.resolve(u, entry.options, artefact).pts;
  }

  /**
   * Calculate total points for the current draft.
   * @returns {number}
   */
  function _draftTotal() {
    return _draft.entries.reduce(function (sum, entry) {
      return sum + _entryPts(entry);
    }, 0);
  }

  /**
   * Sum effective points for a normalised entries array belonging to a
   * SAVED army (not the live draft) — used by the army list cards.
   * @param {Array<{unit_id:string, options:string[]}>} entries
   * @returns {number}
   */
  function _savedArmyPts(entries) {
    return entries.reduce(function (sum, entry) {
      return sum + _entryPts(entry);
    }, 0);
  }

  // ─── View: Army list (home screen) ────────────────────────────────────────

  function _renderList() {
    var page = _el('page-muster');
    if (!page) return;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Muster</div>',
      '  <div class="page-subtitle">Your armies</div>',
      '</div>',

      '<div id="muster-armies-list">',
      '  <div class="muster-loading">Loading armies…</div>',
      '</div>',

      '<button id="muster-new-btn" class="muster-primary-btn">',
      '  + New Army',
      '</button>',

      '<div id="muster-list-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    var newBtn = _el('muster-new-btn');
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        _draft = { army_id: null, army_name: '', entries: [], pts_limit: 2000 };
        _expandedIndices = new Set();
        _renderBuilder();
      });
    }

    _loadArmies();
  }

  function _loadArmies() {
    WBCSheets.fetchArmies().then(function (result) {
      _renderArmiesList(result.data, result.fromCache, result.error);
    }).catch(function (err) {
      console.error('[muster] fetchArmies unexpected error:', err);
      var cached = WBCStorage.loadArmiesCache() || [];
      _renderArmiesList(cached, true, 'Could not reach your army roster. Showing saved data.');
    });
  }

  function _renderArmiesList(armies, fromCache, fetchError) {
    var listEl = _el('muster-armies-list');
    var errEl  = _el('muster-list-error');
    if (!listEl) return;

    if (fetchError) {
      if (errEl) { errEl.textContent = fetchError; errEl.style.display = 'block'; }
    }

    if (!armies || armies.length === 0) {
      listEl.innerHTML = '<p class="setup-hint">No armies saved yet. Create your first army below.</p>';
      return;
    }

    var html = fromCache
      ? '<div class="chronicle-cache-notice">Showing saved records — connect to sync latest.</div>'
      : '';

    armies.forEach(function (army) {
      var entries = WBCResolver.normalizeArmyUnits(army.units);
      var pts = _savedArmyPts(entries);

      html += [
        '<div class="muster-army-card" data-army-id="' + _escapeHtml(army.army_id) + '">',
        '  <div class="muster-army-card-info">',
        '    <div class="muster-army-card-name">' + _escapeHtml(army.army_name || 'Unnamed Army') + '</div>',
        '    <div class="muster-army-card-meta">',
        '      ' + entries.length + ' unit' + (entries.length !== 1 ? 's' : ''),
        '      · ' + pts + ' pts',
        '    </div>',
        '  </div>',
        '  <div class="muster-army-card-actions">',
        '    <button class="muster-card-btn muster-card-btn--edit"',
        '            data-army-id="' + _escapeHtml(army.army_id) + '"',
        '            data-army-name="' + _escapeHtml(army.army_name || '') + '"',
        '            data-entries="' + _escapeHtml(JSON.stringify(entries)) + '"',
        '            aria-label="Edit ' + _escapeHtml(army.army_name || 'army') + '">',
        '      Edit',
        '    </button>',
        '    <button class="muster-card-btn muster-card-btn--delete"',
        '            data-army-id="' + _escapeHtml(army.army_id) + '"',
        '            data-army-name="' + _escapeHtml(army.army_name || 'this army') + '"',
        '            aria-label="Delete ' + _escapeHtml(army.army_name || 'army') + '">',
        '      Delete',
        '    </button>',
        '  </div>',
        '</div>',
      ].join('');
    });

    listEl.innerHTML = html;

    /* Bind edit buttons */
    _qsa('.muster-card-btn--edit', listEl).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var entries;
        try { entries = JSON.parse(this.getAttribute('data-entries')); } catch (e) { entries = []; }
        _draft = {
          army_id:   this.getAttribute('data-army-id'),
          army_name: this.getAttribute('data-army-name'),
          entries:   entries,
          pts_limit: 2000,
        };
        _expandedIndices = new Set();
        _renderBuilder();
      });
    });

    /* Bind delete buttons */
    _qsa('.muster-card-btn--delete', listEl).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var armyId   = this.getAttribute('data-army-id');
        var armyName = this.getAttribute('data-army-name');
        _confirmDelete(armyId, armyName);
      });
    });
  }

  function _confirmDelete(armyId, armyName) {
    if (!window.confirm('Delete "' + armyName + '"? This cannot be undone.')) return;

    var errEl = _el('muster-list-error');

    WBCSheets.deleteArmy(armyId).then(function (result) {
      if (result.success) {
        /* Remove from cache optimistically */
        var cached = WBCStorage.loadArmiesCache() || [];
        WBCStorage.saveArmiesCache(cached.filter(function (a) { return a.army_id !== armyId; }));
        _renderList();
      } else {
        if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
      }
    }).catch(function (err) {
      console.error('[muster] deleteArmy unexpected error:', err);
      if (errEl) { errEl.textContent = 'Unexpected error. Please try again.'; errEl.style.display = 'block'; }
    });
  }

  // ─── View: Army builder ────────────────────────────────────────────────────

  function _renderBuilder() {
    var page = _el('page-muster');
    if (!page) return;

    var isNew     = !_draft.army_id;
    var total     = _draftTotal();
    var overLimit = total > _draft.pts_limit;

    page.innerHTML = [
      '<div class="page-header muster-builder-header">',
      '  <button id="muster-back-btn" class="muster-back-btn" aria-label="Back to army list">‹ Back</button>',
      '  <div class="page-title">' + (isNew ? 'New Army' : 'Edit Army') + '</div>',
      '</div>',

      /* Army name field */
      '<div class="muster-field">',
      '  <label class="setup-label" for="muster-army-name">Army name</label>',
      '  <input id="muster-army-name" class="setup-input" type="text"',
      '         placeholder="e.g. Green Tide" maxlength="60"',
      '         value="' + _escapeHtml(_draft.army_name) + '" />',
      '</div>',

      /* Points summary */
      '<div id="muster-pts-bar" class="muster-pts-bar' + (overLimit ? ' muster-pts-bar--over' : '') + '">',
      '  <span id="muster-pts-total" class="muster-pts-total">' + total + ' pts</span>',
      '  <span class="muster-pts-sep">/</span>',
      '  <input id="muster-pts-limit" class="muster-pts-limit-input" type="number"',
      '         min="100" max="9999" step="50" value="' + _draft.pts_limit + '" />',
      '  <span class="muster-pts-label">pt limit</span>',
      '</div>',

      /* Selected units */
      '<div class="section-label">Selected units (' + _draft.entries.length + ')</div>',
      '<div id="muster-selected-list" class="muster-selected-list">',
      _renderSelectedList(),
      '</div>',

      /* Available units picker */
      '<div class="section-label">Add units</div>',
      '<div id="muster-picker" class="muster-picker">',
      _renderPickerRows(),
      '</div>',

      /* Save / cancel — status/error live INSIDE the sticky bar so feedback
         stays visible alongside the button rather than scrolling out of
         view below it once .muster-builder-actions is sticky. */
      '<div class="muster-builder-actions">',
      '  <button id="muster-save-btn" class="muster-primary-btn"',
      '          ' + (_draft.army_name.trim() === '' ? 'disabled' : '') + '>',
      '    Save Army',
      '  </button>',
      '  <div id="muster-save-status"  class="muster-status"   style="display:none;">Saving…</div>',
      '  <div id="muster-save-error"   class="battle-error"    style="display:none;"></div>',
      '</div>',
    ].join('');

    _bindBuilderEvents();
  }

  function _renderSelectedList() {
    if (_draft.entries.length === 0) {
      return '<p class="setup-hint" id="muster-empty-hint">No units added yet. Pick from the list below.</p>';
    }
    return _draft.entries.map(function (entry, index) {
      return _selectedUnitRow(entry, index);
    }).join('');
  }

  function _selectedUnitRow(entry, index) {
    var u = _resolveUnit(entry.unit_id);

    if (!u) {
      /* Graceful degradation: genuinely unknown unit_id (not retired — those
         still resolve via _resolveUnit; this is a truly missing reference) */
      return [
        '<div class="muster-sel-row muster-sel-row--missing">',
        '  <span class="muster-sel-name">' + _escapeHtml(entry.unit_id) + ' <em>(not found)</em></span>',
        '  <button class="muster-remove-btn" data-entry-index="' + index + '"',
        '          aria-label="Remove unit">✕</button>',
        '</div>',
      ].join('');
    }

    var artefact     = _resolveArtefact(entry.artefact);
    var resolved     = WBCResolver.resolve(u, entry.options, artefact);
    var hasOptions   = Array.isArray(u.options) && u.options.length > 0;
    var eligibleArts = _eligibleArtefactsFor(u);
    var hasArtefacts = eligibleArts.length > 0;
    var expandable   = hasOptions || hasArtefacts;
    var expanded     = _expandedIndices.has(index);
    var fittedCount  = entry.options.length + (entry.artefact ? 1 : 0);

    var label = _escapeHtml(u.name)
      + (u.size ? ' <span class="muster-sel-size">(' + _escapeHtml(u.size) + ')</span>' : '')
      + (u.retired ? ' <span class="muster-sel-retired-tag">retired</span>' : '');

    var rowHtml = [
      '<div class="muster-sel-row" data-entry-index="' + index + '">',
      '  <span class="muster-sel-name">' + label + '</span>',
      '  <span class="muster-sel-pts">' + resolved.pts + ' pts</span>',
      expandable
        ? [
            '  <button class="muster-opt-expand" data-entry-index="' + index + '"',
            '          aria-expanded="' + (expanded ? 'true' : 'false') + '">',
            '    ⚙' + (fittedCount > 0 ? ' <span class="muster-opt-badge-count">' + fittedCount + '</span>' : ''),
            '    ' + (expanded ? '▾' : '▸'),
            '  </button>',
          ].join('')
        : '',
      '  <button class="muster-remove-btn" data-entry-index="' + index + '"',
      '          aria-label="Remove ' + _escapeHtml(u.name) + '">✕</button>',
      '</div>',
    ].join('');

    if (expandable && expanded) {
      var panelHtml = '';
      if (hasOptions) panelHtml += _renderOptionsPanel(u, entry, index);
      if (hasArtefacts) panelHtml += _renderArtefactPanel(eligibleArts, entry, index);
      rowHtml += '<div class="muster-opt-panel">' + panelHtml + '</div>';
    }

    return rowHtml;
  }

  function _renderOptionsPanel(u, entry, index) {
    return u.options.map(function (option) {
      var costLabel = typeof option.cost === 'number'
        ? (option.cost === 0 ? 'free' : '+' + option.cost + ' pts')
        : '';
      var descHtml = option.description
        ? '<div class="muster-opt-desc">' + _escapeHtml(option.description) + '</div>'
        : '';

      if (option.scope === 'battalion') {
        return [
          '<div class="muster-opt-row muster-opt-row--info">',
          '  <div class="muster-opt-info">',
          '    <span class="muster-opt-label">' + _escapeHtml(option.label) + '</span>',
          '    <span class="muster-opt-badge muster-opt-badge--battalion">Battalion</span>',
          '    ' + descHtml,
          '  </div>',
          '</div>',
        ].join('');
      }

      var selected = entry.options.indexOf(option.id) !== -1;
      var rowClass = option.group ? 'muster-opt-row--group' : 'muster-opt-row--toggle';

      return [
        '<div class="muster-opt-row ' + rowClass + '">',
        '  <button class="muster-opt-toggle' + (selected ? ' muster-opt-toggle--selected' : '') + '"',
        '          data-entry-index="' + index + '"',
        '          data-option-id="' + _escapeHtml(option.id) + '"',
        '          data-option-group="' + _escapeHtml(option.group || '') + '"',
        '          aria-pressed="' + (selected ? 'true' : 'false') + '"',
        '          aria-label="' + (selected ? 'Remove' : 'Add') + ' ' + _escapeHtml(option.label) + '">',
        '    ' + (selected ? '✓' : '+'),
        '  </button>',
        '  <div class="muster-opt-info">',
        '    <span class="muster-opt-label">' + _escapeHtml(option.label) + '</span>',
        costLabel ? '    <span class="muster-opt-cost">' + costLabel + '</span>' : '',
        '    ' + descHtml,
        '  </div>',
        '</div>',
      ].join('');
    }).join('');
  }

  /**
   * Render the Artefact section of a unit's expand panel — single-select
   * across the unit's eligible artefacts (at most one per unit, per
   * rulebook), with any artefact already equipped by ANOTHER unit in the
   * current draft shown disabled (each artefact is unique — once per army).
   * @param {Array} eligibleArts — from _eligibleArtefactsFor(u)
   * @param {Object} entry
   * @param {number} index
   * @returns {string}
   */
  function _renderArtefactPanel(eligibleArts, entry, index) {
    var rows = eligibleArts.map(function (art) {
      var selected    = entry.artefact === art.id;
      var takenByName = !selected ? _artefactTakenElsewhere(art.id, index) : null;
      var disabled    = !!takenByName;
      var costLabel   = art.cost === 0 ? 'free' : '+' + art.cost + ' pts';
      var classBadge  = '<span class="muster-opt-badge muster-opt-badge--' + art.class + '">'
        + (art.class === 'heroic' ? 'Heroic' : 'Common') + '</span>';

      return [
        '<div class="muster-opt-row muster-opt-row--group' + (disabled ? ' muster-opt-row--disabled' : '') + '">',
        '  <button class="muster-opt-toggle' + (selected ? ' muster-opt-toggle--selected' : '') + '"',
        '          data-entry-index="' + index + '"',
        '          data-artefact-id="' + _escapeHtml(art.id) + '"',
        '          aria-pressed="' + (selected ? 'true' : 'false') + '"',
        disabled ? '          disabled' : '',
        '          aria-label="' + (selected ? 'Remove' : 'Equip') + ' ' + _escapeHtml(art.name) + '">',
        '    ' + (selected ? '✓' : '+'),
        '  </button>',
        '  <div class="muster-opt-info">',
        '    <span class="muster-opt-label">' + _escapeHtml(art.name) + '</span>',
        '    <span class="muster-opt-cost">' + costLabel + '</span>',
        '    ' + classBadge,
        '    <div class="muster-opt-desc">' + _escapeHtml(art.description) + '</div>',
        takenByName
          ? '    <div class="muster-opt-desc muster-opt-desc--taken">Already equipped by ' + _escapeHtml(takenByName) + '</div>'
          : '',
        '  </div>',
        '</div>',
      ].join('');
    }).join('');

    return '<div class="muster-artefact-section">'
      + '<div class="section-label section-label--sub">Artefact</div>'
      + rows
      + '</div>';
  }

  function _renderPickerRows() {
    var units = _availableUnits();
    if (units.length === 0) return '<p class="setup-hint">No units available.</p>';

    /* Group by category, fixed rulebook order; unknown/missing category
       falls through to a trailing "Other" group (defensive — every audited
       unit carries a category, but a malformed entry must not vanish). */
    var groups = {};
    var groupOrder = [];
    units.forEach(function (u) {
      var key = CATEGORY_ORDER.indexOf(u.category) !== -1 ? u.category : 'Other';
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(u);
    });
    groupOrder.sort(function (a, b) {
      var ai = CATEGORY_ORDER.indexOf(a); if (ai === -1) ai = CATEGORY_ORDER.length;
      var bi = CATEGORY_ORDER.indexOf(b); if (bi === -1) bi = CATEGORY_ORDER.length;
      return ai - bi;
    });

    var html = '';
    groupOrder.forEach(function (categoryName) {
      html += '<div class="section-label section-label--sub">' + _escapeHtml(categoryName) + '</div>';
      groups[categoryName].forEach(function (u) {
        var rules = (u.special_rules || []);
        var rulesHtml = rules.length
          ? '<span class="muster-picker-rules">' + _escapeHtml(rules.join(', ')) + '</span>'
          : '';

        var availabilityHtml = '';
        if (u.availability) {
          if (u.availability.type === 'limited') {
            availabilityHtml = '<span class="muster-avail-badge">Limited: max '
              + _escapeHtml(String(u.availability.max)) + ' per Battalion</span>';
          } else if (u.availability.type === 'unique') {
            availabilityHtml = '<span class="muster-avail-badge muster-avail-badge--unique">Unique — 1 per army</span>';
          }
        }

        var optionsHint = (Array.isArray(u.options) && u.options.length > 0)
          ? '<span class="muster-opt-hint">⚙ options</span>'
          : '';

        html += [
          '<div class="muster-picker-row">',
          '  <div class="muster-picker-info">',
          '    <span class="muster-picker-name">',
          '      ' + _escapeHtml(u.name),
          '      ' + (u.size ? '<span class="muster-sel-size">(' + _escapeHtml(u.size) + ')</span>' : ''),
          '      ' + optionsHint,
          '    </span>',
          '    <div class="muster-picker-stats">',
          '      <span class="usg-cell"><span class="usg-label">Sp</span>' + _statDisplay(u.sp) + '</span>',
          '      <span class="usg-cell"><span class="usg-label">Me</span>' + _statDisplay(u.me) + (u.me && u.me !== '-' ? '+' : '') + '</span>',
          '      <span class="usg-cell"><span class="usg-label">Sh</span>' + _statDisplay(u.sh) + (u.sh && u.sh !== '-' ? '+' : '') + '</span>',
          '      <span class="usg-cell"><span class="usg-label">De</span>' + _statDisplay(u.de) + (u.de && u.de !== '-' ? '+' : '') + '</span>',
          '      <span class="usg-cell"><span class="usg-label">Att</span>' + _statDisplay(u.att) + '</span>',
          '      <span class="usg-cell"><span class="usg-label">Ne</span>' + _statDisplay(u.ne) + '</span>',
          '    </div>',
          '    ' + rulesHtml,
          '    ' + availabilityHtml,
          '  </div>',
          '  <div class="muster-picker-right">',
          '    <span class="muster-picker-pts">' + (typeof u.pts === 'number' ? u.pts : '—') + '</span>',
          '    <button class="muster-add-btn" data-unit-id="' + _escapeHtml(u.unit_id) + '"',
          '            aria-label="Add ' + _escapeHtml(u.name) + '">+</button>',
          '  </div>',
          '</div>',
        ].join('');
      });
    });

    return html;
  }

  function _bindBuilderEvents() {
    /* Back */
    var backBtn = _el('muster-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (_draft.entries.length > 0 || _draft.army_name.trim() !== '') {
          if (!window.confirm('Discard unsaved changes?')) return;
        }
        _renderList();
      });
    }

    /* Army name input */
    var nameInput = _el('muster-army-name');
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        _draft.army_name = this.value;
        var saveBtn = _el('muster-save-btn');
        if (saveBtn) saveBtn.disabled = this.value.trim() === '';
      });
    }

    /* Points limit input */
    var limitInput = _el('muster-pts-limit');
    if (limitInput) {
      limitInput.addEventListener('change', function () {
        var val = parseInt(this.value, 10);
        if (!isNaN(val) && val >= 100) {
          _draft.pts_limit = val;
          _refreshPtsBar();
        }
      });
    }

    /* Add unit buttons (in picker) */
    var pickerEl = _el('muster-picker');
    if (pickerEl) {
      pickerEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.muster-add-btn');
        if (!btn) return;
        var uid = btn.getAttribute('data-unit-id');
        if (uid) _addUnit(uid);
      });
    }

    /* Selected list: remove, options-expand, options-toggle (delegated) */
    var selList = _el('muster-selected-list');
    if (selList) {
      selList.addEventListener('click', function (e) {
        var removeBtn = e.target.closest('.muster-remove-btn');
        if (removeBtn) {
          var idx = parseInt(removeBtn.getAttribute('data-entry-index'), 10);
          _removeEntry(idx);
          return;
        }

        var expandBtn = e.target.closest('.muster-opt-expand');
        if (expandBtn) {
          var eidx = parseInt(expandBtn.getAttribute('data-entry-index'), 10);
          _toggleExpanded(eidx);
          return;
        }

        var optBtn = e.target.closest('.muster-opt-toggle');
        if (optBtn) {
          var oidx = parseInt(optBtn.getAttribute('data-entry-index'), 10);

          var artefactId = optBtn.getAttribute('data-artefact-id');
          if (artefactId !== null) {
            _toggleArtefact(oidx, artefactId);
            return;
          }

          var oid   = optBtn.getAttribute('data-option-id');
          var group = optBtn.getAttribute('data-option-group') || null;
          _toggleOption(oidx, oid, group);
          return;
        }
      });
    }

    /* Save */
    var saveBtn = _el('muster-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', _saveArmy);
  }

  // ─── Draft mutations ───────────────────────────────────────────────────────

  function _addUnit(unitId) {
    _draft.entries.push({ unit_id: unitId, options: [], artefact: null });
    _refreshSelectedList();
    _refreshPtsBar();
  }

  function _removeEntry(index) {
    if (index < 0 || index >= _draft.entries.length) return;
    _draft.entries.splice(index, 1);
    /* Indices shift on removal — safest to collapse all open panels rather
       than risk a stale index pointing at the wrong row. */
    _expandedIndices = new Set();
    _refreshSelectedList();
    _refreshPtsBar();
  }

  function _toggleExpanded(index) {
    if (_expandedIndices.has(index)) {
      _expandedIndices.delete(index);
    } else {
      _expandedIndices.add(index);
    }
    _refreshSelectedList();
  }

  /**
   * Toggle a single option on a draft entry.
   * Independent options (group === null): simple toggle.
   * Grouped options: selecting one clears any other selected id in the same
   * group on that unit (mutual exclusion); selecting the already-selected
   * one clears the group (all group options are optional upgrades).
   *
   * @param {number} index — entry index in _draft.entries
   * @param {string} optionId
   * @param {string|null} group
   */
  function _toggleOption(index, optionId, group) {
    var entry = _draft.entries[index];
    if (!entry) return;

    var pos = entry.options.indexOf(optionId);

    if (group) {
      var u = _resolveUnit(entry.unit_id);
      var groupIds = (u && Array.isArray(u.options))
        ? u.options.filter(function (o) { return o.group === group; }).map(function (o) { return o.id; })
        : [optionId];

      var withoutGroup = entry.options.filter(function (id) { return groupIds.indexOf(id) === -1; });
      entry.options = (pos !== -1) ? withoutGroup : withoutGroup.concat([optionId]);
    } else {
      if (pos !== -1) {
        entry.options.splice(pos, 1);
      } else {
        entry.options.push(optionId);
      }
    }

    _refreshSelectedList();
    _refreshPtsBar();
  }

  /**
   * Toggle a unit's equipped artefact. At most one per unit (selecting a
   * new one replaces any previously equipped); selecting the equipped one
   * again clears it. Refuses selection if the artefact is already equipped
   * by ANOTHER unit in the draft (rulebook: each artefact is unique — once
   * per army) — the row's toggle is disabled in that case, but the guard
   * here protects against any stale-DOM edge case.
   * @param {number} index
   * @param {string} artefactId
   */
  function _toggleArtefact(index, artefactId) {
    var entry = _draft.entries[index];
    if (!entry) return;

    if (entry.artefact === artefactId) {
      entry.artefact = null;
    } else {
      if (_artefactTakenElsewhere(artefactId, index)) return;
      entry.artefact = artefactId;
    }

    _refreshSelectedList();
    _refreshPtsBar();
  }

  function _refreshSelectedList() {
    var listEl = _el('muster-selected-list');
    if (!listEl) return;

    listEl.innerHTML = _renderSelectedList();

    /* Update count label */
    var labels = _qsa('.section-label', _el('page-muster'));
    labels.forEach(function (el) {
      if (el.textContent.indexOf('Selected units') === 0) {
        el.textContent = 'Selected units (' + _draft.entries.length + ')';
      }
    });
  }

  function _refreshPtsBar() {
    var total     = _draftTotal();
    var overLimit = total > _draft.pts_limit;
    var barEl     = _el('muster-pts-bar');
    var totalEl   = _el('muster-pts-total');

    if (barEl) {
      barEl.classList.toggle('muster-pts-bar--over', overLimit);
    }
    if (totalEl) {
      totalEl.textContent = total + ' pts';
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  function _saveArmy() {
    var name = (_el('muster-army-name') || {}).value || _draft.army_name;
    name = name.trim();

    if (!name) {
      var errEl = _el('muster-save-error');
      if (errEl) { errEl.textContent = 'Please give your army a name.'; errEl.style.display = 'block'; }
      return;
    }

    var statusEl = _el('muster-save-status');
    var errEl2   = _el('muster-save-error');
    var saveBtn  = _el('muster-save-btn');

    if (statusEl) statusEl.style.display = 'block';
    if (saveBtn)  saveBtn.disabled = true;
    if (errEl2)   errEl2.style.display = 'none';

    var now    = _isoNow();
    var armyId = _draft.army_id || _uuid();

    /* Always write object form — { unit_id, options, artefact } — even for
       units with no options/artefact selected. Legacy bare-string entries
       are read forever but never written again; armies migrate to the new
       form on next save. */
    var unitsPayload = _draft.entries.map(function (entry) {
      return { unit_id: entry.unit_id, options: entry.options.slice(), artefact: entry.artefact || null };
    });

    var record = {
      army_id:     armyId,
      army_name:   name,
      game_system: (window.WBC && window.WBC.armyData && window.WBC.armyData.game_system) || 'kow',
      units:       JSON.stringify(unitsPayload),
      created_at:  _draft.army_id ? undefined : now,  // only set on create
      updated_at:  now,
    };

    /* Remove undefined fields (created_at on updates) */
    Object.keys(record).forEach(function (k) {
      if (record[k] === undefined) delete record[k];
    });

    WBCSheets.saveArmy(record).then(function (result) {
      if (statusEl) statusEl.style.display = 'none';

      if (result.success) {
        /* Optimistically update local cache */
        var cached = WBCStorage.loadArmiesCache() || [];
        var existing = false;
        cached = cached.map(function (a) {
          if (a.army_id === armyId) {
            existing = true;
            return Object.assign({}, a, record);
          }
          return a;
        });
        if (!existing) cached.push(Object.assign({}, record, { army_id: armyId }));
        WBCStorage.saveArmiesCache(cached);

        _draft = { army_id: null, army_name: '', entries: [], pts_limit: 2000 };
        _expandedIndices = new Set();
        _renderList();
      } else {
        if (saveBtn) saveBtn.disabled = false;
        if (errEl2) { errEl2.textContent = result.error; errEl2.style.display = 'block'; }
      }
    }).catch(function (err) {
      console.error('[muster] saveArmy unexpected error:', err);
      if (statusEl) statusEl.style.display = 'none';
      if (saveBtn)  saveBtn.disabled = false;
      if (errEl2) { errEl2.textContent = 'Unexpected error. Please try again.'; errEl2.style.display = 'block'; }
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * init() — called by app.js on boot.
   */
  function init() {
    /* No-op: Muster renders on tab activation */
  }

  /**
   * onTabActivated() — called by app.js when the Muster tab becomes active.
   */
  function onTabActivated() {
    _renderList();
  }

  return {
    init,
    onTabActivated,
  };

})();
