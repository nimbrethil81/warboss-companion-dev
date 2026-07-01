/**
 * battle.js — Battle mode logic for Warboss Companion (v0.2)
 *
 * Responsibilities:
 *   - Render the battle setup screen (army picker from Muster saves,
 *     opponent name, "who goes first?" selection, start)
 *   - Drive the in-game turn/phase loop
 *   - Display phase prompts sourced from kow.json (never hardcoded here)
 *   - Render contextual unit stat cards per phase
 *   - Manage per-unit "Routed" toggle in the roster
 *   - Accept quick notes per turn
 *   - Handle game end: write summary to Sheets via sheets.js,
 *     then hand off to chronicle.js
 *
 * Army loading (v0.2):
 *   Battle now requires a saved Muster army. On setup, armies are fetched
 *   from Sheets (with cache fallback). The chosen army's unit_ids are
 *   resolved against WBC.armyData (goblins.json) to build the in-game roster.
 *   The selected army is held in WBCStorage.KEYS.SELECTED_ARMY for the
 *   duration of setup; it is cleared once the game object is built.
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC — provides WBC.systemConfig, WBC.armyData,
 *                  WBC.switchTab)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes
 *     go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via
 *     WBCSheets
 *   - All game-specific values (phase names, max turns, prompts) come
 *     from WBC.systemConfig at runtime
 *   - DOM manipulation is scoped to #page-battle and its children only
 */

