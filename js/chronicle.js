/**
 * chronicle.js — Chronicle mode logic for Warboss Companion (v0.2)
 *
 * Responsibilities:
 *   - Post-game logging screen (triggered from battle.js on game end)
 *   - Three reflection fields: what worked, what didn't, one thing to try next time
 *   - Rotating reflection prompt as a catalyst (not a data label)
 *   - Write completed reflection to Sheets via WBCSheets
 *   - Past games browser (reverse-chronological):
 *       · Most recent entry auto-expanded (shows all three reflection fields)
 *       · All other entries compact (date, result, opponent) — tap to expand
 *       · Expanding a compact entry fetches its reflection from Sheets on demand
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
  /*
   * Catalyst prompts shown to spark reflection after a game.
   * All three text fields map to the same three data keys regardless
   * of which prompt is displayed. One is chosen at random per session.
   * Prompts are never repeated within a session but no cross-session
   * deduplication is applied at v0.2 — simplest correct behaviour.
   */

  var REFLECTION_PROMPTS = [
    /* Tactical reflection */
    'Was there a moment you felt you had the upper hand? What caused it?',
    'If you could replay one turn, which would it be and why?',
    'Was there a charge or movement you wish you\'d handled differently?',
    'Which phase felt most comfortable? Which felt most uncertain?',
    'Did your deployment plan survive contact with the enemy?',

    /* Unit reflection */
    'Which unit surprised you — for better or worse?',
    'Did any unit underperform for their points cost?',
    'Was there a unit you expected to struggle that held on longer than anticipated?',
    'Which unit would you swap out if you ran this list again?',
    'Did you use all of your units\' special rules — or forget any mid-battle?',

    /* Opponent reflection */
    'What did your opponent do that you didn\'t expect?',
    'Was there a moment your opponent\'s positioning really frustrated you?',
    'What would you do differently if you faced the same opponent again?',

    /* Rules & knowledge */
    'Was there a rule you were unsure about mid-game?',
    'Did a rule come up that changed the outcome of a phase?',
    'Was there a rule interaction you want to look up before next time?',

    /* Mindset & growth */
    'What would you tell yourself before the battle started?',
    'What\'s the one thing that made the biggest difference to the result?',
    'What will you focus on improving before your next game?',
    'Did you feel in control of the game, or were you reacting throughout?',
  ];

  /* ─── Module state ───────────────────────────────────────────────── */

  var _pendingGame   = null;   // Game payload handed over from battle.js
  var _currentPrompt = '';     // The prompt shown on the current log screen

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

  function _isoNow() { return new Date().toISOString(); }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _randomPrompt(exclude) {
    var pool = REFLECTION_PROMPTS.filter(function (p) { return p !== exclude; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function _formatDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch (e) { return iso; }
  }

  function _resultClass(result) {
    if (result === 'win')  return 'chronicle-win';
    if (result === 'loss') return 'chronicle-loss';
    return 'chronicle-draw';
  }

  function _resultLabel(result) {
    if (result === 'win')  return 'Victory';
    if (result === 'loss') return 'Defeat';
    if (result === 'draw') return 'Draw';
    return result || '—';
  }

  /* ─── Post-game logging screen ───────────────────────────────────── */

  /**
   * startLog() — called by battle.js after a game ends.
   * Stores the pending game and renders the log form.
   */
  function startLog(gamePayload) {
    _pendingGame   = gamePayload;
    _currentPrompt = _randomPrompt();
    _renderLogForm();
  }

  function _renderLogForm() {
    var page = _el('page-chronicle');
    if (!page) return;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Chronicle</div>',
      '  <div class="page-subtitle">Record your dispatch</div>',
      '</div>',

      '<div class="chronicle-prompt-block">',
      '  <p id="chronicle-prompt-text" class="chronicle-prompt-text">',
      _escapeHtml(_currentPrompt),
      '  </p>',
      '  <button id="chronicle-prompt-refresh" class="chronicle-prompt-refresh"',
      '          aria-label="New prompt">↻</button>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="setup-label" for="chronicle-worked">What worked?</label>',
      '  <textarea id="chronicle-worked" class="chronicle-textarea"',
      '            rows="3" placeholder="Units, tactics, decisions that paid off…"',
      '            maxlength="1000"></textarea>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="setup-label" for="chronicle-didnt">What didn\'t?</label>',
      '  <textarea id="chronicle-didnt" class="chronicle-textarea"',
      '            rows="3" placeholder="Mistakes, bad luck, things to avoid…"',
      '            maxlength="1000"></textarea>',
      '</div>',

      '<div class="chronicle-field">',
      '  <label class="setup-label" for="chronicle-next">One thing to try next time</label>',
      '  <textarea id="chronicle-next" class="chronicle-textarea"',
      '            rows="2" placeholder="Keep it specific and actionable…"',
      '            maxlength="500"></textarea>',
      '</div>',

      '<div class="chronicle-log-actions">',
      '  <button id="chronicle-save-btn" class="battle-primary-btn">Save Dispatch</button>',
      '  <button id="chronicle-skip-btn" class="battle-secondary-btn">Skip</button>',
      '</div>',

      '<div id="chronicle-saving-status" class="muster-status" style="display:none;">',
      '  Saving dispatch…',
      '</div>',
      '<div id="chronicle-save-error" class="battle-error" style="display:none;"></div>',
      '<button id="chronicle-retry-btn" class="battle-secondary-btn"',
      '        style="display:none;">Retry</button>',
    ].join('');

    _bindLogFormEvents();
  }

  function _bindLogFormEvents() {
    var promptRefresh = _el('chronicle-prompt-refresh');
    if (promptRefresh) {
      promptRefresh.addEventListener('click', function () {
        _currentPrompt = _randomPrompt(_currentPrompt);
        var textEl = _el('chronicle-prompt-text');
        if (textEl) textEl.textContent = _currentPrompt;
      });
    }

    var saveBtn = _el('chronicle-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', _saveReflection);

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

  function _appendReflectionToCache(reflection) {
    try {
      var cache = WBCStorage.loadGamesCache() || [];
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
      WBCStorage.saveGamesCache(cache);
    } catch (e) {
      /* Non-critical */
    }
  }

  /* ─── Past games browser ─────────────────────────────────────────── */

  function _renderBrowser() {
    var page = _el('page-chronicle');
    if (!page) return;

    page.innerHTML = [
      '<div class="page-header">',
      '  <div class="page-title">Chronicle</div>',
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
    WBCSheets.fetchGames().then(function (result) {
      var games = Array.isArray(result.data) ? result.data : [];
      if (games.length > 0) {
        try { WBCStorage.saveGamesCache(games); } catch (e) {}
        _renderGameList(games, result.fromCache);
      } else {
        var cached = _getCachedGames();
        if (cached.length > 0) {
          _renderGameList(cached, true);
        } else {
          _renderEmptyBrowser();
        }
      }
      if (result.error) {
        var errEl = _el('chronicle-browser-error');
        if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
      }
    }).catch(function () {
      var cached = _getCachedGames();
      if (cached.length > 0) {
        _renderGameList(cached, true);
      } else {
        _renderEmptyBrowser();
      }
    });
  }

  function _getCachedGames() {
    try { return WBCStorage.loadGamesCache() || []; } catch (e) { return []; }
  }

  /**
   * Render the list of games.
   * Most recent entry (index 0 after sort) is auto-expanded.
   * All others are compact with tap-to-expand.
   */
  function _renderGameList(games, fromCache) {
    var listEl = _el('chronicle-list');
    if (!listEl) return;

    var sorted = games.slice().sort(function (a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    if (sorted.length === 0) {
      _renderEmptyBrowser();
      return;
    }

    var html = fromCache
      ? '<div class="chronicle-cache-notice">Showing saved records — connect to sync latest.</div>'
      : '';

    sorted.forEach(function (g, idx) {
      var isFirst   = (idx === 0);
      var rc        = _resultClass(g.result);
      var rl        = _resultLabel(g.result);
      var date      = _formatDate(g.date);
      var opp       = g.opponent_army ? ' vs. ' + _escapeHtml(g.opponent_army) : '';
      var turns     = g.turns_played  ? 'Turn ' + g.turns_played              : '';
      var detail    = [opp, turns].filter(Boolean).join(' · ') || '—';

      html += [
        '<div class="chronicle-entry ' + rc + (isFirst ? ' chronicle-entry--expanded' : '') + '"',
        '     id="chronicle-entry-' + idx + '"',
        '     data-game-id="' + _escapeHtml(g.game_id || '') + '"',
        '     data-open="' + (isFirst ? 'true' : 'false') + '">',

        '  <div class="chronicle-dot ' + rc + '">',
        '    <div class="chronicle-dot-inner"></div>',
        '  </div>',

        '  <div class="chronicle-body">',
        /* Always-visible compact header */
        '    <div class="chronicle-compact-row"',
        '         data-entry-idx="' + idx + '">',
        '      <div class="chronicle-compact-left">',
        '        <div class="chronicle-date">' + date + '</div>',
        '        <div class="chronicle-result ' + rc + '">' + rl + '</div>',
        '      </div>',
        '      <div class="chronicle-detail">' + detail + '</div>',
        '      <span class="chronicle-expand-arrow" id="chronicle-arrow-' + idx + '">',
        isFirst ? '∨' : '›',
        '      </span>',
        '    </div>',

        /* Expandable reflection block */
        '    <div class="chronicle-reflection" id="chronicle-reflection-' + idx + '"',
        '         style="display:' + (isFirst ? 'block' : 'none') + ';">',
        _reflectionBlockHTML(g, idx),
        '    </div>',
        '  </div>',

        '</div>',
      ].join('');
    });

    listEl.innerHTML = html;

    /* Bind tap-to-expand on compact rows */
    _qsa('.chronicle-compact-row', listEl).forEach(function (row) {
      row.addEventListener('click', function () {
        var entryIdx = this.getAttribute('data-entry-idx');
        _toggleEntry(entryIdx, sorted);
      });
    });
  }

  /**
   * Build the inner HTML for the expandable reflection block.
   * Uses cached data if available; otherwise shows a "load" state
   * that populates on first expand.
   */
  function _reflectionBlockHTML(game, idx) {
    var hasWorked  = game.what_worked && game.what_worked.trim();
    var hasDidnt   = game.what_didnt  && game.what_didnt.trim();
    var hasNext    = game.next_time   && game.next_time.trim();
    var hasAny     = hasWorked || hasDidnt || hasNext;

    var html = '';

    if (hasAny) {
      if (hasWorked) {
        html += '<div class="chronicle-ref-section">'
          + '<div class="chronicle-ref-label">What worked</div>'
          + '<div class="chronicle-ref-text">' + _escapeHtml(game.what_worked) + '</div>'
          + '</div>';
      }
      if (hasDidnt) {
        html += '<div class="chronicle-ref-section">'
          + '<div class="chronicle-ref-label">What didn\'t</div>'
          + '<div class="chronicle-ref-text">' + _escapeHtml(game.what_didnt) + '</div>'
          + '</div>';
      }
      if (hasNext) {
        html += '<div class="chronicle-ref-section">'
          + '<div class="chronicle-ref-label">Next time</div>'
          + '<div class="chronicle-ref-text chronicle-ref-text--next">'
          + _escapeHtml(game.next_time) + '</div>'
          + '</div>';
      }
    } else {
      /* No reflection cached — show placeholder; fetched on expand */
      html += '<div class="chronicle-ref-loading" id="chronicle-ref-load-' + idx + '">'
        + 'No dispatch recorded for this battle.'
        + '</div>';
    }

    return html;
  }

  /**
   * Toggle a chronicle entry open/closed.
   * On first open of a non-expanded entry, attempt to fetch the reflection
   * from Sheets if it's not already in the rendered block.
   */
  function _toggleEntry(idx, games) {
    var entryEl   = _el('chronicle-entry-' + idx);
    var reflEl    = _el('chronicle-reflection-' + idx);
    var arrowEl   = _el('chronicle-arrow-' + idx);
    if (!entryEl || !reflEl) return;

    var isOpen = entryEl.getAttribute('data-open') === 'true';

    if (isOpen) {
      /* Collapse */
      entryEl.setAttribute('data-open', 'false');
      entryEl.classList.remove('chronicle-entry--expanded');
      reflEl.style.display = 'none';
      if (arrowEl) arrowEl.textContent = '›';
    } else {
      /* Expand — and fetch reflection from Sheets if not cached */
      entryEl.setAttribute('data-open', 'true');
      entryEl.classList.add('chronicle-entry--expanded');
      reflEl.style.display = 'block';
      if (arrowEl) arrowEl.textContent = '∨';

      var loadEl = _el('chronicle-ref-load-' + idx);
      if (loadEl && games && games[idx]) {
        /* Show loading state then fetch */
        loadEl.textContent = 'Loading dispatch…';
        _fetchAndInjectReflection(games[idx].game_id, reflEl);
      }
    }
  }

  /**
   * Fetch a reflection from Sheets and inject it into the given container.
   * Only called when the cached block showed the "no dispatch" placeholder.
   */
  function _fetchAndInjectReflection(gameId, containerEl) {
    WBCSheets.fetchReflection(gameId).then(function (result) {
      if (!result.data) {
        containerEl.innerHTML = '<div class="chronicle-ref-loading">'
          + 'No dispatch recorded for this battle.</div>';
        return;
      }

      var r = result.data;
      /* Inject the full reflection block */
      containerEl.innerHTML = _reflectionBlockHTML(Object.assign({ game_id: gameId }, r), -1);

      /* Update games cache with this reflection so future renders use it */
      try {
        var cached = WBCStorage.loadGamesCache() || [];
        WBCStorage.saveGamesCache(cached.map(function (g) {
          if (g.game_id === gameId) {
            return Object.assign({}, g, {
              what_worked: r.what_worked,
              what_didnt:  r.what_didnt,
              next_time:   r.next_time,
            });
          }
          return g;
        }));
      } catch (e) { /* non-critical */ }

    }).catch(function (err) {
      console.error('[chronicle] fetchReflection error:', err);
      containerEl.innerHTML = '<div class="chronicle-ref-loading">'
        + 'Could not load dispatch — check your connection.</div>';
    });
  }

  function _renderEmptyBrowser() {
    var listEl = _el('chronicle-list');
    if (listEl) {
      listEl.innerHTML = '<p class="setup-hint">No battles recorded yet. Complete a battle to begin your chronicle.</p>';
    }
  }

  /* ─── Public API ─────────────────────────────────────────────────── */

  function init() {
    /* No-op on boot */
  }

  function onTabActivated() {
    if (_pendingGame) {
      _currentPrompt = _randomPrompt();
      _renderLogForm();
    } else {
      _renderBrowser();
    }
  }

  return {
    init,
    onTabActivated,
    startLog,
  };

})();
