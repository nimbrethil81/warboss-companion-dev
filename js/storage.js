/**
 * storage.js — localStorage wrapper
 *
 * Single source of truth for ALL localStorage reads and writes.
 * No other module touches localStorage directly.
 *
 * Dependencies: none
 *
 * Keys in use (defined in SPEC.md §3 — localStorage Schema):
 *   wbc_active_game    — full state of current game in progress
 *   wbc_armies_cache   — cache of armies fetched from Sheets
 *   wbc_games_cache    — cache of past games fetched from Sheets
 *   wbc_system_config  — cached kow.json content
 *   wbc_selected_army  — the Muster army chosen on the Battle setup screen
 *                        Shape: { army_id, army_name, game_system, unit_ids: [] }
 *                        Cleared when Battle setup is cancelled or game begins.
 */

window.WBCStorage = (() => {

  // ─── KEYS ────────────────────────────────────────────────────────────────────
  // All key strings live here. No magic strings anywhere else in this module.
  const KEYS = {
    ACTIVE_GAME:     'wbc_active_game',
    ARMIES_CACHE:    'wbc_armies_cache',
    GAMES_CACHE:     'wbc_games_cache',
    SYSTEM_CONFIG:   'wbc_system_config',
    SELECTED_ARMY:   'wbc_selected_army',
  };

  // ─── PRIMITIVES ──────────────────────────────────────────────────────────────

  /**
   * Write a value to localStorage under the given key.
   * Serialises to JSON automatically.
   * Returns true on success, false on failure (e.g. storage quota exceeded).
   *
   * @param {string} key
   * @param {*} value — must be JSON-serialisable
   * @returns {boolean}
   */
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[Storage] Failed to write key "${key}":`, err);
      return false;
    }
  }

  /**
   * Read and deserialise a value from localStorage.
   * Returns null if the key does not exist or if parsing fails.
   *
   * @param {string} key
   * @returns {*|null}
   */
  function get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[Storage] Failed to read key "${key}":`, err);
      return null;
    }
  }

  /**
   * Remove a single key from localStorage.
   * Returns true on success, false on failure.
   *
   * @param {string} key
   * @returns {boolean}
   */
  function remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error(`[Storage] Failed to remove key "${key}":`, err);
      return false;
    }
  }

  // ─── ACTIVE GAME ─────────────────────────────────────────────────────────────

  /**
   * Persist the full active game state object.
   * This is the only write path for wbc_active_game.
   *
   * Expected shape (from SPEC.md §3):
   * {
   *   game_id, started_at, army_id, opponent_army,
   *   current_turn, current_phase, first_player,
   *   units: [{ unit_id, name, size, type, sp, me, sh, de, att, ne,
   *              special_rules, routed, damage }],
   *   turn_log: []
   * }
   *
   * @param {Object} gameState
   * @returns {boolean}
   */
  function saveActiveGame(gameState) {
    return set(KEYS.ACTIVE_GAME, gameState);
  }

  /**
   * Retrieve the active game state, or null if none exists.
   *
   * @returns {Object|null}
   */
  function loadActiveGame() {
    return get(KEYS.ACTIVE_GAME);
  }

  /**
   * Remove the active game state entirely.
   * Called after a successful end-of-game Sheets write.
   *
   * @returns {boolean}
   */
  function clearActiveGame() {
    return remove(KEYS.ACTIVE_GAME);
  }

  /**
   * Convenience: update a single top-level field on the active game state
   * without having to load and re-save the entire object at the call site.
   *
   * Returns false if no active game exists or the write fails.
   *
   * @param {string} field — top-level key on the game state object
   * @param {*} value
   * @returns {boolean}
   */
  function updateActiveGameField(field, value) {
    const game = loadActiveGame();
    if (!game) {
      console.warn('[Storage] updateActiveGameField: no active game found');
      return false;
    }
    game[field] = value;
    return saveActiveGame(game);
  }

  // ─── SELECTED ARMY ───────────────────────────────────────────────────────────

  /**
   * Persist the army selected on the Battle setup screen.
   * This is the handoff point between Muster and Battle.
   *
   * Shape:
   * {
   *   army_id:     string,   — UUID from the armies Sheets tab
   *   army_name:   string,   — display name e.g. "Green Tide"
   *   game_system: string,   — e.g. "kow"
   *   unit_ids:    string[]  — ordered array of unit_id strings from goblins.json
   *                            IMMUTABLE KEYS — never rename a unit_id once created
   * }
   *
   * @param {Object} army
   * @returns {boolean}
   */
  function saveSelectedArmy(army) {
    return set(KEYS.SELECTED_ARMY, army);
  }

  /**
   * Retrieve the selected army, or null if none has been chosen.
   *
   * @returns {Object|null}
   */
  function loadSelectedArmy() {
    return get(KEYS.SELECTED_ARMY);
  }

  /**
   * Clear the selected army.
   * Called after battle.js has built the roster from it, or if
   * the user cancels Battle setup.
   *
   * @returns {boolean}
   */
  function clearSelectedArmy() {
    return remove(KEYS.SELECTED_ARMY);
  }

  // ─── ARMIES CACHE ────────────────────────────────────────────────────────────

  /**
   * Persist the armies array fetched from Sheets.
   *
   * @param {Array} armies
   * @returns {boolean}
   */
  function saveArmiesCache(armies) {
    return set(KEYS.ARMIES_CACHE, armies);
  }

  /**
   * Retrieve the cached armies array, or null if the cache is cold.
   *
   * @returns {Array|null}
   */
  function loadArmiesCache() {
    return get(KEYS.ARMIES_CACHE);
  }

  // ─── GAMES CACHE ─────────────────────────────────────────────────────────────

  /**
   * Persist the past-games array fetched from Sheets.
   *
   * @param {Array} games
   * @returns {boolean}
   */
  function saveGamesCache(games) {
    return set(KEYS.GAMES_CACHE, games);
  }

  /**
   * Retrieve the cached past-games array, or null if the cache is cold.
   *
   * @returns {Array|null}
   */
  function loadGamesCache() {
    return get(KEYS.GAMES_CACHE);
  }

  // ─── SYSTEM CONFIG ───────────────────────────────────────────────────────────

  /**
   * Persist the parsed kow.json (or any system config) object.
   *
   * @param {Object} config
   * @returns {boolean}
   */
  function saveSystemConfig(config) {
    return set(KEYS.SYSTEM_CONFIG, config);
  }

  /**
   * Retrieve the cached system config, or null if not yet loaded.
   *
   * @returns {Object|null}
   */
  function loadSystemConfig() {
    return get(KEYS.SYSTEM_CONFIG);
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  return {
    // Key constants — exposed so other modules can reference them without
    // hardcoding strings, but cannot mutate them.
    KEYS: Object.freeze(Object.assign({}, KEYS)),

    // Primitive key-value access — used by app.js for skin and config keys
    get,
    set,
    remove,

    // Active game
    saveActiveGame,
    loadActiveGame,
    clearActiveGame,
    updateActiveGameField,

    // Selected army (Muster → Battle handoff)
    saveSelectedArmy,
    loadSelectedArmy,
    clearSelectedArmy,

    // Armies cache
    saveArmiesCache,
    loadArmiesCache,

    // Games cache
    saveGamesCache,
    loadGamesCache,

    // System config
    saveSystemConfig,
    loadSystemConfig,
  };

})();
