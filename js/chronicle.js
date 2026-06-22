/**
 * chronicle.js — Chronicle mode logic for Warboss Companion
 *
 * Responsibilities at v0.1:
 *   - Post-game logging screen (triggered from battle.js on game end)
 *   - Three reflection fields: what worked, what didn't, one thing to try next time
 *   - Rotating reflection prompt as a catalyst (not a data label)
 *   - Write completed reflection to Sheets via sheets.js
 *   - Past games browser (reverse-chronological list from Sheets cache)
 *
 * Deferred to v0.2:
 *   - Filtering and search of past games
 *   - Unit tagging within reflections
 *   - Win/loss statistics
 *
 * Dependencies (must be loaded before this file):
 *   - storage.js  (WBCStorage)
 *   - sheets.js   (WBCSheets)
 *   - app.js      (window.WBC)
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage directly — all reads/writes go via WBCStorage
 *   - This file NEVER reads Sheets directly — all reads/writes go via WBCSheets
 *   - DOM manipulation is scoped to #page-chronicle and its children only
 */

var WBCChronicle = (function () {
  'use strict';

  /* ─── Reflection prompts ─────────────────────────────────────────── */
  /* These are catalyst prompts shown to spark reflection.
     All three text fields map to the same three data keys regardless
     of which prompt is displayed. */

  var REFLECTION_PROMPTS = [
    'Was there a moment you felt you had the upper hand? What caused it?',
    'Which unit surprised you — for better or worse?',
    'If you could replay one turn, which would it be and why?',
    'What did your opponent do that you didn\'t expect?',
    'Was there a rule you were unsure about mid-game?',
    'Did your deployment plan survive contact with the enemy?',
    'Which phase felt most comfortable? Which felt most uncertain?',
    'Did any unit underperform for their points cost?',
    'Was there a charge or movement you wish you\'d handled differently?',
    'What would you tell yourself before the battle started?'
  ];

  /* ─── Module state ───────────────────────────────────────────────── */

  var _pendingGame  = null;   // Game payload handed over from battle.js
  var _currentPrompt = '';    // The prompt shown on the current log screen

  /* ─── Utility ────────────────────────────────────────────────────── */

  function _el(id) {
    return document.getElementById(id);
  }

  function _qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

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

  function _formatDate(isoString) {
    if (!isoString) return '—';
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString('en-GB', {
        day:   'numeric',
        month: 'short',
        year:  'numeric'
      });
    } catch (e) {
      return isoString.slice(0, 10);
    }
  }

  function _randomPrompt() {
    var idx = Math.floor(Math.random() * REFLECTION_PROMPTS.length);
    return REFLECTION_PROMPTS[idx];
  }

  function _resultClass(result) {
    if (result === 'win')  return 'victory';
    if (result === 'loss') return 'defeat';
    return '';
  }

  function _resultLabel(result) {
    if (result === 'win')  return 'Victory';
    if (result === 'loss') return 'Defeat';
    return 'Draw';
  }

  /* ─── Post-game logging screen ───────────────────────────────────── */

  /**
   * startLog(gamePayload)
   * Called by battle.js immediately after a game ends and Sheets write succeeds.
   * gamePayload matches the games tab schema:
   *   { game_id, date, army_id, opponent_army, result, turns_played, notes }
   */
  function startLog(gamePayload) {
    _pendingGame   = gamePayload;
    _currentPrompt = _randomPrompt();
    _renderLogScreen();
  }

  function _renderLogScreen() {
    var page = _el('page-chronicle');
    if (!page) return;

    var resultLabel   = _pendingGame ? _resultLabel(_pendingGame.result) : '—';
    var resultClass   = _pendingGame ? _resultClass(_pendingGame.result) : '';
    var opponentLabel = (_pendingGame && _pendingGame.opponent_army)
      ? ' vs. ' + _pendingGame.opponent_army
      : '';
    var turnsLabel    = _pendingGame
      ? 'Turn ' + _pendingGame.turns_played
      : '';

    page.innerHTML = [
      '<div class="page-header">',
      '  <div>',
      '    <div class="page-title">Chronicle</div>',
      '  </div>',
      '  <div class="page-subtitle">Record the deeds</div>',
      '</div>',

      '<div class="chronicle-game-banner chronicle-game-banner--' + resultClass + '">',
      '  <span class="chronicle-banner-result ' + resultClass + '">' + resultLabel + '</span>',
      '  <span class="chronicle-banner-meta">' + turnsLabel + opponentLabel + '</span>',
      '</div>',

      '<div class="section-label">Reflection</div>',

      '<div class="chronicle-prompt-card" id="chronicle-prompt-card">',
      '  <p class="chronicle-prompt-text" id="chronicle-prompt-text">' + _currentPrompt + '</p>',
      '  <button class="chronicle-prompt-refresh" id="chronicle-prompt-refresh" title="New prompt">↺</button>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="chronicle-label" for="chronicle-worked">What worked?</label>',
      '  <textarea id="chronicle-worked" class="chronicle-textarea" rows="3"',
      '            placeholder="Units, tactics, decisions that went well…" maxlength="600"></textarea>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="chronicle-label" for="chronicle-didnt">What didn\'t?</label>',
      '  <textarea id="chronicle-didnt" class="chronicle-textarea" rows="3"',
      '            placeholder="What went wrong, or not as planned…" maxlength="600"></textarea>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="chronicle-label" for="chronicle-next">One thing to try next time</label>',
      '  <textarea id="chronicle-next" class="chronicle-textarea" rows="2"',
      '            placeholder="One concrete change or experiment…" maxlength="300"></textarea>',
      '</div>',

      '<div class="chronicle-actions">',
      '  <button id="chronicle-save-btn" class="battle-primary-btn">Save Dispatch</button>',
      '  <button id="chronicle-skip-btn" class="battle-secondary-btn">Skip for now</button>',
      '</div>',

      '<div id="chronicle-saving-status" class="battle-saving-status" style="display:none;">',
      '  Saving dispatch…',
      '</div>',
      '<div id="chronicle-save-error" class="battle-error" style="display:none;"></div>',
      '<button id="chronicle-retry-btn" class="battle-secondary-btn" style="display:none;">Retry</button>',
    ].join('');

    _bindLogEvents();
  }

  function _bindLogEvents() {
    var promptRefresh = _el('chronicle-prompt-refresh');
    if (promptRefresh) {
      promptRefresh.addEventListener('click', function () {
        _currentPrompt = _randomPrompt();
        var textEl = _el('chronicle-prompt-text');
        if (textEl) textEl.textContent = _currentPrompt;
      });
    }

    var saveBtn = _el('chronicle-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        _saveReflection();
      });
    }

    var skipBtn = _el('chronicle-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        _pendingGame = null;
        _renderBrowser();
      });
    }

    var retryBtn = _el('chronicle-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        var errEl = _el('chronicle-save-error');
        if (errEl) errEl.style.display = 'none';
        retryBtn.style.display = 'none';
        _saveReflection();
      });
    }
  }

  function _saveReflection() {
    var workedEl = _el('chronicle-worked');
    var didntEl  = _el('chronicle-didnt');
    var nextEl   = _el('chronicle-next');
    var statusEl = _el('chronicle-saving-status');
    var errEl    = _el('chronicle-save-error');
    var retryBtn = _el('chronicle-retry-btn');
    var saveBtn  = _el('chronicle-save-btn');

    var whatWorked = workedEl ? workedEl.value.trim() : '';
    var whatDidnt  = didntEl  ? didntEl.value.trim()  : '';
    var nextTime   = nextEl   ? nextEl.value.trim()   : '';

    /* Allow save with at least one field filled, or completely blank (skip path) */
    var payload = {
      reflection_id: _uuid(),
      game_id:       _pendingGame ? _pendingGame.game_id : '',
      what_worked:   whatWorked,
      what_didnt:    whatDidnt,
      next_time:     nextTime,
      created_at:    _isoNow()
    };

    if (statusEl) statusEl.style.display = 'block';
    if (saveBtn)  saveBtn.disabled = true;

    WBCSheets.saveReflection(payload).then(function (ok) {
      if (statusEl) statusEl.style.display = 'none';
      if (saveBtn)  saveBtn.disabled = false;

      if (ok) {
        _pendingGame = null;

        /* Update local games cache with new reflection snippet */
        _appendReflectionToCache(payload);

        _renderBrowser();
      } else {
        if (errEl) {
          errEl.textContent = 'Could not save your dispatch to the record sheet. Tap Retry, or Skip to continue without saving.';
          errEl.style.display = 'block';
        }
        if (retryBtn) retryBtn.style.display = 'block';
      }
    }).catch(function (e) {
      console.error('[chronicle] Reflection save error:', e);
      if (statusEl) statusEl.style.display = 'none';
      if (saveBtn)  saveBtn.disabled = false;
      if (errEl) {
        errEl.textContent = 'Unexpected error. Your notes are still here — tap Retry or Skip.';
        errEl.style.display = 'block';
      }
      if (retryBtn) retryBtn.style.display = 'block';
    });
  }

  /* Attach reflection snippet to the matching cached game so the browser
     can show the "next time" preview without a fresh Sheets fetch */
  function _appendReflectionToCache(reflection) {
    try {
      var cache = WBCStorage.get('wbc_games_cache') || [];
      cache = cache.map(function (g) {
        if (g.game_id === reflection.game_id) {
          return Object.assign({}, g, {
            next_time:   reflection.next_time,
            what_worked: reflection.what_worked,
            what_didnt:  reflection.what_didnt
          });
        }
        return g;
      });
      WBCStorage.set('wbc_games_cache', cache);
    } catch (e) {
      /* Non-critical — browser will just show without the snippet */
    }
  }

  /* ─── Past games browser ─────────────────────────────────────────── */

  function _renderBrowser() {
    var page = _el('page-chronicle');
    if (!page) return;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div>',
      '    <div class="page-title">Chronicle</div>',
      '  </div>',
      '  <div class="page-subtitle">Deeds recorded</div>',
      '</div>',

      '<div class="section-label">Recent Battles</div>',

      '<div id="chronicle-list" class="chronicle-list">',
      '  <div class="chronicle-loading">Loading dispatches…</div>',
      '</div>',

      '<div id="chronicle-browser-error" class="battle-error" style="display:none;"></div>',
    ].join('');

    _loadGames();
  }

  function _loadGames() {
    /* Try Sheets first; fall back to local cache */
    WBCSheets.fetchGames().then(function (games) {
      if (Array.isArray(games) && games.length > 0) {
        /* Update cache */
        try { WBCStorage.set('wbc_games_cache', games); } catch (e) {}
        _renderGameList(games);
      } else {
        /* Empty result — try cache */
        var cached = _getCachedGames();
        if (cached.length > 0) {
          _renderGameList(cached, true);
        } else {
          _renderEmptyBrowser();
        }
      }
    }).catch(function () {
      /* Sheets unreachable — use cache */
      var cached = _getCachedGames();
      if (cached.length > 0) {
        _renderGameList(cached, true);
      } else {
        _renderEmptyBrowser();
      }
    });
  }

  function _getCachedGames() {
    try {
      return WBCStorage.get('wbc_games_cache') || [];
    } catch (e) {
      return [];
    }
  }

  function _renderGameList(games, fromCache) {
    var listEl = _el('chronicle-list');
    if (!listEl) return;

    /* Sort newest first */
    var sorted = games.slice().sort(function (a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    if (sorted.length === 0) {
      _renderEmptyBrowser();
      return;
    }

    var html = '';

    if (fromCache) {
      html += '<div class="chronicle-cache-notice">Showing saved records — connect to sync latest.</div>';
    }

    sorted.forEach(function (g, idx) {
      var rc    = _resultClass(g.result);
      var rl    = _resultLabel(g.result);
      var date  = _formatDate(g.date);
      var opp   = g.opponent_army ? ' vs. ' + g.opponent_army : '';
      var turns = g.turns_played  ? 'Turn ' + g.turns_played  : '';
      var next  = g.next_time     ? g.next_time                : '';

      html += [
        '<div class="chronicle-entry ' + rc + '" id="chronicle-entry-' + idx + '" data-open="false">',

        '  <div class="chronicle-dot ' + rc + '">',
        '    <div class="chronicle-dot-inner"></div>',
        '  </div>',

        '  <div class="chronicle-body">',
        '    <div class="chronicle-date">' + date + '</div>',
        '    <div class="chronicle-result ' + rc + '">' + rl + '</div>',
        '    <div class="chronicle-detail">' + (opp || turns ? [opp, turns].filter(Boolean).join(' · ') : '—') + '</div>',
        next ? '<div class="chronicle-next-tip">Next time: ' + _escapeHtml(next) + '</div>' : '',
        '  </div>',

        '</div>',
      ].join('');
    });

    listEl.innerHTML = html;
  }

  function _renderEmptyBrowser() {
    var listEl = _el('chronicle-list');
    if (listEl) {
      listEl.innerHTML = '<p class="setup-hint">No battles recorded yet. Complete a battle to begin your chronicle.</p>';
    }
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#39;');
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  /**
   * init() — called by app.js on boot.
   */
  function init() {
    /* No-op at v0.1 */
  }

  /**
   * onTabActivated() — called by app.js / skins.js when Chronicle tab becomes active.
   * If a pending game is waiting for a log entry, show the log screen.
   * Otherwise show the browser.
   */
  function onTabActivated() {
    if (_pendingGame) {
      _renderLogScreen();
    } else {
      _renderBrowser();
    }
  }

  /**
   * startLog(gamePayload) — entry point called by battle.js after a game ends.
   * Switches to Chronicle tab and shows the post-game logging screen.
   */
  function startLog(gamePayload) {
    _pendingGame   = gamePayload;
    _currentPrompt = _randomPrompt();
    /* Tab switch is handled by battle.js calling WBC.switchTab('chronicle')
       which triggers onTabActivated(); we just need _pendingGame to be set. */
  }

  return {
    init:           init,
    onTabActivated: onTabActivated,
    startLog:       startLog
  };

}());
