/* js/market.js — the Portal Exchange price engine.
 * ---------------------------------------------------------------------------
 * Every tradable asset (each game's currencies and the fake stocks) has a
 * price in Portal Credits (◈) that is a pure function of (player salt, asset,
 * minute). Nothing is stored and nothing ticks: the price at any minute, past
 * or present, is computed on demand. That gives
 *   - prices that keep moving while the hub is closed,
 *   - history for charts without saving it,
 *   - limit orders that can be checked against every minute since they were
 *     placed (js/bank.js),
 *   - no way to change a price by reloading.
 *
 * Shape of a price path: log(price) = log(base) + layered smooth noise at
 * several time scales (30 min … 2 weeks) + a market-wide factor for stocks +
 * occasional news shocks that decay over about a day. The noise is mean-
 * reverting, so prices wander around their base value instead of drifting
 * off — a game economy should not inflate forever.
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const MINUTE = 60000;
  const EPOCH = Date.UTC(2026, 0, 1);
  // [period in minutes, weight] — short wiggles to multi-week swings.
  const LAYERS = [[30, 0.10], [240, 0.22], [1440, 0.42], [4320, 0.62], [20160, 1.0]];
  const NEWS_CHANCE = 0.12;   // chance an asset has a news event on a given day
  const NEWS_DECAY = 1440;    // minutes for a shock to fade to ~37%

  /* ---------- deterministic noise ---------- */

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function hash2(a, b) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15 | 0, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return h >>> 0;
  }

  const unit = (seed, i) => hash2(seed, i) / 4294967296;      // [0, 1)
  const signed = (seed, i) => unit(seed, i) * 2 - 1;           // [-1, 1)

  // Smooth value noise in [-1, 1].
  function vnoise(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return signed(seed, i) * (1 - u) + signed(seed, i + 1) * u;
  }

  function layered(m, seed) {
    let v = 0;
    for (let k = 0; k < LAYERS.length; k++) {
      const [period, w] = LAYERS[k];
      v += w * vnoise(m / period + k * 17.31, seed + k * 1013);
    }
    return v / 1.4; // keep a typical swing near ±vol
  }

  /* ---------- assets ---------- */

  let salt = 0;
  const assets = new Map(); // id → { id, kind, name, short, base, vol, spread, beta, seed, … }

  function define(a) {
    assets.set(a.id, Object.assign({ beta: 0, spread: 0.005 }, a, { seed: 0 }));
    reseed();
  }

  function reseed() {
    for (const a of assets.values()) a.seed = hash2(salt, hashStr(a.id));
  }

  /* ---------- news ---------- */

  // News events that can still move the price at minute m (started in the
  // last 3 days), newest first: [{ start, size }].
  function eventsAt(a, m) {
    const out = [];
    const day = Math.floor(m / 1440);
    for (let d = day; d >= day - 3; d--) {
      if (unit(a.seed ^ 0x5bd1e995, d) >= NEWS_CHANCE) continue;
      const start = d * 1440 + Math.floor(unit(a.seed ^ 0x27d4eb2f, d) * 1440);
      if (start > m) continue;
      const dir = unit(a.seed ^ 0x165667b1, d) < 0.5 ? -1 : 1;
      const size = dir * a.vol * (0.5 + unit(a.seed ^ 0x3c6ef372, d) * 0.7);
      out.push({ start, size, day: d });
    }
    return out;
  }

  /* ---------- prices ---------- */

  const minuteOf = (t) => Math.floor((t - EPOCH) / MINUTE);
  const timeOf = (m) => EPOCH + m * MINUTE;

  /** Mid price (credits per unit) at minute m. */
  function midAtMinute(id, m) {
    const a = assets.get(id);
    if (!a) return 0;
    let x = a.vol * layered(m, a.seed);
    if (a.beta) x += a.beta * 0.12 * layered(m, hash2(salt, 0x4d41524b)); // whole market
    for (const e of eventsAt(a, m)) x += e.size * Math.exp(-(m - e.start) / NEWS_DECAY);
    return a.base * Math.exp(x);
  }

  function quoteAtMinute(id, m) {
    const a = assets.get(id);
    const mid = midAtMinute(id, m);
    const s = a ? a.spread : 0;
    return { mid, bid: mid * (1 - s), ask: mid * (1 + s) };
  }

  /** Mid prices over the last `minutes` ending at time t, as `points` samples. */
  function history(id, t, minutes, points) {
    const end = minuteOf(t);
    const step = Math.max(1, Math.floor(minutes / (points - 1)));
    const out = [];
    for (let m = end - step * (points - 1); m <= end; m += step) out.push({ t: timeOf(m), v: midAtMinute(id, m) });
    return out;
  }

  function change(id, t, minutes) {
    const now = midAtMinute(id, minuteOf(t));
    const then = midAtMinute(id, minuteOf(t) - minutes);
    return then ? now / then - 1 : 0;
  }

  /** Headlines from the last `days` days across all stocks, newest first. */
  function news(t, days) {
    const m = minuteOf(t);
    const out = [];
    for (const a of assets.values()) {
      if (a.kind !== 'stock') continue;
      for (const e of eventsAt(a, m)) {
        if (m - e.start > days * 1440) continue;
        const pool = e.size > 0 ? a.up : a.down;
        if (!pool || !pool.length) continue;
        const text = pool[hash2(a.seed, e.day) % pool.length];
        out.push({ t: timeOf(e.start), id: a.id, sym: a.short, up: e.size > 0, text });
      }
    }
    return out.sort((x, y) => y.t - x.t);
  }

  global.Market = {
    MINUTE,
    define,
    setSalt(s) { salt = s >>> 0; reseed(); },
    asset: (id) => assets.get(id) || null,
    list: (kind) => [...assets.values()].filter((a) => !kind || a.kind === kind),
    minuteOf,
    timeOf,
    midAtMinute,
    quoteAtMinute,
    quote: (id, t) => quoteAtMinute(id, minuteOf(t)),
    history,
    change,
    news,
  };
})(window);
