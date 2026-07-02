/**
 * training.js — Training Ground mode logic for Warboss Companion (v0.3)
 *
 * Responsibilities:
 *   - Lazy-load the system's training question bank on first tab activation
 *     (never part of the boot chain — this mode must not be able to affect
 *     Muster, Battle, or Chronicle if its data is missing or malformed)
 *   - Run a stateless multiple-choice quiz session:
 *       · Question order shuffled fresh each session
 *       · Option order shuffled fresh on every presentation of a question
 *         (not just once per session), so repeats can't be answered from
 *         positional memory
 *       · No per-question history or spaced repetition in v1 — score is
 *         in-memory only and resets each session
 *   - Wire its own nav trigger (#training-btn, top-right, beside the gear
 *     button) — this mode is not part of the bottom nav bar
 *
 * Dependencies (must be loaded before this file):
 *   - app.js (window.WBC) — for WBC.switchTab and WBC.currentSystem
 *
 * Module isolation rules:
 *   - This file NEVER touches localStorage or Sheets — v1 progress is
 *     stateless/in-memory by design (confirmed decision, not an oversight)
 *   - This file fetches its own data independently (system index →
 *     training_file) rather than depending on state populated by app.js's
 *     boot chain, since the training bank is intentionally outside that
 *     chain — a missing/corrupt bank must never be able to block boot
 *   - DOM manipulation is scoped to #page-training and #training-btn only
 *   - No game-specific values are hardcoded here — all question content,
 *     categories, and wording come from kow-training.json
 */