var WBCBattle = (function () {
  'use strict';

  /* ─── Constants ──────────────────────────────────────────────────── */

  var STORAGE_KEY = 'wbc_active_game';

  /* Your phases within your half of a turn, in order.
     Must match phase_id values in kow.json. */
  var YOUR_PHASES = ['movement', 'ranged', 'combat'];

  /* The opponent's phase id — a single phase representing their full turn. */
  var OPP_PHASE = 'opponent_turn';

  /* Full sequence for reference (used by _findPhase lookups only). */
  var PHASE_ORDER = YOUR_PHASES.concat([OPP_PHASE]);

  /*
   * Round sequence — the four phases in the order they actually occur
   * for THIS game, based on who went first. A "round" is one full
   * cycle of both players; the turn counter should only increment
   * once per round, at the wrap point, wherever that falls.
   *
   *   You first     : movement → ranged → combat → opponent_turn → (wrap)
   *   Opponent first : opponent_turn → movement → ranged → combat → (wrap)
   */
  function _roundSequence() {
    if (_game && _game.first_player === 'opponent') {
      return [OPP_PHASE].concat(YOUR_PHASES);
    }
    return YOUR_PHASES.concat([OPP_PHASE]);
  }

  function _roundIndex() {
    return _roundSequence().indexOf(_game.current_phase);
  }

  /* Which stats to show on unit cards per phase.
     Values are keys on the unit object from goblins.json.
     'special_rules' is always rendered separately below the stat row. */
  var PHASE_STATS = {
    'movement':      [{ key: 'sp',  label: 'Sp'  }],
    'ranged':        [{ key: 'att', label: 'Att' },
                      { key: 'sh',  label: 'Sh'  }],
    'combat':        [{ key: 'att', label: 'Att' },
                      { key: 'me',  label: 'Me'  }],
    'opponent_turn': [{ key: 'de',  label: 'De'  },
                      { key: 'ne',  label: 'Ne'  }]
  };

  /* ─── Module state ───────────────────────────────────────────────── */

  var _game     = null;   // Active game object (mirrors wbc_active_game)
  var _config   = null;   // Cached reference to WBC.systemConfig
  var _rendered = false;  // True once the in-game UI has been built
  var _armies   = [];     // Armies fetched for the setup screen

  /* ─── Utility ────────────────────────────────────────────────────── */

  function _uuid() {
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
    return Array.prototype.slice.call(
      (root || document).querySelectorAll(selector)
    );
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  /* Find a phase object in systemConfig by phase_id */
  function _findPhase(phaseId) {
    var phases = (_config && _config.phases) || [];
    for (var i = 0; i < phases.length; i++) {
      if (phases[i].phase_id === phaseId) return phases[i];
    }
    return null;
  }

  /* Format a stat value for display.
     Me, Sh, De are stored as plain numbers in the JSON but displayed
     with a trailing '+' (e.g. 4 → "4+"). Ne is stored as "14/16".
     Att and Sp are plain numbers. */
  function _fmtStat(key, val) {
    if (val === null || val === undefined || val === '-') return '—';
    var s = String(val);
    if (key === 'me' || key === 'sh' || key === 'de') {
      return (s.indexOf('+') === -1 && s !== '—') ? s + '+' : s;
    }
    return s;
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
    _game     = null;
    _rendered = false;
  }

  /* ─── Setup screen ───────────────────────────────────────────────── */

  /**
   * Render the setup shell immediately, then asynchronously load armies
   * into the picker. This keeps the UI responsive — the player sees
   * the form immediately while the fetch happens in the background.
   */
  function _renderSetup() {
    var page = _el('page-battle');
    if (!page) return;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div><div class="page-title">Battle</div></div>',
      '  <div class="page-subtitle">To the field</div>',
      '</div>',

      '<div class="battle-setup-form">',

      /* Army picker — populated by _populateArmyPicker() */
      '  <div class="setup-field">',
      '    <label class="setup-label" for="battle-army-select">Your Army</label>',
      '    <select id="battle-army-select" class="setup-input">',
      '      <option value="">Loading armies…</option>',
      '    </select>',
      '    <div id="battle-army-hint" class="setup-hint-inline" style="display:none;">',
      '      No saved armies. <button id="battle-go-muster" class="setup-link-btn">',
      '      Go to Muster</button> to build one first.',
      '    </div>',
      '  </div>',

      /* Opponent field */
      '  <div class="setup-field">',
      '    <label class="setup-label" for="battle-opponent-input">',
      '      Opponent\'s Army <span class="setup-optional">(optional)</span>',
      '    </label>',
      '    <input id="battle-opponent-input" class="setup-input" type="text"',
      '           placeholder="e.g. Undead, Northern Alliance…" maxlength="80" />',
      '  </div>',

      /* Who goes first */
      '  <div class="setup-field">',
      '    <div class="setup-label">Who goes first?</div>',
      '    <div class="setup-toggle" id="setup-first-player">',
      '      <button class="setup-toggle-btn setup-toggle-btn--active"',
      '              data-value="you" id="first-you">You</button>',
      '      <button class="setup-toggle-btn"',
      '              data-value="opponent" id="first-opponent">Opponent</button>',
      '    </div>',
      '  </div>',

      '</div>',

      '<button id="battle-start-btn" class="battle-primary-btn">',
      '  Begin Battle',
      '</button>',

      '<div class="section-label" style="margin-top:32px;">Resume</div>',
      '<div id="battle-resume-area"></div>',
      '<div id="battle-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    _bindSetupEvents();
    _renderResumeCard();
    _loadArmiesForSetup();
  }

  /**
   * Fetch armies from Sheets (with cache fallback) and populate the
   * army <select> element. Shows a "Go to Muster" prompt if none exist.
   */
  function _loadArmiesForSetup() {
    WBCSheets.fetchArmies().then(function (result) {
      _armies = result.data || [];
      _populateArmyPicker(result.fromCache);
      if (result.error && _armies.length === 0) {
        _showError(result.error);
      }
    }).catch(function (err) {
      console.error('[battle] fetchArmies error:', err);
      _armies = WBCStorage.loadArmiesCache() || [];
      _populateArmyPicker(true);
      if (_armies.length === 0) {
        _showError('Could not load armies. Check your connection and try again.');
      }
    });
  }

  function _populateArmyPicker(fromCache) {
    var select  = _el('battle-army-select');
    var hintEl  = _el('battle-army-hint');
    if (!select) return;

    if (_armies.length === 0) {
      select.style.display = 'none';
      if (hintEl) hintEl.style.display = 'block';
      return;
    }

    var options = _armies.map(function (a) {
      var unitIds;
      try {
        unitIds = typeof a.units === 'string' ? JSON.parse(a.units) : (a.units || []);
      } catch (e) { unitIds = []; }

      var pts = unitIds.reduce(function (sum, uid) {
        var u = _findUnitInArmyData(uid);
        return sum + (u && typeof u.pts === 'number' ? u.pts : 0);
      }, 0);

      var label = _escapeHtml(a.army_name || 'Unnamed')
        + ' (' + unitIds.length + ' units, ' + pts + ' pts)';

      return '<option value="' + _escapeHtml(a.army_id) + '">' + label + '</option>';
    });

    select.innerHTML = '<option value="">— choose an army —</option>' + options.join('');
    select.style.display = '';
    if (hintEl) hintEl.style.display = 'none';

    if (fromCache) {
      _showError('Showing cached armies — changes made in Muster may not appear here.');
    }
  }

  /**
   * Look up a unit in WBC.armyData by unit_id.
   * Returns null if not found (handles retired/unknown units gracefully).
   */
  function _findUnitInArmyData(unitId) {
    var armyData = window.WBC && window.WBC.armyData;
    if (!armyData || !Array.isArray(armyData.units)) return null;
    for (var i = 0; i < armyData.units.length; i++) {
      if (armyData.units[i].unit_id === unitId) return armyData.units[i];
    }
    return null;
  }

  function _renderResumeCard() {
    var area = _el('battle-resume-area');
    if (!area) return;

    _loadGame();

    if (!_game) {
      area.innerHTML = '<p class="setup-hint">No battle in progress.</p>';
      return;
    }

    var phase     = _findPhase(_game.current_phase);
    var phaseName = phase ? phase.phase_name : _game.current_phase;
    var turnLabel = 'Turn ' + _game.current_turn;
    var oppLabel  = _game.opponent_army ? ' vs. ' + _escapeHtml(_game.opponent_army) : '';

    area.innerHTML = [
      '<div class="battle-resume-card">',
      '  <div class="resume-meta">' + turnLabel + ' · ' + _escapeHtml(phaseName) + oppLabel + '</div>',
      '  <div class="resume-actions">',
      '    <button id="battle-continue-btn" class="battle-secondary-btn">Continue</button>',
      '    <button id="battle-abandon-btn"  class="battle-abandon-btn">Abandon</button>',
      '  </div>',
      '</div>',
    ].join('');

    var cont = _el('battle-continue-btn');
    if (cont) cont.addEventListener('click', _renderGame);

    var aband = _el('battle-abandon-btn');
    if (aband) {
      aband.addEventListener('click', function () {
        if (window.confirm('Abandon this battle? All unsaved progress will be lost.')) {
          _clearGame();
          _renderSetup();
        }
      });
    }
  }

  function _bindSetupEvents() {
    /* Who goes first toggle */
    var toggleWrap = _el('setup-first-player');
    if (toggleWrap) {
      _qsa('.setup-toggle-btn', toggleWrap).forEach(function (btn) {
        btn.addEventListener('click', function () {
          _qsa('.setup-toggle-btn', toggleWrap).forEach(function (b) {
            b.classList.remove('setup-toggle-btn--active');
          });
          this.classList.add('setup-toggle-btn--active');
        });
      });
    }

    /* Start button */
    var startBtn = _el('battle-start-btn');
    if (startBtn) startBtn.addEventListener('click', _startNewGame);

    /* Go to Muster link (shown when no armies exist) */
    var musterBtn = _el('battle-go-muster');
    if (musterBtn) {
      musterBtn.addEventListener('click', function () {
        if (window.WBC && typeof window.WBC.switchTab === 'function') {
          window.WBC.switchTab('muster');
        }
      });
    }
  }

  /* ─── Game lifecycle ─────────────────────────────────────────────── */

  function _startNewGame() {
    var armySelect     = _el('battle-army-select');
    var opponentInput  = _el('battle-opponent-input');
    var firstPlayerBtn = _qs('.setup-toggle-btn--active', _el('setup-first-player'));

    var armyId      = armySelect    ? armySelect.value.trim()    : '';
    var opponent    = opponentInput ? opponentInput.value.trim() : '';
    var firstPlayer = firstPlayerBtn
      ? firstPlayerBtn.getAttribute('data-value')
      : 'you';

    if (!armyId) {
      _showError('Please select an army before starting. Build one in Muster first.');
      return;
    }

    /* Find the chosen army record */
    var armyRecord = null;
    for (var i = 0; i < _armies.length; i++) {
      if (_armies[i].army_id === armyId) { armyRecord = _armies[i]; break; }
    }

    if (!armyRecord) {
      _showError('Could not find the selected army. Please try again.');
      return;
    }

    /* Resolve unit_ids → full unit objects from WBC.armyData (goblins.json).
       unit_id identifies the UNIT TYPE (e.g. "goblin_rabble") and stays
       untouched — Muster/Sheets still key off it. Duplicate entries in
       the army (e.g. 6x Goblin Rabble) share that unit_id, so each gets
       its own inst_id here to track routed/damage state per instance. */
    var unitIds;
    try {
      unitIds = typeof armyRecord.units === 'string'
        ? JSON.parse(armyRecord.units)
        : (armyRecord.units || []);
    } catch (e) { unitIds = []; }

    var units = [];
    var missing = [];
    unitIds.forEach(function (uid) {
      var u = _findUnitInArmyData(uid);
      if (u) {
        units.push({
          inst_id:       _uuid(),   /* unique per unit instance */
          unit_id:       u.unit_id,
          name:          u.name,
          size:          u.size,
          type:          u.type,
          sp:            u.sp,
          me:            u.me,
          sh:            u.sh,
          de:            u.de,
          att:           u.att,
          ne:            u.ne,
          special_rules: u.special_rules || [],
          routed:        false,
          damage:        0
        });
      } else {
        missing.push(uid);
        console.warn('[battle] unit_id not found in armyData:', uid);
      }
    });

    if (missing.length > 0) {
      /* Non-fatal: warn but continue with the units that did resolve */
      console.warn('[battle] ' + missing.length + ' unit(s) could not be resolved. '
        + 'They may have been retired from goblins.json.');
    }

    if (units.length === 0) {
      _showError('This army has no units that could be loaded. '
        + 'Please edit it in Muster and add units.');
      return;
    }

    /* If opponent goes first, Turn 1 starts at opponent_turn phase */
    var startPhase = (firstPlayer === 'opponent')
      ? OPP_PHASE
      : YOUR_PHASES[0];

    _game = {
      game_id:       _uuid(),
      started_at:    _isoNow(),
      army_id:       armyId,
      army_name:     armyRecord.army_name || '',
      opponent_army: opponent,
      first_player:  firstPlayer,
      current_turn:  1,
      current_phase: startPhase,
      units:         units,
      turn_log:      []
    };

    _saveGame();
    _renderGame();
  }

  /* ─── In-game UI ─────────────────────────────────────────────────── */

  function _renderGame() {
    _config = (window.WBC && window.WBC.systemConfig)
      ? window.WBC.systemConfig : null;

    var page = _el('page-battle');
    if (!page) return;
    if (!_game) { _renderSetup(); return; }

    var maxTurns = (_config && _config.max_turns) ? _config.max_turns : 7;

    /*
     * Layout (top to bottom):
     *   .battle-fixed   — never scrolls: turn header + phase display
     *                     + nav bar + prompts bar
     *   .battle-scroll  — scrollable: roster cards + notes + end game btn
     */
    page.innerHTML = [

      /* ── Fixed header region ───────────────────────────── */
      '<div class="battle-fixed" id="battle-fixed">',

      /* Turn header row */
      '  <div class="battle-turn-header">',
      '    <div class="battle-turn-block">',
      '      <span class="battle-turn-label">Turn</span>',
      '      <span class="battle-turn-number" id="battle-turn-number">'
        + _game.current_turn + '</span>',
      '      <span class="battle-turn-max">/ ' + maxTurns + '</span>',
      '    </div>',
      '    <div class="battle-player-toggle" id="battle-player-toggle">',
      '      <button class="battle-player-btn" id="player-btn-you"',
      '              data-player="you">You</button>',
      '      <button class="battle-player-btn" id="player-btn-opp"',
      '              data-player="opponent">Opp</button>',
      '    </div>',
      '  </div>',

      /* Phase display */
      '  <div class="battle-phase-row" id="battle-phase-row">',
      /* filled by _renderPhaseDisplay() */
      '  </div>',

      /* Four-button nav bar */
      '  <div class="battle-nav-bar">',
      '    <button class="battle-nav-btn battle-nav-btn--turn"',
      '            id="nav-prev-turn" title="Previous Turn">',
      '      <span class="bnb-icon">«</span>',
      '      <span class="bnb-tag">Prev Turn</span>',
      '    </button>',
      '    <button class="battle-nav-btn battle-nav-btn--phase"',
      '            id="nav-prev-phase" title="Previous Phase">',
      '      <span class="bnb-icon">‹</span>',
      '      <span class="bnb-tag">Prev Phase</span>',
      '    </button>',
      '    <button class="battle-nav-btn battle-nav-btn--phase"',
      '            id="nav-next-phase" title="Next Phase">',
      '      <span class="bnb-icon">›</span>',
      '      <span class="bnb-tag">Next Phase</span>',
      '    </button>',
      '    <button class="battle-nav-btn battle-nav-btn--turn"',
      '            id="nav-next-turn" title="Next Turn">',
      '      <span class="bnb-icon">»</span>',
      '      <span class="bnb-tag">Next Turn</span>',
      '    </button>',
      '  </div>',

      /* Prompts collapsed bar */
      '  <div class="battle-prompts-bar" id="battle-prompts-bar">',
      /* filled by _renderPromptsBar() */
      '  </div>',

      '</div>',
      /* ── end .battle-fixed ─────────────────────────────── */

      /* ── Scrollable roster ─────────────────────────────── */
      '<div class="battle-scroll" id="battle-scroll">',
      '  <div class="battle-roster-label">Your Roster</div>',
      '  <div id="battle-roster"></div>',

      /* Notes now live at the bottom of the scroll area, under the
         roster — only visible once scrolled down, reclaiming the
         fixed screen real estate they used to occupy. */
      '  <div class="battle-notes-bar">',
      '    <textarea id="battle-notes" class="battle-notes-field" rows="2"',
      '              placeholder="Quick note for this turn…" maxlength="500"></textarea>',
      '    <button id="battle-save-note-btn" class="battle-save-note-btn">',
      '      Save<br>Note',
      '    </button>',
      '  </div>',

      /* End game lives at the very bottom of the scroll area */
      '  <div class="battle-end-footer">',
      '    <button id="battle-end-game-btn" class="battle-end-btn">',
      '      End Game',
      '    </button>',
      '  </div>',
      '</div>',
      /* ── end .battle-scroll ────────────────────────────── */

      '<div id="battle-game-error" class="battle-error" style="display:none;"></div>',

    ].join('');

    _rendered = true;
    _updatePlayerToggleUI();
    _renderPhaseDisplay();
    _renderPromptsBar();
    _renderRoster();
    _restoreNoteField();
    _bindGameEvents();
  }

  /* ─── Phase / turn display ───────────────────────────────────────── */

  function _renderPhaseDisplay() {
    var row = _el('battle-phase-row');
    if (!row || !_game) return;

    var phase      = _findPhase(_game.current_phase);
    var phaseName  = phase ? phase.phase_name : _game.current_phase;
    var isOpponent = (_game.current_phase === OPP_PHASE);

    row.className = 'battle-phase-row'
      + (isOpponent ? ' battle-phase-row--opp' : '');

    row.innerHTML = [
      '<span class="battle-phase-tag">',
      isOpponent ? 'Opponent\'s' : 'Your',
      '</span>',
      '<span class="battle-phase-name">' + _escapeHtml(phaseName) + '</span>',
    ].join('');
  }

  function _updatePlayerToggleUI() {
    var youBtn = _el('player-btn-you');
    var oppBtn = _el('player-btn-opp');
    if (!youBtn || !oppBtn || !_game) return;

    var isOpp = (_game.current_phase === OPP_PHASE);
    youBtn.className = 'battle-player-btn' + (isOpp ? '' : ' battle-player-btn--you');
    oppBtn.className = 'battle-player-btn' + (isOpp ? ' battle-player-btn--opp' : '');
  }

  /* ─── Prompts bar ────────────────────────────────────────────────── */

  function _renderPromptsBar() {
    var bar = _el('battle-prompts-bar');
    if (!bar || !_game) return;

    var phase = _findPhase(_game.current_phase);
    if (!phase || !Array.isArray(phase.prompts) || phase.prompts.length === 0) {
      bar.innerHTML = '';
      bar.style.display = 'none';
      return;
    }

    bar.style.display = '';

    var highPrompts = phase.prompts.filter(function (p) {
      return p.priority === 'high';
    });
    var total = phase.prompts.length;

    var previewText = highPrompts.length > 0
      ? highPrompts[0].text
      : phase.prompts[0].text;

    var expanded = bar.getAttribute('data-expanded') === 'true';

    bar.innerHTML = [
      '<div class="prompts-bar-collapsed" id="prompts-collapsed">',
      '  <span class="prompts-bar-icon">⚠</span>',
      '  <span class="prompts-bar-preview">' + _escapeHtml(previewText) + '</span>',
      '  <span class="prompts-bar-count">' + total + '</span>',
      '</div>',

      '<div class="prompts-bar-expanded" id="prompts-expanded"',
      '     style="display:' + (expanded ? 'block' : 'none') + ';">',
      _buildPromptsExpandedHTML(phase.prompts),
      '</div>',
    ].join('');

    var collapsed = _el('prompts-collapsed');
    if (collapsed) {
      collapsed.addEventListener('click', function () {
        var isExp = bar.getAttribute('data-expanded') === 'true';
        bar.setAttribute('data-expanded', isExp ? 'false' : 'true');
        var expPanel = _el('prompts-expanded');
        if (expPanel) expPanel.style.display = isExp ? 'none' : 'block';
      });
    }
  }

  function _buildPromptsExpandedHTML(prompts) {
    var sorted = prompts.slice().sort(function (a, b) {
      var ord = { high: 0, medium: 1, low: 2 };
      return (ord[a.priority] || 1) - (ord[b.priority] || 1);
    });

    return sorted.map(function (p, idx) {
      return [
        '<div class="prompt-card prompt-card--' + (p.priority || 'medium') + '"',
        '     data-pidx="' + idx + '">',
        '  <div class="prompt-card-header" data-pidx="' + idx + '">',
        '    <span class="prompt-card-icon">'
          + (p.priority === 'high' ? '⚠' : '›') + '</span>',
        '    <span class="prompt-card-text">' + _escapeHtml(p.text) + '</span>',
        '    <span class="prompt-card-toggle" id="ptoggle-' + idx + '">+</span>',
        '  </div>',
        p.detail
          ? '<div class="prompt-card-detail" id="pdetail-' + idx + '"'
            + ' style="display:none;">'
            + _escapeHtml(p.detail) + '</div>'
          : '',
        '</div>',
      ].join('');
    }).join('');
  }

  /* ─── Roster ─────────────────────────────────────────────────────── */

  function _renderRoster() {
    var container = _el('battle-roster');
    if (!container || !_game) return;

    var active = [];
    var routed = [];
    (_game.units || []).forEach(function (u) {
      (u.routed ? routed : active).push(u);
    });

    if (active.length === 0 && routed.length === 0) {
      container.innerHTML = '<p class="setup-hint">No units in roster.</p>';
      return;
    }

    var html = '';
    active.forEach(function (u) { html += _unitCardHTML(u); });

    if (routed.length > 0) {
      html += '<div class="battle-roster-label battle-roster-label--routed">'
        + 'Routed</div>';
      routed.forEach(function (u) { html += _unitCardHTML(u); });
    }

    container.innerHTML = html;

    /* Bind Routed / Restore buttons */
    _qsa('.unit-routed-btn', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        _toggleRouted(this.getAttribute('data-inst-id'));
      });
    });

    /* Bind special rules expand/collapse */
    _qsa('.unit-rules-row', container).forEach(function (row) {
      row.addEventListener('click', function () {
        var instId = this.getAttribute('data-inst-id');
        var text  = _el('urules-text-' + instId);
        var arrow = _el('urules-arrow-' + instId);
        if (!text) return;
        var isExp = this.getAttribute('data-expanded') === 'true';
        this.setAttribute('data-expanded', isExp ? 'false' : 'true');
        text.classList.toggle('unit-rules-text--expanded', !isExp);
        if (arrow) arrow.textContent = isExp ? '›' : '‹';
      });
    });

    /* Bind prompt card expand inside prompts panel */
    _qsa('.prompt-card-header').forEach(function (hdr) {
      hdr.addEventListener('click', function () {
        var idx    = this.getAttribute('data-pidx');
        var detail = _el('pdetail-' + idx);
        var tog    = _el('ptoggle-' + idx);
        if (!detail) return;
        var vis = detail.style.display !== 'none';
        detail.style.display = vis ? 'none' : 'block';
        if (tog) tog.textContent = vis ? '+' : '−';
      });
    });
  }

  function _unitCardHTML(u) {
    var isRouted  = u.routed;
    var label     = _escapeHtml(u.name);
    var sizeLine  = _escapeHtml((u.size || '') + (u.type ? ' · ' + u.type : ''));
    var instId    = u.inst_id;

    /* Contextual stats for the current phase */
    var statDefs  = PHASE_STATS[_game.current_phase] || [];
    var statsHTML = statDefs.map(function (def) {
      return [
        '<div class="unit-stat-cell">',
        '  <span class="unit-stat-label">' + def.label + '</span>',
        '  <span class="unit-stat-value">'
          + _fmtStat(def.key, u[def.key]) + '</span>',
        '</div>',
      ].join('');
    }).join('');

    /* Special rules — truncated by CSS, expands on tap.
       Keyed by inst_id (not unit_id) so duplicate units in the roster
       (e.g. 6x Goblin Rabble) each get their own expand state and DOM id. */
    var rules     = (u.special_rules || []).join(', ') || '—';
    var rulesHTML = [
      '<div class="unit-rules-row" data-inst-id="' + instId + '" data-expanded="false">',
      '  <span class="unit-rules-label">Rules</span>',
      '  <span class="unit-rules-text" id="urules-text-' + instId + '">',
      _escapeHtml(rules),
      '  </span>',
      '  <span class="unit-rules-arrow" id="urules-arrow-' + instId + '">›</span>',
      '</div>',
    ].join('');

    return [
      '<div class="unit-card' + (isRouted ? ' unit-card--routed' : '') + '"',
      '     data-inst-id="' + instId + '">',

      '  <div class="unit-card-top">',
      '    <div class="unit-card-names">',
      '      <div class="unit-card-name">' + label + '</div>',
      '      <div class="unit-card-size">' + sizeLine + '</div>',
      '    </div>',
      '    <button class="unit-routed-btn" data-inst-id="' + instId + '">',
      isRouted ? 'Restore' : 'Routed',
      '    </button>',
      '  </div>',

      statsHTML
        ? '<div class="unit-card-stats">' + statsHTML + '</div>'
        : '',

      rulesHTML,

      '</div>',
    ].join('');
  }

  /* Toggles the routed state of ONE unit instance (identified by inst_id).
     Duplicate units sharing the same unit_id (e.g. 6x Goblin Rabble) are
     tracked separately, so routing one does not affect the others. */
  function _toggleRouted(instId) {
    if (!_game || !Array.isArray(_game.units)) return;
    _game.units = _game.units.map(function (u) {
      if (u.inst_id === instId) {
        return Object.assign({}, u, { routed: !u.routed });
      }
      return u;
    });
    _saveGame();
    _renderRoster();
  }

  /* ─── Phase / Turn navigation ────────────────────────────────────── */

  /*
   * Turn structure — order depends on who went first (_roundSequence()):
   *   You first     : movement → ranged → combat → opponent_turn
   *   Opponent first : opponent_turn → movement → ranged → combat
   *
   * A "round" is one pass through that 4-phase sequence. The turn
   * counter increments only when wrapping past the LAST phase in the
   * sequence, whichever phase that is for this game.
   *
   * Next Phase steps one phase at a time through the sequence, wrapping
   * (and incrementing the turn) at the end.
   *
   * Next Turn jumps to the START of the other player's block within the
   * round (see _roundBlockBoundary), or to the start of the next round
   * if already in the second block.
   *
   * Prev Turn is the mirror of Next Turn, stepping backward.
   */

  function _advancePhase() {
    if (!_game) return;
    var maxTurns = (_config && _config.max_turns) ? _config.max_turns : 7;

    var seq = _roundSequence();
    var idx = _roundIndex();

    if (idx < seq.length - 1) {
      _game.current_phase = seq[idx + 1];
    } else {
      if (_game.current_turn >= maxTurns) {
        _promptGameEnd();
        return;
      }
      _game.current_turn += 1;
      _game.current_phase = seq[0];
    }

    _saveGame();
    _refreshGameUI();
  }

  function _retreatPhase() {
    if (!_game) return;

    var seq = _roundSequence();
    var idx = _roundIndex();

    if (idx > 0) {
      _game.current_phase = seq[idx - 1];
    } else {
      if (_game.current_turn <= 1) return;
      _game.current_turn -= 1;
      _game.current_phase = seq[seq.length - 1];
    }

    _saveGame();
    _refreshGameUI();
  }

  /*
   * Index in the round sequence where the "other" player's block begins.
   * The round always has two blocks: OPP_PHASE (1 phase) and YOUR_PHASES
   * (3 phases) — in one order or the other depending on first_player.
   */
  function _roundBlockBoundary(seq) {
    return (seq[0] === OPP_PHASE) ? 1 : seq.indexOf(OPP_PHASE);
  }

  function _advanceTurn() {
    if (!_game) return;
    var maxTurns = (_config && _config.max_turns) ? _config.max_turns : 7;

    var seq = _roundSequence();
    var idx = _roundIndex();
    var k   = _roundBlockBoundary(seq);

    if (idx < k) {
      /* Still in the first block of the round — jump to the start
         of the other player's block, same turn. */
      _game.current_phase = seq[k];
    } else {
      if (_game.current_turn >= maxTurns) {
        _promptGameEnd();
        return;
      }
      _game.current_turn += 1;
      _game.current_phase = seq[0];
    }

    _saveGame();
    _refreshGameUI();
  }

  function _retreatTurn() {
    if (!_game) return;

    var seq = _roundSequence();
    var idx = _roundIndex();
    var k   = _roundBlockBoundary(seq);

    if (idx < k) {
      /* In the first block of the round — jump back to the start of
         the other player's block in the PREVIOUS round. */
      if (_game.current_turn <= 1) return;
      _game.current_turn -= 1;
      _game.current_phase = seq[k];
    } else {
      /* In the second block — jump back to the start of the first
         block, same turn (that block already happened this turn). */
      _game.current_phase = seq[0];
    }

    _saveGame();
    _refreshGameUI();
  }

  function _refreshGameUI() {
    var turnEl = _el('battle-turn-number');
    if (turnEl && _game) turnEl.textContent = _game.current_turn;

    _updatePlayerToggleUI();
    _renderPhaseDisplay();
    _renderPromptsBar();
    _renderRoster();
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
    var key  = _currentNoteKey();
    if (!key) return;

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

    var btn = _el('battle-save-note-btn');
    if (btn) {
      btn.innerHTML = 'Saved ✓';
      setTimeout(function () { btn.innerHTML = 'Save<br>Note'; }, 1500);
    }
  }

  function _restoreNoteField() {
    var field = _el('battle-notes');
    if (!field || !_game) return;
    var key   = _currentNoteKey();
    var entry = (_game.turn_log || []).filter(function (e) {
      return e.key === key;
    })[0];
    field.value = entry ? entry.note : '';
  }

  /* ─── Game end ───────────────────────────────────────────────────── */

  function _promptGameEnd() {
    var page = _el('page-battle');
    if (!page) return;

    var routedCount = (_game.units || []).filter(function (u) {
      return u.routed;
    }).length;
    var totalCount = (_game.units || []).length;
    var maxTurns   = (_config && _config.max_turns) ? _config.max_turns : 7;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Battle Complete</div>',
      '</div>',

      '<div class="battle-end-summary">',
      '  <p class="battle-end-label">Turn '
        + _game.current_turn + ' of ' + maxTurns + '</p>',
      '  <p class="battle-end-label">'
        + routedCount + ' of ' + totalCount + ' units routed</p>',
      '</div>',

      '<div class="section-label">Result</div>',
      '<div class="battle-result-row">',
      '  <button class="battle-result-btn battle-result-btn--win"',
      '          data-result="win">Victory</button>',
      '  <button class="battle-result-btn battle-result-btn--draw"',
      '          data-result="draw">Draw</button>',
      '  <button class="battle-result-btn battle-result-btn--loss"',
      '          data-result="loss">Defeat</button>',
      '</div>',

      '<div id="battle-saving-status" class="battle-saving-status"',
      '     style="display:none;">Saving battle record…</div>',
      '<div id="battle-save-error" class="battle-error"',
      '     style="display:none;"></div>',
      '<button id="battle-retry-save-btn" class="battle-secondary-btn"',
      '        style="display:none;">Retry Save</button>',
    ].join('');

    _qsa('.battle-result-btn', page).forEach(function (btn) {
      btn.addEventListener('click', function () {
        _completeGame(this.getAttribute('data-result'));
      });
    });
  }

  function _completeGame(result) {
    if (!_game) return;
    _game.result      = result;
    _game.finished_at = _isoNow();
    _saveGame();

    var gamePayload = {
      game_id:       _game.game_id,
      date:          _isoNow(),
      army_id:       _game.army_id,
      opponent_army: _game.opponent_army,
      result:        result,
      turns_played:  _game.current_turn,
      notes:         (_game.turn_log || []).map(function (e) {
        return '[T' + e.turn_number + ' ' + e.phase + '] ' + e.note;
      }).join(' | ')
    };

    var statusEl = _el('battle-saving-status');
    var errEl    = _el('battle-save-error');
    var retryBtn = _el('battle-retry-save-btn');

    if (statusEl) statusEl.style.display = 'block';

    WBCSheets.saveGame(gamePayload).then(function (ok) {
      if (statusEl) statusEl.style.display = 'none';

      if (ok) {
        _clearGame();
        if (window.WBCChronicle &&
            typeof window.WBCChronicle.startLog === 'function') {
          window.WBCChronicle.startLog(gamePayload);
        }
        if (window.WBC && typeof window.WBC.switchTab === 'function') {
          window.WBC.switchTab('chronicle');
        }
      } else {
        if (errEl) {
          errEl.textContent = 'Could not save to your record sheet. '
            + 'Your battle data is safe locally — tap Retry to try again.';
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
        errEl.textContent = 'Unexpected error saving battle. '
          + 'Your local data is preserved — tap Retry.';
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
    var nextPhase = _el('nav-next-phase');
    if (nextPhase) {
      nextPhase.addEventListener('click', function () {
        _saveNoteFromField();
        _advancePhase();
      });
    }

    var prevPhase = _el('nav-prev-phase');
    if (prevPhase) {
      prevPhase.addEventListener('click', function () {
        _saveNoteFromField();
        _retreatPhase();
      });
    }

    var nextTurn = _el('nav-next-turn');
    if (nextTurn) {
      nextTurn.addEventListener('click', function () {
        _saveNoteFromField();
        _advanceTurn();
      });
    }

    var prevTurn = _el('nav-prev-turn');
    if (prevTurn) {
      prevTurn.addEventListener('click', function () {
        _saveNoteFromField();
        _retreatTurn();
      });
    }

    var saveNote = _el('battle-save-note-btn');
    if (saveNote) saveNote.addEventListener('click', _saveNoteFromField);

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
    var errEl = _el('battle-error') || _el('battle-game-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  function init() {
    _config = (window.WBC && window.WBC.systemConfig)
      ? window.WBC.systemConfig : null;
    _loadGame();
  }

  function onTabActivated() {
    _config = (window.WBC && window.WBC.systemConfig)
      ? window.WBC.systemConfig : null;
    _armies = [];
    _loadGame();

    if (_game && !_game.result) {
      _renderGame();
    } else {
      _renderSetup();
    }
  }

  return {
    init:           init,
    onTabActivated: onTabActivated,
  };

}());
