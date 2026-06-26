/**
 * skins.js — Warboss Companion skin system
 *
 * Responsibilities:
 *   - Define the CSS for all four skins (gf, mf, gs, ms).
 *   - Expose window.WBC_SKINS.apply(key) for app.js to call.
 *   - Inject CSS into <style id="skin-style"> so that style.css's
 *     var(--gold), var(--blood), etc. resolve correctly at runtime.
 *   - Update the PWA theme-color meta tag to match the active skin.
 *
 * What this file does NOT do:
 *   - Inject any HTML. The app shell is in index.html.
 *   - Touch localStorage (all via storage.js).
 *   - Define any mode-specific layout. That belongs in style.css.
 *
 * Skin boundary rule (confirmed in Stage 6):
 *   skins.js owns:
 *     - All :root custom properties (--gold, --blood, --ash, etc.)
 *     - Body background and font-family
 *     - .phone-wrap, .screen, .page, .page-header, .page-title
 *     - .bottom-nav, .nav-btn, .nav-label, .nav-battle-wrap,
 *       .nav-battle-btn, .battle-label
 *     - .army-card, .chronicle-entry and their sub-elements
 *     - Skin-specific section labels, add buttons, modal chrome
 *     - Google Fonts @import
 *   style.css owns:
 *     - Reset and app frame (#app, html, body height)
 *     - Offline/data-notice banners
 *     - Gear button and theme modal
 *     - Battle mode active UI (tracker, prompts, roster, quick reference)
 *     - Shared form inputs and utility classes
 *
 * The twelve semantic custom properties that style.css consumes:
 *   --ash, --ash-light   — body text mid and light
 *   --blood, --blood-light — danger / high-priority accent
 *   --gold, --gold-dim, --gold-light — primary accent
 *   --ink                — deepest background / card bg
 *   --sapphire           — secondary accent (info, phase indicators)
 *   --stone              — card / panel surface
 *   --tab-bg             — bottom nav background
 *   --tab-border         — nav top border and dividers
 *
 * Each skin maps its own colour vocabulary onto these twelve names.
 *
 * Load order: skins.js FIRST (before app.js) per index.html script order.
 */