var WBCTraining = (function () {
  'use strict';

  /* ─── Constants ───────────────────────────────────────────────────── */

  var DATA_ROOT        = './data/';
  var SYSTEM_INDEX_URL = DATA_ROOT + 'systems/index.json';
  var SYSTEM_BASE_URL  = DATA_ROOT + 'systems/';
  var DEFAULT_SYSTEM   = 'kow';

  /* ─── Module state ────────────────────────────────────────────────── */

  var _loadState   = 'idle';  // 'idle' | 'loading' | 'ready' | 'error' | 'empty'
  var _bank         = null;   // parsed kow-training.json
  var _categoryName = {};     // id -> display name, built from _bank.categories

  var _session = null;
  /*
   * _session shape when active:
   * {
   *   order:      [question, question, ...]  // shuffled copy of the bank
   *   index:      0                          // current position in order
   *   correct:    0                          // count answered correctly
   *   answered:   0                          // count answered (right or wrong)
   *   displayOptions: [{ text, isCorrect }]  // current question's shuffled options
   *   locked:     false                      // true once an option is picked, until Next
   * }
   */

  /* ─── Utility ─────────────────────────────────────────────────────── */

  function _el(id) {
    return document.getElementById(id);
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Fisher–Yates shuffle, returns a new array — never mutates the source */
  function _shuffled(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function _fetchJSON(url) {
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' fetching ' + url);
        }
        return response.json();
      })
      .catch(function (err) {
        if (err instanceof SyntaxError) {
          throw new Error('JSON parse error in ' + url + ': ' + err.message);
        }
        throw err;
      });
  }

  /* ─── Data loading ────────────────────────────────────────────────── */

  /**
   * _loadBank()
   * Independent of app.js's boot chain by design (see file header).
   * Resolves the active system's training_file via the system index,
   * then fetches and structurally validates it.
   * Never throws — always resolves, setting _loadState to 'ready',
   * 'empty', or 'error'.
   */
  function _loadBank() {
    if (_loadState === 'loading' || _loadState === 'ready') {
      return Promise.resolve();
    }
    _loadState = 'loading';

    return _fetchJSON(SYSTEM_INDEX_URL)
      .then(function (index) {
        if (!index || !Array.isArray(index.systems) || index.systems.length === 0) {
          throw new Error('System index is empty or malformed');
        }
        var systemId = (window.WBC && WBC.currentSystem) || DEFAULT_SYSTEM;
        var entry = null;
        for (var i = 0; i < index.systems.length; i++) {
          if (index.systems[i].id === systemId) { entry = index.systems[i]; break; }
        }
        if (!entry) entry = index.systems[0];

        if (!entry.training_file) {
          /* Not a failure — this system simply has no Training Ground data yet. */
          _loadState = 'empty';
          return null;
        }
        return _fetchJSON(SYSTEM_BASE_URL + entry.training_file);
      })
      .then(function (bank) {
        if (_loadState === 'empty') return;

        if (!bank || !Array.isArray(bank.questions) || bank.questions.length === 0
            || !Array.isArray(bank.categories)) {
          throw new Error('Training bank is malformed or has no questions');
        }

        _bank = bank;
        _categoryName = {};
        bank.categories.forEach(function (c) {
          _categoryName[c.id] = c.name || c.id;
        });
        _loadState = 'ready';
      })
      .catch(function (err) {
        console.warn('[training] bank load failed:', err);
        _loadState = 'error';
      });
  }

  /* ─── Session logic ───────────────────────────────────────────────── */

  function _startSession() {
    _session = {
      order:    _shuffled(_bank.questions),
      index:    0,
      correct:  0,
      answered: 0,
      displayOptions: null,
      locked:   false,
    };
    _prepareCurrentQuestion();
  }

  /* Builds a fresh shuffled option order for whichever question is current.
     Called on session start AND on every "Next" — a repeated question gets
     a new option order each time it's presented. */
  function _prepareCurrentQuestion() {
    var q = _session.order[_session.index];
    var withFlags = q.options.map(function (text, i) {
      return { text: text, isCorrect: i === q.answer };
    });
    _session.displayOptions = _shuffled(withFlags);
    _session.locked = false;
  }

  function _submitAnswer(chosenIndex) {
    if (!_session || _session.locked) return;
    _session.locked = true;
    _session.answered++;
    if (_session.displayOptions[chosenIndex].isCorrect) {
      _session.correct++;
    }
    _renderQuiz();
  }

  function _nextQuestion() {
    if (!_session) return;
    if (_session.index < _session.order.length - 1) {
      _session.index++;
      _prepareCurrentQuestion();
      _renderQuiz();
    } else {
      _renderSummary();
    }
  }

  /* ─── Rendering ───────────────────────────────────────────────────── */

  function _render() {
    var root = _el('training-root');
    if (!root) return;

    if (_loadState === 'loading' || _loadState === 'idle') {
      root.innerHTML = '<p class="setup-hint">Loading training questions&hellip;</p>';
      return;
    }
    if (_loadState === 'empty') {
      root.innerHTML = '<p class="setup-hint">No training questions are available for this system yet.</p>';
      return;
    }
    if (_loadState === 'error') {
      root.innerHTML = '<p class="setup-hint">Could not load Training Ground &mdash; check your connection and try again. The rest of the app is unaffected.</p>';
      return;
    }
    if (!_session) {
      _renderStart();
      return;
    }
    _renderQuiz();
  }

  function _renderStart() {
    var root = _el('training-root');
    if (!root) return;
    var count = _bank.questions.length;
    root.innerHTML =
      '<div class="qr-card">' +
        '<div class="qr-title">Training Ground</div>' +
        '<div class="qr-body">' + count + ' questions across the rules, ' +
        'shuffled fresh each session. No history is kept between sessions &mdash; ' +
        'just recall, on the spot.</div>' +
      '</div>' +
      '<button class="wbc-btn-primary" id="training-start-btn" type="button" style="margin-top:12px;">' +
        'Start Session' +
      '</button>';

    var startBtn = _el('training-start-btn');
    if (startBtn) startBtn.addEventListener('click', function () {
      _startSession();
      _renderQuiz();
    });
  }

  function _renderQuiz() {
    var root = _el('training-root');
    if (!root || !_session) return;

    var q = _session.order[_session.index];
    var total = _session.order.length;
    var catName = _categoryName[q.category] || q.category;

    var optionsHtml = _session.displayOptions.map(function (opt, i) {
      var cls = 'training-option';
      var revealIcon = '';
      if (_session.locked) {
        if (opt.isCorrect) {
          cls += ' training-option--correct';
          revealIcon = ' &#10003;';
        } else {
          cls += ' training-option--wrong';
        }
      }
      var disabled = _session.locked ? ' disabled' : '';
      return '<button class="' + cls + '" data-idx="' + i + '" type="button"' + disabled + '>' +
               _escapeHtml(opt.text) + revealIcon +
             '</button>';
    }).join('');

    var feedbackHtml = '';
    if (_session.locked) {
      feedbackHtml =
        '<div class="training-explanation">' +
          '<div class="training-explanation-text">' + _escapeHtml(q.explanation || '') + '</div>' +
          (q.source ? '<div class="training-source">' + _escapeHtml(q.source) + '</div>' : '') +
        '</div>' +
        '<button class="wbc-btn-primary" id="training-next-btn" type="button">' +
          (_session.index < total - 1 ? 'Next Question' : 'See Results') +
        '</button>';
    }

    root.innerHTML =
      '<div class="training-progress">Question ' + (_session.index + 1) + ' of ' + total +
        ' &middot; ' + _session.correct + ' correct</div>' +
      '<div class="badge training-cat-badge">' + _escapeHtml(catName) + '</div>' +
      '<div class="training-question">' + _escapeHtml(q.question) + '</div>' +
      '<div class="training-options">' + optionsHtml + '</div>' +
      feedbackHtml;

    if (!_session.locked) {
      Array.prototype.slice.call(root.querySelectorAll('.training-option')).forEach(function (btn) {
        btn.addEventListener('click', function () {
          _submitAnswer(parseInt(btn.dataset.idx, 10));
        });
      });
    } else {
      var nextBtn = _el('training-next-btn');
      if (nextBtn) nextBtn.addEventListener('click', _nextQuestion);
    }
  }

  function _renderSummary() {
    var root = _el('training-root');
    if (!root || !_session) return;
    var total = _session.order.length;

    root.innerHTML =
      '<div class="qr-card">' +
        '<div class="qr-title">Session Complete</div>' +
        '<div class="qr-body">' + _session.correct + ' correct out of ' + total + '.</div>' +
      '</div>' +
      '<button class="wbc-btn-primary" id="training-again-btn" type="button" style="margin-top:12px;">' +
        'Start New Session' +
      '</button>';

    var againBtn = _el('training-again-btn');
    if (againBtn) againBtn.addEventListener('click', function () {
      _startSession();
      _renderQuiz();
    });
  }

  /* ─── Nav wiring ──────────────────────────────────────────────────── */
  /*
   * Training Ground is not part of the bottom nav bar (v1/beta placement:
   * icon beside the gear button). Wired here rather than in app.js so this
   * mode's footprint stays entirely inside training.js / #page-training.
   */
  function _initNavTrigger() {
    var btn = _el('training-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (window.WBC && typeof WBC.switchTab === 'function') {
        WBC.switchTab('training');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', _initNavTrigger);

  /* ─── Public API ──────────────────────────────────────────────────── */

  function onTabActivated() {
    if (_loadState === 'idle') {
      _render(); // show the loading state immediately
      _loadBank().then(_render);
    } else {
      _render();
    }
  }

  return {
    onTabActivated: onTabActivated,
  };

})();
