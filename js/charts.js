/* js/charts.js — price charts drawn as inline SVG.
 *   Charts.spark(points)                  tiny trend line for tables
 *   Charts.line(el, points, opts)         full chart with axis, crosshair, tooltip
 * points: [{ t, v }]. Single series, so no legend: the panel title names it.
 * Gains and losses are never shown by colour alone — callers pair the
 * colour with ▲/▼ and a sign.
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function extent(points) {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    if (lo === hi) { lo *= 0.99; hi *= 1.01; }
    return [lo, hi];
  }

  // Three to five round tick values covering [lo, hi].
  function ticks(lo, hi) {
    const raw = (hi - lo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(v);
    return out;
  }

  /** Sparkline as an SVG string; trend class sets the stroke. */
  function spark(points, w = 96, h = 28) {
    if (!points.length) return '';
    const [lo, hi] = extent(points);
    const x = (i) => (i / (points.length - 1)) * (w - 2) + 1;
    const y = (v) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
    const d = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('');
    const up = points[points.length - 1].v >= points[0].v;
    return `<svg class="spark ${up ? 'is-up' : 'is-down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" preserveAspectRatio="none"><path d="${d}" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /**
   * Full chart into `host` (sized by CSS). opts:
   *   format(v) → string   value label     time(t) → string   time label
   *   ref                  optional reference value drawn as a dashed line (e.g. your average cost)
   *   refLabel             label for it
   */
  function line(host, points, opts) {
    const o = opts || {};
    const fmt = o.format || ((v) => v.toFixed(2));
    const tfmt = o.time || ((t) => new Date(t).toLocaleString());
    host.textContent = '';
    if (points.length < 2) return;
    const W = Math.max(280, host.clientWidth || 600);
    const H = Math.max(160, host.clientHeight || 260);
    const pad = { l: 8, r: 64, t: 12, b: 24 };
    let [lo, hi] = extent(points);
    if (o.ref) { lo = Math.min(lo, o.ref); hi = Math.max(hi, o.ref); }
    const span = hi - lo;
    lo -= span * 0.08; hi += span * 0.08;
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const up = points[points.length - 1].v >= points[0].v;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart ' + (up ? 'is-up' : 'is-down'), role: 'img' });
    svg.setAttribute('aria-label', (o.title || 'Price') + ': from ' + fmt(points[0].v) + ' to ' + fmt(points[points.length - 1].v));

    const defs = el('defs', {});
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0', class: 'chart-fill-top' }));
    grad.appendChild(el('stop', { offset: '1', class: 'chart-fill-bottom' }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Recessive grid + right-hand value axis.
    for (const v of ticks(lo, hi)) {
      const yy = y(v);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'chart-grid' }));
      const lab = el('text', { x: W - pad.r + 8, y: yy + 4, class: 'chart-axis' });
      lab.textContent = fmt(v);
      svg.appendChild(lab);
    }
    for (const [t, anchor] of [[t0, 'start'], [t1, 'end']]) {
      const lab = el('text', { x: anchor === 'start' ? pad.l : W - pad.r, y: H - 6, 'text-anchor': anchor, class: 'chart-axis' });
      lab.textContent = tfmt(t);
      svg.appendChild(lab);
    }

    const d = points.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('');
    svg.appendChild(el('path', { d: d + `L${x(t1).toFixed(1)} ${H - pad.b}L${x(t0).toFixed(1)} ${H - pad.b}Z`, fill: `url(#${gid})`, class: 'chart-area' }));
    svg.appendChild(el('path', { d, class: 'chart-line', fill: 'none' }));

    if (o.ref) {
      const yy = y(o.ref);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'chart-ref' }));
      const lab = el('text', { x: pad.l + 4, y: yy - 5, class: 'chart-ref-label' });
      lab.textContent = (o.refLabel || 'Reference') + ' ' + fmt(o.ref);
      svg.appendChild(lab);
    }

    // Last value dot.
    const last = points[points.length - 1];
    svg.appendChild(el('circle', { cx: x(last.t), cy: y(last.v), r: 4, class: 'chart-dot' }));

    // Crosshair + tooltip.
    const cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'chart-cross', visibility: 'hidden' });
    const dot = el('circle', { r: 4.5, class: 'chart-dot is-hover', visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(dot);
    const hit = el('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent', tabindex: 0 });
    svg.appendChild(hit);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const tipV = document.createElement('strong');
    const tipT = document.createElement('span');
    tip.append(tipV, tipT);

    function show(i) {
      const p = points[Math.max(0, Math.min(points.length - 1, i))];
      const px = x(p.t), py = y(p.v);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      tipV.textContent = fmt(p.v);
      tipT.textContent = tfmt(p.t);
      tip.hidden = false;
      const scale = host.clientWidth / W || 1;
      const left = Math.min(Math.max(px * scale - 60, 0), host.clientWidth - 130);
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, py * (host.clientHeight / H || 1) - 54) + 'px';
      focusIdx = i;
    }
    function hide() {
      cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true;
    }
    let focusIdx = points.length - 1;
    const idxAt = (clientX) => {
      const r = svg.getBoundingClientRect();
      const vx = ((clientX - r.left) / r.width) * W;
      const tt = t0 + ((vx - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
      return Math.round(((tt - t0) / (t1 - t0)) * (points.length - 1));
    };
    hit.addEventListener('pointermove', (e) => show(idxAt(e.clientX)));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', () => show(focusIdx));
    hit.addEventListener('blur', hide);
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { show(focusIdx - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { show(focusIdx + 1); e.preventDefault(); }
    });

    host.append(svg, tip);
  }

  global.Charts = { spark, line };
})(window);