(function () {
  'use strict';

  // ─── SKIN DEFINITIONS ─────────────────────────────────────────────────────
  //
  // Each entry: {
  //   themeColor : string  — PWA meta theme-color hex
  //   fonts      : string  — @import block (or empty string)
  //   fontFamily : string  — body font-family value
  //   vars       : object  — CSS custom property key → value
  //   extra      : string  — any skin-specific rules beyond :root vars
  // }
  //
  // "extra" handles elements whose visual treatment differs fundamentally
  // between skins (e.g. nav colour on the MF red bar, card border-radius
  // differences, etc.) without leaking semantic variable names.

  var SKINS = {

    // ── GF — Grimdark Fantasy ──────────────────────────────────────────────
    // Dark parchment, gold and blood accent. Cinzel + Crimson Text.
    gf: {
      themeColor: '#16120e',
      fonts: "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');",
      fontFamily: "'Crimson Text', Georgia, serif",
      vars: {
        '--parchment':    '#16120e',
        '--stone':        '#211b13',
        '--gold':         '#d4a843',
        '--gold-light':   '#f0c94a',
        '--gold-dim':     '#8a6e2e',
        '--blood':        '#9b1f1f',
        '--blood-light':  '#e03030',
        '--crimson':      '#c0392b',
        '--sapphire':     '#2563a8',
        '--sapphire-dim': '#1a3f6f',
        '--ash':          '#8a7f72',
        '--ash-light':    '#d4c9b8',
        '--ink':          '#0d0b08',
        '--tab-bg':       '#0f0d0a',
        '--tab-border':   '#352b1c',
      },
      extra: [
        'body { background: var(--parchment); font-family: ' + "'Crimson Text', Georgia, serif" + '; color: var(--ash-light); }',

        '.phone-wrap { background: var(--parchment); }',

        '.screen { background-color: var(--parchment); }',
        '.screen::before { content: ""; position: absolute; inset: 0; background-image:',
        '  radial-gradient(ellipse at 15% 85%, rgba(160,30,30,0.14) 0%, transparent 55%),',
        '  radial-gradient(ellipse at 85% 15%, rgba(37,99,168,0.10) 0%, transparent 50%),',
        '  radial-gradient(ellipse at 50% 50%, rgba(212,168,67,0.04) 0%, transparent 70%);',
        '  pointer-events: none; z-index: 0; }',

        '.page-title { font-family: "Cinzel", serif; color: var(--gold-light);',
        '  text-shadow: 0 0 20px rgba(240,201,74,0.25); }',
        '.page-subtitle { color: var(--ash); font-style: italic; }',
        '.page-header { border-bottom: 1px solid var(--tab-border); }',
        '.page-header::after { background: var(--gold); }',

        '.section-label { font-family: "Cinzel", serif; color: #9a7e3a; }',

        '.army-card { background: linear-gradient(135deg,#221c13 0%,#1c1710 100%); border: 1px solid #3f3220; }',
        '.army-card::before { background: linear-gradient(180deg,var(--gold-light),var(--gold)); }',
        '.army-card-name { font-family: "Cinzel", serif; color: #e8dcc8; }',
        '.army-card-meta { color: var(--ash); }',
        '.army-card-pts { font-family: "Cinzel", serif; color: var(--gold-light);',
        '  text-shadow: 0 0 12px rgba(240,201,74,0.3); }',
        '.army-card-pts span { color: var(--ash); }',

        '.add-btn { border: 1px dashed var(--tab-border); color: var(--ash); font-family: "Cinzel", serif; }',
        '.add-btn:hover { border-color: var(--gold-dim); color: var(--gold-dim); }',

        '.bottom-nav { background: var(--tab-bg); border-top: 1px solid var(--tab-border); }',
        '.bottom-nav::before { background: linear-gradient(90deg,transparent 0%,var(--gold-dim) 30%,var(--gold) 50%,var(--gold-dim) 70%,transparent 100%); }',
        '.nav-label { font-family: "Cinzel", serif; color: #5a6a7e; }',
        '.nav-btn.active .nav-label { color: var(--gold-light); }',

        '.nav-battle-btn { background: radial-gradient(circle at 35% 35%,#2a1a10,var(--ink));',
        '  border: 2px solid var(--gold-dim);',
        '  box-shadow: 0 0 0 4px var(--tab-bg), inset 0 1px 0 rgba(201,168,76,0.1);',
        '  color: #5a6a7e; }',
        '.nav-battle-btn.active { border-color: var(--gold-light); box-shadow: 0 0 0 4px var(--tab-bg), 0 -4px 16px rgba(201,168,76,0.25), inset 0 1px 0 rgba(201,168,76,0.2); color: var(--gold-light); }',
        '.nav-battle-btn.active ~ .battle-label { color: var(--gold-light); }',
        '.battle-label { font-family: "Cinzel", serif; color: #5a6a7e; }',

        '.chronicle-dot { border-color: var(--gold-dim); background: var(--ink); }',
        '.chronicle-dot.victory { border-color: var(--gold); background: rgba(201,168,76,0.15); }',
        '.chronicle-dot.defeat  { border-color: var(--blood); background: rgba(139,26,26,0.15); }',
        '.chronicle-dot-inner { background: var(--gold-dim); }',
        '.victory .chronicle-dot-inner { background: var(--gold); }',
        '.defeat  .chronicle-dot-inner { background: var(--blood); }',
        '.chronicle-date { color: var(--ash); }',
        '.chronicle-result { font-family: "Cinzel", serif; color: var(--ash-light); }',
        '.chronicle-result.victory { color: var(--gold-light); }',
        '.chronicle-result.defeat  { color: var(--crimson); }',
        '.chronicle-detail { color: var(--ash); }',
        '.chronicle-score { font-family: "Cinzel", serif; color: var(--ash-light); }',
        '.chronicle-score em { color: var(--ash); }',
      ].join('\n'),
    },

    // ── MF — Madcap Fantasy ────────────────────────────────────────────────
    // Parchment cream, Citadel red nav bar, chunky borders. IM Fell English.
    mf: {
      themeColor: '#f5f0e0',
      fonts: "@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=IM+Fell+English:ital@0;1&display=swap');",
      fontFamily: "'IM Fell English', Georgia, serif",
      vars: {
        // Semantic vars mapped to MF palette
        '--gold':         '#b8860b',
        '--gold-light':   '#c8a830',
        '--gold-dim':     '#8a6200',
        '--blood':        '#b51a1a',
        '--blood-light':  '#d42020',
        '--ash':          '#8a8a8a',
        '--ash-light':    '#1a1a1a',
        '--ink':          '#f8f4e8',     // MF is light-on-dark inverted: ink = paper
        '--stone':        '#ede7d2',
        '--sapphire':     '#1a3a8a',
        '--tab-bg':       '#b51a1a',
        '--tab-border':   '#6a0000',
        // MF-native extras kept for completeness
        '--cream':        '#f5f0e0',
        '--off-white':    '#ede7d2',
        '--chaos-black':  '#1a1a1a',
        '--skull-white':  '#f8f4e8',
        '--mid-grey':     '#8a8a8a',
        '--light-grey':   '#c8c4b8',
        '--border':       '#1a1a1a',
        '--sunburst':     '#e8a800',
        '--sunburst-lt':  '#ffc820',
      },
      extra: [
        'body { background: #f5f0e0; font-family: "IM Fell English", Georgia, serif; color: #1a1a1a; }',
        '.phone-wrap { background: #f5f0e0; }',
        '.screen { background-color: #f5f0e0; background-image: repeating-linear-gradient(45deg,transparent,transparent 28px,rgba(0,0,0,0.018) 28px,rgba(0,0,0,0.018) 29px); }',

        '.page-title { font-family: "Cinzel", serif; font-weight: 900; color: #b51a1a; text-shadow: 1px 1px 0 #6a0000; }',
        '.page-subtitle { color: #8a8a8a; font-style: italic; }',
        '.page-header { border-bottom: 3px solid #1a1a1a; }',
        '.page-header::after { background: #b51a1a; }',

        '.section-label { font-family: "Cinzel", serif; color: #f8f4e8; background: #1a1a1a; border-left: 3px solid #b51a1a; padding: 3px 10px 2px; display: inline-block; }',

        '.army-card { background: #f8f4e8; border: 2px solid #1a1a1a; box-shadow: 3px 3px 0 #1a1a1a; border-radius: 2px; }',
        '.army-card:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 #1a1a1a; }',
        '.army-card::before { width: 5px; background: #b51a1a; }',
        '.army-card-name { font-family: "Cinzel", serif; color: #1a1a1a; }',
        '.army-card-meta { color: #8a8a8a; }',
        '.army-card-pts { font-family: "Cinzel", serif; font-weight: 900; color: #b51a1a; }',
        '.army-card-pts span { color: #8a8a8a; }',

        '.add-btn { border: 2px dashed #1a1a1a; border-radius: 2px; color: #8a8a8a; font-family: "Cinzel", serif; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; }',
        '.add-btn:hover { background: #ede7d2; color: #1a1a1a; border-style: solid; }',

        '.bottom-nav { background: #b51a1a; border-top: 3px solid #1a1a1a; }',
        '.nav-label { font-family: "Cinzel", serif; color: rgba(255,255,255,0.6); }',
        '.nav-btn.active .nav-label { color: #fff; }',
        '.nav-btn.active::after { content: ""; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 20px; height: 2px; background: #e8a800; box-shadow: 0 0 4px #ffc820; }',

        '.nav-battle-btn { background: linear-gradient(145deg,#e8e0c8,#d4cbb0); border: 3px solid #1a1a1a; box-shadow: 0 0 0 2px #b51a1a, 4px 4px 0 #1a1a1a; color: rgba(26,26,26,0.4); }',
        '.nav-battle-btn.active { background: linear-gradient(145deg,#fff8e0,#f0e8c0); box-shadow: 0 0 0 2px #e8a800, 4px 4px 0 #1a1a1a; color: #1a1a1a; }',
        '.nav-battle-btn.active ~ .battle-label { color: #fff; }',
        '.battle-label { font-family: "Cinzel", serif; color: rgba(255,255,255,0.6); }',

        '.chronicle-dot { background: #c8c4b8; border: 2px solid #1a1a1a; border-radius: 0; box-shadow: 1px 1px 0 #1a1a1a; }',
        '.chronicle-dot.victory { background: #2a7a2a; border-color: #1a4a1a; }',
        '.chronicle-dot.defeat  { background: #b51a1a; border-color: #6a0000; }',
        '.chronicle-dot-inner { background: rgba(255,255,255,0.6); }',
        '.chronicle-date { font-family: "Cinzel", serif; color: #8a8a8a; }',
        '.chronicle-result { font-family: "Cinzel", serif; font-weight: 700; color: #1a1a1a; }',
        '.chronicle-result.victory { color: #2a7a2a; }',
        '.chronicle-result.defeat  { color: #b51a1a; }',
        '.chronicle-detail { color: #8a8a8a; }',
        '.chronicle-score { font-family: "Cinzel", serif; font-weight: 900; color: #1a1a1a; }',
        '.chronicle-score em { color: #8a8a8a; }',
      ].join('\n'),
    },

    // ── GS — Grimdark Sci-Fi ──────────────────────────────────────────────
    // Cold iron, hazard stripes, glowing readouts. Oswald + Share Tech Mono.
    gs: {
      themeColor: '#1c1e20',
      fonts: "@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&family=Oswald:wght@700&display=swap');",
      fontFamily: "'Rajdhani', sans-serif",
      vars: {
        // Semantic vars mapped to GS palette
        '--gold':         '#f0c020',     // hazard yellow
        '--gold-light':   '#f8d040',
        '--gold-dim':     '#a88010',
        '--blood':        '#cc1111',     // warning red
        '--blood-light':  '#ff4444',
        '--ash':          '#5a6268',
        '--ash-light':    '#c8cdd2',
        '--ink':          '#1c1e20',
        '--stone':        '#272b2e',
        '--sapphire':     '#00aaff',     // phos blue
        '--tab-bg':       '#111315',
        '--tab-border':   '#2e3438',
        // GS-native extras
        '--iron':         '#1c1e20',
        '--iron-mid':     '#272b2e',
        '--iron-light':   '#363c42',
        '--iron-edge':    '#4a5258',
        '--hazard-yel':   '#f0c020',
        '--toxic-green':  '#3aff6a',
        '--toxic-dim':    '#1a7a36',
        '--text-dim':     '#5a6268',
        '--text-main':    '#c8cdd2',
        '--rivet':        '#5a6268',
        '--rust':         '#8b3a1a',
        '--panel-border': '#2e3438',
      },
      extra: [
        'body { background: #1c1e20; font-family: "Rajdhani", sans-serif; color: #c8cdd2; }',
        '.phone-wrap { background: #1c1e20; }',
        '.screen { background-color: #1c1e20; background-image: repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.012) 3px,rgba(255,255,255,0.012) 4px); }',
        '.screen::before { content: ""; position: absolute; top: 0; left: 0; width: 20px; height: 20px; border-top: 2px solid #4a5258; border-left: 2px solid #4a5258; z-index: 10; pointer-events: none; }',
        '.screen::after  { content: ""; position: absolute; top: 0; right: 0; width: 20px; height: 20px; border-top: 2px solid #4a5258; border-right: 2px solid #4a5258; z-index: 10; pointer-events: none; }',

        '.page-title { font-family: "Oswald", sans-serif; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #c8cdd2; }',
        '.page-subtitle { font-family: "Share Tech Mono", monospace; font-size: 9px; letter-spacing: 0.1em; color: #3aff6a; border: 1px solid #1a7a36; padding: 2px 6px; background: rgba(58,255,106,0.06); }',
        '.page-header { border-bottom: 1px solid #2e3438; }',
        '.page-header::after { background: repeating-linear-gradient(90deg,#f0c020 0px,#f0c020 8px,#1a1a1a 8px,#1a1a1a 14px); opacity: 0.7; }',

        '.section-label { font-family: "Share Tech Mono", monospace; font-size: 9px; letter-spacing: 0.25em; color: #7a6a4a; }',
        '.section-label::before { content: "//"; color: #f0c020; opacity: 0.6; margin-right: 8px; }',

        '.army-card { background: #272b2e; border: 1px solid #2e3438; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 2px 2px 0 rgba(0,0,0,0.4); border-radius: 1px; }',
        '.army-card:hover { border-color: #4a5258; }',
        '.army-card::before { background: #3aff6a; box-shadow: 0 0 8px #3aff6a, 0 0 2px #3aff6a; }',
        '.army-card-name { font-family: "Oswald", sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #c8cdd2; }',
        '.army-card-meta { font-family: "Share Tech Mono", monospace; font-size: 11px; color: #5a6268; }',
        '.army-card-pts { font-family: "Share Tech Mono", monospace; font-size: 20px; font-weight: 700; color: #3aff6a; text-shadow: 0 0 10px rgba(58,255,106,0.4); }',
        '.army-card-pts span { color: #5a6268; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; }',

        '.add-btn { border: 1px dashed #2e3438; border-radius: 1px; font-family: "Share Tech Mono", monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #5a6268; }',
        '.add-btn:hover { border-color: #4a5258; color: #c8cdd2; background: #272b2e; }',

        '.bottom-nav { background: #111315; border-top: 1px solid #2e3438; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }',
        '.bottom-nav::before { content: ""; position: absolute; top: -4px; left: 0; right: 0; height: 3px; background: repeating-linear-gradient(90deg,#f0c020 0px,#f0c020 10px,#1a1a1a 10px,#1a1a1a 18px); opacity: 0.8; }',
        '.nav-label { font-family: "Share Tech Mono", monospace; font-size: 7px; letter-spacing: 0.25em; color: #5a6268; }',
        '.nav-btn.active .nav-label { color: #3aff6a; }',
        '.nav-btn.active::after { content: ""; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 24px; height: 1px; background: #3aff6a; box-shadow: 0 0 6px #3aff6a; }',

        '.nav-battle-btn { background: radial-gradient(circle at 35% 30%,#363c42,#1c1e20); border: 2px solid #4a5258; box-shadow: 0 0 0 3px #111315, 0 0 0 4px #f0c020, 0 0 0 5px #111315, 0 -4px 16px rgba(240,192,32,0.2); color: #5a6268; }',
        '.nav-battle-btn.active { border-color: #3aff6a; box-shadow: 0 0 0 3px #111315, 0 0 0 4px #3aff6a, 0 0 0 5px #111315, 0 -4px 20px rgba(58,255,106,0.35); color: #3aff6a; }',
        '.nav-battle-btn.active ~ .battle-label { color: #3aff6a; }',
        '.battle-label { font-family: "Share Tech Mono", monospace; font-size: 7px; letter-spacing: 0.25em; color: #5a6268; }',

        '.chronicle-dot { border: 1px solid #2e3438; background: #363c42; border-radius: 1px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }',
        '.chronicle-dot.victory { background: rgba(58,255,106,0.1); border-color: #1a7a36; box-shadow: 0 0 6px rgba(58,255,106,0.2); }',
        '.chronicle-dot.defeat  { background: rgba(204,17,17,0.1); border-color: #8b1111; box-shadow: 0 0 6px rgba(204,17,17,0.2); }',
        '.chronicle-dot-inner { background: #5a6268; border-radius: 50%; }',
        '.victory .chronicle-dot-inner { background: #3aff6a; box-shadow: 0 0 4px #3aff6a; }',
        '.defeat  .chronicle-dot-inner { background: #cc1111; box-shadow: 0 0 4px #cc1111; }',
        '.chronicle-date { font-family: "Share Tech Mono", monospace; font-size: 9px; letter-spacing: 0.15em; color: #5a6268; }',
        '.chronicle-result { font-family: "Oswald", sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #c8cdd2; }',
        '.chronicle-result.victory { color: #3aff6a; text-shadow: 0 0 8px rgba(58,255,106,0.4); }',
        '.chronicle-result.defeat  { color: #cc1111; text-shadow: 0 0 8px rgba(204,17,17,0.4); }',
        '.chronicle-detail { font-family: "Share Tech Mono", monospace; font-size: 10px; color: #5a6268; }',
        '.chronicle-score { font-family: "Share Tech Mono", monospace; font-size: 18px; font-weight: 700; color: #c8cdd2; }',
        '.chronicle-score em { font-style: normal; font-size: 9px; color: #5a6268; letter-spacing: 0.1em; }',
      ].join('\n'),
    },

    // ── MS — Madcap Sci-Fi ────────────────────────────────────────────────
    // Deep space, neon accents, plasma blues and alien greens. Orbitron + Fredoka One.
    ms: {
      themeColor: '#0d0d2b',
      fonts: "@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Orbitron:wght@700;900&display=swap');",
      fontFamily: "'Fredoka One', sans-serif",
      vars: {
        // Semantic vars mapped to MS palette
        '--gold':         '#ffe020',     // zap yellow
        '--gold-light':   '#ffeE60',
        '--gold-dim':     '#a89010',
        '--blood':        '#ff3db0',     // laser pink (danger)
        '--blood-light':  '#ff80cc',
        '--ash':          '#6a7aaa',
        '--ash-light':    '#e8f0ff',
        '--ink':          '#0d0d2b',
        '--stone':        '#1a1a4a',
        '--sapphire':     '#00c8ff',     // plasma blue
        '--tab-bg':       '#0a0a22',
        '--tab-border':   '#2a2a6a',
        // MS-native extras
        '--space-bg':     '#0d0d2b',
        '--space-card':   '#1a1a4a',
        '--space-border': '#2a2a6a',
        '--plasma-blue':  '#00c8ff',
        '--laser-pink':   '#ff3db0',
        '--zap-yellow':   '#ffe020',
        '--alien-green':  '#30ff90',
        '--alien-dim':    '#10884a',
        '--star-white':   '#e8f0ff',
        '--text-main':    '#e8f0ff',
        '--text-dim':     '#6a7aaa',
        '--planet-purp':  '#8844ff',
      },
      extra: [
        'body { background: #0d0d2b; font-family: "Fredoka One", sans-serif; color: #e8f0ff; }',
        '.phone-wrap { background: #0d0d2b; }',
        '.screen { background-color: #0d0d2b; background-image: radial-gradient(1px 1px at 12% 18%,rgba(255,255,255,0.7) 0%,transparent 100%),radial-gradient(1px 1px at 44% 9%,rgba(255,255,255,0.8) 0%,transparent 100%),radial-gradient(1px 1px at 81% 61%,rgba(255,255,255,0.6) 0%,transparent 100%),radial-gradient(ellipse at 80% 10%,rgba(136,68,255,0.12) 0%,transparent 50%); }',

        '.page-title { font-family: "Orbitron", sans-serif; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #e8f0ff; text-shadow: 0 0 10px #00c8ff, 0 0 30px rgba(0,200,255,0.3); }',
        '.page-subtitle { font-size: 12px; font-weight: 700; color: #6a7aaa; }',
        '.page-header { border-bottom: 2px solid #2a2a6a; }',
        '.page-header::after { background: linear-gradient(90deg,#00c8ff,#8844ff,#ff3db0,transparent); }',

        '.section-label { font-family: "Orbitron", sans-serif; font-size: 8px; letter-spacing: 0.3em; color: #00c8ff; text-shadow: 0 0 8px rgba(0,200,255,0.6); }',
        '.section-label::before { content: "★"; color: #ffe020; font-size: 10px; margin-right: 8px; text-shadow: 0 0 8px rgba(255,224,32,0.8); }',

        '.army-card { background: #1a1a4a; border: 2px solid #2a2a6a; border-radius: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.4); }',
        '.army-card:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.5), 0 0 20px rgba(0,200,255,0.1); }',
        '.army-card::before { background: #00c8ff; box-shadow: 0 0 10px #00c8ff; border-radius: 0 4px 4px 0; top: 20%; bottom: 20%; }',
        '.army-card-name { font-family: "Fredoka One", sans-serif; font-size: 16px; color: #e8f0ff; }',
        '.army-card-meta { font-size: 12px; font-weight: 700; color: #6a7aaa; }',
        '.army-card-pts { font-family: "Orbitron", sans-serif; font-size: 18px; font-weight: 900; color: #ffe020; text-shadow: 0 0 12px rgba(255,224,32,0.6); }',
        '.army-card-pts span { color: #6a7aaa; font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase; }',

        '.add-btn { border: 2px dashed #2a2a6a; border-radius: 14px; font-family: "Orbitron", sans-serif; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #6a7aaa; }',
        '.add-btn:hover { background: #1a1a4a; color: #00c8ff; border-color: #00c8ff; text-shadow: 0 0 8px rgba(0,200,255,0.5); }',

        '.bottom-nav { background: #0a0a22; border-top: 2px solid #2a2a6a; }',
        '.bottom-nav::before { content: ""; position: absolute; top: -2px; left: 0; right: 0; height: 2px; background: linear-gradient(90deg,#00c8ff,#8844ff,#ff3db0,#ffe020,#30ff90,#00c8ff); opacity: 0.8; }',
        '.nav-label { font-family: "Orbitron", sans-serif; font-size: 7px; letter-spacing: 0.2em; color: #6a7aaa; }',
        '.nav-btn.active .nav-label { color: #00c8ff; text-shadow: 0 0 8px rgba(0,200,255,0.6); }',
        '.nav-btn.active::after { content: ""; position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: #00c8ff; box-shadow: 0 0 8px #00c8ff, 0 0 16px rgba(0,200,255,0.4); }',

        '.nav-battle-btn { background: radial-gradient(circle at 35% 30%,#1a1a5a,#0a0a2a); border: 2px solid #8844ff; box-shadow: 0 0 0 3px #0a0a22, 0 0 0 5px rgba(136,68,255,0.4), 0 0 20px rgba(136,68,255,0.3); color: #6a7aaa; }',
        '.nav-battle-btn.active { border-color: #00c8ff; box-shadow: 0 0 0 3px #0a0a22, 0 0 0 5px rgba(0,200,255,0.5), 0 0 24px rgba(0,200,255,0.4); color: #00c8ff; }',
        '.nav-battle-btn.active ~ .battle-label { color: #00c8ff; }',
        '.battle-label { font-family: "Orbitron", sans-serif; font-size: 7px; letter-spacing: 0.2em; color: #6a7aaa; }',

        '.chronicle-dot { border: 2px solid #2a2a6a; background: #1a1a4a; border-radius: 50%; }',
        '.chronicle-dot.victory { border-color: #30ff90; background: rgba(48,255,144,0.1); box-shadow: 0 0 8px rgba(48,255,144,0.4); }',
        '.chronicle-dot.defeat  { border-color: #ff3db0; background: rgba(255,61,176,0.1); box-shadow: 0 0 8px rgba(255,61,176,0.3); }',
        '.chronicle-dot-inner { background: #6a7aaa; border-radius: 50%; }',
        '.victory .chronicle-dot-inner { background: #30ff90; box-shadow: 0 0 6px #30ff90; }',
        '.defeat  .chronicle-dot-inner { background: #ff3db0; box-shadow: 0 0 6px #ff3db0; }',
        '.chronicle-date { font-family: "Orbitron", sans-serif; font-size: 9px; letter-spacing: 0.15em; color: #6a7aaa; }',
        '.chronicle-result { font-family: "Fredoka One", sans-serif; font-size: 16px; color: #e8f0ff; }',
        '.chronicle-result.victory { color: #30ff90; text-shadow: 0 0 10px rgba(48,255,144,0.5); }',
        '.chronicle-result.defeat  { color: #ff3db0; text-shadow: 0 0 10px rgba(255,61,176,0.4); }',
        '.chronicle-detail { font-size: 12px; color: #6a7aaa; font-weight: 700; }',
        '.chronicle-score { font-family: "Orbitron", sans-serif; font-size: 17px; font-weight: 900; color: #e8f0ff; }',
        '.chronicle-score em { font-style: normal; font-size: 9px; color: #6a7aaa; letter-spacing: 0.1em; }',
      ].join('\n'),
    },

  };

  // ─── SHARED STRUCTURAL CSS ─────────────────────────────────────────────────
  //
  // These rules are identical across all skins. They're injected once per
  // skin change alongside the skin-specific block. This avoids duplication in
  // SKINS above while keeping skins.js as the sole owner of these selectors.

  var STRUCTURAL_CSS = [
    '/* ── Shared structural rules (owned by skins.js) ── */',
    'body { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }',

    '.phone-wrap { max-width: 390px; height: 100vh; margin: 0 auto;',
    '  display: flex; flex-direction: column; position: relative;',
    '  box-shadow: 0 0 60px rgba(0,0,0,0.8); }',

    '.screen { flex: 1; display: flex; flex-direction: column;',
    '  overflow: hidden; position: relative; }',

    '.page { display: none; flex: 1; flex-direction: column;',
    '  padding: 24px 20px 0; position: relative; z-index: 1;',
    '  overflow-y: auto; padding-bottom: 100px; }',
    '.page.active { display: flex; }',

    '.page-header { display: flex; align-items: flex-end; gap: 12px;',
    '  margin-bottom: 24px; padding-bottom: 14px; padding-right: 44px;',
    '  position: relative; }',
    '.page-header::after { content: ""; position: absolute; bottom: -1px; left: 0;',
    '  width: 60px; height: 2px; }',

    '.page-title { font-size: 22px; line-height: 1; }',
    '.page-subtitle { font-size: 14px; letter-spacing: 0.02em; padding-bottom: 2px; }',

    '.section-label { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;',
    '  margin: 20px 0 10px; display: flex; align-items: center; gap: 8px; }',
    '.section-label::after { content: ""; flex: 1; height: 1px;',
    '  background: linear-gradient(90deg, var(--tab-border), transparent); }',

    '.army-card { padding: 14px 16px 14px 20px; margin-bottom: 12px;',
    '  position: relative; overflow: hidden; cursor: pointer;',
    '  display: flex; align-items: center; justify-content: space-between; gap: 12px;',
    '  transition: border-color 0.2s, box-shadow 0.2s, transform 0.1s; }',
    '.army-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }',
    '.army-card-text { flex: 1; min-width: 0; padding-left: 4px; }',
    '.army-card-name { font-size: 15px; font-weight: 600; margin-bottom: 4px;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.army-card-meta { font-size: 13px; }',
    '.army-card-pts { flex-shrink: 0; text-align: right; line-height: 1; }',
    '.army-card-pts span { display: block; font-size: 10px; font-weight: 400;',
    '  text-align: right; letter-spacing: 0.05em; margin-top: 3px; }',

    '.add-btn { width: 100%; padding: 12px; background: transparent;',
    '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  gap: 8px; transition: all 0.2s; }',
    '.add-btn svg { opacity: 0.6; }',

    '.bottom-nav { position: relative; height: 64px;',
    '  display: flex; align-items: center; justify-content: space-around;',
    '  z-index: 10; flex-shrink: 0; }',
    '.bottom-nav::before { content: ""; position: absolute; top: -1px; left: 0; right: 0;',
    '  height: 1px; }',

    '#nav-battle-wrap { position: relative; display: flex; flex-direction: column;',
    '  align-items: center; margin-top: -28px; }',

    '.nav-btn { background: none; border: none; cursor: pointer;',
    '  display: flex; flex-direction: column; align-items: center; gap: 4px;',
    '  padding: 8px 20px; position: relative; transition: all 0.2s; }',

    '.nav-btn svg { transition: all 0.2s; }',
    '.nav-label { font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;',
    '  transition: color 0.2s; }',

    '#btn-battle { width: 62px; height: 62px; border-radius: 50%;',
    '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
    '  transition: all 0.2s; position: relative; }',

    '.battle-label { font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase;',
    '  margin-top: 5px; transition: color 0.2s; }',

    '.chronicle-entry { display: flex; gap: 14px; padding-bottom: 20px;',
    '  margin-bottom: 20px; border-bottom: 1px solid var(--tab-border);',
    '  position: relative; }',
    '.chronicle-entry::before { content: ""; position: absolute; left: 9px; top: 28px;',
    '  bottom: -20px; width: 1px; background: var(--tab-border); }',
    '.chronicle-entry:last-child::before { display: none; }',
    '.chronicle-dot { width: 20px; height: 20px; flex-shrink: 0; margin-top: 3px;',
    '  display: flex; align-items: center; justify-content: center; }',
    '.chronicle-dot-inner { width: 6px; height: 6px; }',
    '.chronicle-body { flex: 1; }',
    '.chronicle-date { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }',
    '.chronicle-result { font-size: 15px; margin-bottom: 4px; }',
    '.chronicle-detail { font-size: 13px; font-style: italic; line-height: 1.5; }',
    '.chronicle-score { font-size: 20px; font-weight: 700; margin-top: 6px; }',
    '.chronicle-score em { font-style: normal; font-size: 12px; }',
  ].join('\n');

  // ─── apply(key) ────────────────────────────────────────────────────────────

  /**
   * Inject the selected skin's CSS into <style id="skin-style">.
   * Called by app.js on boot and whenever the player changes skin.
   *
   * @param {string} key — 'gf' | 'mf' | 'gs' | 'ms'
   */
  function apply(key) {
    var skin = SKINS[key];
    if (!skin) {
      console.warn('[Skins] Unknown skin key "' + key + '", falling back to gf');
      skin = SKINS['gf'];
      key  = 'gf';
    }

    // Build :root custom properties block
    var rootVars = Object.keys(skin.vars).map(function (prop) {
      return '  ' + prop + ': ' + skin.vars[prop] + ';';
    }).join('\n');

    var css = [
      skin.fonts,
      ':root {',
      rootVars,
      '}',
      STRUCTURAL_CSS,
      skin.extra,
    ].join('\n');

    var styleEl = document.getElementById('skin-style');
    if (styleEl) {
      styleEl.textContent = css;
    } else {
      console.error('[Skins] <style id="skin-style"> not found in DOM');
    }

    // Update PWA theme-color meta tag
    var metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) {
      metaTheme.setAttribute('content', skin.themeColor);
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  window.WBC_SKINS = {
    apply: apply,
    keys : Object.keys(SKINS),  // ['gf','mf','gs','ms'] — useful for future skin pickers
  };

}());
