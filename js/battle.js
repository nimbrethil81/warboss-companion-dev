/**
 * battle.js — Battle mode logic for Warboss Companion
 *
 * Responsibilities:
 *   - Render the battle setup screen (army select, opponent name, start)
 *   - Drive the in-game turn/phase loop
 *   - Display phase prompts sourced from kow.json (never hardcoded here)
 *   - Manage per-unit "Routed" toggle in the roster
 *   - Accept quick notes per turn
 *   - Handle game end: write summary to Sheets via sheets.js, then hand off to chronicle.js
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC — provides WBC.systemConfig, WBC.armyData, WBC.switchTab)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via WBCSheets
 *   - All game-specific values (phase names, max turns, prompts) come from WBC.systemConfig at runtime
 *   - DOM manipulation is scoped to #page-battle and its children only
 */

var WBCBattle = (function () {
  'use strict';

  /* ─── Constants ──────────────────────────────────────────────────── */

  var STORAGE_KEY = 'wbc_active_game';

  /* Phase order. Used to advance the phase cycle.
     Sourced from systemConfig at runtime — this array just names the order
     and must match the phase_id values in kow.json. */
  var PHASE_ORDER = ['movement', 'ranged', 'combat', 'opponent_turn'];

  /* ─── Module state ───────────────────────────────────────────────── */

  var _game = null;          // Active game object (mirrors wbc_active_game)
  var _config = null;        // Cached reference to WBC.systemConfig
  var _rendered = false;     // True once the in-game UI has been built

  /* ─── Utility ────────────────────────────────────────────────────── */

  function _uuid() {
    // RFC4122 v4 UUID, ES5-compatible
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function _isoNow() {
    return new Date().toISOString();
  }

  function _el(id) {
    return document.getElementById(id);
  }

  function _qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function _qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* Find a phase object in systemConfig by phase_id */
  function _findPhase(phaseId) {
    var phases = (_config && _config.phases) || [];
    for (var i = 0; i < phases.length; i++) {
      if (phases[i].phase_id === phaseId) return phases[i];
    }
    return null;
  }

  /* ─── Persistence ────────────────────────────────────────────────── */

  function _saveGame() {
    try {
      WBCStorage.set(STORAGE_KEY, _game);
    } catch (e) {
      console.error('[battle] Failed to persist game state:', e);
    }
  }

  function _loadGame() {
    try {
      _game = WBCStorage.get(STORAGE_KEY);
    } catch (e) {
      _game = null;
    }
  }

  function _clearGame() {
    try {
      WBCStorage.remove(STORAGE_KEY);
    } catch (e) {
      console.error('[battle] Failed to clear game state:', e);
    }
    _game = null;
    _rendered = false;
  }

  /* ─── Setup screen ───────────────────────────────────────────────── */

  function _renderSetup() {
    var page = _el('page-battle');
    if (!page) return;

    /* Army options — sourced from WBC.armyData if available, else generic prompt */
    var armyOptions = '';
    var armyData = (window.WBC && window.WBC.armyData) ? window.WBC.armyData : null;
    if (armyData && armyData.army_name) {
      armyOptions = '<option value="' + armyData.army_id + '">' + armyData.army_name + '</option>';
    } else {
      armyOptions = '<option value="">Loading army…</option>';
    }

    page.innerHTML = [
      '<div class="page-header">',
      '  <div>',
      '    <div class="page-title">Battle</div>',
      '  </div>',
      '  <div class="page-subtitle">To the field</div>',
      '</div>',

      '<div class="section-label">New Battle</div>',

      '<div class="battle-setup-form">',

      '  <div class="setup-field">',
      '    <label class="setup-label" for="battle-army-select">Your Army</label>',
      '    <select id="battle-army-select" class="setup-input">',
      armyOptions,
      '    </select>',
      '  </div>',

      '  <div class="setup-field">',
      '    <label class="setup-label" for="battle-opponent-input">Opponent\'s Army (optional)</label>',
      '    <input id="battle-opponent-input" class="setup-input" type="text" ',
      '           placeholder="e.g. Undead, Northern Alliance…" maxlength="80" />',
      '  </div>',

      '</div>',

      '<button id="battle-start-btn" class="battle-primary-btn">',
      '  Begin Battle',
      '</button>',

      '<div class="section-label" style="margin-top:32px;">Resume</div>',

      '<div id="battle-resume-area">',
      /* Populated by _renderResumeCard() if a saved game exists */
      '</div>',

      '<div id="battle-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    _bindSetupEvents();
    _renderResumeCard();
  }

  function _renderResumeCard() {
    var area = _el('battle-resume-area');
    if (!area) return;

    _loadGame();

    if (!_game) {
      area.innerHTML = '<p class="setup-hint">No battle in progress.</p>';
      return;
    }

    var phase = _findPhase(_game.current_phase);
    var phaseName = phase ? phase.phase_name : _game.current_phase;
    var turnLabel = 'Turn ' + _game.current_turn;
    var opponentLabel = _game.opponent_army ? ' vs. ' + _game.opponent_army : '';

    area.innerHTML = [
      '<div class="battle-resume-card" id="battle-resume-card">',
      '  <div class="resume-meta">' + turnLabel + ' · ' + phaseName + opponentLabel + '</div>',
      '  <div class="resume-actions">',
      '    <button id="battle-continue-btn" class="battle-secondary-btn">Continue</button>',
      '    <button id="battle-abandon-btn" class="battle-abandon-btn">Abandon</button>',
      '  </div>',
      '</div>',
    ].join('');

    var continueBtn = _el('battle-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        _renderGame();
      });
    }

    var abandonBtn = _el('battle-abandon-btn');
    if (abandonBtn) {
      abandonBtn.addEventListener('click', function () {
        if (window.confirm('Abandon this battle? All unsaved progress will be lost.')) {
          _clearGame();
          _renderSetup();
        }
      });
    }
  }

  function _bindSetupEvents() {
    var startBtn = _el('battle-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        _startNewGame();
      });
    }
  }

  /* ─── Game lifecycle ─────────────────────────────────────────────── */

  function _startNewGame() {
    var armySelect = _el('battle-army-select');
    var opponentInput = _el('battle-opponent-input');
    var errorDiv = _el('battle-error');

    var armyId = armySelect ? armySelect.value : '';
    var opponent = opponentInput ? opponentInput.value.trim() : '';

    if (!armyId) {
      _showError('Please select an army before starting.');
      return;
    }

    /* Build the unit roster from the loaded army data */
    var units = [];
    var armyData = (window.WBC && window.WBC.armyData) ? window.WBC.armyData : null;
    if (armyData && Array.isArray(armyData.units)) {
      units = armyData.units.map(function (u) {
        return {
          unit_id:   u.unit_id,
          name:      u.name,
          size:      u.size,
          type:      u.type,
          sp:        u.sp,
          me:        u.me,
          sh:        u.sh,
          de:        u.de,
          att:       u.att,
          ne:        u.ne,
          special_rules: u.special_rules || [],
          routed:    false,
          damage:    0
        };
      });
    }

    _game = {
      game_id:        _uuid(),
      started_at:     _isoNow(),
      army_id:        armyId,
      opponent_army:  opponent,
      current_turn:   1,
      current_phase:  PHASE_ORDER[0],
      active_player:  'you',
      units:          units,
      turn_log:       []
    };

    _saveGame();
    _renderGame();
  }

  /* ─── In-game UI ─────────────────────────────────────────────────── */

  function _renderGame() {
    _config = (window.WBC && window.WBC.systemConfig) ? window.WBC.systemConfig : null;

    var page = _el('page-battle');
    if (!page) return;
    if (!_game) { _renderSetup(); return; }

    var maxTurns = (_config && _config.max_turns) ? _config.max_turns : 7;

    page.innerHTML = [
      '<div class="battle-header">',
      '  <div class="battle-turn-block">',
      '    <span class="battle-turn-label">Turn</span>',
      '    <span class="battle-turn-number" id="battle-turn-number">' + _game.current_turn + '</span>',
      '    <span class="battle-turn-max">/ ' + maxTurns + '</span>',
      '  </div>',
      '  <div class="battle-phase-block" id="battle-phase-block">',
      /* filled by _renderPhaseDisplay */
      '  </div>',
      '  <button class="battle-end-btn" id="battle-end-game-btn" title="End game">End</button>',
      '</div>',

      '<div id="battle-prompts" class="battle-prompts">',
      /* filled by _renderPrompts */
      '</div>',

      '<div class="section-label" id="battle-roster-label">Your Roster</div>',
      '<div id="battle-roster" class="battle-roster">',
      /* filled by _renderRoster */
      '</div>',

      '<div class="section-label">Turn Notes</div>',
      '<div class="battle-notes-block">',
      '  <textarea id="battle-notes" class="battle-notes" rows="3" ',
      '            placeholder="Quick notes for this turn…" maxlength="500"></textarea>',
      '  <button id="battle-save-note-btn" class="battle-secondary-btn" style="margin-top:8px;">Save Note</button>',
      '</div>',

      '<div class="battle-phase-nav">',
      '  <button id="battle-prev-phase-btn" class="battle-nav-btn">← Prev Phase</button>',
      '  <button id="battle-next-phase-btn" class="battle-nav-btn battle-nav-btn--primary">Next Phase →</button>',
      '</div>',

      '<div id="battle-game-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    _rendered = true;
    _renderPhaseDisplay();
    _renderPrompts();
    _renderRoster();
    _restoreNoteField();
    _bindGameEvents();
  }

  function _renderPhaseDisplay() {
    var block = _el('battle-phase-block');
    if (!block || !_game) return;

    var phase = _findPhase(_game.current_phase);
    var phaseName = phase ? phase.phase_name : _game.current_phase;
    var isOpponent = _game.current_phase === 'opponent_turn';

    block.innerHTML = [
      '<span class="battle-player-tag ' + (isOpponent ? 'battle-player-tag--opp' : '') + '">',
      isOpponent ? 'Opponent' : 'Your',
      '</span>',
      '<span class="battle-phase-name">' + phaseName + '</span>',
    ].join('');
  }

  function _renderPrompts() {
    var container = _el('battle-prompts');
    if (!container || !_game) return;

    var phase = _findPhase(_game.current_phase);
    if (!phase || !Array.isArray(phase.prompts) || phase.prompts.length === 0) {
      container.innerHTML = '';
      return;
    }

    /* High-priority prompts first */
    var sorted = phase.prompts.slice().sort(function (a, b) {
      var order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] || 1) - (order[b.priority] || 1);
    });

    var html = sorted.map(function (p, idx) {
      return [
        '<div class="battle-prompt battle-prompt--' + (p.priority || 'medium') + '" ',
        '     id="prompt-' + idx + '" data-expanded="false">',
        '  <div class="prompt-header" data-prompt-idx="' + idx + '">',
        '    <span class="prompt-icon">' + (p.priority === 'high' ? '⚠' : '›') + '</span>',
        '    <span class="prompt-text">' + p.text + '</span>',
        '    <span class="prompt-toggle">+</span>',
        '  </div>',
        '  <div class="prompt-detail" id="prompt-detail-' + idx + '" style="display:none;">',
        p.detail ? '<p>' + p.detail + '</p>' : '',
        '  </div>',
        '</div>',
      ].join('');
    }).join('');

    container.innerHTML = html;

    /* Bind expand/collapse */
    _qsa('.prompt-header', container).forEach(function (header) {
      header.addEventListener('click', function () {
        var idx = this.getAttribute('data-prompt-idx');
        var card = _el('prompt-' + idx);
        var detail = _el('prompt-detail-' + idx);
        var toggle = _qs('.prompt-toggle', card);
        if (!card || !detail) return;

        var isExpanded = card.getAttribute('data-expanded') === 'true';
        card.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
        detail.style.display = isExpanded ? 'none' : 'block';
        if (toggle) toggle.textContent = isExpanded ? '+' : '−';
      });
    });
  }

  function _renderRoster() {
    var container = _el('battle-roster');
    if (!container || !_game) return;

    var active = [];
    var routed = [];
    (_game.units || []).forEach(function (u) {
      (u.routed ? routed : active).push(u);
    });

    var html = '';

    if (active.length === 0 && routed.length === 0) {
      html = '<p class="setup-hint">No units in roster. Set up your army in Muster first.</p>';
      container.innerHTML = html;
      return;
    }

    active.forEach(function (u) {
      html += _unitCard(u, false);
    });

    if (routed.length > 0) {
      html += '<div class="section-label" style="margin-top:20px;opacity:0.5;">Routed</div>';
      routed.forEach(function (u) {
        html += _unitCard(u, true);
      });
    }

    container.innerHTML = html;

    /* Bind Routed toggle buttons */
    _qsa('.unit-routed-btn', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var unitId = this.getAttribute('data-unit-id');
        _toggleRouted(unitId);
      });
    });
  }

  function _unitCard(u, isRouted) {
    var label = u.name + (u.size ? ' (' + u.size + ')' : '');
    var neStr = u.ne !== undefined ? String(u.ne) : '—';

    return [
      '<div class="unit-card ' + (isRouted ? 'unit-card--routed' : '') + '" data-unit-id="' + u.unit_id + '">',
      '  <div class="unit-card-main">',
      '    <div class="unit-card-name">' + label + '</div>',
      '    <div class="unit-card-type">' + (u.type || '') + '</div>',
      '  </div>',
      '  <div class="unit-card-stats">',
      '    <span class="unit-stat"><span class="unit-stat-label">Ne</span>' + neStr + '</span>',
      '    <span class="unit-stat"><span class="unit-stat-label">De</span>' + (u.de !== undefined ? u.de : '—') + '</span>',
      '    <span class="unit-stat"><span class="unit-stat-label">Att</span>' + (u.att !== undefined ? u.att : '—') + '</span>',
      '  </div>',
      '  <button class="unit-routed-btn" data-unit-id="' + u.unit_id + '">',
      isRouted ? 'Restore' : 'Routed',
      '  </button>',
      '</div>',
    ].join('');
  }

  function _toggleRouted(unitId) {
    if (!_game || !Array.isArray(_game.units)) return;
    _game.units = _game.units.map(function (u) {
      if (u.unit_id === unitId) {
        return Object.assign({}, u, { routed: !u.routed });
      }
      return u;
    });
    _saveGame();
    _renderRoster();
  }

  /* ─── Phase / Turn navigation ────────────────────────────────────── */

  function _currentPhaseIndex() {
    return PHASE_ORDER.indexOf(_game.current_phase);
  }

  function _advancePhase() {
    if (!_game) return;
    var idx = _currentPhaseIndex();
    var config = (window.WBC && window.WBC.systemConfig) ? window.WBC.systemConfig : null;
    var maxTurns = (config && config.max_turns) ? config.max_turns : 7;

    if (idx < PHASE_ORDER.length - 1) {
      /* Move to the next phase within this turn */
      _game.current_phase = PHASE_ORDER[idx + 1];
    } else {
      /* End of opponent turn — advance the turn */
      if (_game.current_turn >= maxTurns) {
        /* Game end */
        _promptGameEnd();
        return;
      }
      _game.current_turn += 1;
      _game.current_phase = PHASE_ORDER[0];
    }

    _saveGame();
    _refreshGameUI();
  }

  function _retreatPhase() {
    if (!_game) return;
    var idx = _currentPhaseIndex();

    if (idx > 0) {
      _game.current_phase = PHASE_ORDER[idx - 1];
    } else if (_game.current_turn > 1) {
      _game.current_turn -= 1;
      _game.current_phase = PHASE_ORDER[PHASE_ORDER.length - 1];
    }
    /* If turn 1 phase 0 — do nothing */

    _saveGame();
    _refreshGameUI();
  }

  function _refreshGameUI() {
    /* Update turn counter without full re-render */
    var turnEl = _el('battle-turn-number');
    if (turnEl && _game) turnEl.textContent = _game.current_turn;

    _renderPhaseDisplay();
    _renderPrompts();
    _renderRoster();   /* routed state doesn't change, but re-render is cheap */
    _restoreNoteField();
  }

  /* ─── Notes ──────────────────────────────────────────────────────── */

  function _currentNoteKey() {
    if (!_game) return null;
    return 'turn' + _game.current_turn + '_' + _game.current_phase;
  }

  function _saveNoteFromField() {
    if (!_game) return;
    var field = _el('battle-notes');
    if (!field) return;
    var note = field.value.trim();
    var key = _currentNoteKey();
    if (!key) return;

    /* Upsert into turn_log */
    var found = false;
    _game.turn_log = (_game.turn_log || []).map(function (entry) {
      if (entry.key === key) {
        found = true;
        return Object.assign({}, entry, { note: note, updated_at: _isoNow() });
      }
      return entry;
    });
    if (!found && note) {
      _game.turn_log.push({
        key:         key,
        turn_number: _game.current_turn,
        phase:       _game.current_phase,
        note:        note,
        updated_at:  _isoNow()
      });
    }

    _saveGame();

    /* Brief visual confirmation */
    var btn = _el('battle-save-note-btn');
    if (btn) {
      btn.textContent = 'Saved ✓';
      setTimeout(function () { btn.textContent = 'Save Note'; }, 1500);
    }
  }

  function _restoreNoteField() {
    var field = _el('battle-notes');
    if (!field || !_game) return;
    var key = _currentNoteKey();
    var entry = (_game.turn_log || []).filter(function (e) { return e.key === key; })[0];
    field.value = entry ? entry.note : '';
  }

  /* ─── Game end ───────────────────────────────────────────────────── */

  function _promptGameEnd() {
    var page = _el('page-battle');
    if (!page) return;

    var routedCount = (_game.units || []).filter(function (u) { return u.routed; }).length;
    var totalCount  = (_game.units || []).length;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Battle Complete</div>',
      '</div>',

      '<div class="battle-end-summary">',
      '  <p class="battle-end-label">Turn ' + _game.current_turn + ' of ' + ((window.WBC && window.WBC.systemConfig && window.WBC.systemConfig.max_turns) || 7) + '</p>',
      '  <p class="battle-end-label">' + routedCount + ' of ' + totalCount + ' units routed</p>',
      '</div>',

      '<div class="section-label">Result</div>',
      '<div class="battle-result-row">',
      '  <button class="battle-result-btn battle-result-btn--win"  data-result="win">Victory</button>',
      '  <button class="battle-result-btn battle-result-btn--draw" data-result="draw">Draw</button>',
      '  <button class="battle-result-btn battle-result-btn--loss" data-result="loss">Defeat</button>',
      '</div>',

      '<div id="battle-saving-status" class="battle-saving-status" style="display:none;">',
      '  Saving battle record…',
      '</div>',
      '<div id="battle-save-error" class="battle-error" style="display:none;"></div>',
      '<button id="battle-retry-save-btn" class="battle-secondary-btn" style="display:none;">Retry Save</button>',
    ].join('');

    _qsa('.battle-result-btn', page).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var result = this.getAttribute('data-result');
        _completeGame(result);
      });
    });
  }

  function _completeGame(result) {
    if (!_game) return;
    _game.result = result;
    _game.finished_at = _isoNow();
    _saveGame();

    /* Build the payload for Sheets */
    var gamePayload = {
      game_id:        _game.game_id,
      date:           _isoNow(),
      army_id:        _game.army_id,
      opponent_army:  _game.opponent_army,
      result:         result,
      turns_played:   _game.current_turn,
      notes:          (_game.turn_log || []).map(function (e) { return '[T' + e.turn_number + ' ' + e.phase + '] ' + e.note; }).join(' | ')
    };

    var statusEl = _el('battle-saving-status');
    var errEl    = _el('battle-save-error');
    var retryBtn = _el('battle-retry-save-btn');

    if (statusEl) statusEl.style.display = 'block';

    WBCSheets.saveGame(gamePayload).then(function (ok) {
      if (statusEl) statusEl.style.display = 'none';

      if (ok) {
        /* Success — hand off to Chronicle logging screen */
        _clearGame();
        if (window.WBCChronicle && typeof window.WBCChronicle.startLog === 'function') {
          window.WBCChronicle.startLog(gamePayload);
        }
        if (window.WBC && typeof window.WBC.switchTab === 'function') {
          window.WBC.switchTab('chronicle');
        }
      } else {
        /* Failed write — preserve local state, surface retry */
        if (errEl) {
          errEl.textContent = 'Could not save to your record sheet. Your battle data is safe locally — tap Retry to try again.';
          errEl.style.display = 'block';
        }
        if (retryBtn) {
          retryBtn.style.display = 'block';
          retryBtn.addEventListener('click', function () {
            if (errEl) errEl.style.display = 'none';
            retryBtn.style.display = 'none';
            _completeGame(result);
          });
        }
      }
    }).catch(function (e) {
      console.error('[battle] Sheets save error:', e);
      if (statusEl) statusEl.style.display = 'none';
      if (errEl) {
        errEl.textContent = 'Unexpected error saving battle. Your local data is preserved — tap Retry.';
        errEl.style.display = 'block';
      }
      if (retryBtn) {
        retryBtn.style.display = 'block';
        retryBtn.addEventListener('click', function () {
          if (errEl) errEl.style.display = 'none';
          retryBtn.style.display = 'none';
          _completeGame(result);
        });
      }
    });
  }

  /* ─── Event binding ──────────────────────────────────────────────── */

  function _bindGameEvents() {
    var nextBtn = _el('battle-next-phase-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        _saveNoteFromField();
        _advancePhase();
      });
    }

    var prevBtn = _el('battle-prev-phase-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        _retreatPhase();
      });
    }

    var saveNoteBtn = _el('battle-save-note-btn');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', function () {
        _saveNoteFromField();
      });
    }

    var endBtn = _el('battle-end-game-btn');
    if (endBtn) {
      endBtn.addEventListener('click', function () {
        if (window.confirm('End the battle now and record the result?')) {
          _saveNoteFromField();
          _promptGameEnd();
        }
      });
    }
  }

  /* ─── Error display ──────────────────────────────────────────────── */

  function _showError(msg) {
    var errEl = _el('battle-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  /**
   * init() — called by app.js when the app boots.
   * Decides whether to show the setup screen or resume an in-progress game.
   */
  function init() {
    _config = (window.WBC && window.WBC.systemConfig) ? window.WBC.systemConfig : null;
    _loadGame();
    /* Render is deferred until the user navigates to Battle tab */
  }

  /**
   * onTabActivated() — called by app.js / skins.js whenever the Battle tab becomes active.
   * Renders the appropriate screen based on game state.
   */
  function onTabActivated() {
    _config = (window.WBC && window.WBC.systemConfig) ? window.WBC.systemConfig : null;
    _loadGame();

    if (_game && !_game.result) {
      /* Active game in progress — go straight to the game UI */
      _renderGame();
    } else {
      /* No active game — show setup */
      _renderSetup();
    }
  }

  return {
    init:            init,
    onTabActivated:  onTabActivated
  };

}());
