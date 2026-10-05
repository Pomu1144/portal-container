/* js/vault.js — the character vault and the player profile.
 * The vault is the hub's source of truth for which characters the player
 * owns across every game. One card per character (id = sourceGame:baseId);
 * level and rarity only ever go up. Stored in localStorage under portal_*.
 */
(function (global) {
  'use strict';

  const KEY = 'portal_vault_v1';
  const SCHEMA = 1;
  const listeners = new Set();

  function blank() {
    return { schema: SCHEMA, player: { name: '' }, cards: {} };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.schema === SCHEMA && raw.cards && typeof raw.cards === 'object') return raw;
    } catch (_) { /* fall through */ }
    return blank();
  }

  let state = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('[Vault] save failed', e); }
    listeners.forEach((fn) => { try { fn(); } catch (_) {} });
  }

  // Another tab (or a game on the same origin) changed the vault.
  global.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    listeners.forEach((fn) => { try { fn(); } catch (_) {} });
  });

  /** Add a card, or raise level/rarity of the copy already held. Returns the stored card. */
  function put(card) {
    const c = PortalSDK.validateCard(card);
    const have = state.cards[c.id];
    if (have) {
      have.level = Math.max(have.level, c.level);
      have.rarity = Math.max(have.rarity, c.rarity);
      have.maxLevel = Math.max(have.maxLevel, c.maxLevel);
      // Newer art / stats from the source game win.
      if (c.art.portrait) have.art.portrait = c.art.portrait;
      if (c.art.full) have.art.full = c.art.full;
      have.stats = c.stats;
      have.name = c.name;
      have.title = c.title;
    } else {
      c.addedAt = Date.now();
      state.cards[c.id] = c;
    }
    save();
    return state.cards[c.id];
  }

  /** Apply a progress patch from a game. Level/rarity never go down. */
  function patch(id, p) {
    const have = state.cards[id];
    if (!have) return null;
    if (p.level != null) have.level = Math.min(have.maxLevel, Math.max(have.level, Math.round(p.level)));
    if (p.rarity != null) have.rarity = Math.min(7, Math.max(have.rarity, Math.round(p.rarity)));
    save();
    return have;
  }

  function remove(id) {
    if (!state.cards[id]) return;
    delete state.cards[id];
    save();
  }

  global.Vault = {
    all: () => Object.values(state.cards).sort((a, b) => b.rarity - a.rarity || b.level - a.level || a.name.localeCompare(b.name)),
    get: (id) => state.cards[id] || null,
    put,
    patch,
    remove,
    count: () => Object.keys(state.cards).length,
    playerName: () => state.player.name || '',
    setPlayerName: (n) => { state.player.name = String(n || '').trim().slice(0, 24); save(); },
    onChange: (fn) => listeners.add(fn),
  };
})(window);
