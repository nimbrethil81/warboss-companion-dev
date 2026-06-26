/**
 * sheets.js — Google Sheets read/write wrapper
 *
 * Single source of truth for ALL Google Sheets interactions.
 * No other module calls fetch() against the Sheets endpoint directly.
 *
 * Dependencies: storage.js (must be loaded before this file in index.html)
 *
 * Architecture note (SPEC.md §3):
 *   Game state is held in localStorage during play and written to Sheets
 *   only at game end. Muster and Chronicle degrade gracefully — cached
 *   data is shown with a notice if Sheets is unreachable.
 *
 * Authentication note (SPEC.md §8, open question #1):
 *   The SHEET_URL below is the Apps Script Web App URL that acts as a
 *   proxy to the Google Sheet. This avoids exposing an API key in
 *   client-side code and removes the need for full OAuth for single-user
 *   MVP. Replace the placeholder before first use.
 *
 * Future-proofing note:
 *   When migrating away from Google Sheets (e.g. to Supabase), only this
 *   file changes. All callers use the function signatures below.
 */

window.WBCSheets = (() => {

  // ─── CONFIGURATION ───────────────────────────────────────────────────────────
  // Replace with your deployed Apps Script Web App URL.
  // Never hardcode a raw Sheets API key here — use the Apps Script proxy.
  const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyxCPep5DsZ8nhZ9J_1gbv67Ym9uiDAH2phZHj2we19d8keUii7bS4-m2B9Ccu3tmSq/exec';

  // Tab names must match the actual sheet tab names in the Google Sheet.
  const TABS = Object.freeze({
    ARMIES:      'armies',
    GAMES:       'games',
    GAME_LOG:    'game_log',
    REFLECTIONS: 'reflections',
  });

  // Request timeout in milliseconds.
  // At the table, a player should not wait more than this before seeing
  // a fallback response.
  const TIMEOUT_MS = 8000;

  // ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

  /**
   * Wraps fetch with a timeout using AbortController.
   * Rejects with an Error on timeout or network failure.
   *
   * @param {string} url
   * @param {Object} options — standard fetch options
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST a payload to the Apps Script Web App.
   * All write operations go through here.
   *
   * @param {Object} payload
   * @returns {Promise<Object>} — parsed JSON response body
   * @throws {Error} on network failure, timeout, or non-OK HTTP status
   */
  async function post(payload) {
    const response = await fetchWithTimeout(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Sheets POST failed: HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * GET rows from a named sheet tab, optionally filtered by a field value.
   * The Apps Script endpoint is expected to accept query params:
   *   ?tab=armies&filterField=army_id&filterValue=abc123
   *
   * @param {string} tab — one of TABS.*
   * @param {Object} [filter] — optional { field, value } to narrow results
   * @returns {Promise<Array>} — array of row objects
   * @throws {Error} on network failure, timeout, or non-OK HTTP status
   */
  async function get(tab, filter = null) {
    let url = `${SHEET_URL}?tab=${encodeURIComponent(tab)}`;
    if (filter) {
      url += `&filterField=${encodeURIComponent(filter.field)}`;
      url += `&filterValue=${encodeURIComponent(filter.value)}`;
    }

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Sheets GET failed: HTTP ${response.status}`);
    }

    return response.json();
  }

  // ─── ARMIES ──────────────────────────────────────────────────────────────────

  /**
   * Fetch all armies belonging to the current user from the `armies` tab.
   * On success, updates the local cache via WBCStorage.
   * On failure, returns the stale cache (may be null if cache is cold).
   *
   * @returns {Promise<{ data: Array, fromCache: boolean, error: string|null }>}
   */
  async function fetchArmies() {
    try {
      const data = await get(TABS.ARMIES);
      WBCStorage.saveArmiesCache(data);
      return { data, fromCache: false, error: null };
    } catch (err) {
      console.warn('[Sheets] fetchArmies failed, falling back to cache:', err);
      const cached = WBCStorage.loadArmiesCache();
      return {
        data: cached || [],
        fromCache: true,
        error: 'Could not reach your army roster. Showing saved data.',
      };
    }
  }

  /**
   * Write a new or updated army record to the `armies` tab.
   * The caller should optimistically update the armies cache themselves
   * after a successful save.
   *
   * army object shape:
   * {
   *   army_id:     string,   — UUID
   *   army_name:   string,   — display name
   *   game_system: string,   — e.g. "kow"
   *   units:       string,   — JSON.stringify(unit_ids[]) — array of unit_id strings only
   *   created_at:  string,   — ISO 8601
   *   updated_at:  string,   — ISO 8601
   * }
   *
   * @param {Object} army
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function saveArmy(army) {
    try {
      await post({ action: 'upsert', tab: TABS.ARMIES, record: army });
      return { success: true, error: null };
    } catch (err) {
      console.error('[Sheets] saveArmy failed:', err);
      return {
        success: false,
        error: 'Your army could not be saved. Please try again.',
      };
    }
  }

  /**
   * Delete an army record from the `armies` tab by army_id.
   * The caller should remove the entry from the local cache after success.
   *
   * @param {string} armyId
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function deleteArmy(armyId) {
    try {
      await post({ action: 'delete', tab: TABS.ARMIES, id: armyId, idField: 'army_id' });
      return { success: true, error: null };
    } catch (err) {
      console.error('[Sheets] deleteArmy failed:', err);
      return {
        success: false,
        error: 'Your army could not be deleted. Please try again.',
      };
    }
  }

  // ─── GAMES ───────────────────────────────────────────────────────────────────

  /**
   * Fetch all past games from the `games` tab.
   * On success, updates the local cache via WBCStorage.
   * On failure, returns the stale cache.
   *
   * @returns {Promise<{ data: Array, fromCache: boolean, error: string|null }>}
   */
  async function fetchGames() {
    try {
      const data = await get(TABS.GAMES);
      WBCStorage.saveGamesCache(data);
      return { data, fromCache: false, error: null };
    } catch (err) {
      console.warn('[Sheets] fetchGames failed, falling back to cache:', err);
      const cached = WBCStorage.loadGamesCache();
      return {
        data: cached || [],
        fromCache: true,
        error: 'Could not reach your battle history. Showing saved data.',
      };
    }
  }

  /**
   * Write a completed game summary to the `games` tab.
   * This is called once at the end of a game, after the player confirms
   * the result. Local game state (wbc_active_game) should be cleared by
   * the caller only after this resolves with success: true.
   *
   * game object shape:
   * {
   *   game_id, date, army_id, opponent_army,
   *   result, turns_played, notes
   * }
   *
   * @param {Object} game
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function saveGame(game) {
    try {
      await post({ action: 'insert', tab: TABS.GAMES, record: game });
      return { success: true, error: null };
    } catch (err) {
      console.error('[Sheets] saveGame failed:', err);
      return {
        success: false,
        error: 'Your game result could not be saved. Your local data is safe — please try again when you have a connection.',
      };
    }
  }

  // ─── GAME LOG ────────────────────────────────────────────────────────────────

  /**
   * Write a batch of turn-phase log entries to the `game_log` tab.
   * Called alongside saveGame() at game end — the full turn_log array
   * from wbc_active_game is written in one call.
   *
   * Each entry shape:
   * { log_id, game_id, turn_number, phase, note }
   *
   * @param {Array} logEntries
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function saveGameLog(logEntries) {
    try {
      await post({ action: 'insertMany', tab: TABS.GAME_LOG, records: logEntries });
      return { success: true, error: null };
    } catch (err) {
      console.error('[Sheets] saveGameLog failed:', err);
      return {
        success: false,
        error: 'Turn notes could not be saved. Your game result was still recorded.',
      };
    }
  }

  // ─── REFLECTIONS ─────────────────────────────────────────────────────────────

  /**
   * Fetch the reflection for a specific game from the `reflections` tab.
   *
   * @param {string} gameId
   * @returns {Promise<{ data: Object|null, error: string|null }>}
   */
  async function fetchReflection(gameId) {
    try {
      const rows = await get(TABS.REFLECTIONS, { field: 'game_id', value: gameId });
      return { data: rows[0] || null, error: null };
    } catch (err) {
      console.error('[Sheets] fetchReflection failed:', err);
      return {
        data: null,
        error: 'Could not load the reflection for this game.',
      };
    }
  }

  /**
   * Write a post-game reflection to the `reflections` tab.
   * One reflection per game_id — the Apps Script endpoint upserts
   * on game_id to avoid duplicates.
   *
   * reflection object shape:
   * {
   *   reflection_id, game_id,
   *   what_worked, what_didnt, next_time,
   *   created_at
   * }
   *
   * @param {Object} reflection
   * @returns {Promise<{ success: boolean, error: string|null }>}
   */
  async function saveReflection(reflection) {
    try {
      await post({ action: 'upsert', tab: TABS.REFLECTIONS, record: reflection });
      return { success: true, error: null };
    } catch (err) {
      console.error('[Sheets] saveReflection failed:', err);
      return {
        success: false,
        error: 'Your reflection could not be saved. Please try again.',
      };
    }
  }

  // ─── GAME-END WRITE (composite) ───────────────────────────────────────────────

  /**
   * Write everything needed at the end of a game in the correct order:
   *   1. game summary  → `games` tab
   *   2. turn log      → `game_log` tab  (best-effort, non-blocking)
   *
   * Returns a result object so the caller can decide whether to clear
   * local state and what message to show the player.
   *
   * The game summary write is authoritative — if it fails, local state
   * is preserved and the player is prompted to retry. The turn log write
   * failing is non-fatal: the game is still recorded.
   *
   * @param {Object} game       — games tab record
   * @param {Array}  logEntries — game_log tab records (may be empty)
   * @returns {Promise<{
   *   gameSaved: boolean,
   *   logSaved: boolean,
   *   error: string|null
   * }>}
   */
  async function writeGameEnd(game, logEntries = []) {
    // Step 1: authoritative game summary write
    const gameResult = await saveGame(game);

    if (!gameResult.success) {
      return {
        gameSaved: false,
        logSaved: false,
        error: gameResult.error,
      };
    }

    // Step 2: best-effort turn log write (failure is non-fatal)
    let logSaved = true;
    if (logEntries.length > 0) {
      const logResult = await saveGameLog(logEntries);
      logSaved = logResult.success;
    }

    return {
      gameSaved: true,
      logSaved,
      error: logSaved
        ? null
        : 'Game saved. Turn notes could not be uploaded — they will remain in your local history.',
    };
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────────

  return {
    // Exposed constants — callers can reference tab names without hardcoding
    TABS,

    // Armies
    fetchArmies,
    saveArmy,
    deleteArmy,

    // Games
    fetchGames,
    saveGame,

    // Game log
    saveGameLog,

    // Reflections
    fetchReflection,
    saveReflection,

    // Composite
    writeGameEnd,
  };

})();
