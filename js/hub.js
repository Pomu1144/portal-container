/* js/hub.js — the launcher UI: games, vault, party picker, in-game view. */
(function () {
  'use strict';

  const SDK = window.PortalSDK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let games = [];
  let filter = 'all';
  let picking = null;           // game being entered
  const picked = new Set();     // card ids chosen for the party

  /* ---------- helpers ---------- */

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function gameName(id) {
    const g = games.find((x) => x.id === id);
    return g ? g.name : id;
  }

  function stars(n) {
    return '★'.repeat(Math.max(1, Math.min(7, n)));
  }

  function cardHtml(c, opts) {
    const o = opts || {};
    const initials = esc(c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2));
    const img = c.art.portrait
      ? `<img src="${esc(c.art.portrait)}" alt="" loading="lazy" onerror="this.remove()">`
      : '';
    return `
      <${o.tag || 'div'} class="card el-${esc(c.element.toLowerCase())}${o.selected ? ' is-picked' : ''}" data-id="${esc(c.id)}"${o.tag === 'button' ? ' type="button" aria-pressed="' + (o.selected ? 'true' : 'false') + '"' : ''}>
        <span class="card-art"><span class="card-initials">${initials}</span>${img}</span>
        <span class="card-body">
          <span class="card-name">${esc(c.name)}</span>
          <span class="card-meta"><span class="card-stars">${stars(c.rarity)}</span><span class="card-lv">Lv ${c.level}</span></span>
          <span class="card-tags"><span class="tag tag-el">${esc(c.element)}</span><span class="tag">${esc(gameName(c.sourceGame))}</span></span>
        </span>
        ${o.selected ? '<span class="card-check" aria-hidden="true">✓</span>' : ''}
      </${o.tag || 'div'}>`;
  }

  /* ---------- player ---------- */

  function renderPlayer() {
    $('player-name').textContent = Vault.playerName() || 'Set name';
  }

  $('player-btn').addEventListener('click', () => {
    const name = prompt('Player name (shown to games you enter):', Vault.playerName());
    if (name != null) { Vault.setPlayerName(name); renderPlayer(); }
  });

  /* ---------- games ---------- */

  function renderGames() {
    $('games').innerHTML = games.map((g) => `
      <article class="game" style="--accent:${esc(g.accent || '#d6b25e')}">
        <span class="game-kanji" aria-hidden="true">${esc(g.kanji || '門')}</span>
        <div class="game-text">
          <h3>${esc(g.name)}</h3>
          <p>${esc(g.tagline || '')}</p>
        </div>
        <button class="btn is-primary" type="button" data-enter="${esc(g.id)}">Enter</button>
      </article>`).join('');
  }

  $('games').addEventListener('click', (e) => {
    const b = e.target.closest('[data-enter]');
    if (!b) return;
    openPicker(games.find((g) => g.id === b.dataset.enter));
  });

  /* ---------- vault ---------- */

  function renderFilters() {
    const sources = [...new Set(Vault.all().map((c) => c.sourceGame))];
    if (filter !== 'all' && !sources.includes(filter)) filter = 'all';
    const opts = [['all', 'All']].concat(sources.map((s) => [s, gameName(s)]));
    $('filters').innerHTML = opts.map(([id, label]) =>
      `<button type="button" class="chip${filter === id ? ' is-on' : ''}" role="radio" aria-checked="${filter === id}" data-filter="${esc(id)}">${esc(label)}</button>`).join('');
    $('filters').hidden = sources.length < 2;
  }

  function renderVault() {
    const all = Vault.all();
    const list = filter === 'all' ? all : all.filter((c) => c.sourceGame === filter);
    $('vault-count').textContent = all.length;
    $('vault-empty').hidden = all.length > 0;
    $('vault').innerHTML = list.map((c) => cardHtml(c)).join('');
    renderFilters();
  }

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderVault();
  });

  /* ---------- paste code ---------- */

  $('paste-code-btn').addEventListener('click', () => {
    $('code-input').value = '';
    $('code-error').textContent = '';
    $('code-dialog').showModal();
  });

  $('code-go').addEventListener('click', () => {
    try {
      const cards = SDK.decodeCode($('code-input').value);
      if (!cards.length) throw new Error('That code has no characters in it');
      cards.forEach((c) => Vault.put(c));
      $('code-dialog').close();
      toast(cards.length + ' character' + (cards.length === 1 ? '' : 's') + ' added to the vault');
    } catch (err) {
      $('code-error').textContent = err.message;
    }
  });

  /* ---------- party picker ---------- */

  function maxFor(game) {
    return Math.min(SDK.MAX_PARTY, game.maxParty || SDK.MAX_PARTY);
  }

  function renderPicker() {
    const max = maxFor(picking);
    const all = Vault.all();
    $('party-grid').innerHTML = all.map((c) => cardHtml(c, { tag: 'button', selected: picked.has(c.id) })).join('');
    $('party-empty').hidden = all.length > 0;
    $('party-count').textContent = picked.size + ' / ' + max;
    $('party-go').textContent = picked.size ? 'Enter with ' + picked.size : 'Enter without a party';
  }

  function openPicker(game) {
    picking = game;
    picked.clear();
    $('party-title').textContent = 'Enter ' + game.name;
    $('party-sub').textContent = 'Up to ' + maxFor(game) + ' characters travel with you. They’re copies — they stay in your vault.';
    renderPicker();
    $('party-dialog').showModal();
  }

  $('party-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = b.dataset.id;
    if (picked.has(id)) picked.delete(id);
    else if (picked.size < maxFor(picking)) picked.add(id);
    else { toast('A party holds at most ' + maxFor(picking) + ' characters'); return; }
    renderPicker();
  });

  $('party-go').addEventListener('click', () => {
    const cards = [...picked].map((id) => Vault.get(id)).filter(Boolean);
    $('party-dialog').close();
    play(picking, cards);
  });

  /* ---------- in-game view ---------- */

  function play(game, cards) {
    $('play-title').textContent = game.name;
    $('play-status').textContent = 'Connecting…';
    $('play-status').classList.remove('is-on');
    $('play-party').innerHTML = cards.map((c) =>
      `<span class="mini el-${esc(c.element.toLowerCase())}" title="${esc(c.name)}">${c.art.portrait ? `<img src="${esc(c.art.portrait)}" alt="" onerror="this.remove()">` : ''}<i>${esc(c.name[0])}</i></span>`).join('');
    $('play').hidden = false;
    document.body.classList.add('is-playing');

    PortalBridge.open(game, $('play-frame'), cards, (type, card) => {
      if (type === 'connected') { $('play-status').textContent = 'Connected'; $('play-status').classList.add('is-on'); }
      else if (type === 'grant') toast(card.name + ' added to the vault');
      else if (type === 'update') toast(card.name + ' is now Lv ' + card.level);
      else if (type === 'exit') leave();
    });
  }

  function leave() {
    PortalBridge.close();
    $('play').hidden = true;
    document.body.classList.remove('is-playing');
    renderVault();
  }

  $('leave-btn').addEventListener('click', leave);

  /* ---------- boot ---------- */

  Vault.onChange(() => { renderVault(); renderPlayer(); });

  fetch('games.json')
    .then((r) => r.json())
    .then((list) => { games = Array.isArray(list) ? list : []; })
    .catch(() => { games = []; toast('Could not load the game list'); })
    .finally(() => { renderGames(); renderVault(); renderPlayer(); });
})();
