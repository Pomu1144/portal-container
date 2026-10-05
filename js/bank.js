/* js/bank.js — the Portal's money: balances, conversions, stock trades,
 * limit orders, and the ledger. Prices come from js/market.js.
 * ---------------------------------------------------------------------------
 * Units
 *   credits          Portal Credits, stored as whole cents (◈1.00 = 100)
 *   <game>:coins     a game's soft currency (Ryo, JP, …), whole units
 *   <game>:premium   a game's premium currency (Pearls, Cubes, …), whole units
 *   stock:<SYM>      whole shares
 *
 * Games deposit and withdraw only their own two currencies (the protocol in
 * sdk/portal-sdk.js). Everything else happens here: sell an asset for
 * credits at its bid, buy one at its ask, or convert one into another in a
 * single step. Rounding always goes against the player, so no round trip
 * can create money.
 *
 * Time only moves forward: trades use max(device clock, last time seen), so
 * winding the clock back cannot replay an old price.
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const KEY = 'portal_bank_v1';
  const SCHEMA = 1;
  const LEDGER_MAX = 400;
  const TX_KEYS_MAX = 2000;
  const ORDER_DAYS = 7;
  const MAX_OPEN_ORDERS = 20;
  const listeners = new Set();

  function blank() {
    return {
      schema: SCHEMA,
      salt: (Math.random() * 4294967296) >>> 0, // this player's market
      lastSeen: 0,
      balances: { credits: 0 },
      basis: {},     // stock:<SYM> → total cents paid for the shares held
      orders: [],
      ledger: [],
      txKeys: [],    // '<game>:<txId>' already applied, with their result
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.schema === SCHEMA && s.balances) return s;
    } catch (_) { /* fall through */ }
    return blank();
  }

  let state = load();
  Market.setSalt(state.salt);

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('[Bank] save failed', e); }
    listeners.forEach((fn) => { try { fn(); } catch (_) {} });
  }

  global.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    Market.setSalt(state.salt);
    listeners.forEach((fn) => { try { fn(); } catch (_) {} });
  });

  /* ---------- clock ---------- */

  function now() {
    const t = Math.max(Date.now(), state.lastSeen || 0);
    if (t - state.lastSeen > 30000) { state.lastSeen = t; save(); }
    return t;
  }

  /* ---------- helpers ---------- */

  const bal = (id) => Math.max(0, Math.floor(state.balances[id] || 0));
  const add = (id, n) => { state.balances[id] = bal(id) + n; if (!state.balances[id] && id !== 'credits') delete state.balances[id]; };
  const isStock = (id) => id.startsWith('stock:');
  const fail = (msg) => { const e = new Error(msg); e.refused = true; throw e; };

  function asset(id) {
    const a = Market.asset(id);
    if (!a) fail('Unknown asset');
    return a;
  }

  function wholeQty(n) {
    if (!Number.isInteger(n) || n < 1 || n > 1e12) fail('Enter a whole amount of at least 1');
    return n;
  }

  function log(entry) {
    state.ledger.unshift(Object.assign({ at: now() }, entry));
    state.ledger.length = Math.min(state.ledger.length, LEDGER_MAX);
  }

  // Share of the cost basis that leaves with `qty` shares.
  function takeBasis(id, qty) {
    if (!isStock(id)) return 0;
    const held = bal(id);
    const b = state.basis[id] || 0;
    const part = held ? Math.round(b * qty / held) : 0;
    state.basis[id] = b - part;
    if (held - qty <= 0) delete state.basis[id];
    return part;
  }

  /* ---------- quotes ---------- */

  function quote(id) {
    if (id === 'credits') return { mid: 1, bid: 1, ask: 1 };
    asset(id);
    return Market.quote(id, now());
  }

  const sellCents = (id, qty) => Math.floor(qty * quote(id).bid * 100 + 1e-9);
  const buyCents = (id, qty) => Math.ceil(qty * quote(id).ask * 100 - 1e-9);

  /**
   * What converting `qty` of `from` into `to` would give right now.
   * `from` = 'credits' means qty is cents. Returns
   * { gotCents, outQty, spentCents, leftoverCents }.
   */
  function preview(from, qty, to) {
    if (from === to) fail('Pick two different assets');
    const gotCents = from === 'credits' ? qty : sellCents(from, qty);
    if (to === 'credits') return { gotCents, outQty: gotCents, spentCents: 0, leftoverCents: gotCents };
    const unitCents = quote(to).ask * 100;
    let outQty = Math.floor(gotCents / unitCents + 1e-9);
    while (outQty > 0 && buyCents(to, outQty) > gotCents) outQty--;
    const spentCents = outQty ? buyCents(to, outQty) : 0;
    return { gotCents, outQty, spentCents, leftoverCents: gotCents - spentCents };
  }

  /* ---------- trading ---------- */

  /** Convert `qty` of `from` into as much `to` as it buys; change stays in credits. */
  function convert(from, qty, to) {
    wholeQty(qty);
    if (from !== 'credits') asset(from);
    if (to !== 'credits') asset(to);
    if (bal(from) < qty) fail('Not enough ' + label(from));
    const p = preview(from, qty, to);
    if (to !== 'credits' && p.outQty < 1) fail('Too small to buy one ' + label(to, 1));
    const basisOut = takeBasis(from, qty);
    add(from, -qty);
    if (from !== 'credits') add('credits', p.gotCents);
    if (to !== 'credits') {
      add('credits', -p.spentCents);
      add(to, p.outQty);
      if (isStock(to)) state.basis[to] = (state.basis[to] || 0) + p.spentCents;
    }
    log({ type: 'convert', from, qty, to, outQty: p.outQty, cents: p.gotCents, basisOut });
    save();
    return p;
  }

  /** Buy `qty` units of `id` with credits. */
  function buy(id, qty) {
    wholeQty(qty);
    asset(id);
    const cost = buyCents(id, qty);
    if (bal('credits') < cost) fail('Not enough credits');
    add('credits', -cost);
    add(id, qty);
    if (isStock(id)) state.basis[id] = (state.basis[id] || 0) + cost;
    log({ type: 'buy', id, qty, cents: cost });
    save();
    return cost;
  }

  /** Sell `qty` units of `id` for credits. */
  function sell(id, qty) {
    wholeQty(qty);
    asset(id);
    if (bal(id) < qty) fail('Not enough ' + label(id));
    const got = sellCents(id, qty);
    const basisOut = takeBasis(id, qty);
    add(id, -qty);
    add('credits', got);
    log({ type: 'sell', id, qty, cents: got, basisOut });
    save();
    return got;
  }

  /* ---------- limit orders ---------- */

  /**
   * Place a limit order. buy: fills when the ask is at or below `limit`
   * (credits per unit); the cost is set aside now. sell: fills when the bid
   * is at or above `limit`; the units are set aside now. Orders fill at the
   * limit price and expire after 7 days, returning what was set aside.
   */
  function placeOrder({ id, side, qty, limit }) {
    asset(id);
    wholeQty(qty);
    if (side !== 'buy' && side !== 'sell') fail('Bad order side');
    if (!(limit > 0) || !isFinite(limit)) fail('Enter a target price above 0');
    if (state.orders.filter((o) => o.status === 'open').length >= MAX_OPEN_ORDERS) fail('Too many open orders (max ' + MAX_OPEN_ORDERS + ')');
    const m = Market.minuteOf(now());
    const order = {
      id: 'o_' + m.toString(36) + Math.random().toString(36).slice(2, 7),
      assetId: id, side, qty, limit,
      placed: m, checked: m, expires: m + ORDER_DAYS * 1440, status: 'open',
    };
    if (side === 'buy') {
      order.reserved = Math.ceil(qty * limit * 100 - 1e-9);
      if (bal('credits') < order.reserved) fail('Not enough credits to cover the order');
      add('credits', -order.reserved);
    } else {
      if (bal(id) < qty) fail('Not enough ' + label(id));
      order.basisOut = takeBasis(id, qty);
      add(id, -qty);
      order.reserved = qty;
    }
    state.orders.unshift(order);
    log({ type: 'order', id, side, qty, limit, orderId: order.id });
    save();
    return order;
  }

  function release(o) {
    if (o.side === 'buy') add('credits', o.reserved);
    else {
      add(o.assetId, o.qty);
      if (isStock(o.assetId)) state.basis[o.assetId] = (state.basis[o.assetId] || 0) + (o.basisOut || 0);
    }
  }

  function cancelOrder(orderId) {
    const o = state.orders.find((x) => x.id === orderId && x.status === 'open');
    if (!o) fail('Order is no longer open');
    release(o);
    o.status = 'cancelled';
    o.closed = Market.minuteOf(now());
    log({ type: 'order-cancelled', id: o.assetId, side: o.side, qty: o.qty, limit: o.limit, orderId: o.id });
    save();
  }

  /** Check open orders against every minute since they were last checked. */
  function settle() {
    const nowM = Market.minuteOf(now());
    let changed = false;
    const events = [];
    for (const o of state.orders) {
      if (o.status !== 'open') continue;
      const end = Math.min(nowM, o.expires);
      let filledAt = 0;
      for (let m = o.checked + 1; m <= end; m++) {
        const q = Market.quoteAtMinute(o.assetId, m);
        if ((o.side === 'buy' && q.ask <= o.limit) || (o.side === 'sell' && q.bid >= o.limit)) { filledAt = m; break; }
      }
      o.checked = filledAt || end;
      changed = true;
      if (filledAt) {
        o.status = 'filled';
        o.closed = filledAt;
        if (o.side === 'buy') {
          add(o.assetId, o.qty);
          if (isStock(o.assetId)) state.basis[o.assetId] = (state.basis[o.assetId] || 0) + o.reserved;
          log({ type: 'filled', id: o.assetId, side: 'buy', qty: o.qty, limit: o.limit, cents: o.reserved, orderId: o.id, at: Market.timeOf(filledAt) });
        } else {
          const got = Math.floor(o.qty * o.limit * 100 + 1e-9);
          add('credits', got);
          log({ type: 'filled', id: o.assetId, side: 'sell', qty: o.qty, limit: o.limit, cents: got, basisOut: o.basisOut, orderId: o.id, at: Market.timeOf(filledAt) });
        }
        events.push(o);
      } else if (nowM >= o.expires) {
        o.status = 'expired';
        o.closed = o.expires;
        release(o);
        log({ type: 'order-expired', id: o.assetId, side: o.side, qty: o.qty, limit: o.limit, orderId: o.id });
        events.push(o);
      }
    }
    // Keep closed orders for a while so the player can see what happened.
    const keepFrom = nowM - 14 * 1440;
    state.orders = state.orders.filter((o) => o.status === 'open' || (o.closed || 0) >= keepFrom).slice(0, 100);
    if (changed) save();
    return events;
  }

  /* ---------- game transfers (protocol) ---------- */

  /**
   * Apply a game's deposit/withdraw once. key = '<game>:<txId>'. A repeated
   * key returns the first result and changes nothing.
   */
  function transfer(key, type, id, amount, meta) {
    const seen = state.txKeys.find((k) => k.key === key);
    if (seen) return { ok: seen.ok, error: seen.error, replay: true };
    let result;
    if (!Market.asset(id) || !(amount >= 1)) result = { ok: false, error: 'Bad transfer' };
    else if (type === 'withdraw' && bal(id) < amount) result = { ok: false, error: 'Not enough ' + label(id) + ' at the Portal' };
    else {
      add(id, type === 'deposit' ? amount : -amount);
      result = { ok: true };
    }
    state.txKeys.unshift({ key, ok: result.ok, error: result.error });
    state.txKeys.length = Math.min(state.txKeys.length, TX_KEYS_MAX);
    log(Object.assign({ type, id, qty: amount, ok: result.ok, error: result.error }, meta));
    save();
    return result;
  }

  /* ---------- reporting ---------- */

  function label(id, n) {
    if (id === 'credits') return 'credits';
    const a = Market.asset(id);
    if (!a) return id;
    return a.kind === 'stock' ? a.short + (n === 1 ? ' share' : ' shares') : a.name;
  }

  /** Total value of everything at the bid, in cents (open orders included). */
  function netWorthCents() {
    let total = bal('credits');
    for (const id of Object.keys(state.balances)) if (id !== 'credits' && Market.asset(id)) total += sellCents(id, bal(id));
    for (const o of state.orders) {
      if (o.status !== 'open') continue;
      total += o.side === 'buy' ? o.reserved : sellCents(o.assetId, o.qty);
    }
    return total;
  }

  global.Bank = {
    now,
    bal,
    quote,
    preview,
    convert,
    buy,
    sell,
    buyCents,
    sellCents,
    placeOrder,
    cancelOrder,
    settle,
    transfer,
    label,
    netWorthCents,
    holdings: () => Object.keys(state.balances).filter((id) => id !== 'credits' && bal(id) > 0),
    basis: (id) => state.basis[id] || 0,
    orders: () => state.orders.slice(),
    ledger: () => state.ledger.slice(),
    onChange: (fn) => listeners.add(fn),
  };
})(window);
