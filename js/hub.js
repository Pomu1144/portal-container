/* js/hub.js — the Portal app: routing and the Play, Vault, Exchange,
 * Markets and Activity screens. Money logic lives in js/bank.js, prices in
 * js/market.js, the game connection in js/bridge.js.
 */
(function () {
  'use strict';

  const SDK = window.PortalSDK;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let games = [];
  let route = 'play';
  const RANGES = [['1D', 1440, 97], ['1W', 10080, 169], ['1M', 43200, 181]];
  const ui = { filter: 'all', pairRange: 1, stock: null, stockRange: 0 };

  /* ---------- formatting ---------- */

  const nf2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n) => Math.floor(n).toLocaleString();
  const fmtC = (cents) => '◈' + nf2.format(cents / 100);
  function fmtP(v) {
    if (!isFinite(v)) return '—';
    if (v >= 1) return '◈' + nf2.format(v);
    return '◈' + Number(v.toPrecision(3)).toString();
  }
  function fmtRatio(v) {
    if (v >= 100) return fmtN(v);
    if (v >= 1) return nf2.format(v);
    return Number(v.toPrecision(3)).toString();
  }
  function delta(x) {
    const up = x >= 0;
    return `<span class="delta ${up ? 'is-up' : 'is-down'}">${up ? '▲' : '▼'} ${up ? '+' : '−'}${Math.abs(x * 100).toFixed(2)}%</span>`;
  }
  const timeShort = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const timeAxis = (span) => (t) => span <= 1440
    ? new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  /* ---------- assets ---------- */

  const gameName = (id) => (games.find((g) => g.id === id) || {}).name || id;

  function assetIcon(id, size) {
    const cls = 'icon' + (size ? ' icon-' + size : '');
    if (id === 'credits') return `<span class="${cls} icon-credits"><img src="assets/currency/credits.png" alt="" onerror="this.remove()"><i>◈</i></span>`;
    const a = Market.asset(id);
    if (!a) return `<span class="${cls}"><i>?</i></span>`;
    if (a.kind === 'stock') {
      return `<span class="${cls} icon-stock"><img src="assets/stocks/${esc(a.short)}.png" alt="" loading="lazy" onerror="this.remove()"><i>${esc(a.short.slice(0, 2))}</i></span>`;
    }
    return `<span class="${cls} icon-${esc(a.tier)}"><img src="assets/currency/${esc(id.replace(':', '-'))}.png" alt="" loading="lazy" onerror="this.remove()"><i>${esc(a.glyph || a.short[0])}</i></span>`;
  }

  const assetName = (id) => (id === 'credits' ? 'Portal Credits' : (Market.asset(id) || {}).name || id);
  const assetSub = (id) => {
    if (id === 'credits') return 'Portal';
    const a = Market.asset(id);
    return a ? (a.kind === 'stock' ? a.short + ' · ' + a.sector : gameName(a.game) + ' · ' + (a.tier === 'premium' ? 'Premium' : 'Coins')) : '';
  };
  const currencies = () => Market.list('currency').map((a) => a.id);
  const stocks = () => Market.list('stock').map((a) => a.id);

  /* ---------- top bar ---------- */

  function renderTop() {
    $('net-worth').textContent = fmtC(Bank.netWorthCents());
    $('credits').textContent = fmtC(Bank.bal('credits'));
    const name = Vault.playerName();
    $('player-name').textContent = name || 'Set name';
    $('player-avatar').textContent = (name || '?').slice(0, 1).toUpperCase();
  }

  $('player-btn').addEventListener('click', () => {
    const name = prompt('Player name (shown to games you enter):', Vault.playerName());
    if (name != null) Vault.setPlayerName(name);
  });

  /* ---------- routing ---------- */

  const PAGES = ['play', 'vault', 'exchange', 'markets', 'activity'];

  function go() {
    const r = (location.hash || '#play').slice(1);
    route = PAGES.includes(r) ? r : 'play';
    for (const p of PAGES) $('page-' + p).hidden = p !== route;
    for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('is-active', a.dataset.route === route);
    $('top-title').textContent = $('page-' + route).dataset.title;
    document.title = (route === 'play' ? '' : $('page-' + route).dataset.title + ' · ') + 'Portal';
    render();
  }

  function render() {
    renderTop();
    if (route === 'play') renderGames();
    if (route === 'vault') renderVault();
    if (route === 'exchange') renderExchange();
    if (route === 'markets') renderMarkets();
    if (route === 'activity') renderActivity();
  }

  window.addEventListener('hashchange', go);

  /* ---------- play ---------- */

  function renderGames() {
    $('games').innerHTML = games.map((g) => {
      const c = g.currencies || {};
      const coin = Bank.bal(g.id + ':coins'), prem = Bank.bal(g.id + ':premium');
      return `
      <article class="game" style="--accent:${esc(g.accent || '#d4af5f')}">
        <div class="game-art">
          <span class="game-kanji" aria-hidden="true">${esc(g.kanji || '門')}</span>
          <img src="assets/games/${esc(g.id)}-cover.webp" alt="" loading="lazy" onerror="this.remove()">
        </div>
        <div class="game-body">
          <div>
            <h3>${esc(g.name)}</h3>
            <p class="muted">${esc(g.tagline || '')}</p>
          </div>
          <dl class="game-held">
            <div><dt>${esc((c.coins || {}).short || 'Coins')} held here</dt><dd>${fmtN(coin)}</dd></div>
            <div><dt>${esc((c.premium || {}).short || 'Premium')} held here</dt><dd>${fmtN(prem)}</dd></div>
          </dl>
          <button class="btn is-primary" type="button" data-enter="${esc(g.id)}">Enter</button>
        </div>
      </article>`;
    }).join('');
  }

  $('games').addEventListener('click', (e) => {
    const b = e.target.closest('[data-enter]');
    if (b) openPicker(games.find((g) => g.id === b.dataset.enter));
  });

  /* ---------- vault ---------- */

  const stars = (n) => '★'.repeat(Math.max(1, Math.min(7, n)));

  function cardHtml(c, opts) {
    const o = opts || {};
    const initials = esc(c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2));
    const img = c.art.portrait ? `<img src="${esc(c.art.portrait)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    const tag = o.button ? 'button' : 'div';
    return `
      <${tag} class="card el-${esc(c.element.toLowerCase())}${o.selected ? ' is-picked' : ''}" data-id="${esc(c.id)}"${o.button ? ` type="button" aria-pressed="${o.selected}"` : ''}>
        <span class="card-art"><span class="card-initials">${initials}</span>${img}<span class="card-rarity">${stars(c.rarity)}</span></span>
        <span class="card-body">
          <span class="card-name">${esc(c.name)}</span>
          <span class="card-meta"><span>Lv ${c.level}</span><span class="tag tag-el">${esc(c.element)}</span></span>
          <span class="card-src">${esc(gameName(c.sourceGame))}</span>
        </span>
      </${tag}>`;
  }

  function renderVault() {
    const all = Vault.all();
    const sources = [...new Set(all.map((c) => c.sourceGame))];
    if (ui.filter !== 'all' && !sources.includes(ui.filter)) ui.filter = 'all';
    const opts = [['all', 'All ' + all.length]].concat(sources.map((s) => [s, gameName(s)]));
    $('filters').innerHTML = opts.map(([id, l]) => `<button type="button" role="radio" aria-checked="${ui.filter === id}" class="${ui.filter === id ? 'is-on' : ''}" data-filter="${esc(id)}">${esc(l)}</button>`).join('');
    const list = ui.filter === 'all' ? all : all.filter((c) => c.sourceGame === ui.filter);
    $('vault').innerHTML = list.map((c) => cardHtml(c)).join('');
    $('vault-empty').hidden = all.length > 0;
  }

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) { ui.filter = b.dataset.filter; renderVault(); }
  });

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

  /* ---------- shared: tables ---------- */

  function rowHtml(id, cells, attrs) {
    return `<div class="tr" role="row" ${attrs || ''}>${cells.map((c) => `<div class="td ${c[1] || ''}" role="cell">${c[0]}</div>`).join('')}</div>`;
  }

  function assetCell(id) {
    return `<span class="asset">${assetIcon(id)}<span class="asset-text"><b>${esc(assetName(id))}</b><small>${esc(assetSub(id))}</small></span></span>`;
  }

  /* ---------- exchange ---------- */

  let exchangeBuilt = false;

  function fillSelect(sel, ids, keep) {
    const prev = keep || sel.value;
    sel.innerHTML = ids.map((id) => `<option value="${esc(id)}">${esc(assetName(id))}</option>`).join('');
    if (ids.includes(prev)) sel.value = prev;
  }

  function renderExchange() {
    const t = Bank.now();
    const ids = currencies();
    $('fx-table').innerHTML = rowHtml('', [['Currency'], ['Price', 'num'], ['24h', 'num'], ['7 days', 'spark-cell hide-sm'], ['You hold', 'num']], 'data-head') +
      ids.map((id) => {
        const q = Bank.quote(id);
        const held = Bank.bal(id);
        return rowHtml(id, [
          [assetCell(id)],
          [fmtP(q.mid), 'num'],
          [delta(Market.change(id, t, 1440)), 'num'],
          [Charts.spark(Market.history(id, t, 10080, 43)), 'spark-cell hide-sm'],
          [held ? `${fmtN(held)}<small>${fmtC(Bank.sellCents(id, held))}</small>` : '<span class="muted">—</span>', 'num stack'],
        ], `data-asset="${esc(id)}" tabindex="0"`);
      }).join('');

    if (!exchangeBuilt) {
      exchangeBuilt = true;
      const opts = ['credits'].concat(ids);
      fillSelect($('cv-from'), opts, ids[0]);
      fillSelect($('cv-to'), opts, ids[2] || 'credits');
      $('pair-range').innerHTML = RANGES.map(([l], i) => `<button type="button" role="radio" data-range="${i}">${l}</button>`).join('');
    }
    for (const b of $('pair-range').children) {
      const on = Number(b.dataset.range) === ui.pairRange;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on);
    }
    updateConvert();
    renderPair();
    renderOrderPanel();
  }

  $('fx-table').addEventListener('click', (e) => {
    const r = e.target.closest('[data-asset]');
    if (!r) return;
    $('cv-from').value = r.dataset.asset;
    if ($('cv-to').value === r.dataset.asset) $('cv-to').value = 'credits';
    updateConvert(); renderPair();
  });

  function convertArgs() {
    const from = $('cv-from').value, to = $('cv-to').value;
    const raw = $('cv-qty').value.trim();
    let qty = Math.floor(Number(raw));
    if (from === 'credits') qty = Math.floor(Number(raw) * 100); // credits are typed in ◈, held in cents
    return { from, to, qty, raw };
  }

  function updateConvert() {
    const { from, to, qty, raw } = convertArgs();
    const have = Bank.bal(from);
    $('cv-have').textContent = 'Available: ' + (from === 'credits' ? fmtC(have) : fmtN(have) + ' ' + assetName(from));
    $('cv-qty').step = from === 'credits' ? '0.01' : '1';
    const rows = [];
    if (from === to) rows.push(['', 'Pick two different currencies']);
    else {
      const unitFrom = from === 'credits' ? 1 : Bank.quote(from).bid;
      const unitTo = to === 'credits' ? 1 : Bank.quote(to).ask;
      rows.push(['Rate', `1 ${esc(assetName(from === 'credits' ? 'credits' : from))} = ${fmtRatio(unitFrom / unitTo)} ${esc(to === 'credits' ? 'Credits' : assetName(to))}`]);
      if (raw && qty > 0) {
        try {
          const p = Bank.preview(from, qty, to);
          rows.push(['You get', to === 'credits' ? fmtC(p.gotCents) : fmtN(p.outQty) + ' ' + esc(assetName(to))]);
          if (to !== 'credits' && p.leftoverCents) rows.push(['Change', fmtC(p.leftoverCents) + ' stays as credits']);
          const spread = ((from === 'credits' ? 0 : Market.asset(from).spread) + (to === 'credits' ? 0 : Market.asset(to).spread)) * 100;
          rows.push(['Spread', spread.toFixed(1) + '% (included)']);
        } catch (err) {
          rows.push(['', esc(err.message)]);
        }
      }
    }
    $('cv-quote').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  ['cv-from', 'cv-to'].forEach((id) => $(id).addEventListener('change', () => { updateConvert(); renderPair(); }));
  $('cv-qty').addEventListener('input', updateConvert);
  $('cv-max').addEventListener('click', () => {
    const from = $('cv-from').value;
    const have = Bank.bal(from);
    $('cv-qty').value = from === 'credits' ? (have / 100).toFixed(2) : have;
    updateConvert();
  });
  $('cv-swap').addEventListener('click', () => {
    const a = $('cv-from').value;
    $('cv-from').value = $('cv-to').value;
    $('cv-to').value = a;
    updateConvert(); renderPair();
  });
  $('convert-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { from, to, qty } = convertArgs();
    const msg = $('cv-msg');
    try {
      const p = Bank.convert(from, qty, to);
      msg.className = 'form-msg is-ok';
      msg.textContent = 'Converted. You got ' + (to === 'credits' ? fmtC(p.gotCents) : fmtN(p.outQty) + ' ' + assetName(to)) + '.';
      $('cv-qty').value = '';
    } catch (err) {
      msg.className = 'form-msg is-error';
      msg.textContent = err.message;
    }
    render();
  });

  // Pair chart: how many TO one FROM buys, over time (mid prices).
  function renderPair() {
    const from = $('cv-from').value, to = $('cv-to').value;
    const [label, span, pts] = RANGES[ui.pairRange];
    const t = Bank.now();
    const series = (id) => (id === 'credits' ? null : Market.history(id, t, span, pts));
    const a = series(from), b = series(to);
    let points;
    if (from === to) points = [];
    else if (!a) points = b.map((p) => ({ t: p.t, v: 1 / p.v }));
    else if (!b) points = a;
    else points = a.map((p, i) => ({ t: p.t, v: p.v / b[i].v }));
    const unitTo = to === 'credits' ? 'Credits' : assetName(to);
    $('pair-title').textContent = `1 ${from === 'credits' ? 'Credit' : assetName(from)} in ${unitTo}`;
    if (points.length) {
      const vals = points.map((p) => p.v);
      const first = vals[0], last = vals[vals.length - 1];
      $('pair-stats').innerHTML = `
        <div class="kpi"><small>Now</small><b>${fmtRatio(last)}</b></div>
        <div class="kpi"><small>${label} change</small><b>${delta(last / first - 1)}</b></div>
        <div class="kpi"><small>${label} high</small><b>${fmtRatio(Math.max(...vals))}</b></div>
        <div class="kpi"><small>${label} low</small><b>${fmtRatio(Math.min(...vals))}</b></div>`;
    } else $('pair-stats').innerHTML = '';
    Charts.line($('pair-chart'), points, { format: fmtRatio, time: timeAxis(span), title: $('pair-title').textContent });
  }

  $('pair-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    ui.pairRange = Number(b.dataset.range);
    renderExchange();
  });

  /* ---------- shared: target (limit) orders ---------- */

  // A trade box for one or more assets. Builds its form once; refresh()
  // updates prices and estimates without touching what the player typed.
  function tradeBox(host, opts) {
    host.innerHTML = `
      <div class="panel-head"><h3>${esc(opts.title)}</h3><small>${esc(opts.sub || '')}</small></div>
      <form class="form trade" autocomplete="off">
        <div class="seg seg-full" data-k="side" role="radiogroup" aria-label="Side">
          <button type="button" role="radio" data-v="buy" class="is-on" aria-checked="true">Buy</button>
          <button type="button" role="radio" data-v="sell" aria-checked="false">Sell</button>
        </div>
        ${opts.assets ? `<label class="field"><span>Currency</span><div class="field-row"><select data-k="asset"></select></div></label>` : ''}
        <div class="seg seg-full seg-sm" data-k="type" role="radiogroup" aria-label="Order type">
          <button type="button" role="radio" data-v="market" class="${opts.targetOnly ? '' : 'is-on'}" aria-checked="${!opts.targetOnly}" ${opts.targetOnly ? 'hidden' : ''}>Now</button>
          <button type="button" role="radio" data-v="limit" class="${opts.targetOnly ? 'is-on' : ''}" aria-checked="${!!opts.targetOnly}">At target price</button>
        </div>
        <label class="field"><span data-k="qty-label">Quantity</span>
          <div class="field-row"><input data-k="qty" type="number" inputmode="numeric" min="1" step="1" placeholder="0"><button type="button" class="chip" data-k="max">Max</button></div>
        </label>
        <label class="field" data-k="limit-field"><span>Target price (◈ per unit)</span>
          <div class="field-row"><input data-k="limit" type="number" inputmode="decimal" min="0" step="any" placeholder="0.00"></div>
          <small class="field-hint" data-k="limit-hint"></small>
        </label>
        <dl class="quote" data-k="quote"></dl>
        <button class="btn is-primary is-block" type="submit" data-k="go">Buy</button>
        <p class="form-msg" data-k="msg" role="status" aria-live="polite"></p>
      </form>`;
    const q = (k) => host.querySelector(`[data-k="${k}"]`);
    const state = { side: 'buy', type: opts.targetOnly ? 'limit' : 'market' };
    if (opts.assets) fillSelect(q('asset'), opts.assets());
    const assetId = () => (opts.assets ? q('asset').value : opts.asset());

    function setSeg(seg, v) {
      for (const b of seg.children) { const on = b.dataset.v === v; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); }
    }
    q('side').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { state.side = b.dataset.v; setSeg(q('side'), state.side); refresh(); } });
    q('type').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { state.type = b.dataset.v; setSeg(q('type'), state.type); refresh(); } });
    ['qty', 'limit'].forEach((k) => q(k).addEventListener('input', refresh));
    if (opts.assets) q('asset').addEventListener('change', () => { q('limit').value = ''; refresh(); });
    q('max').addEventListener('click', () => {
      const id = assetId();
      const quote = Bank.quote(id);
      if (state.side === 'sell') q('qty').value = Bank.bal(id);
      else {
        const per = state.type === 'limit' && Number(q('limit').value) > 0 ? Number(q('limit').value) : quote.ask;
        q('qty').value = Math.max(0, Math.floor(Bank.bal('credits') / (per * 100) - 1e-9));
      }
      refresh();
    });

    function refresh() {
      const id = assetId();
      if (!id) return;
      const quote = Bank.quote(id);
      const qty = Math.floor(Number(q('qty').value));
      const limit = Number(q('limit').value);
      q('limit-field').hidden = state.type !== 'limit';
      q('qty-label').textContent = Market.asset(id).kind === 'stock' ? 'Shares' : 'Amount of ' + assetName(id);
      q('limit-hint').textContent = state.side === 'buy'
        ? 'Fills when the ask is at or below this. Now: ' + fmtP(quote.ask)
        : 'Fills when the bid is at or above this. Now: ' + fmtP(quote.bid);
      const rows = [];
      rows.push(state.side === 'buy' ? ['Ask', fmtP(quote.ask)] : ['Bid', fmtP(quote.bid)]);
      rows.push([state.side === 'buy' ? 'Credits' : 'You hold', state.side === 'buy' ? fmtC(Bank.bal('credits')) : fmtN(Bank.bal(id))]);
      if (qty > 0) {
        if (state.type === 'market') rows.push([state.side === 'buy' ? 'Cost' : 'You get', fmtC(state.side === 'buy' ? Bank.buyCents(id, qty) : Bank.sellCents(id, qty))]);
        else if (limit > 0) rows.push([state.side === 'buy' ? 'Set aside' : 'You get if filled', fmtC(state.side === 'buy' ? Math.ceil(qty * limit * 100 - 1e-9) : Math.floor(qty * limit * 100 + 1e-9))]);
      }
      if (state.type === 'limit') rows.push(['Expires', 'in 7 days, unused funds return']);
      q('quote').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      q('go').textContent = (state.type === 'limit' ? 'Place ' : '') + (state.side === 'buy' ? 'Buy' : 'Sell') + (state.type === 'limit' ? ' order' : '');
      q('go').classList.toggle('is-sell', state.side === 'sell');
    }

    host.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = assetId();
      const qty = Math.floor(Number(q('qty').value));
      const msg = q('msg');
      try {
        if (state.type === 'market') {
          const cents = state.side === 'buy' ? Bank.buy(id, qty) : Bank.sell(id, qty);
          msg.textContent = (state.side === 'buy' ? 'Bought ' : 'Sold ') + fmtN(qty) + ' ' + Bank.label(id, qty) + ' for ' + fmtC(cents) + '.';
        } else {
          const o = Bank.placeOrder({ id, side: state.side, qty, limit: Number(q('limit').value) });
          msg.textContent = 'Order placed: ' + o.side + ' ' + fmtN(o.qty) + ' at ' + fmtP(o.limit) + '. Track it in Activity.';
        }
        msg.className = 'form-msg is-ok';
        q('qty').value = '';
      } catch (err) {
        msg.className = 'form-msg is-error';
        msg.textContent = err.message;
      }
      render();
    });

    refresh();
    return { refresh, assetId };
  }

  let fxBox = null;
  function renderOrderPanel() {
    if (!fxBox) {
      fxBox = tradeBox($('fx-order-panel'), {
        title: 'Target orders',
        sub: 'Buy or sell a currency for credits when it reaches your price',
        assets: currencies,
        targetOnly: true,
      });
    }
    fxBox.refresh();
  }

  /* ---------- markets ---------- */

  let stockBox = null;
  let detailFor = null;

  function renderMarkets() {
    const t = Bank.now();
    const news = Market.news(t, 3).slice(0, 12);
    $('ticker').innerHTML = news.length
      ? `<span class="ticker-label">News</span><div class="ticker-track">${news.map((n) =>
        `<button type="button" class="ticker-item" data-asset="${esc(n.id)}"><b>${esc(n.sym)}</b> <span class="delta ${n.up ? 'is-up' : 'is-down'}">${n.up ? '▲' : '▼'}</span> ${esc(n.text)} <time>${esc(timeShort(n.t))}</time></button>`).join('')}</div>`
      : '<span class="ticker-label">News</span><span class="muted">Quiet markets today.</span>';

    const ids = stocks();
    if (!ui.stock || !ids.includes(ui.stock)) ui.stock = ids[0];
    $('stock-table').innerHTML = rowHtml('', [['Company'], ['Price', 'num'], ['24h', 'num'], ['1 day', 'spark-cell hide-sm'], ['Owned', 'num hide-xs']], 'data-head') +
      ids.map((id) => rowHtml(id, [
        [assetCell(id)],
        [fmtP(Bank.quote(id).mid), 'num'],
        [delta(Market.change(id, t, 1440)), 'num'],
        [Charts.spark(Market.history(id, t, 1440, 49)), 'spark-cell hide-sm'],
        [Bank.bal(id) ? fmtN(Bank.bal(id)) : '<span class="muted">—</span>', 'num hide-xs'],
      ], `data-asset="${esc(id)}" tabindex="0" aria-selected="${id === ui.stock}" class="${id === ui.stock ? 'is-selected' : ''}"`)).join('');
    renderStockDetail();
  }

  function selectStock(id) {
    if (!Market.asset(id)) return;
    ui.stock = id;
    renderMarkets();
    if (window.matchMedia('(max-width: 1100px)').matches) $('stock-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('stock-table').addEventListener('click', (e) => { const r = e.target.closest('[data-asset]'); if (r) selectStock(r.dataset.asset); });
  $('stock-table').addEventListener('keydown', (e) => { const r = e.target.closest('[data-asset]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectStock(r.dataset.asset); } });
  $('ticker').addEventListener('click', (e) => { const r = e.target.closest('[data-asset]'); if (r) selectStock(r.dataset.asset); });

  function renderStockDetail() {
    const id = ui.stock;
    const a = Market.asset(id);
    const host = $('stock-detail');
    if (detailFor !== id) {
      detailFor = id;
      host.innerHTML = `
        <div class="detail-head">
          ${assetIcon(id, 'lg')}
          <div class="detail-name"><h3>${esc(a.name)}</h3><small>${esc(a.short)} · ${esc(a.sector)}</small></div>
          <div class="detail-price"><b data-d="price"></b><span data-d="chg"></span></div>
        </div>
        <div class="seg seg-sm" data-d="range" role="radiogroup" aria-label="Range">${RANGES.map(([l], i) => `<button type="button" role="radio" data-range="${i}">${l}</button>`).join('')}</div>
        <div class="chart-host" data-d="chart"></div>
        <div class="kpis" data-d="stats"></div>
        <div class="trade-host" data-d="trade"></div>`;
      host.querySelector('[data-d="range"]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-range]');
        if (b) { ui.stockRange = Number(b.dataset.range); renderStockDetail(); }
      });
      stockBox = tradeBox(host.querySelector('[data-d="trade"]'), { title: 'Trade ' + a.short, sub: 'Spread ' + (a.spread * 200).toFixed(1) + '% round trip', asset: () => ui.stock });
    }
    const d = (k) => host.querySelector(`[data-d="${k}"]`);
    const t = Bank.now();
    const [label, span, pts] = RANGES[ui.stockRange];
    for (const b of d('range').children) { const on = Number(b.dataset.range) === ui.stockRange; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); }
    const q = Bank.quote(id);
    d('price').textContent = fmtP(q.mid);
    d('chg').innerHTML = delta(Market.change(id, t, span)) + ` <small class="muted">${label}</small>`;
    const held = Bank.bal(id);
    const avg = held ? Bank.basis(id) / held / 100 : 0;
    const pts2 = Market.history(id, t, span, pts);
    Charts.line(d('chart'), pts2, { format: fmtP, time: timeAxis(span), title: a.name, ref: avg || undefined, refLabel: 'Your avg' });
    const vals = pts2.map((p) => p.v);
    const value = Bank.sellCents(id, held);
    const pl = held ? value - Bank.basis(id) : 0;
    d('stats').innerHTML = `
      <div class="kpi"><small>Bid / Ask</small><b>${fmtP(q.bid)} / ${fmtP(q.ask)}</b></div>
      <div class="kpi"><small>${label} high / low</small><b>${fmtP(Math.max(...vals))} / ${fmtP(Math.min(...vals))}</b></div>
      <div class="kpi"><small>You own</small><b>${held ? fmtN(held) + ' · ' + fmtC(value) : '—'}</b></div>
      <div class="kpi"><small>Profit / loss</small><b>${held ? `<span class="delta ${pl >= 0 ? 'is-up' : 'is-down'}">${pl >= 0 ? '▲ +' : '▼ −'}${fmtC(Math.abs(pl))}</span>` : '—'}</b></div>`;
    stockBox.refresh();
  }

  /* ---------- activity ---------- */

  function renderActivity() {
    const held = Bank.holdings();
    $('holdings-table').innerHTML = held.length
      ? rowHtml('', [['Asset'], ['Amount', 'num'], ['Value', 'num'], ['P/L', 'num hide-xs']], 'data-head') +
        held.map((id) => {
          const n = Bank.bal(id);
          const v = Bank.sellCents(id, n);
          const isStock = Market.asset(id).kind === 'stock';
          const pl = isStock ? v - Bank.basis(id) : null;
          return rowHtml(id, [[assetCell(id)], [fmtN(n), 'num'], [fmtC(v), 'num'],
            [pl == null ? '<span class="muted">—</span>' : `<span class="delta ${pl >= 0 ? 'is-up' : 'is-down'}">${pl >= 0 ? '▲ +' : '▼ −'}${fmtC(Math.abs(pl))}</span>`, 'num hide-xs']]);
        }).join('')
      : '<p class="muted pad">Nothing yet. Send currency from a game, then convert or invest it here.</p>';

    const orders = Bank.orders();
    $('orders-table').innerHTML = orders.length
      ? rowHtml('', [['Order'], ['Target', 'num'], ['Status', 'num']], 'data-head') +
        orders.map((o) => rowHtml(o.id, [
          [`<span class="asset">${assetIcon(o.assetId)}<span class="asset-text"><b>${o.side === 'buy' ? 'Buy' : 'Sell'} ${fmtN(o.qty)} ${esc(Market.asset(o.assetId).short)}</b><small>Placed ${esc(timeShort(Market.timeOf(o.placed)))}</small></span></span>`],
          [fmtP(o.limit), 'num'],
          [o.status === 'open' ? `<button class="chip" type="button" data-cancel="${esc(o.id)}">Cancel</button>` : `<span class="status status-${esc(o.status)}">${esc(o.status)}</span>`, 'num'],
        ])).join('')
      : '<p class="muted pad">No orders. Set a target price on the Exchange or Markets page.</p>';

    const L = Bank.ledger().slice(0, 60);
    $('ledger').innerHTML = L.length ? L.map(ledgerRow).join('') : '<li class="muted pad">No activity yet.</li>';
  }

  $('orders-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    try { Bank.cancelOrder(b.dataset.cancel); toast('Order cancelled; funds returned'); } catch (err) { toast(err.message); }
    render();
  });

  function ledgerRow(e) {
    const n = (id, q) => (id === 'credits' ? fmtC(q) : fmtN(q) + ' ' + Bank.label(id, q));
    let icon = e.id || e.from || 'credits', text, amount = '', cls = '';
    switch (e.type) {
      case 'deposit': text = `Received from ${esc(gameName(e.gameId))}`; amount = '+' + n(e.id, e.qty); cls = e.ok ? 'is-up' : ''; break;
      case 'withdraw': text = `Sent to ${esc(gameName(e.gameId))}`; amount = '−' + n(e.id, e.qty); break;
      case 'convert': icon = e.to; text = `Converted ${esc(n(e.from, e.qty))}`; amount = '+' + (e.to === 'credits' ? fmtC(e.outQty) : n(e.to, e.outQty)); cls = 'is-up'; break;
      case 'buy': text = `Bought ${esc(n(e.id, e.qty))}`; amount = '−' + fmtC(e.cents); break;
      case 'sell': text = `Sold ${esc(n(e.id, e.qty))}`; amount = '+' + fmtC(e.cents); cls = 'is-up'; break;
      case 'order': text = `Order placed: ${e.side} ${esc(n(e.id, e.qty))} at ${fmtP(e.limit)}`; break;
      case 'filled': text = `Order filled: ${e.side === 'buy' ? 'bought' : 'sold'} ${esc(n(e.id, e.qty))} at ${fmtP(e.limit)}`; amount = (e.side === 'buy' ? '−' : '+') + fmtC(e.cents); cls = e.side === 'sell' ? 'is-up' : ''; break;
      case 'order-cancelled': text = `Order cancelled: ${e.side} ${esc(n(e.id, e.qty))}`; break;
      case 'order-expired': text = `Order expired: ${e.side} ${esc(n(e.id, e.qty))}`; break;
      default: text = esc(e.type);
    }
    const refused = e.ok === false;
    return `<li class="${refused ? 'is-refused' : ''}">${assetIcon(icon)}<span class="ledger-text">${text}${refused ? ' · refused' : ''}<time>${esc(timeShort(e.at))}</time></span><b class="ledger-amt ${refused ? '' : cls}">${refused ? '' : amount}</b></li>`;
  }

  /* ---------- party picker ---------- */

  let picking = null;
  const picked = new Set();
  const maxFor = (g) => Math.min(SDK.MAX_PARTY, g.maxParty || SDK.MAX_PARTY);

  function renderPicker() {
    const all = Vault.all();
    $('party-grid').innerHTML = all.map((c) => cardHtml(c, { button: true, selected: picked.has(c.id) })).join('');
    $('party-empty').hidden = all.length > 0;
    $('party-count').textContent = picked.size + ' / ' + maxFor(picking);
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
    PortalBridge.open(game, $('play-frame'), cards, (type, data) => {
      if (type === 'connected') { $('play-status').textContent = 'Connected'; $('play-status').classList.add('is-on'); }
      else if (type === 'grant') toast(data.name + ' added to the vault');
      else if (type === 'update') toast(data.name + ' is now Lv ' + data.level);
      else if (type === 'deposit') toast('+' + fmtN(data.amount) + ' ' + assetName(data.id) + ' at the Portal');
      else if (type === 'withdraw') toast(fmtN(data.amount) + ' ' + assetName(data.id) + ' sent to ' + game.name);
      else if (type === 'exit') leave();
    });
  }

  function leave() {
    PortalBridge.close();
    $('play').hidden = true;
    document.body.classList.remove('is-playing');
    render();
  }

  $('leave-btn').addEventListener('click', leave);

  /* ---------- boot ---------- */

  function defineAssets(stockList) {
    for (const g of games) {
      for (const tier of ['coins', 'premium']) {
        const c = (g.currencies || {})[tier];
        if (!c) continue;
        Market.define({
          id: g.id + ':' + tier, kind: 'currency', game: g.id, tier,
          name: c.name, short: c.short || c.name, glyph: c.glyph,
          base: c.base, vol: c.vol, spread: c.spread,
        });
      }
    }
    for (const s of stockList) {
      Market.define({
        id: 'stock:' + s.sym, kind: 'stock', name: s.name, short: s.sym, sector: s.sector,
        base: s.base, vol: s.vol, beta: s.beta, spread: 0.004, up: s.up, down: s.down,
      });
    }
  }

  function tick() {
    for (const o of Bank.settle()) {
      const a = Market.asset(o.assetId);
      toast(o.status === 'filled'
        ? `Order filled: ${o.side} ${fmtN(o.qty)} ${a ? a.short : ''} at ${fmtP(o.limit)}`
        : `Order expired: ${o.side} ${fmtN(o.qty)} ${a ? a.short : ''}`);
    }
    if ($('play').hidden) render();
  }

  Vault.onChange(() => { if ($('play').hidden) render(); else renderTop(); });

  const getJSON = (u) => fetch(u).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  Promise.all([getJSON('games.json'), getJSON('data/stocks.json')]).then(([g, s]) => {
    games = Array.isArray(g) ? g : [];
    defineAssets(Array.isArray(s) ? s : []);
    Bank.settle();
    go();
    // Prices are per minute; check orders and refresh twice a minute.
    setInterval(tick, 30000);
  });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (route === 'exchange') renderPair(); if (route === 'markets') renderStockDetail(); }, 150); });
})();
