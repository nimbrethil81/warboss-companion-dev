/**
 * muster.js — Muster mode logic for Warboss Companion (v0.1 stub)
 *
 * Responsibilities at v0.1:
 *   - Display the loaded army from WBC.armyData (sourced from goblins.json)
 *   - Show unit list with key stats in a readable format
 *   - Placeholder UI for future army builder functionality
 *
 * Deferred to v0.2:
 *   - Add / remove units
 *   - Points validation
 *   - Save army configuration to Sheets
 *   - Load a saved army into Battle mode
 *   - Multiple army slots
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC — provides WBC.armyData, WBC.armyIndex)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via WBCSheets
 *   - No unit stat values are hardcoded here — all data comes from WBC.armyData at runtime
 *   - DOM manipulation is scoped to #page-muster and its children only
 */

var WBCMuster = (function () {
  'use strict';

  /* ─── Utility ────────────────────────────────────────────────────── */

  function _el(id) {
    return document.getElementById(id);
  }

  function _qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function _qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* Format a stat value for display — handles '-', numbers, and strings */
  function _statDisplay(val) {
    if (val === null || val === undefined || val === '-') return '—';
    return String(val);
  }

  /* ─── Render helpers ─────────────────────────────────────────────── */

  function _renderArmyView(armyData) {
    var page = _el('page-muster');
    if (!page) return;

    var armyName = armyData.army_name || 'Your Army';
    var units = Array.isArray(armyData.units) ? armyData.units : [];

    /* Group units by type for cleaner display */
    var groups = {};
    var groupOrder = [];
    units.forEach(function (u) {
      var key = u.type || 'Other';
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(u);
    });

    var unitRows = '';
    groupOrder.forEach(function (typeName) {
      unitRows += '<div class="section-label">' + typeName + '</div>';
      groups[typeName].forEach(function (u) {
        unitRows += _unitRow(u);
      });
    });

    /* Points total — only count units that have a pts value */
    var totalPts = units.reduce(function (sum, u) {
      return sum + (typeof u.pts === 'number' ? u.pts : 0);
    }, 0);

    page.innerHTML = [
      '<div class="page-header">',
      '  <div>',
      '    <div class="page-title">Muster</div>',
      '  </div>',
      '  <div class="page-subtitle">' + armyName + '</div>',
      '</div>',

      '<div class="muster-army-meta">',
      '  <span class="muster-unit-count">' + units.length + ' unit' + (units.length !== 1 ? 's' : '') + '</span>',
      '  <span class="muster-pts-total">' + (totalPts > 0 ? totalPts + ' pts' : '') + '</span>',
      '</div>',

      unitRows,

      '<div class="muster-stub-notice">',
      '  <p>Army editing coming in v0.2. Units above are your reference roster from the data file.</p>',
      '</div>',

      '<div id="muster-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    /* Bind stat row expand/collapse */
    _qsa('.unit-row-header', page).forEach(function (header) {
      header.addEventListener('click', function () {
        var card = this.parentElement;
        if (!card) return;
        var detail = _qs('.unit-row-detail', card);
        if (!detail) return;
        var open = card.getAttribute('data-open') === 'true';
        card.setAttribute('data-open', open ? 'false' : 'true');
        detail.style.display = open ? 'none' : 'block';
        var arrow = _qs('.unit-row-arrow', this);
        if (arrow) arrow.textContent = open ? '›' : '∨';
      });
    });
  }

  function _unitRow(u) {
    var label = u.name + (u.size ? ' (' + u.size + ')' : '');
    var rules = (u.special_rules || []).join(', ') || '—';

    return [
      '<div class="unit-row" data-open="false">',
      '  <div class="unit-row-header">',
      '    <span class="unit-row-name">' + label + '</span>',
      '    <span class="unit-row-pts">' + (typeof u.pts === 'number' ? u.pts + ' pts' : '') + '</span>',
      '    <span class="unit-row-arrow">›</span>',
      '  </div>',
      '  <div class="unit-row-detail" style="display:none;">',
      '    <div class="unit-stat-grid">',
      '      <span class="usg-cell"><span class="usg-label">Sp</span>'  + _statDisplay(u.sp)  + '</span>',
      '      <span class="usg-cell"><span class="usg-label">Me</span>'  + _statDisplay(u.me)  + '+</span>',
      '      <span class="usg-cell"><span class="usg-label">Sh</span>'  + _statDisplay(u.sh)  + (u.sh && u.sh !== '-' ? '+' : '') + '</span>',
      '      <span class="usg-cell"><span class="usg-label">De</span>'  + _statDisplay(u.de)  + '+</span>',
      '      <span class="usg-cell"><span class="usg-label">Att</span>' + _statDisplay(u.att) + '</span>',
      '      <span class="usg-cell"><span class="usg-label">Ne</span>'  + _statDisplay(u.ne)  + '</span>',
      '    </div>',
      '    <div class="unit-row-rules"><span class="usg-label">Special Rules: </span>' + rules + '</div>',
      '  </div>',
      '</div>',
    ].join('');
  }

  function _renderLoadingState() {
    var page = _el('page-muster');
    if (!page) return;
    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Muster</div>',
      '</div>',
      '<div class="muster-loading">Loading army data…</div>',
    ].join('');
  }

  function _renderEmptyState() {
    var page = _el('page-muster');
    if (!page) return;
    page.innerHTML = [
      '<div class="page-header">',
      '  <div>',
      '    <div class="page-title">Muster</div>',
      '  </div>',
      '  <div class="page-subtitle">Your armies</div>',
      '</div>',
      '<div class="muster-stub-notice">',
      '  <p>No army data loaded. Check your connection and reload, or ensure your army JSON file is in place.</p>',
      '</div>',
      '<div id="muster-error" class="battle-error" style="display:none;"></div>',
    ].join('');
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  /**
   * init() — called by app.js on boot.
   * Nothing to do at v0.1 — data is loaded by app.js.
   */
  function init() {
    /* No-op at v0.1 */
  }

  /**
   * onTabActivated() — called by app.js / skins.js when the Muster tab becomes active.
   */
  function onTabActivated() {
    var armyData = (window.WBC && window.WBC.armyData) ? window.WBC.armyData : null;

    if (!armyData) {
      /* Army data not yet loaded — show loading state and poll */
      _renderLoadingState();
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        var data = (window.WBC && window.WBC.armyData) ? window.WBC.armyData : null;
        if (data) {
          clearInterval(poll);
          _renderArmyView(data);
        } else if (attempts > 20) {
          clearInterval(poll);
          _renderEmptyState();
        }
      }, 250);
      return;
    }

    _renderArmyView(armyData);
  }

  return {
    init:           init,
    onTabActivated: onTabActivated
  };

}());
