/**
 * app.js — Warboss Companion
 * Stage 4: App initialisation, tab routing, system config loading
 *
 * Responsibilities:
 *   - Boot sequence: load kow.json on DOMContentLoaded, cache via storage.js
 *   - Tab routing: show/hide .page divs, sync nav button state
 *   - Skin coordination: read/save preference, delegate CSS to skins.js
 *   - Offline/online detection: surface a banner when network is unavailable
 *   - Expose window.WBC namespace for mode modules (muster.js, battle.js, chronicle.js)
 *
 * Dependencies (must be loaded before this file):
 *   - skins.js  → window.WBC_SKINS
 *   - storage.js → window.WBCStorage
 *
 * Does NOT:
 *   - Touch localStorage directly (all via WBCStorage)
 *   - Touch Google Sheets (all via sheets.js, called from mode modules)
 *   - Hardcode any game-specific values (all content from kow.json)
 *   - Implement mode logic (muster.js / battle.js / chronicle.js handle that)
 */

(function () {
  'use strict';

  /* ─── Constants ────────────────────────────────────────────────────────── */

  var DATA_ROOT        = './data/';
  var SYSTEM_INDEX_URL = DATA_ROOT + 'systems/index.json';
  var SYSTEM_BASE_URL  = DATA_ROOT + 'systems/';
  var ARMY_INDEX_BASE  = DATA_ROOT + 'armies/';

  var STORAGE_KEY_CONFIG      = 'wbc_system_config';
  var STORAGE_KEY_ARMY_INDEX  = 'wbc_army_index';
  var STORAGE_KEY_ARTEFACTS   = 'wbc_artefacts_cache';
  var STORAGE_KEY_ENUMS       = 'wbc_enums_cache';
  var STORAGE_KEY_SKIN        = 'wbc_skin_key';
  var STORAGE_KEY_ACTIVE_GAME = 'wbc_active_game';

  var DEFAULT_SKIN    = 'gf';
  var DEFAULT_MODE    = 'muster';
  var DEFAULT_SYSTEM  = 'kow';

  /* ─── Public namespace ─────────────────────────────────────────────────── */
  /*
   * window.WBC is the shared namespace. Mode modules read from it; only
   * app.js writes to it. Treat every property here as the single source
   * of runtime truth.
   */
  window.WBC = {
    currentMode  : null,   // 'muster' | 'battle' | 'chronicle'
    currentSystem: null,   // 'kow' (or future system id)
    config       : null,   // parsed kow.json — alias: systemConfig (both kept in sync)
    systemConfig : null,   // same object — battle.js and chronicle.js read this name
    armyIndex    : null,   // parsed armies/kow/index.json
    armyData     : null,   // parsed goblins.json (the active army file)
    artefactData : null,   // parsed kow-artefacts.json (catalogue) — may stay null;
                            // absence degrades Muster/Battle to no-artefact display only
                            // (Fail Gracefully — never blocks boot or the core modes)
    enumData     : null,   // parsed kow-enums.json (type/size vocab) — used only by
                            // _validateArmyEnums() as a data-integrity guard; may stay
                            // null (guard inactive, warned loudly) without blocking boot
    isOffline    : false,

    /* Called by mode modules after they initialise */
    onModeReady  : null,   // optional callback hook

    /* Public methods */
    switchTab    : switchTab,
    openModal    : openModal,
    closeModal   : closeModal,
    setSkinAxis  : setSkinAxis,
  };

  /* ─── Internal state ───────────────────────────────────────────────────── */

  var _skinState = { world: 'fantasy', tone: 'grimdark' };
  var _currentSystemMeta = null;   // the systems/index.json entry for the active system

  var _SKIN_KEY_MAP = {
    'fantasy-grimdark' : 'gf',
    'fantasy-madcap'   : 'mf',
    'scifi-grimdark'   : 'gs',
    'scifi-madcap'     : 'ms',
  };

  var _SKIN_AXIS_LABELS = {
    world: { fantasy: 'Fantasy', scifi: 'Sci-Fi'   },
    tone : { grimdark: 'Grimdark', madcap: 'Madcap' },
  };

  /* ─── Boot ─────────────────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    _initSkin();
    _initOfflineDetection();
    _initModalListeners();
    _initNavListeners();
    _loadSystemConfig();
  });

  /* ─── Skin initialisation ──────────────────────────────────────────────── */

  function _initSkin() {
    var savedKey = WBCStorage.get(STORAGE_KEY_SKIN) || DEFAULT_SKIN;
    _applySkinKey(savedKey);
    _syncSkinModal(savedKey);
  }

  function _skinKeyToState(key) {
    var map = {
      gf: { world: 'fantasy',  tone: 'grimdark' },
      mf: { world: 'fantasy',  tone: 'madcap'   },
      gs: { world: 'scifi',    tone: 'grimdark'  },
      ms: { world: 'scifi',    tone: 'madcap'    },
    };
    return map[key] || map[DEFAULT_SKIN];
  }

  function _applySkinKey(key) {
    if (window.WBC_SKINS && typeof WBC_SKINS.apply === 'function') {
      WBC_SKINS.apply(key);
    }
    /* Update internal state so modal toggles reflect current skin */
    _skinState = _skinKeyToState(key);
    WBCStorage.set(STORAGE_KEY_SKIN, key);
  }

  function _syncSkinModal(key) {
    var state = _skinKeyToState(key);

    ['world', 'tone'].forEach(function (axis) {
      var track = document.getElementById('track-' + axis);
      if (!track) return;
      track.querySelectorAll('.toggle-opt').forEach(function (btn) {
        var val = btn.dataset.value;
        btn.classList.toggle('on', val === state[axis]);
      });
      var label = document.getElementById(axis + '-val');
      if (label) label.textContent = _SKIN_AXIS_LABELS[axis][state[axis]];
    });
  }

  /**
   * setSkinAxis(axis, value)
   * Called by gear modal toggle buttons (wired in _initModalListeners).
   * axis: 'world' | 'tone'
   * value: e.g. 'fantasy' | 'scifi' | 'grimdark' | 'madcap'
   */
  function setSkinAxis(axis, value) {
    _skinState[axis] = value;
    var key = _SKIN_KEY_MAP[_skinState.world + '-' + _skinState.tone] || DEFAULT_SKIN;
    _applySkinKey(key);
    _syncSkinModal(key);
  }

  /* ─── Offline detection ────────────────────────────────────────────────── */

  function _initOfflineDetection() {
    window.addEventListener('offline', _handleOffline);
    window.addEventListener('online',  _handleOnline);
    if (!navigator.onLine) _handleOffline();
  }

  function _handleOffline() {
    WBC.isOffline = true;
    _showOfflineBanner(true);
  }

  function _handleOnline() {
    WBC.isOffline = false;
    _showOfflineBanner(false);
    /* Re-attempt config load if we failed earlier */
    if (!WBC.config) {
      _loadSystemConfig();
    }
  }

  function _showOfflineBanner(show) {
    var banner = document.getElementById('offline-banner');
    if (!banner) return;
    banner.hidden = !show;
  }

  /* ─── Modal (gear / skin picker) ──────────────────────────────────────── */

  function openModal() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('open');
  }

  function closeModal() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function _initModalListeners() {
    /* Gear button */
    var gearBtn = document.getElementById('gear-btn');
    if (gearBtn) {
      gearBtn.addEventListener('click', openModal);
    }

    /* Tap outside modal to close */
    var overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    /* Skin axis toggle buttons */
    document.querySelectorAll('.toggle-opt[data-axis]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSkinAxis(btn.dataset.axis, btn.dataset.value);
      });
    });
  }

  /* ─── Tab routing ──────────────────────────────────────────────────────── */

  function _initNavListeners() {
    ['muster', 'battle', 'chronicle'].forEach(function (mode) {
      var btn = document.getElementById('btn-' + mode);
      if (btn) {
        btn.addEventListener('click', function () {
          switchTab(mode);
        });
      }
    });
  }

  /**
   * switchTab(mode)
   * Shows the requested page, hides all others.
   * Updates nav button active state.
   * Fires WBC.onModeReady(mode) if set by a mode module.
   */
  function switchTab(mode) {
    if (!mode) return;

    /* Hide all pages */
    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.remove('active');
    });

    /* Show target page */
    var targetPage = document.getElementById('page-' + mode);
    if (targetPage) {
      targetPage.classList.add('active');
    } else {
      console.warn('WBC: page element not found for mode "' + mode + '"');
      return;
    }

    /* Update nav buttons */
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.remove('active');
    });
    var activeBtn = document.getElementById('btn-' + mode);
    if (activeBtn) activeBtn.classList.add('active');

    /* Battle button gets its own active class (bump button) */
    var battleBtn = document.getElementById('btn-battle');
    if (battleBtn) {
      battleBtn.classList.toggle('active', mode === 'battle');
    }

    /* Training button lives outside the bottom nav (top-right, beside
       gear) so it needs its own active-state toggle too. */
    var trainingBtn = document.getElementById('training-btn');
    if (trainingBtn) {
      trainingBtn.classList.toggle('active', mode === 'training');
    }

    WBC.currentMode = mode;

    /* Call the mode module's onTabActivated handler if it exists */
    var moduleMap = {
      muster:    window.WBCMuster,
      battle:    window.WBCBattle,
      chronicle: window.WBCChronicle,
      training:  window.WBCTraining,
    };
    var activeModule = moduleMap[mode];
    if (activeModule && typeof activeModule.onTabActivated === 'function') {
      try {
        activeModule.onTabActivated();
      } catch (err) {
        console.error('WBC: onTabActivated threw for mode "' + mode + '":', err);
      }
    }

    /* Legacy: notify via onModeReady if set by a mode module */
    if (typeof WBC.onModeReady === 'function') {
      try {
        WBC.onModeReady(mode);
      } catch (err) {
        console.error('WBC: onModeReady threw for mode "' + mode + '":', err);
      }
    }
  }

  /* ─── System config loading ─────────────────────────────────────────────── */

  /**
   * _loadSystemConfig()
   * Fetch data/systems/index.json to discover the active system,
   * then fetch that system's JSON (e.g. kow.json).
   * On success: populates WBC.config, WBC.currentSystem, then loads army index.
   * On failure: falls back to localStorage cache, surfaces error notice.
   */
  function _loadSystemConfig() {
    _fetchJSON(SYSTEM_INDEX_URL)
      .then(function (index) {
        if (!index || !Array.isArray(index.systems) || index.systems.length === 0) {
          throw new Error('System index is empty or malformed');
        }
        /* For MVP: use the first system (KoW). Future: let user pick. */
        var system = index.systems[0];
        WBC.currentSystem = system.id;
        _currentSystemMeta = system;   // keep manifest entry for artefact_file lookup
        return _fetchJSON(SYSTEM_BASE_URL + system.file);
      })
      .then(function (config) {
        if (!config || !config.system_id) {
          throw new Error('System config is malformed');
        }
        WBC.config = config;
        WBC.systemConfig = config;   // alias — battle.js reads this name
        WBCStorage.set(STORAGE_KEY_CONFIG, JSON.stringify(config));
        _onConfigReady();
        _loadArtefactData(WBC.currentSystem);   // parallel, non-blocking (Fail Gracefully)
        var armyPromise = _loadArmyIndex(WBC.currentSystem);
        var enumPromise = _loadEnumData(WBC.currentSystem);
        /* Validation needs both — armyData and enumData resolve independently
           and in either order, so wait on both before running the guard. */
        Promise.all([armyPromise, enumPromise]).then(_validateArmyEnums);
        return armyPromise;
      })
      .catch(function (err) {
        console.warn('WBC: config fetch failed, attempting cache fallback:', err);
        _loadConfigFromCache();
      });
  }

  function _loadConfigFromCache() {
    try {
      var raw = WBCStorage.get(STORAGE_KEY_CONFIG);
      if (raw) {
        WBC.config = JSON.parse(raw);
        WBC.systemConfig = WBC.config;   // alias — battle.js reads this name
        WBC.currentSystem = WBC.config.system_id || DEFAULT_SYSTEM;
        _onConfigReady();
        if (_currentSystemMeta) { _loadArtefactData(WBC.currentSystem); }
        var armyPromise = _loadArmyIndex(WBC.currentSystem);
        var enumPromise = _currentSystemMeta ? _loadEnumData(WBC.currentSystem) : Promise.resolve();
        Promise.all([armyPromise, enumPromise]).then(_validateArmyEnums);
        _showDataNotice('Rules loaded from cache. Some data may be out of date.');
      } else {
        _showDataNotice('Could not load game rules. Check your connection and reload.');
        _onConfigReady(); /* Still boot — mode modules handle missing config gracefully */
      }
    } catch (err) {
      console.error('WBC: cache fallback failed:', err);
      _showDataNotice('Could not load game rules. Check your connection and reload.');
      _onConfigReady();
    }
  }

  function _onConfigReady() {
    /* Switch to default mode now that config is available */
    switchTab(DEFAULT_MODE);
  }

  /* ─── Army index loading ────────────────────────────────────────────────── */

  /**
   * _loadArmyIndex(systemId)
   * Fetches data/armies/{systemId}/index.json.
   * Populates WBC.armyIndex, caches to localStorage.
   * Returns a Promise so callers can chain if needed.
   */
  function _loadArmyIndex(systemId) {
    var url = ARMY_INDEX_BASE + systemId + '/index.json';
    return _fetchJSON(url)
      .then(function (index) {
        if (!index || !Array.isArray(index.armies)) {
          throw new Error('Army index malformed for system: ' + systemId);
        }
        WBC.armyIndex = index;
        WBCStorage.set(STORAGE_KEY_ARMY_INDEX, JSON.stringify(index));
        /* Load the first army data file automatically (MVP: single army) */
        if (index.armies.length > 0) {
          var firstArmy = index.armies[0];
          return _fetchJSON(ARMY_INDEX_BASE + systemId + '/' + firstArmy.file)
            .then(function (armyData) {
              WBC.armyData = armyData;
            })
            .catch(function (err) {
              console.warn('WBC: army data fetch failed:', err);
            });
        }
      })
      .catch(function (err) {
        console.warn('WBC: army index fetch failed, attempting cache:', err);
        try {
          var raw = WBCStorage.get(STORAGE_KEY_ARMY_INDEX);
          if (raw) {
            WBC.armyIndex = JSON.parse(raw);
          }
        } catch (cacheErr) {
          console.error('WBC: army index cache fallback failed:', cacheErr);
        }
      });
  }

  /* ─── Artefact catalogue loading ────────────────────────────────────────── */

  /**
   * _loadArtefactData(systemId)
   * Fetches the system's artefact catalogue (data/systems/{artefact_file}),
   * if the active systems/index.json entry declares one. Entirely optional:
   * a missing artefact_file, or a fetch/parse failure, leaves WBC.artefactData
   * as null and never blocks boot or any core mode. Muster/Battle degrade to
   * showing no artefact picker/chip when it's null (Fail Gracefully) — same
   * pattern as Training Ground's lazy, isolated kow-training.json load.
   */
  function _loadArtefactData(systemId) {
    var fileName = _currentSystemMeta && _currentSystemMeta.artefact_file;
    if (!fileName) return;   // system has no artefact catalogue — nothing to do

    _fetchJSON(SYSTEM_BASE_URL + fileName)
      .then(function (data) {
        if (!data || !Array.isArray(data.artefacts)) {
          throw new Error('Artefact catalogue malformed for system: ' + systemId);
        }
        WBC.artefactData = data;
        WBCStorage.set(STORAGE_KEY_ARTEFACTS, JSON.stringify(data));
      })
      .catch(function (err) {
        console.warn('WBC: artefact catalogue fetch failed, attempting cache:', err);
        try {
          var raw = WBCStorage.get(STORAGE_KEY_ARTEFACTS);
          if (raw) { WBC.artefactData = JSON.parse(raw); }
        } catch (cacheErr) {
          console.error('WBC: artefact catalogue cache fallback failed:', cacheErr);
        }
        /* If both fetch and cache fail, WBC.artefactData stays null — the
           app continues to boot and function normally without artefacts. */
      });
  }

  /* ─── Enum data loading ──────────────────────────────────────────────────── */

  /**
   * _loadEnumData(systemId)
   * Fetches the system's canonical type/size enum file (data/systems/{enum_file}),
   * if the active systems/index.json entry declares one (mirrors artefact_file).
   *
   * Unlike the artefact catalogue, this is not a "nice to have" — it's WBC's
   * only guard against faction-data drift (typo'd/unnormalized type or size
   * values slipping into a faction JSON; see resolver.js validateUnitEnums()
   * and the G1 design doc). So an absent or malformed enum_file warns loudly
   * rather than skipping silently — a deploy that forgets the file shouldn't
   * quietly disable the only check catching bad faction data.
   *
   * Still never blocks boot: Fail Gracefully, same as every other loader here.
   * A failed/missing enum file just means the guard doesn't run this session.
   *
   * @param {string} systemId
   * @returns {Promise<void>}
   */
  function _loadEnumData(systemId) {
    var fileName = _currentSystemMeta && _currentSystemMeta.enum_file;
    if (!fileName) {
      console.warn(
        'WBC: no enum_file declared for system "' + systemId + '" in systems/index.json — ' +
        'unit type/size validation guard is INACTIVE this session.'
      );
      return Promise.resolve();
    }

    return _fetchJSON(SYSTEM_BASE_URL + fileName)
      .then(function (data) {
        if (!data || !Array.isArray(data.unit_types) || !Array.isArray(data.unit_sizes)) {
          throw new Error('Enum file malformed for system: ' + systemId);
        }
        WBC.enumData = data;
        WBCStorage.set(STORAGE_KEY_ENUMS, JSON.stringify(data));
      })
      .catch(function (err) {
        console.warn('WBC: enum file fetch failed, attempting cache:', err);
        try {
          var raw = WBCStorage.get(STORAGE_KEY_ENUMS);
          if (raw) { WBC.enumData = JSON.parse(raw); }
        } catch (cacheErr) {
          console.error('WBC: enum file cache fallback failed:', cacheErr);
        }
        if (!WBC.enumData) {
          console.warn('WBC: unit type/size validation guard is INACTIVE this session (enum file unavailable).');
        }
      });
  }

  /* ─── Enum validation (post-load guard) ─────────────────────────────────── */

  /**
   * _validateArmyEnums()
   * Runs once both WBC.armyData and WBC.enumData have resolved, in whichever
   * order (see the Promise.all() call sites above). Calls the pure
   * WBCResolver.validateUnitEnums() guard, which throws fail-loud by design
   * (a located, detailed Error listing every bad type/size).
   *
   * This call site is where that fail-loud validator gets reconciled with
   * the app's Fail Gracefully posture: catch the throw, log the full located
   * detail to console.error for debugging, and surface a short, actionable
   * one-line summary (first offending unit_id + field) via the existing
   * on-screen data notice — but never block boot or null out armyData.
   * An enum violation is a data-authoring bug (yours), not a reason to brick
   * Battle/Chronicle mid-session.
   *
   * If enumData never loaded, the guard is skipped — already warned about
   * in _loadEnumData().
   */
  function _validateArmyEnums() {
    if (!WBC.armyData || !Array.isArray(WBC.armyData.units) || !WBC.enumData) return;

    try {
      WBCResolver.validateUnitEnums(WBC.armyData.units, WBC.enumData);
    } catch (err) {
      console.error('WBC: unit enum validation failed —', err.message);
      var firstIssue = (err.message.split('\n')[1] || err.message)
        .replace(/^\s*-\s*/, '')
        .trim();
      _showDataNotice('Data issue: ' + firstIssue + ' — see console for full detail.');
    }
  }

  /* ─── Data notice ───────────────────────────────────────────────────────── */

  function _showDataNotice(message) {
    var el = document.getElementById('data-notice');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  /* ─── Utility: fetch JSON ──────────────────────────────────────────────── */

  /**
   * _fetchJSON(url)
   * Wraps fetch() with error normalisation.
   * Rejects with a human-readable Error on HTTP errors or network failure.
   * Returns a Promise<object>.
   */
  function _fetchJSON(url) {
    return fetch(url)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' fetching ' + url);
        }
        return response.json();
      })
      .catch(function (err) {
        /* Re-throw with context so callers get a useful message */
        if (err instanceof SyntaxError) {
          throw new Error('JSON parse error in ' + url + ': ' + err.message);
        }
        throw err;
      });
  }

}());
