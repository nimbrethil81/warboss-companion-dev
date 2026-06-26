/**
 * muster.js — Muster mode logic for Warboss Companion (v0.2)
 *
 * Responsibilities:
 *   - Browse units from WBC.armyData (goblins.json) and add/remove them
 *     to build a named army list
 *   - Display total points and a configurable points limit
 *   - Save named armies to Sheets (unit_ids only — no stat duplication)
 *   - List all saved armies with load/delete actions
 *   - Armies are available to Battle mode via WBCStorage.saveSelectedArmy()
 *
 * Unit ID immutability rule (enforced at data level, documented here):
 *   unit_id values in goblins.json are permanent keys. They must NEVER
 *   be renamed once an army has been saved, or saved armies will fail to
 *   resolve those units. To retire a unit, add "retired": true to its
 *   goblins.json entry instead of deleting it.
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC — provides WBC.armyData, WBC.switchTab)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via WBCSheets
 *   - No unit stat values are hardcoded here — all data comes from WBC.armyData at runtime
 *   - DOM manipulation is scoped to #page-muster and its children only
 */

var WBCMuster = (function () {
  'use strict';

  // ─── Module state ─────────────────────────────────────────────────────────

  var _draft = {
    army_id:    null,       // null = new army; UUID = editing existing
    army_name:  '',
    unit_ids:   [],         // ordered array of unit_id strings
    pts_limit:  2000,
  };

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
   * All available units from goblins.json, excluding retired ones.
   * @returns {Array}
   */
  function _availableUnits() {
    var armyData = window.WBC && window.WBC.armyData;
    if (!armyData || !Array.isArray(armyData.units)) return [];
    return armyData.units.filter(function (u) { return !u.retired; });
  }

  /**
   * Look up a unit object by unit_id from WBC.armyData.
   * Returns null if not found (handles retired/removed units gracefully).
   * @param {string} unitId
   * @returns {Object|null}
   */
  function _findUnit(unitId) {
    var units = _availableUnits();
    for (var i = 0; i < units.length; i++) {
      if (units[i].unit_id === unitId) return units[i];
    }
    return null;
  }

  /**
   * Calculate total points for the current draft from WBC.armyData.
   * @returns {number}
   */
  function _draftTotal() {
    return _draft.unit_ids.reduce(function (sum, uid) {
      var u = _findUnit(uid);
      return sum + (u && typeof u.pts === 'number' ? u.pts : 0);
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
        _draft = { army_id: null, army_name: '', unit_ids: [], pts_limit: 2000 };
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
      var unitIds;
      try {
        unitIds = typeof army.units === 'string' ? JSON.parse(army.units) : (army.units || []);
      } catch (e) { unitIds = []; }

      var pts = unitIds.reduce(function (sum, uid) {
        var u = _findUnit(uid);
        return sum + (u && typeof u.pts === 'number' ? u.pts : 0);
      }, 0);

      html += [
        '<div class="muster-army-card" data-army-id="' + _escapeHtml(army.army_id) + '">',
        '  <div class="muster-army-card-info">',
        '    <div class="muster-army-card-name">' + _escapeHtml(army.army_name || 'Unnamed Army') + '</div>',
        '    <div class="muster-army-card-meta">',
        '      ' + unitIds.length + ' unit' + (unitIds.length !== 1 ? 's' : ''),
        '      · ' + pts + ' pts',
        '    </div>',
        '  </div>',
        '  <div class="muster-army-card-actions">',
        '    <button class="muster-card-btn muster-card-btn--edit"',
        '            data-army-id="' + _escapeHtml(army.army_id) + '"',
        '            data-army-name="' + _escapeHtml(army.army_name || '') + '"',
        '            data-unit-ids="' + _escapeHtml(JSON.stringify(unitIds)) + '"',
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
        var unitIds;
        try { unitIds = JSON.parse(this.getAttribute('data-unit-ids')); } catch (e) { unitIds = []; }
        _draft = {
          army_id:   this.getAttribute('data-army-id'),
          army_name: this.getAttribute('data-army-name'),
          unit_ids:  unitIds,
          pts_limit: 2000,
        };
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

    var isNew    = !_draft.army_id;
    var total    = _draftTotal();
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
      '<div class="section-label">Selected units (' + _draft.unit_ids.length + ')</div>',
      '<div id="muster-selected-list" class="muster-selected-list">',
      _draft.unit_ids.length === 0
        ? '<p class="setup-hint" id="muster-empty-hint">No units added yet. Pick from the list below.</p>'
        : _draft.unit_ids.map(function (uid) { return _selectedUnitRow(uid); }).join(''),
      '</div>',

      /* Available units picker */
      '<div class="section-label">Add units</div>',
      '<div id="muster-picker" class="muster-picker">',
      _renderPickerRows(),
      '</div>',

      /* Save / cancel */
      '<div class="muster-builder-actions">',
      '  <button id="muster-save-btn" class="muster-primary-btn"',
      '          ' + (_draft.army_name.trim() === '' ? 'disabled' : '') + '>',
      '    Save Army',
      '  </button>',
      '</div>',
      '<div id="muster-save-status"  class="muster-status"   style="display:none;">Saving…</div>',
      '<div id="muster-save-error"   class="battle-error"    style="display:none;"></div>',
    ].join('');

    _bindBuilderEvents();
  }

  function _selectedUnitRow(unitId) {
    var u = _findUnit(unitId);
    if (!u) {
      /* Graceful degradation: unit not found (retired or unknown) */
      return [
        '<div class="muster-sel-row muster-sel-row--missing">',
        '  <span class="muster-sel-name">' + _escapeHtml(unitId) + ' <em>(not found)</em></span>',
        '  <button class="muster-remove-btn" data-unit-id="' + _escapeHtml(unitId) + '"',
        '          aria-label="Remove unit">✕</button>',
        '</div>',
      ].join('');
    }

    var label = _escapeHtml(u.name) + (u.size ? ' <span class="muster-sel-size">(' + _escapeHtml(u.size) + ')</span>' : '');

    return [
      '<div class="muster-sel-row" data-unit-id="' + _escapeHtml(unitId) + '">',
      '  <span class="muster-sel-name">' + label + '</span>',
      '  <span class="muster-sel-pts">' + (typeof u.pts === 'number' ? u.pts + ' pts' : '') + '</span>',
      '  <button class="muster-remove-btn" data-unit-id="' + _escapeHtml(unitId) + '"',
      '          aria-label="Remove ' + _escapeHtml(u.name) + '">✕</button>',
      '</div>',
    ].join('');
  }

  function _renderPickerRows() {
    var units = _availableUnits();
    if (units.length === 0) return '<p class="setup-hint">No units available.</p>';

    /* Group by type */
    var groups = {};
    var groupOrder = [];
    units.forEach(function (u) {
      var key = u.type || 'Other';
      if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(u);
    });

    var html = '';
    groupOrder.forEach(function (typeName) {
      html += '<div class="section-label section-label--sub">' + _escapeHtml(typeName) + '</div>';
      groups[typeName].forEach(function (u) {
        var rules = (u.special_rules || []);
        var rulesHtml = rules.length
          ? '<span class="muster-picker-rules">' + _escapeHtml(rules.join(', ')) + '</span>'
          : '';

        html += [
          '<div class="muster-picker-row">',
          '  <div class="muster-picker-info">',
          '    <span class="muster-picker-name">',
          '      ' + _escapeHtml(u.name),
          '      ' + (u.size ? '<span class="muster-sel-size">(' + _escapeHtml(u.size) + ')</span>' : ''),
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
        if (_draft.unit_ids.length > 0 || _draft.army_name.trim() !== '') {
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

    /* Remove unit buttons (in selected list) */
    var selList = _el('muster-selected-list');
    if (selList) {
      selList.addEventListener('click', function (e) {
        var btn = e.target.closest('.muster-remove-btn');
        if (!btn) return;
        var uid = btn.getAttribute('data-unit-id');
        if (uid) _removeUnit(uid);
      });
    }

    /* Save */
    var saveBtn = _el('muster-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', _saveArmy);
  }

  // ─── Draft mutations ───────────────────────────────────────────────────────

  function _addUnit(unitId) {
    _draft.unit_ids.push(unitId);
    _refreshSelectedList();
    _refreshPtsBar();
  }

  function _removeUnit(unitId) {
    /* Remove only the first occurrence (allows duplicates) */
    var idx = _draft.unit_ids.indexOf(unitId);
    if (idx !== -1) _draft.unit_ids.splice(idx, 1);
    _refreshSelectedList();
    _refreshPtsBar();
  }

  function _refreshSelectedList() {
    var listEl = _el('muster-selected-list');
    if (!listEl) return;

    if (_draft.unit_ids.length === 0) {
      listEl.innerHTML = '<p class="setup-hint" id="muster-empty-hint">No units added yet. Pick from the list below.</p>';
    } else {
      listEl.innerHTML = _draft.unit_ids.map(function (uid) {
        return _selectedUnitRow(uid);
      }).join('');
    }

    /* Update count label */
    var label = _qs('.section-label', _el('page-muster'));
    /* Find specifically the "Selected units" label */
    var labels = _qsa('.section-label', _el('page-muster'));
    labels.forEach(function (el) {
      if (el.textContent.indexOf('Selected units') === 0) {
        el.textContent = 'Selected units (' + _draft.unit_ids.length + ')';
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

    var record = {
      army_id:     armyId,
      army_name:   name,
      game_system: (window.WBC && window.WBC.armyData && window.WBC.armyData.game_system) || 'kow',
      units:       JSON.stringify(_draft.unit_ids),
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

        _draft = { army_id: null, army_name: '', unit_ids: [], pts_limit: 2000 };
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
