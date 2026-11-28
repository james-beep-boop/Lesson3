'use strict';
// Parametric figure generators (code-drawn, editable PowerPoint shapes, no photos).
// Unlike the fixed templates in diagrams.js, a figure is built from a small JSON spec the deck author supplies:
//   geometry | grid | circuit | atoms | flow | apparatus | graph | forces | machines | sankey | waves | rays | numberline | molecule | periodic   (see FAMILY_DOCS for the spec each takes)
// The generator owns the drawing rules and checks the spec for science/maths errors (a label that contradicts
// the drawing, a voltmeter in series, electrons that do not add up). Errors go back to the authoring repair loop.
// A figure is built once into a list of primitives in a frame {w,h} (units); drawFigure() scales it into a box.
//
// Primitives (frame units, y down):
//   {t:'line',x1,y1,x2,y2,color,w,dash,arrow}   {t:'ell',cx,cy,rx,ry,fill,line,w}   {t:'rect',x,y,w,h,fill,line,w,r}
//   {t:'text',x,y,text,pt,bold,color,align,wu}  text box centred on (x,y) (align l/r anchors that edge at x), width wu units

const { widthIn, heightIn } = require('./measure');

const INK = '1A1A1A', GREY = '8A8A8A', LIGHT = 'D9D9D9';
const PALETTE = ['1F77B4', 'D62728', '2CA02C', 'FF7F0E', '9467BD', '17A2B8'];
const COLOURS = { blue: '1F77B4', red: 'D62728', green: '2CA02C', orange: 'FF7F0E', purple: '9467BD', black: INK, grey: GREY };
const col = (c, i = 0) => COLOURS[c] || PALETTE[i % PALETTE.length];

const L = (x1, y1, x2, y2, o = {}) => ({ t: 'line', x1, y1, x2, y2, color: o.color || INK, w: o.w || 1.5, dash: o.dash, arrow: o.arrow });
const E = (cx, cy, rx, ry, o = {}) => ({ t: 'ell', cx, cy, rx, ry, fill: o.fill, line: o.line === undefined ? INK : o.line, w: o.w || 1.5 });
const R = (x, y, w, h, o = {}) => ({ t: 'rect', x, y, w, h, fill: o.fill, line: o.line === undefined ? INK : o.line, w_: o.w || 1.5, r: o.r });
const T = (x, y, text, o = {}) => ({ t: 'text', x, y, text: String(text), pt: o.pt || 16, bold: !!o.bold, color: o.color || INK, align: o.align || 'c', wu: o.wu, italic: !!o.italic, tick: !!o.tick });
const polyline = (pts, o = {}) => { const out = []; for (let i = 1; i < pts.length; i++) out.push(L(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], o)); return out; };
const arc = (cx, cy, r, a0, a1, o = {}) => { // angles in radians, screen coordinates (y down); a1 > a0 draws the short way given
  const n = Math.max(6, Math.round(Math.abs(a1 - a0) / 0.2)), pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return polyline(pts, o);
};
const isNum = v => typeof v === 'number' && isFinite(v);
const isPt = p => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const bbox = pts => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });

// ---------------------------------------------------------------- geometry
// spec: {points:{A:[x,y],...}, lines:[{a,b,label,dash,tick,color}], fill:[[names]], circles:[{c,r,label}],
//        angles:[{at,from,to,label,right}], point_labels:true, scale:'exact'|'not_to_scale'}
// Coordinates are maths coordinates (y up). 'exact' means labelled lengths and angles are checked against the drawing.
function buildGeometry(sp) {
  const errors = [], pts = sp.points || {};
  const names = Object.keys(pts);
  if (!names.length) return { errors: ['geometry: no points'] };
  for (const n of names) if (!isPt(pts[n])) errors.push(`geometry: point ${n} must be [x, y]`);
  if (errors.length) return { errors };
  const ref = (n, where) => { if (!pts[n]) { errors.push(`geometry: ${where} uses unknown point '${n}'`); return false; } return true; };
  const circles = (sp.circles || []).map(c => ({ ...c, cc: typeof c.c === 'string' ? pts[c.c] : c.c })), exact = sp.scale === 'exact';
  circles.forEach(c => { if (!isPt(c.cc) || !isNum(c.r) || c.r <= 0) errors.push('geometry: each circle needs c (point name or [x,y]) and r > 0'); });
  if (errors.length) return { errors };
  // frame: bounding box of points and circles, scaled so the larger side is 84 units
  const all = names.map(n => pts[n]);
  circles.forEach(c => all.push([c.cc[0] - c.r, c.cc[1] - c.r], [c.cc[0] + c.r, c.cc[1] + c.r]));
  const bb = bbox(all), sw = Math.max(bb.x1 - bb.x0, 1e-9), sh = Math.max(bb.y1 - bb.y0, 1e-9), k = 84 / Math.max(sw, sh), M = 14;
  const W = sw * k + 2 * M, H = sh * k + 2 * M;
  const P = p => [M + (p[0] - bb.x0) * k, M + (bb.y1 - p[1]) * k];
  const cen = P([all.reduce((a, p) => a + p[0], 0) / all.length, all.reduce((a, p) => a + p[1], 0) / all.length]);
  const out = [];
  for (const poly of sp.fill || []) { // light fill drawn as a fan of triangles is not possible; use outline plus translucent look via lines only
    poly.forEach(n => ref(n, 'fill'));
  }
  const lineLen = {};
  for (const ln of sp.lines || []) {
    if (!ref(ln.a, 'line') || !ref(ln.b, 'line')) continue;
    const a = P(pts[ln.a]), b = P(pts[ln.b]);
    out.push(L(a[0], a[1], b[0], b[1], { color: col(ln.color), w: 2.25, dash: ln.dash ? 'dash' : undefined }));
    const len = Math.hypot(pts[ln.b][0] - pts[ln.a][0], pts[ln.b][1] - pts[ln.a][1]);
    if (ln.tick) { // equal-length ticks
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      for (let i = 0; i < ln.tick; i++) { const o = (i - (ln.tick - 1) / 2) * 2.2; out.push(L(mx + ux * o - uy * 2.2, my + uy * o + ux * 2.2, mx + ux * o + uy * 2.2, my + uy * o - ux * 2.2, { w: 1.5 })); }
    }
    if (ln.label) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
      if ((mx + nx - cen[0]) ** 2 + (my + ny - cen[1]) ** 2 < (mx - nx - cen[0]) ** 2 + (my - ny - cen[1]) ** 2) { nx = -nx; ny = -ny; }
      out.push(T(mx + nx * 6.5, my + ny * 5, ln.label, { pt: 16, bold: true, wu: 22 }));
      const m = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)\s*$/.exec(ln.label);
      if (m) (lineLen[m[2]] = lineLen[m[2]] || []).push({ v: +m[1], d: len, n: ln.a + ln.b });
    }
  }
  // labelled lengths must match the drawing when scale is exact
  if (exact) for (const [u, arr] of Object.entries(lineLen)) for (let i = 1; i < arr.length; i++) {
    const r = (arr[i].d / arr[0].d) / (arr[i].v / arr[0].v);
    if (r < 0.92 || r > 1.08) errors.push(`geometry: ${arr[i].n} is labelled ${arr[i].v} ${u} and ${arr[0].n} ${arr[0].v} ${u}, but the drawing has a different ratio; fix the coordinates or set scale 'not_to_scale'`);
  }
  for (const c of circles) {
    const p = P(c.cc);
    out.push(E(p[0], p[1], c.r * k, c.r * k, { line: INK, w: 2.25 }));
    if (typeof c.c === 'string') out.push(E(p[0], p[1], 0.9, 0.9, { fill: INK, line: INK, w: 0.5 }));
    if (c.label) out.push(T(p[0] + c.r * k * 0.5, p[1] - 4, c.label, { pt: 16, bold: true, wu: 22 }));
  }
  for (const an of sp.angles || []) {
    if (!ref(an.at, 'angle') || !ref(an.from, 'angle') || !ref(an.to, 'angle')) continue;
    const v = P(pts[an.at]), f = P(pts[an.from]), t = P(pts[an.to]);
    let a0 = Math.atan2(f[1] - v[1], f[0] - v[0]), a1 = Math.atan2(t[1] - v[1], t[0] - v[0]);
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const shortest = Math.min(Math.hypot(f[0] - v[0], f[1] - v[1]), Math.hypot(t[0] - v[0], t[1] - v[1]));
    const r = Math.min(8, shortest * 0.35);
    if (an.right) {
      const ux = Math.cos(a0) * r * 0.9, uy = Math.sin(a0) * r * 0.9, wx = Math.cos(a1) * r * 0.9, wy = Math.sin(a1) * r * 0.9;
      out.push(...polyline([[v[0] + ux, v[1] + uy], [v[0] + ux + wx, v[1] + uy + wy], [v[0] + wx, v[1] + wy]], { w: 1.5 }));
      if (exact && Math.abs(Math.abs(d) - Math.PI / 2) > 0.06) errors.push(`geometry: angle at ${an.at} is marked as a right angle but the drawing measures ${(Math.abs(d) * 180 / Math.PI).toFixed(0)} degrees`);
    } else {
      out.push(...arc(v[0], v[1], r, a0, a0 + d, { w: 1.5 }));
      const mid = a0 + d / 2;
      if (an.label) out.push(T(v[0] + Math.cos(mid) * (r + 6.5), v[1] + Math.sin(mid) * (r + 5.5), an.label, { pt: 16, bold: true, wu: 14 }));
      const m = /(\d+(?:\.\d+)?)\s*°/.exec(an.label || '');
      if (exact && m && Math.abs(Math.abs(d) * 180 / Math.PI - +m[1]) > 4) errors.push(`geometry: angle at ${an.at} is labelled ${m[1]}° but the drawing measures ${(Math.abs(d) * 180 / Math.PI).toFixed(0)}°; fix the coordinates or set scale 'not_to_scale'`);
    }
    if (an.right && an.label) out.push(T(v[0] + (Math.cos(a0) + Math.cos(a1)) * (r + 4), v[1] + (Math.sin(a0) + Math.sin(a1)) * (r + 4), an.label, { pt: 16, bold: true, wu: 14 }));
  }
  if (sp.point_labels !== false) for (const n of names) {
    const p = P(pts[n]); let dx = p[0] - cen[0], dy = p[1] - cen[1]; const d = Math.hypot(dx, dy) || 1;
    out.push(E(p[0], p[1], 0.9, 0.9, { fill: INK, line: INK, w: 0.5 }));
    out.push(T(p[0] + dx / d * 5, p[1] + dy / d * 4.5, n, { pt: 18, bold: true, wu: 10 }));
  }
  let H2 = H;
  if (!exact) { out.push(T(W / 2, H + 3, 'Not drawn to scale', { pt: 14, italic: true, color: GREY, wu: 50 })); H2 = H + 7; }
  return { w: W, h: H2, shapes: out, errors, notes: exact ? 'drawn to scale' : 'not to scale' };
}

// ---------------------------------------------------------------- coordinate grid
// spec: {x:[min,max], y:[min,max], step, grid:true, shapes:[{pts:[[x,y]..], labels:[..], color, closed}],
//        lines:[{m,c,label,color}|{x:3,label}|{y:2,label}|{p:[x,y],q:[x,y],label}], points:[{at,label}],
//        vectors:[{from,to,label,color}]}
function buildGrid(sp) {
  const errors = [];
  const [x0, x1] = sp.x || [], [y0, y1] = sp.y || [];
  if (![x0, x1, y0, y1].every(isNum) || x1 <= x0 || y1 <= y0) return { errors: ['grid: x and y must be [min, max] with max > min'] };
  const xr = x1 - x0, yr = y1 - y0;
  if (xr > 40 || yr > 40) errors.push('grid: window larger than 40 units');
  const step = sp.step || 1, u = 80 / Math.max(xr, yr), M = 12;
  const W = xr * u + 2 * M, H = yr * u + 2 * M;
  const X = x => M + (x - x0) * u, Y = y => M + (y1 - y) * u;
  const out = [];
  if (sp.grid !== false) {
    for (let x = Math.ceil(x0 / step) * step; x <= x1 + 1e-9; x += step) out.push(L(X(x), Y(y0), X(x), Y(y1), { color: LIGHT, w: 0.5 }));
    for (let y = Math.ceil(y0 / step) * step; y <= y1 + 1e-9; y += step) out.push(L(X(x0), Y(y), X(x1), Y(y), { color: LIGHT, w: 0.5 }));
  }
  const ax = x0 <= 0 && x1 >= 0 ? 0 : x0, ay = y0 <= 0 && y1 >= 0 ? 0 : y0;
  out.push(L(X(x0), Y(ay), X(x1) + 4, Y(ay), { w: 1.75, arrow: 'end' }), L(X(ax), Y(y0), X(ax), Y(y1) - 4, { w: 1.75, arrow: 'end' }));
  const every = sp.labels_every || step;
  for (let x = Math.ceil(x0 / every) * every; x <= x1 + 1e-9; x += every) if (Math.abs(x - ax) > 1e-9) { out.push(L(X(x), Y(ay) - 0.9, X(x), Y(ay) + 0.9, { w: 1 })); out.push(T(X(x), Y(ay) + 4.2, +x.toFixed(6), { pt: 14, wu: 8, tick: true })); }
  for (let y = Math.ceil(y0 / every) * every; y <= y1 + 1e-9; y += every) if (Math.abs(y - ay) > 1e-9) { out.push(L(X(ax) - 0.9, Y(y), X(ax) + 0.9, Y(y), { w: 1 })); out.push(T(X(ax) - 4.2, Y(y), +y.toFixed(6), { pt: 14, align: 'r', wu: 8, tick: true })); }
  out.push(T(X(x1) + 5, Y(ay) - 3.5, sp.x_label || 'x', { pt: 16, italic: true, wu: 8 }), T(X(ax) + 5, Y(y1) - 3, sp.y_label || 'y', { pt: 16, italic: true, wu: 8 }));
  if (ax === 0 && ay === 0) out.push(T(X(0) - 3, Y(0) + 4.2, '0', { pt: 14, wu: 6 }));
  const inside = (x, y) => x >= x0 - 1e-9 && x <= x1 + 1e-9 && y >= y0 - 1e-9 && y <= y1 + 1e-9;
  (sp.shapes || []).forEach((s, i) => {
    const c = col(s.color, i), ps = s.pts || [];
    if (ps.length < 2 || !ps.every(isPt)) { errors.push('grid: each shape needs pts as [[x, y], ...]'); return; }
    ps.forEach(p => { if (!inside(p[0], p[1])) errors.push(`grid: point (${p[0]}, ${p[1]}) is outside the grid window`); });
    const q = s.closed === false ? ps : ps.concat([ps[0]]);
    out.push(...polyline(q.map(p => [X(p[0]), Y(p[1])]), { color: c, w: 2.5 }));
    const gc = [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
    ps.forEach((p, j) => {
      out.push(E(X(p[0]), Y(p[1]), 0.9, 0.9, { fill: c, line: c, w: 0.5 }));
      const lab = (s.labels || [])[j]; if (!lab) return;
      const dx = p[0] - gc[0], dy = p[1] - gc[1], d = Math.hypot(dx, dy) || 1;
      out.push(T(X(p[0]) + dx / d * 5.5, Y(p[1]) - dy / d * 4.5, lab, { pt: 16, bold: true, color: c, wu: 10 }));
    });
  });
  (sp.lines || []).forEach((ln, i) => {
    const c = col(ln.color, i + 1); let a, b;
    if (isNum(ln.m)) { const cc = ln.c || 0; a = [x0, ln.m * x0 + cc]; b = [x1, ln.m * x1 + cc]; }
    else if (isNum(ln.x)) { a = [ln.x, y0]; b = [ln.x, y1]; }
    else if (isNum(ln.y)) { a = [x0, ln.y]; b = [x1, ln.y]; }
    else if (isPt(ln.p) && isPt(ln.q)) { a = ln.p; b = ln.q; if (ln.extend) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = 100; a = [a[0] - dx * t, a[1] - dy * t]; b = [b[0] + dx * t, b[1] + dy * t]; } }
    else { errors.push('grid: each line needs m (and c), x, y, or p and q'); return; }
    // clip to window (Liang-Barsky)
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (p === 0) { if (q < 0) { t0 = 1; t1 = 0; } } else { const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); }
    }
    if (t0 >= t1) { errors.push('grid: a line lies outside the grid window'); return; }
    const A = [a[0] + dx * t0, a[1] + dy * t0], B = [a[0] + dx * t1, a[1] + dy * t1];
    out.push(L(X(A[0]), Y(A[1]), X(B[0]), Y(B[1]), { color: c, w: 2.5, dash: ln.dash ? 'dash' : undefined }));
    if (ln.label) out.push(T(X(B[0]) - 3, Y(B[1]) - 5, ln.label, { pt: 16, bold: true, color: c, align: 'r', wu: 30 }));
  });
  (sp.points || []).forEach((pt, i) => {
    if (!isPt(pt.at)) { errors.push('grid: each point needs at: [x, y]'); return; }
    if (!inside(pt.at[0], pt.at[1])) errors.push(`grid: point (${pt.at[0]}, ${pt.at[1]}) is outside the grid window`);
    const c = col(pt.color, i);
    out.push(E(X(pt.at[0]), Y(pt.at[1]), 1.2, 1.2, { fill: c, line: c, w: 0.5 }));
    if (pt.label) out.push(T(X(pt.at[0]) + 3, Y(pt.at[1]) - 4.5, pt.label, { pt: 16, bold: true, color: c, align: 'l', wu: 26 }));
  });
  (sp.vectors || []).forEach((v, i) => {
    if (!isPt(v.from) || !isPt(v.to)) { errors.push('grid: each vector needs from and to as [x, y]'); return; }
    const c = col(v.color, i + 2);
    out.push(L(X(v.from[0]), Y(v.from[1]), X(v.to[0]), Y(v.to[1]), { color: c, w: 2.5, arrow: 'end', dash: v.dash ? 'dash' : undefined }));
    if (v.label) out.push(T((X(v.from[0]) + X(v.to[0])) / 2 + 2, (Y(v.from[1]) + Y(v.to[1])) / 2 - 5, v.label, { pt: 16, bold: true, color: c, wu: 24 }));
  });
  return { w: W + 4, h: H, shapes: out, errors, notes: 'grid drawn to scale' };
}

// ---------------------------------------------------------------- circuit
// spec: {source:{type:'cell'|'battery',label}, series:[comp], parallel:[[comp],[comp]], bottom:[comp]}
// comp: {type, label}. series sits on the top wire left to right, then the parallel branches (each a vertical column).
const COMP = {
  cell: 4, battery: 6, bulb: 7, resistor: 10, variable_resistor: 10, switch_open: 9, switch_closed: 9,
  ammeter: 8, voltmeter: 8, fuse: 9, diode: 7, led: 7,
};
// draw component centred at (cx,cy), local axis u along the wire. horiz => u is x; else u is y.
function symbol(type, cx, cy, horiz, flip) {
  const o = [], P = (u, v) => horiz ? [cx + u * (flip ? -1 : 1), cy + v] : [cx + v, cy + u * (flip ? -1 : 1)];
  const ln = (u1, v1, u2, v2, w = 2, color = INK) => { const a = P(u1, v1), b = P(u2, v2); o.push(L(a[0], a[1], b[0], b[1], { w, color })); };
  const rect = (u1, v1, u2, v2) => { ln(u1, v1, u2, v1); ln(u2, v1, u2, v2); ln(u2, v2, u1, v2); ln(u1, v2, u1, v1); };
  switch (type) {
    case 'cell': ln(-1, -4.5, -1, 4.5, 2); ln(1, -2.5, 1, 2.5, 4.5); break;
    case 'battery': ln(-2.5, -4.5, -2.5, 4.5, 2); ln(-0.5, -2.5, -0.5, 2.5, 4.5); ln(1.5, -4.5, 1.5, 4.5, 2); ln(3.5, -2.5, 3.5, 2.5, 4.5); break;
    case 'bulb': { const c = P(0, 0); o.push(E(c[0], c[1], 3.4, 3.4, { w: 2 })); ln(-2.4, -2.4, 2.4, 2.4); ln(-2.4, 2.4, 2.4, -2.4); break; }
    case 'resistor': rect(-4.5, -2, 4.5, 2); break;
    case 'variable_resistor': rect(-4.5, -2, 4.5, 2); { const a = P(-4, 4.5), b = P(4, -4.5); o.push(L(a[0], a[1], b[0], b[1], { w: 1.75, arrow: 'end' })); } break;
    case 'fuse': rect(-4, -1.8, 4, 1.8); ln(-4, 0, 4, 0, 1.25); break;
    case 'switch_open': { const a = P(-4, 0), b = P(4, 0); o.push(E(a[0], a[1], 0.9, 0.9, { fill: INK })); o.push(E(b[0], b[1], 0.9, 0.9, { fill: INK })); ln(-4, 0, 3, -4.5, 2); break; }
    case 'switch_closed': { const a = P(-4, 0), b = P(4, 0); o.push(E(a[0], a[1], 0.9, 0.9, { fill: INK })); o.push(E(b[0], b[1], 0.9, 0.9, { fill: INK })); ln(-4, 0, 4, 0, 2); break; }
    case 'ammeter': case 'voltmeter': { const c = P(0, 0); o.push(E(c[0], c[1], 3.6, 3.6, { w: 2 })); o.push(T(c[0], c[1], type === 'ammeter' ? 'A' : 'V', { pt: 18, bold: true, wu: 6 })); break; }
    case 'diode': case 'led': ln(-3, -3.2, -3, 3.2); ln(-3, -3.2, 3, 0); ln(-3, 3.2, 3, 0); ln(3, -3.2, 3, 3.2);
      if (type === 'led') { const a = P(0, -4), b = P(2.2, -7); o.push(L(a[0], a[1], b[0], b[1], { w: 1.5, arrow: 'end' })); const c = P(2, -3.5), d = P(4.2, -6.5); o.push(L(c[0], c[1], d[0], d[1], { w: 1.5, arrow: 'end' })); } break;
    default: break;
  }
  return o;
}
function wireWithGaps(x1, y1, x2, y2, gaps, horiz) { // gaps: [{c, hl}] positions along the wire axis
  const out = [], a = horiz ? x1 : y1, b = horiz ? x2 : y2, dir = b >= a ? 1 : -1;
  const gs = gaps.slice().sort((p, q) => dir * (p.c - q.c)); let cur = a;
  const seg = (s, e) => { if (dir * (e - s) > 0.01) out.push(horiz ? L(s, y1, e, y1, { w: 2 }) : L(x1, s, x1, e, { w: 2 })); };
  for (const g of gs) { seg(cur, g.c - dir * g.hl); cur = g.c + dir * g.hl; }
  seg(cur, b); return out;
}
function buildCircuit(sp) {
  const errors = [], out = [];
  const series = sp.series || [], branches = sp.parallel || [], bottom = sp.bottom || [];
  const src = sp.source || { type: 'cell' };
  const bad = c => !c || !COMP[c.type] ? (errors.push(`circuit: unknown component type '${c && c.type}' (allowed: ${Object.keys(COMP).join(', ')})`), true) : false;
  [src, ...series, ...bottom, ...branches.flat()].forEach(bad);
  if (!['cell', 'battery'].includes(src.type)) errors.push('circuit: source must be a cell or a battery');
  series.concat(bottom).forEach(c => { if (c.type === 'voltmeter') errors.push('circuit: a voltmeter must be connected in parallel (put it in a parallel branch), not in series'); });
  branches.forEach(br => { if (br.length === 1 && br[0].type === 'ammeter' && branches.length > 1) errors.push('circuit: an ammeter alone in a parallel branch short-circuits the other branches; put it in series'); });
  if (errors.length) return { errors };
  const nB = branches.length, topN = series.length;
  const bw = 22;
  const rightX = nB ? Math.max(70, 28 + topN * 17) + (nB - 1) * bw + 10 : Math.max(70, 28 + topN * 17 + 12);
  const junctionX = nB ? rightX - (nB - 1) * bw - 10 : rightX;
  const left = 14, topY = 16, botY = 16 + (nB && branches.some(b => b.length > 1) ? 46 : 40);
  const W = rightX + 22, H = botY + 20;
  // left edge: source in the middle
  const midY = (topY + botY) / 2;
  const srcHl = COMP[src.type] / 2 + 1;
  out.push(...wireWithGaps(left, topY, left, botY, [{ c: midY, hl: srcHl }], false));
  out.push(...symbol(src.type, left, midY, false, true));
  out.push(T(left - 7, midY, src.label || '', { pt: 16, bold: true, align: 'r', wu: 18 }));
  // top wire with series components
  const gapsTop = series.map((c, i) => ({ c: left + 14 + i * 17, hl: COMP[c.type] / 2 + 1, comp: c }));
  out.push(...wireWithGaps(left, topY, junctionX, topY, gapsTop, true));
  gapsTop.forEach(g => { out.push(...symbol(g.comp.type, g.c, topY, true)); if (g.comp.label) out.push(T(g.c, topY - 8.5, g.comp.label, { pt: 16, bold: true, wu: 22 })); });
  // bottom wire (optionally with components)
  const gapsBot = bottom.map((c, i) => ({ c: left + 14 + i * 17, hl: COMP[c.type] / 2 + 1, comp: c }));
  out.push(...wireWithGaps(left, botY, nB ? rightX : rightX, botY, gapsBot, true));
  gapsBot.forEach(g => { out.push(...symbol(g.comp.type, g.c, botY, true)); if (g.comp.label) out.push(T(g.c, botY + 8.5, g.comp.label, { pt: 16, bold: true, wu: 22 })); });
  if (!nB) { out.push(L(rightX, topY, rightX, botY, { w: 2 })); }
  else {
    branches.forEach((br, i) => {
      const x = junctionX + i * bw + (nB === 1 ? 0 : 0);
      const gs = br.map((c, j) => ({ c: topY + (botY - topY) * (j + 1) / (br.length + 1), hl: COMP[c.type] / 2 + 1, comp: c }));
      out.push(...wireWithGaps(x, topY, x, botY, gs, false));
      gs.forEach(g => { out.push(...symbol(g.comp.type, x, g.c, false)); if (g.comp.label) out.push(T(x + 6, g.c, g.comp.label, { pt: 16, bold: true, align: 'l', wu: 24 })); });
      if (i > 0) { out.push(L(x - bw, topY, x, topY, { w: 2 }), L(x - bw, botY, x, botY, { w: 2 })); }
      if (nB > 1) { out.push(E(x, topY, 0.8, 0.8, { fill: INK, line: INK, w: 0.5 }), E(x, botY, 0.8, 0.8, { fill: INK, line: INK, w: 0.5 })); }
    });
    const last = junctionX + (nB - 1) * bw;
    out.push(L(last, topY, rightX, topY, { w: 2 }), L(last, botY, rightX, botY, { w: 2 }), L(rightX, topY, rightX, botY, { w: 2 }));
    out.push(T(0, 0, '', { pt: 1 }));
  }
  return { w: W, h: H, shapes: out.filter(s => !(s.t === 'text' && s.text === '')), errors, notes: 'circuit symbols' };
}

// ---------------------------------------------------------------- atoms and ions (Bohr diagrams)
const SYM = ['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'];
const CAP = [2, 8, 8, 18];
// spec: {atoms:[{symbol, protons, neutrons, shells:[2,8,1], charge, show_counts, label, outer_only}]}
function buildAtoms(sp) {
  const errors = [], atoms = sp.atoms || [];
  if (!atoms.length || atoms.length > 4) return { errors: ['atoms: give 1 to 4 atoms or ions'] };
  const radii = at => 15 + 8 * ((at.shells || []).length - 1);
  atoms.forEach((a, i) => {
    const tag = `atom ${i + 1} (${a.symbol || '?'})`;
    if (!Array.isArray(a.shells) || !a.shells.length || a.shells.length > 4 || !a.shells.every(n => Number.isInteger(n) && n >= 0)) { errors.push(`atoms: ${tag} needs shells as electrons per shell, e.g. [2, 8, 1] (max 4 shells)`); return; }
    const z = SYM.indexOf(a.symbol) + 1, charge = a.charge || 0, tot = a.shells.reduce((s, n) => s + n, 0);
    if (z === 0) errors.push(`atoms: ${tag}: symbol not in the first 36 elements`);
    if (z && a.protons !== undefined && a.protons !== null && a.protons !== z) errors.push(`atoms: ${tag}: ${a.symbol} has ${z} protons, not ${a.protons}`);
    if (z && tot !== z - charge) errors.push(`atoms: ${tag}: ${a.shells.join(', ')} is ${tot} electrons but ${a.symbol}${charge ? ` with charge ${charge > 0 ? '+' : ''}${charge}` : ''} needs ${z - charge}`);
    a.shells.forEach((n, s) => { if (n > CAP[s]) errors.push(`atoms: ${tag}: shell ${s + 1} holds at most ${CAP[s]} electrons, not ${n}`); });
    if (z && z <= 20) a.shells.forEach((n, s) => { if (s < a.shells.length - 1 && n < Math.min(CAP[s], 8)) errors.push(`atoms: ${tag}: shell ${s + 1} must be full before shell ${s + 2} (${a.shells.join(', ')})`); });
  });
  if (errors.length) return { errors };
  const out = [], rmax = Math.max(...atoms.map(radii)), D = 2 * (rmax + 6), gap = 8;
  let x = 0;
  atoms.forEach(a => {
    const cx = x + D / 2, cy = rmax + 8, r0 = radii(a), z = SYM.indexOf(a.symbol) + 1;
    const ion = !!a.charge;
    if (a.outer_only) { // outer shell only: dots around the symbol (Lewis style)
      out.push(T(cx, cy, a.symbol, { pt: 28, bold: true, wu: 14 }));
      const n = a.shells[a.shells.length - 1], pos = [[0, -9, 3, 0], [0, 9, -3, 0], [9, 0, 0, -3], [-9, 0, 0, 3]];
      for (let i = 0; i < n; i++) { const p = pos[i % 4], s = i < 4 ? 1 : -1; out.push(E(cx + p[0] + (p[2] ? s * p[2] : 0), cy + p[1] + (p[3] ? s * p[3] : 0), 0.95, 0.95, { fill: INK, line: INK, w: 0.5 })); }
    } else {
      a.shells.forEach((n, s) => {
        const r = 15 + 8 * s; out.push(E(cx, cy, r, r, { line: '7F7F7F', w: 1.5 }));
        for (let i = 0; i < n; i++) { const ang = -Math.PI / 2 + (2 * Math.PI * i) / n + s * 0.5; out.push(E(cx + r * Math.cos(ang), cy + r * Math.sin(ang), 1.5, 1.5, { fill: '1F77B4', line: '1F77B4', w: 0.5 })); }
      });
      out.push(E(cx, cy, 8.5, 8.5, { fill: 'FDE9C9', line: 'C77700', w: 2 }));
      const counts = a.show_counts !== false;
      out.push(T(cx, cy, counts ? `${z}p\n${a.neutrons !== undefined && a.neutrons !== null ? a.neutrons + 'n' : ''}`.trim() : a.symbol, { pt: counts ? 13 : 16, bold: true, wu: 16 }));
    }
    let ly = cy + rmax + 7;
    const nm = (ion && a.charge ? `${a.symbol}${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ''}${a.charge > 0 ? '+' : '−'}` : a.symbol) + (a.label ? ` ${a.label}` : '');
    out.push(T(cx, ly + 3, nm, { pt: 18, bold: true, wu: D + 4 }));
    if (ion && !a.outer_only) { // square brackets with the charge at the top right
      const bx = r0 + 6, by = r0 + 6;
      for (const sd of [1, -1]) out.push(L(cx + sd * bx, cy - by, cx + sd * bx, cy + by, { w: 2 }), L(cx + sd * bx, cy - by, cx + sd * (bx - 3), cy - by, { w: 2 }), L(cx + sd * bx, cy + by, cx + sd * (bx - 3), cy + by, { w: 2 }));
      out.push(T(cx + bx + 2, cy - by - 2, `${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ''}${a.charge > 0 ? '+' : '−'}`, { pt: 18, bold: true, align: 'l', wu: 8 }));
    }
    x += D + gap;
  });
  return { w: x - gap, h: 2 * (rmax + 8) + 14, shapes: out, errors, notes: 'electron arrangement checked against proton number' };
}

// ---------------------------------------------------------------- flow / cycle
// spec: {kind:'flow'|'cycle', nodes:[{text}], arrow_labels:[...], per_row:4}
function buildFlow(sp) {
  const errors = [], nodes = sp.nodes || [], n = nodes.length;
  if (n < 2 || n > 10) return { errors: ['flow: give 2 to 10 nodes'] };
  nodes.forEach(nd => { if (!nd.text || nd.text.length > 60) errors.push(`flow: node text is empty or longer than 60 characters ('${String(nd.text).slice(0, 30)}...')`); });
  if (errors.length) return { errors };
  const out = [], al = sp.arrow_labels || [], nodeShapes = [];
  const box = (cx, cy, w, h, nd, i) => { const c = PALETTE[i % PALETTE.length]; out.push(R(cx - w / 2, cy - h / 2, w, h, { fill: tintOf(c), line: c, w: 2, r: 3 })); out.push(T(cx, cy, nd.text, { pt: 16, bold: true, wu: w - 2, box: [w - 2, h - 1] })); nodeShapes.push({ cx, cy, w, h }); };
  const clip = (a, b) => { // point on edge of box a towards b
    const dx = b.cx - a.cx, dy = b.cy - a.cy; const t = Math.min(dx ? (a.w / 2 + 1) / Math.abs(dx) : 1e9, dy ? (a.h / 2 + 1) / Math.abs(dy) : 1e9); return [a.cx + dx * t, a.cy + dy * t];
  };
  const link = (i, j) => {
    const a = nodeShapes[i], b = nodeShapes[j], p = clip(a, b), q = clip(b, a);
    out.push(L(p[0], p[1], q[0], q[1], { w: 2.5, arrow: 'end' }));
    if (al[i]) { const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; out.push(T(mx, my - 4.2, al[i], { pt: 14, italic: true, wu: 22 })); }
  };
  let W, H;
  if (sp.kind === 'cycle') {
    const rx = 38, ry = 26, bw = 26, bh = 11; W = 2 * rx + bw + 6; H = 2 * ry + bh + 6;
    nodes.forEach((nd, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n; box(W / 2 + rx * Math.cos(a), H / 2 + ry * Math.sin(a), bw, bh, nd, i); });
    for (let i = 0; i < n; i++) link(i, (i + 1) % n);
  } else {
    const per = Math.max(2, Math.min(sp.per_row || 4, 5)), rows = Math.ceil(n / per), bw = 24, bh = 12, gx = 12, gy = 14;
    W = Math.min(per, n) * bw + (Math.min(per, n) - 1) * gx + 4; H = rows * bh + (rows - 1) * gy + 4;
    nodes.forEach((nd, i) => { const r = Math.floor(i / per), c = i % per, cc = r % 2 ? per - 1 - c : c; box(2 + bw / 2 + cc * (bw + gx), 2 + bh / 2 + r * (bh + gy), bw, bh, nd, i); });
    for (let i = 0; i < n - 1; i++) link(i, i + 1);
  }
  return { w: W, h: H, shapes: out, errors, notes: sp.kind === 'cycle' ? 'cycle' : 'flow' };
}
function tintOf(hex) { const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); return c.map(v => Math.round(v + (255 - v) * 0.85).toString(16).padStart(2, '0')).join('').toUpperCase(); }



// ---------------------------------------------------------------- graph
// spec: {kind:'line'|'scatter'|'bar', x:{label,min,max,step}, y:{label,min,max,step}, series:[{name,points:[[x,y]],style:'straight'|'curve'|'none',best_fit,color}],
//        bars:[{label,value,color}], hide_points:false, title}
function buildGraph(sp) {
  const errors = [], kind = sp.kind || 'line', ax = sp.x || {}, ay = sp.y || {};
  if (!['line', 'scatter', 'bar'].includes(kind)) return { errors: ["graph: kind must be line, scatter or bar"] };
  const axErr = (a, nm) => { if (!a.label || a.label.length > 30) errors.push(`graph: ${nm} axis needs a label of 1 to 30 characters`);
    else if (!/\(.+\)/.test(a.label) && !a.unitless) errors.push(`graph: ${nm} axis label '${a.label}' needs a unit in brackets, e.g. 'Time (s)' (set unitless true only for a pure number or category)`); };
  axErr(ay, 'y'); if (kind !== 'bar') axErr(ax, 'x'); else if (!ax.label) errors.push('graph: x axis needs a label');
  if (!isNum(ay.min) || !isNum(ay.max) || ay.min >= ay.max) errors.push('graph: y needs numeric min < max');
  if (!(ay.step > 0) || (ay.max - ay.min) / ay.step > 20) errors.push('graph: y step must be positive and give at most 20 ticks');
  if (kind !== 'bar') { if (!isNum(ax.min) || !isNum(ax.max) || ax.min >= ax.max) errors.push('graph: x needs numeric min < max'); if (!(ax.step > 0) || (ax.max - ax.min) / ax.step > 20) errors.push('graph: x step must be positive and give at most 20 ticks'); }
  const series = sp.series || [], bars = sp.bars || [];
  if (kind === 'bar') { if (bars.length < 2 || bars.length > 8) errors.push('graph: a bar chart needs 2 to 8 bars'); bars.forEach(b => { if (!isNum(b.value)) errors.push(`graph: bar '${b.label}' needs a numeric value`); else if (b.value < ay.min || b.value > ay.max) errors.push(`graph: bar '${b.label}' value ${b.value} is outside the y axis (${ay.min} to ${ay.max})`); if (!b.label || b.label.length > 18) errors.push(`graph: bar label '${b.label}' must be 1 to 18 characters`); }); }
  else { if (!series.length || series.length > 4) errors.push('graph: give 1 to 4 series');
    series.forEach((s, i) => { const nm = s.name || `series ${i + 1}`, pts = s.points || [];
      if (pts.length < 1 || pts.length > 30 || !pts.every(isPt)) errors.push(`graph: ${nm} needs 1 to 30 [x,y] points`);
      else { pts.forEach(p => { if (p[0] < ax.min || p[0] > ax.max || p[1] < ay.min || p[1] > ay.max) errors.push(`graph: ${nm} point (${p[0]}, ${p[1]}) is outside the axes`); });
        const style = s.style || (kind === 'scatter' ? 'none' : 'straight'); if (style !== 'none' && pts.length < 2) errors.push(`graph: ${nm} needs at least 2 points to join`);
        if (style !== 'none') for (let k = 1; k < pts.length; k++) if (pts[k][0] <= pts[k - 1][0]) { errors.push(`graph: ${nm} x values must increase along a joined line (sort the points, or use style "none")`); break; }
        if (s.best_fit && pts.length < 3) errors.push(`graph: ${nm} best_fit needs at least 3 points`); }
      if (series.length > 1 && (!s.name || s.name.length > 24)) errors.push('graph: with more than one series, each needs a name of up to 24 characters'); }); }
  if (errors.length) return { errors };
  const out = [], X0 = 15, X1 = 96, Y0 = 6, Y1 = 56, fx = v => X0 + (v - ax.min) / (ax.max - ax.min) * (X1 - X0), fy = v => Y1 - (v - ay.min) / (ay.max - ay.min) * (Y1 - Y0);
  const fmt = v => String(Math.round(v * 1000) / 1000);
  for (let v = ay.min; v <= ay.max + 1e-9; v += ay.step) { out.push(L(X0, fy(v), X1, fy(v), { w: 0.5, color: LIGHT })); out.push(T(X0 - 1.5, fy(v), fmt(v), { pt: 12, align: 'r', wu: 9, tick: true })); }
  if (kind === 'bar') {
    const n = bars.length, slot = (X1 - X0) / n, bw = Math.min(slot * 0.6, 14);
    bars.forEach((b, i) => { const cx = X0 + slot * (i + 0.5), c = col(b.color, i); out.push(R(cx - bw / 2, fy(b.value), bw, Y1 - fy(b.value), { fill: tintOf(c), line: c, w: 2 })); out.push(T(cx, Y1 + 3.5, b.label, { pt: 12, wu: slot, tick: true })); if (!sp.hide_points) out.push(T(cx, fy(b.value) - 2.5, fmt(b.value), { pt: 12, bold: true, wu: 12, tick: true })); });
  } else {
    for (let v = ax.min; v <= ax.max + 1e-9; v += ax.step) { out.push(L(fx(v), Y0, fx(v), Y1, { w: 0.5, color: LIGHT })); out.push(T(fx(v), Y1 + 3, fmt(v), { pt: 12, wu: 9, tick: true })); }
    series.forEach((s, i) => { const c = col(s.color, i), pts = s.points, style = s.style || (kind === 'scatter' ? 'none' : 'straight');
      if (!sp.hide_points) {
        if (style === 'straight') out.push(...polyline(pts.map(p => [fx(p[0]), fy(p[1])]), { color: c, w: 2.5 }));
        else if (style === 'curve') { const P = pts.map(p => [fx(p[0]), fy(p[1])]), q = [P[0], ...P, P[P.length - 1]], sm = [];
          for (let k = 1; k < q.length - 2; k++) for (let u = 0; u < 8; u++) { const tt = u / 8, a = q[k - 1], b = q[k], cc = q[k + 1], d = q[k + 2]; sm.push([0, 1].map(m => 0.5 * ((2 * b[m]) + (-a[m] + cc[m]) * tt + (2 * a[m] - 5 * b[m] + 4 * cc[m] - d[m]) * tt * tt + (-a[m] + 3 * b[m] - 3 * cc[m] + d[m]) * tt * tt * tt))); }
          sm.push(P[P.length - 1]); out.push(...polyline(sm, { color: c, w: 2.5 })); }
        if (s.best_fit) { const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n, sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
          if (sxx > 0) { const m = sxy / sxx, b = my - m * mx, xa = Math.min(...pts.map(p => p[0])), xb = Math.max(...pts.map(p => p[0])); const ya = m * xa + b, yb = m * xb + b;
            if (ya < ay.min || ya > ay.max || yb < ay.min || yb > ay.max) errors.push(`graph: the best-fit line of ${s.name || 'series ' + (i + 1)} leaves the y axis; widen the y range`); else out.push(L(fx(xa), fy(ya), fx(xb), fy(yb), { color: c, w: 2, dash: 'dash' })); } }
        pts.forEach(p => out.push(E(fx(p[0]), fy(p[1]), 1.1, 1.1, { fill: c, line: c, w: 1 }))); }
      if (series.length > 1) { const ly = 8 + i * 5; out.push(L(X1 - 22, ly, X1 - 17, ly, { color: c, w: 3 })); out.push(T(X1 - 15.5, ly, s.name, { pt: 12, align: 'l', wu: 18 })); } });
  }
  out.push(L(X0, Y0, X0, Y1, { w: 2.5 })); out.push(L(X0, Y1, X1, Y1, { w: 2.5 }));
  out.push(T(X0, 1.5, ay.label, { pt: 14, bold: true, align: 'l', wu: 40 })); out.push(T((X0 + X1) / 2, 66, ax.label, { pt: 14, bold: true, wu: 50 }));
  return { w: 100, h: 69, shapes: out, errors, notes: 'graph' };
}


// ---------------------------------------------------------------- forces
// spec: {object:{shape:'box'|'ball'|'trolley', label}, forces:[{name,dir:'up'|'down'|'left'|'right'|degrees,value,unit?,label?}], balanced:true|false|null, surface:true}
// Arrow lengths are drawn in proportion to the values. If balanced is true the forces must add to zero; if false they must not.
const DIRS = { right: 0, up: 90, left: 180, down: 270 };
function buildForces(sp) {
  const errors = [], fs = sp.forces || [], ob = sp.object || {};
  if (!['box', 'ball', 'trolley'].includes(ob.shape || 'box')) errors.push('forces: object.shape must be box, ball or trolley');
  if (fs.length < 1 || fs.length > 6) errors.push('forces: give 1 to 6 forces');
  const names = new Set(), vec = [];
  fs.forEach((f, i) => { const nm = f.name || `force ${i + 1}`;
    if (!f.name || f.name.length > 24) errors.push(`forces: force ${i + 1} needs a name of 1 to 24 characters`); else if (names.has(f.name)) errors.push(`forces: '${f.name}' is repeated`); names.add(f.name);
    if (!isNum(f.value) || f.value <= 0) errors.push(`forces: ${nm} needs a positive numeric value`);
    const a = typeof f.dir === 'number' ? f.dir : DIRS[f.dir]; if (a === undefined) errors.push(`forces: ${nm} dir must be up, down, left, right or an angle in degrees (0 = right, 90 = up)`); else vec.push({ f, a: a * Math.PI / 180 }); });
  if (errors.length) return { errors };
  const sx = vec.reduce((s, v) => s + v.f.value * Math.cos(v.a), 0), sy = vec.reduce((s, v) => s + v.f.value * Math.sin(v.a), 0), net = Math.hypot(sx, sy), mx = Math.max(...vec.map(v => v.f.value));
  if (sp.balanced === true && net > 0.02 * mx) errors.push(`forces: marked balanced, but the forces add up to ${Math.round(net * 100) / 100} (not zero); fix the values or directions`);
  if (sp.balanced === false && net < 0.02 * mx) errors.push('forces: marked unbalanced, but the forces add up to zero');
  if (errors.length) return { errors };
  const out = [], cx = 50, cy = 33, k = 22 / mx, bw = 16, bh = 10;
  const half = d => { // distance from centre to the object's edge along direction d
    if (ob.shape === 'ball') return 6; const c = Math.abs(Math.cos(d)), s = Math.abs(Math.sin(d)); return Math.min(c > 1e-6 ? (bw / 2) / c : 1e9, s > 1e-6 ? (bh / 2) / s : 1e9); };
  if (sp.surface !== false) out.push(L(10, cy + bh / 2 + (ob.shape === 'trolley' ? 3.4 : 0), 90, cy + bh / 2 + (ob.shape === 'trolley' ? 3.4 : 0), { w: 3, color: '595959' }));
  if (ob.shape === 'ball') out.push(E(cx, cy, 6, 6, { fill: 'D9E8F5', line: INK, w: 2 })); else { out.push(R(cx - bw / 2, cy - bh / 2, bw, bh, { fill: 'D9E8F5', line: INK, w: 2 })); if (ob.shape === 'trolley') { out.push(E(cx - 5, cy + bh / 2 + 1.7, 1.7, 1.7, { fill: '8A8A8A', line: INK, w: 1.5 })); out.push(E(cx + 5, cy + bh / 2 + 1.7, 1.7, 1.7, { fill: '8A8A8A', line: INK, w: 1.5 })); } }
  if (ob.label) out.push(T(cx, cy, ob.label, { pt: 14, bold: true, wu: bw - 1 }));
  vec.forEach((v, i) => { const c = PALETTE[i % PALETTE.length], d = half(v.a), len = v.f.value * k, ux = Math.cos(v.a), uy = -Math.sin(v.a);
    const x1 = cx + ux * d, y1 = cy + uy * d, x2 = cx + ux * (d + len), y2 = cy + uy * (d + len);
    out.push(L(x1, y1, x2, y2, { color: c, w: 3.5, arrow: 'end' }));
    const txt = v.f.label !== undefined ? v.f.label : `${v.f.name} ${v.f.value} ${v.f.unit || 'N'}`, lx = x2 + ux * 3, ly = y2 + uy * 3.4;
    out.push(T(lx, ly, txt, { pt: 14, bold: true, color: c, wu: 28, align: Math.abs(ux) < 0.3 ? 'c' : ux > 0 ? 'l' : 'r' })); });
  const xs = out.filter(s => s.t === 'text').map(s => s.x);
  return { w: 100, h: 66, shapes: out, errors, notes: 'forces' };
}

// ---------------------------------------------------------------- apparatus
// spec: {parts:[{id,type,x,size,liquid,colour,stopper,on,in,inverted,reading,holds,flame}], links:[{from,to}], labels:[{on,text,side,at}]}
// Fixed, correctly drawn bench parts placed by position. The generator owns the drawing and checks the setup.
const LQ = { blue: 'BFDFF5', red: 'F4B6B6', green: 'BFE5BF', orange: 'F9D3A8', purple: 'D8C7EA', clear: 'EAF4FB' };
const APP_TYPES = ['beaker', 'conical_flask', 'test_tube', 'measuring_cylinder', 'bunsen', 'tripod', 'gas_jar', 'trough', 'balance', 'thermometer', 'funnel', 'dish', 'stand'];
const CONTAINERS = ['beaker', 'conical_flask', 'test_tube', 'measuring_cylinder', 'gas_jar', 'trough', 'dish'];
const SIZE = { small: 0.8, m: 1, l: 1.25 };
const BENCH = 62;

function liquidRects(cx, by, h, hw, level, color, out) {
  const top = h * 0.92 * level;
  for (let d = 0; d < top; d += 0.8) { const w = hw(d + 0.4), hh = Math.min(0.95, top - d + 0.15); out.push(R(cx - w, by - d - hh, 2 * w, hh, { fill: color, line: null })); }
  return by - top;
}

function drawPart(pt, cx, by, u, out) { // returns geometry: {bb, top, surface, support, hw0}
  const g = { bb: null, top: [cx, by], surface: null, support: null }, lc = LQ[pt.colour] || LQ.blue, lvl = pt.liquid || 0;
  const wall = (x1, y1, x2, y2) => out.push(L(x1, y1, x2, y2, { w: 2 }));
  switch (pt.type) {
    case 'beaker': { const w = 7 * u, h = 18 * u; if (lvl) g.surface = liquidRects(cx, by, h, () => w, lvl, lc, out);
      wall(cx - w, by - h, cx - w, by); wall(cx + w, by - h, cx + w, by); wall(cx - w, by, cx + w, by); if (g.surface) out.push(L(cx - w, g.surface, cx + w, g.surface, { w: 1, color: GREY }));
      g.bb = { x0: cx - w, x1: cx + w, y0: by - h, y1: by }; g.top = [cx, by - h]; g.mouth = by - h; g.hw0 = w; break; }
    case 'conical_flask': { const h = 20 * u, nh = 2.6 * u, bw = 8 * u, k = h * 0.55, hw = d => d <= k ? bw - (bw - nh) * d / k : nh;
      if (lvl) g.surface = liquidRects(cx, by, h, hw, lvl, lc, out);
      wall(cx - bw, by, cx + bw, by); wall(cx - bw, by, cx - nh, by - k); wall(cx + bw, by, cx + nh, by - k); wall(cx - nh, by - k, cx - nh, by - h); wall(cx + nh, by - k, cx + nh, by - h);
      let top = by - h; if (pt.stopper) { out.push(R(cx - nh - 0.7, by - h - 3, 2 * nh + 1.4, 3, { fill: '8A8A8A', line: INK, w: 1.5 })); top = by - h - 3; }
      g.bb = { x0: cx - bw, x1: cx + bw, y0: top, y1: by }; g.top = [cx, top]; g.mouth = by - h; g.hw0 = nh; g.sealed = !!pt.stopper; break; }
    case 'test_tube': { const hw = 2.6 * u, h = 20 * u; if (lvl) { g.surface = liquidRects(cx, by - hw, h - hw, () => hw, lvl, lc, out); out.push(E(cx, by - hw, hw, hw, { fill: lc, line: null })); }
      wall(cx - hw, by - h, cx - hw, by - hw); wall(cx + hw, by - h, cx + hw, by - hw); out.push(...arc(cx, by - hw, hw, 0, Math.PI, { w: 2 }));
      let top = by - h; if (pt.stopper) { out.push(R(cx - hw - 0.5, top - 3, 2 * hw + 1, 3, { fill: '8A8A8A', line: INK, w: 1.5 })); top -= 3; }
      g.bb = { x0: cx - hw - 0.5, x1: cx + hw + 0.5, y0: top, y1: by }; g.top = [cx, top]; g.mouth = by - h; g.hw0 = hw; g.sealed = !!pt.stopper; break; }
    case 'measuring_cylinder': { const hw = 2.8 * u, h = 26 * u; if (lvl) g.surface = liquidRects(cx, by, h, () => hw, lvl, lc, out);
      wall(cx - hw, by - h, cx - hw, by); wall(cx + hw, by - h, cx + hw, by); out.push(R(cx - hw - 1.5, by - 1.2, 2 * hw + 3, 1.2, { fill: 'D9D9D9', line: INK, w: 1.5 }));
      for (let i = 1; i <= 9; i++) out.push(L(cx - hw, by - h * i / 10, cx - hw + (i % 5 ? 1.4 : 2.4), by - h * i / 10, { w: 1 }));
      g.bb = { x0: cx - hw - 1.5, x1: cx + hw + 1.5, y0: by - h, y1: by }; g.top = [cx, by - h]; g.mouth = by - h; g.hw0 = hw; break; }
    case 'bunsen': { const w = 2.2 * u, h = 8.5 * u; out.push(R(cx - 4.5 * u, by - 1.6, 9 * u, 1.6, { fill: '595959', line: INK, w: 1.5 })); out.push(R(cx - w, by - h, 2 * w, h - 1.6, { fill: 'A6A6A6', line: INK, w: 1.5 }));
      if (pt.flame !== false) { out.push(E(cx, by - h - 3.2 * u, 1.5 * u, 3.4 * u, { fill: 'FFB000', line: null })); out.push(E(cx, by - h - 2.2 * u, 0.8 * u, 2.2 * u, { fill: '2F80ED', line: null })); }
      g.bb = { x0: cx - 4.5 * u, x1: cx + 4.5 * u, y0: by - h - (pt.flame !== false ? 6.6 * u : 0), y1: by }; g.top = [cx, g.bb.y0]; g.heat = true; break; }
    case 'tripod': { const h = 19 * u, w = 8 * u; out.push(L(cx - w, by - h, cx - w - 2, by, { w: 2.5 })); out.push(L(cx + w, by - h, cx + w + 2, by, { w: 2.5 })); out.push(R(cx - w - 1, by - h - 1.2, 2 * w + 2, 1.2, { fill: 'D9D9D9', line: INK, w: 1.5 }));
      g.bb = { x0: cx - w - 2, x1: cx + w + 2, y0: by - h - 1.2, y1: by }; g.support = by - h - 1.2; g.top = [cx, g.support]; break; }
    case 'gas_jar': { const hw = 4 * u, h = 22 * u; if (lvl) { if (pt.inverted) { const top = by - h; for (let d = 0; d < h * lvl; d += 0.8) out.push(R(cx - hw, by - d - 0.95 - (h - h * lvl) * 0 , 2 * hw, 0.95, { fill: lc, line: null })); g.surface = by - h * lvl; } else g.surface = liquidRects(cx, by, h, () => hw, lvl, lc, out); }
      wall(cx - hw, by - h, cx - hw, by); wall(cx + hw, by - h, cx + hw, by); if (pt.inverted) wall(cx - hw, by - h, cx + hw, by - h); else wall(cx - hw, by, cx + hw, by);
      g.bb = { x0: cx - hw, x1: cx + hw, y0: by - h, y1: by }; g.top = [cx, by - h]; g.mouth = pt.inverted ? by : by - h; g.hw0 = hw; g.inverted = !!pt.inverted; break; }
    case 'trough': { const hw = 15 * u, h = 8 * u; g.surface = liquidRects(cx, by, h, () => hw, lvl || 0.7, lc, out); wall(cx - hw, by - h, cx - hw, by); wall(cx + hw, by - h, cx + hw, by); wall(cx - hw, by, cx + hw, by);
      const sy = by - h * 0.55; out.push(R(cx - hw * 0.35, sy, hw * 0.7, 1.1, { fill: 'D9D9D9', line: INK, w: 1.5 })); g.bb = { x0: cx - hw, x1: cx + hw, y0: by - h, y1: by }; g.top = [cx, by - h]; g.shelf = sy; g.support = sy; g.rim = by - h; g.hw0 = hw; break; }
    case 'balance': { const w = 10 * u; out.push(R(cx - w, by - 5, 2 * w, 5, { fill: 'D9D9D9', line: INK, w: 2, r: 1 })); out.push(R(cx - 4 * u, by - 4.2, 8 * u, 3, { fill: '203040', line: INK, w: 1 }));
      if (pt.reading) out.push(T(cx, by - 2.7, pt.reading, { pt: 12, bold: true, color: 'A8FFB0', wu: 8 * u })); out.push(R(cx - 6 * u, by - 6.2, 12 * u, 1.2, { fill: 'A6A6A6', line: INK, w: 1.5 }));
      g.bb = { x0: cx - w, x1: cx + w, y0: by - 6.2, y1: by }; g.support = by - 6.2; g.top = [cx, g.support]; break; }
    case 'dish': { const hw = 6 * u, h = 3.5 * u; out.push(...arc(cx, by - h, hw, 0, Math.PI, { w: 2 })); out.push(L(cx - hw, by - h, cx + hw, by - h, { w: 2 })); if (lvl) out.push(R(cx - hw * 0.7, by - h - 0.9, hw * 1.4, 0.9, { fill: lc, line: null }));
      g.bb = { x0: cx - hw, x1: cx + hw, y0: by - h, y1: by }; g.top = [cx, by - h]; g.mouth = by - h; g.hw0 = hw; break; }
    case 'funnel': { const hw = 6 * u, h = 8 * u; out.push(L(cx - hw, by - h - 5, cx - 0.9, by - 5, { w: 2 })); out.push(L(cx + hw, by - h - 5, cx + 0.9, by - 5, { w: 2 })); out.push(L(cx - 0.9, by - 5, cx - 0.9, by, { w: 2 })); out.push(L(cx + 0.9, by - 5, cx + 0.9, by, { w: 2 }));
      out.push(L(cx - hw, by - h - 5, cx + hw, by - h - 5, { w: 2 })); if (pt.paper) out.push(L(cx - hw * 0.8, by - h - 4.2, cx, by - 5.5, { w: 1, color: GREY, dash: 'dash' }), L(cx + hw * 0.8, by - h - 4.2, cx, by - 5.5, { w: 1, color: GREY, dash: 'dash' }));
      g.bb = { x0: cx - hw, x1: cx + hw, y0: by - h - 5, y1: by }; g.top = [cx, by - h - 5]; break; }
    case 'stand': { const h = 40 * u; out.push(L(cx, by, cx, by - h, { w: 3 })); out.push(R(cx - 6 * u, by - 1.6, 12 * u, 1.6, { fill: '595959', line: INK, w: 1.5 })); g.bb = { x0: cx - 6 * u, x1: cx + 6 * u, y0: by - h, y1: by }; g.top = [cx, by - h]; break; }
  }
  return g;
}

function buildApparatus(sp) {
  const errors = [], parts = sp.parts || [], out = [], geo = {}, byId = {}, W = 100, H = 70;
  if (!parts.length || parts.length > 10) return { errors: ['apparatus: give 1 to 10 parts'] };
  parts.forEach(p => { if (!p.id || byId[p.id]) errors.push(`apparatus: part id '${p.id}' is missing or repeated`); byId[p.id] = p;
    if (!APP_TYPES.includes(p.type)) errors.push(`apparatus: unknown part type '${p.type}' (use ${APP_TYPES.join(', ')})`);
    if (p.liquid !== undefined && (!isNum(p.liquid) || p.liquid < 0 || p.liquid > 1)) errors.push(`apparatus: ${p.id} liquid must be between 0 and 1`);
    if (p.liquid && !CONTAINERS.includes(p.type)) errors.push(`apparatus: ${p.id} (${p.type}) cannot hold a liquid`);
    if (p.stopper && !['conical_flask', 'test_tube'].includes(p.type)) errors.push(`apparatus: ${p.id} (${p.type}) cannot take a stopper`); });
  const SOLIDW = /\b(granules?|powder|crystals?|lumps?|pieces?|chips?|strips?|ribbon|filings|turnings)\b/i;
  for (const l of (sp.labels || [])) { const q = byId[l.on]; if (q && SOLIDW.test(l.text || '') && !q.solid && CONTAINERS.includes(q.type)) errors.push(`apparatus: label '${l.text}' names a solid in ${l.on}, but no solid is drawn; add "solid":"granules" (or "powder") to that part`); }
  if (errors.length) return { errors };
  out.push(L(6, BENCH, 94, BENCH, { w: 3, color: '595959' }));
  // draw in two passes: parts that sit on the bench first, then parts that rest on another part
  const order = [...parts.filter(p => !p.on && !p.in), ...parts.filter(p => p.on), ...parts.filter(p => p.in)];
  for (const p of order) {
    const u = SIZE[p.size] || 1; let cx = p.x, by = BENCH;
    if (p.on) { const h = geo[p.on]; if (!h) { errors.push(`apparatus: ${p.id} is on '${p.on}', which is not drawn before it (check the id)`); continue; }
      if (h.support === null || h.support === undefined) { errors.push(`apparatus: ${p.id} cannot rest on ${p.on} (${byId[p.on].type}); use a tripod, trough or balance`); continue; } by = h.support; cx = byId[p.on].x + (p.dx || 0); if (p.x !== undefined && Math.abs(p.x - byId[p.on].x) > 0.01) errors.push(`apparatus: ${p.id} is on ${p.on}, so its x must equal ${byId[p.on].x} (or omit x)`); }
    if (p.type === 'thermometer') {
      const h = geo[p.in]; if (!h || !(byId[p.in] && CONTAINERS.includes(byId[p.in].type))) { errors.push(`apparatus: thermometer ${p.id} must be 'in' a container part`); continue; }
      const cont = byId[p.in]; if (!cont.liquid) errors.push(`apparatus: thermometer ${p.id} is in ${p.in}, which has no liquid`);
      const x = h.bb.x0 + (h.bb.x1 - h.bb.x0) * 0.62, y0 = h.bb.y0 - 9, y1 = h.bb.y1 - 2.5;
      out.push(R(x - 0.7, y0, 1.4, y1 - y0, { fill: 'FFFFFF', line: INK, w: 1.2 })); out.push(E(x, y1 + 0.6, 1.5, 1.5, { fill: 'D62728', line: INK, w: 1 })); out.push(R(x - 0.35, y1 - (y1 - y0) * 0.35, 0.7, (y1 - y0) * 0.35, { fill: 'D62728', line: null }));
      geo[p.id] = { bb: { x0: x - 1.5, x1: x + 1.5, y0, y1 }, top: [x, y0], attached: true }; continue; }
    if (p.type === 'funnel') { if (!p.on && !p.in) { errors.push(`apparatus: funnel ${p.id} must be placed 'in' a beaker or flask`); continue; } }
    const h = p.in && p.type === 'funnel' ? (() => { const c = geo[p.in]; if (!c) return null; return c; })() : null;
    if (p.type === 'funnel' && p.in) { const c = geo[p.in]; if (!c) { errors.push(`apparatus: funnel ${p.id} is in '${p.in}', which is not drawn`); continue; }
      const g = drawPart(p, byId[p.in].x, c.mouth + 5, u, out); g.attached = true; geo[p.id] = g; continue; }
    if (p.type === 'gas_jar' && p.inverted && p.on) { geo[p.id] = drawPart(p, cx, by, u, out); continue; }
    geo[p.id] = drawPart(p, cx, by, u, out);
    if (p.solid && geo[p.id].bb && CONTAINERS.includes(p.type)) { const bb = geo[p.id].bb, n = 7; // solid pieces resting on the base
      for (let i = 0; i < n; i++) out.push(E(bb.x0 + (bb.x1 - bb.x0) * (i + 1) / (n + 1), bb.y1 - 1.1 - (i % 2) * 1.2, 1.1, 0.9, { fill: p.solid === 'powder' ? 'BFBFBF' : '7F7F7F', line: INK, w: 0.75 })); }
  }
  if (errors.length) return { errors };
  // stands hold a part with a clamp arm
  parts.filter(p => p.type === 'stand' && p.holds).forEach(p => { const h = geo[p.holds]; if (!h) { errors.push(`apparatus: stand ${p.id} holds '${p.holds}', which is not drawn`); return; }
    const y = h.bb.y0 + (h.bb.y1 - h.bb.y0) * 0.3, gx = geo[p.id].bb; const sx = byId[p.id].x; const tx = sx < (h.bb.x0 + h.bb.x1) / 2 ? h.bb.x0 : h.bb.x1;
    out.push(L(sx, y, tx, y, { w: 3, color: '595959' })); });
  // layout checks
  const free = parts.filter(p => !p.on && !p.in && p.type !== 'stand');
  parts.forEach(p => { const g = geo[p.id]; if (!g || !g.bb) return; if (g.bb.x0 < 16 || g.bb.x1 > 84) errors.push(`apparatus: ${p.id} is outside the drawing area (keep x between about 22 and 78 so labels fit at the sides)`); if (g.bb.y0 < 2) errors.push(`apparatus: ${p.id} is too tall for the frame; use size small or remove a part`); });
  for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) { const a = geo[free[i].id].bb, b = geo[free[j].id].bb;
    const bunsenUnder = (free[i].type === 'bunsen' && free[j].type === 'tripod') || (free[j].type === 'bunsen' && free[i].type === 'tripod');
    if (!bunsenUnder && a.x0 < b.x1 + 1 && b.x0 < a.x1 + 1) errors.push(`apparatus: ${free[i].id} and ${free[j].id} overlap (move one along the bench; x differs by at least the width of the parts)`); }
  // science checks
  parts.forEach(p => {
    if (p.type === 'bunsen') { const above = parts.find(q => q.on && byId[q.on] && byId[q.on].type === 'tripod' && Math.abs(byId[q.on].x - p.x) < 8);
      if (!above) { if (p.flame !== false) errors.push(`apparatus: bunsen ${p.id} heats nothing; put a tripod above it at the same x and the vessel on the tripod`); }
      else if (above.stopper && !(sp.links || []).some(l => l.from === above.id)) errors.push(`apparatus: ${above.id} is sealed with a stopper over a flame and has no delivery tube; a closed vessel must not be heated (remove the stopper or add a link)`);
      if (above && ['test_tube', 'measuring_cylinder', 'gas_jar'].includes(above.type)) errors.push(`apparatus: ${above.id} (${above.type}) is not heated on a tripod; use a beaker, flask or dish`); }
    if (p.type === 'measuring_cylinder' && p.on && byId[p.on].type === 'tripod') errors.push(`apparatus: a measuring cylinder is never heated`);
  });
  (sp.links || []).forEach(l => { const a = byId[l.from], b = byId[l.to];
    if (!a || !b) { errors.push(`apparatus: link ${l.from} -> ${l.to} names a part that does not exist`); return; }
    if (!a.stopper) errors.push(`apparatus: link from ${l.from}: a delivery tube needs a stopper on ${l.from} (set stopper true)`);
    if (!CONTAINERS.includes(b.type)) errors.push(`apparatus: a delivery tube must end in a container, not ${b.type}`);
    const ga = geo[l.from], gb = geo[l.to]; if (!ga || !gb) return;
    const x1 = ga.top[0], y1 = ga.top[1] + 1.5, x2 = gb.top[0], topY = Math.min(ga.bb.y0, gb.bb.y0) - 6;
    if (b.type === 'trough') { // over the rim, under the water, then up into the jar standing on the shelf (or just under the water)
      const jar = parts.find(q => q.on === l.to && q.type === 'gas_jar'), gj = jar && geo[jar.id], xr = gb.bb.x0 + 2.5, yw = gb.bb.y1 - 2.2;
      const pts = [[x1, y1], [x1, topY], [xr, topY], [xr, yw], [gj ? gj.top[0] : x2, yw]]; if (gj) pts.push([gj.top[0], gb.shelf - 6]);
      out.push(...polyline(pts, { w: 2.5, color: '595959' })); return; }
    let endY = gb.inverted ? gb.bb.y1 - 2 : (gb.surface || gb.bb.y1 - 4) + (b.liquid ? 3 : -1);
    const pts = [[x1, y1], [x1, topY], [x2, topY], [x2, endY]]; out.push(...polyline(pts, { w: 2.5, color: '595959' })); });
  // labels: leader lines to the left or right column, spaced so they never overlap
  const labs = (sp.labels || []).map(l => { const g = geo[l.on], p = byId[l.on]; if (!g || !g.bb) { errors.push(`apparatus: label '${l.text}' is on '${l.on}', which does not exist`); return null; }
    if (!l.text || l.text.length > 28) errors.push(`apparatus: label '${l.text}' must be 1 to 28 characters`);
    let ay = g.bb.y0 + (g.bb.y1 - g.bb.y0) * 0.45; if (l.at === 'liquid') { if (!g.surface) errors.push(`apparatus: label '${l.text}' points at the liquid of ${l.on}, which has none`); else ay = g.surface; } else if (l.at === 'top') ay = g.bb.y0 + 1; else if (l.at === 'base') ay = g.bb.y1 - 2;
    const side = l.side === 'left' ? 'left' : l.side === 'right' ? 'right' : ((g.bb.x0 + g.bb.x1) / 2 < 50 ? 'left' : 'right');
    return { text: l.text, side, ay, ax: side === 'left' ? g.bb.x0 : g.bb.x1, ly: ay }; }).filter(Boolean);
  for (const side of ['left', 'right']) { const col = labs.filter(l => l.side === side).sort((a, b) => a.ay - b.ay); let last = -99;
    col.forEach(l => { l.ly = Math.max(l.ay, last + 6.5); last = l.ly; }); const over = last - 66; if (over > 0) col.forEach(l => { l.ly -= over; });
    col.forEach(l => { const lx = side === 'left' ? 17 : 83; out.push(L(l.ax, l.ay, lx, l.ly, { w: 1, color: GREY })); out.push(T(side === 'left' ? 15.5 : 84.5, l.ly, l.text, { pt: 16, bold: true, align: side === 'left' ? 'r' : 'l', wu: 24 })); }); }
  // crop the empty space above the tallest part so a small setup is drawn large, not tiny at the foot of a tall frame
  let minY = 99; for (const sh of out) { const v = sh.t === 'line' ? Math.min(sh.y1, sh.y2) : sh.t === 'ell' ? sh.cy - sh.ry : sh.t === 'text' ? sh.y - 3 : sh.y; if (v < minY) minY = v; }
  const dy = Math.max(0, Math.min(minY - 5, 66 - 34));
  if (dy > 0) for (const sh of out) { for (const k of ['y', 'y1', 'y2', 'cy']) if (typeof sh[k] === 'number') sh[k] -= dy; }
  return { w: W, h: 66 - dy, shapes: out, errors, notes: 'apparatus' };
}


// ---------------------------------------------------------------- machines (pulley, lever, ramp)
// spec: {kind:"pulley"|"lever"|"ramp", ...}. Checks the physics the drawing implies (ideal effort, moments, components on a slope).
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-9);
function buildMachines(sp) {
  const errors = [], out = [], kind = sp.kind;
  const txt = o => !o ? '' : (o.label || '') + (isNum(o.value) ? ` ${o.value} ${o.unit || 'N'}` : '');
  if (kind === 'pulley') {
    const n = sp.supporting_ropes, ld = sp.load || {}, ef = sp.effort || {};
    if (!Number.isInteger(n) || n < 1 || n > 6) return { errors: ['machines: pulley needs supporting_ropes, a whole number from 1 to 6 (the rope strands that hold up the load)'] };
    if (isNum(ld.value) && isNum(ef.value)) {
      if (sp.ideal === undefined) errors.push('machines: load and effort values are given, so set "ideal": true (no friction, no pulley weight: effort = load / ropes) or false (real: effort is larger)');
      else if (sp.ideal === true && !near(ef.value, ld.value / n, 0.03)) errors.push(`machines: ideal pulley with ${n} supporting ropes needs effort = load / ${n} = ${Math.round(ld.value / n * 100) / 100}, not ${ef.value}`);
      else if (sp.ideal === false && ef.value <= ld.value / n) errors.push(`machines: a real pulley (friction, moving pulley weight) needs MORE effort than load / ${n} = ${Math.round(ld.value / n * 100) / 100}, not ${ef.value}`); }
    if (errors.length) return { errors };
    out.push(L(14, 5, 86, 5, { w: 3, color: '595959' }));
    let lx, effX;
    if (n === 1) { out.push(L(40, 5, 40, 10, { w: 2 })); out.push(E(40, 16, 6, 6, { fill: 'D9D9D9', line: INK, w: 2 })); out.push(L(34, 16, 34, 38, { w: 2.5, color: '595959' })); effX = 46; out.push(L(46, 16, 46, 38, { w: 2.5, color: '595959' })); lx = 34; }
    else { const dx = Math.min(10, 30 / (n - 1)), xs = Array.from({ length: n }, (_, i) => 38 + i * dx), a = xs[0] - 4, b = xs[n - 1] + 4;
      out.push(L(a + 2, 5, a + 2, 10, { w: 2 })); out.push(L(b - 2, 5, b - 2, 10, { w: 2 }));
      out.push(R(a, 10, b - a, 6, { fill: 'D9D9D9', line: INK, w: 2 })); out.push(R(a, 34, b - a, 6, { fill: 'D9D9D9', line: INK, w: 2 }));
      xs.forEach(x => out.push(L(x, 16, x, 34, { w: 2.5, color: '595959' })));
      effX = b + 6; out.push(...polyline([[b, 13], [effX, 13], [effX, 40]], { w: 2.5, color: '595959' })); lx = (a + b) / 2; out.push(L(lx, 40, lx, 41, { w: 2 })); }
    const top = n === 1 ? 38 : 41; out.push(L(lx, top - (n === 1 ? 0 : 1), lx, top + 4, { w: 2.5, color: '595959' }));
    out.push(R(lx - 9, top + 4, 18, 9, { fill: 'D9E8F5', line: INK, w: 2 })); out.push(T(lx, top + 17, txt(ld) || 'load', { pt: 14, bold: true, wu: 30 }));
    out.push(L(effX, 40, effX, 52, { w: 3.5, color: PALETTE[1], arrow: 'end' })); out.push(T(effX + 2, 54, txt(ef) || 'effort', { pt: 14, bold: true, color: PALETTE[1], wu: 26, align: 'l' }));
    out.push(T(86, 28, `${n} supporting rope${n > 1 ? 's' : ''}`, { pt: 12, color: GREY, wu: 22, align: 'r' }));
    return { w: 100, h: 66, shapes: out, errors, notes: 'machines' }; }
  if (kind === 'lever') {
    const cls = sp.class, fu = sp.fulcrum, ld = sp.load || {}, ef = sp.effort || {};
    if (![1, 2, 3].includes(cls)) errors.push('machines: lever needs class 1, 2 or 3');
    const fp = fu && fu.pos, lp = ld.pos, ep = ef.pos;
    [['fulcrum', fp], ['load', lp], ['effort', ep]].forEach(([nm, v]) => { if (!isNum(v) || v < 0 || v > 1) errors.push(`machines: ${nm}.pos must be a number from 0 to 1 along the beam`); });
    if (errors.length) return { errors };
    const dl = Math.abs(lp - fp), de = Math.abs(ep - fp);
    if (dl < 0.08 || de < 0.08 || Math.abs(lp - ep) < 0.12) errors.push('machines: fulcrum, load and effort must be at least 0.08 to 0.12 apart along the beam so they can be drawn');
    const between = (m, a, b) => (m > Math.min(a, b) && m < Math.max(a, b));
    if (cls === 1 && !between(fp, lp, ep)) errors.push('machines: class 1 lever: the fulcrum must lie between the load and the effort');
    if (cls === 2 && !between(lp, fp, ep)) errors.push('machines: class 2 lever: the load must lie between the fulcrum and the effort');
    if (cls === 3 && !between(ep, fp, lp)) errors.push('machines: class 3 lever: the effort must lie between the fulcrum and the load');
    if (sp.balanced === true) { if (!(isNum(ld.value) && isNum(ef.value))) errors.push('machines: balanced lever needs load.value and effort.value'); else if (!near(ld.value * dl, ef.value * de, 0.03)) errors.push(`machines: not balanced: load moment ${Math.round(ld.value * dl * 1000) / 1000} vs effort moment ${Math.round(ef.value * de * 1000) / 1000} (value x distance from the fulcrum)`); }
    if (errors.length) return { errors };
    const X = f => 12 + 76 * f; out.push(R(12, 34.5, 76, 3, { fill: 'C9A66B', line: INK, w: 2 }));
    const fx = X(fp); out.push(...polyline([[fx, 37.5], [fx - 5, 48], [fx + 5, 48], [fx, 37.5]], { w: 2.5 })); out.push(L(fx - 8, 48, fx + 8, 48, { w: 3, color: '595959' }));
    out.push(L(X(lp), 37.5, X(lp), 50, { w: 3.5, color: PALETTE[0], arrow: 'end' })); out.push(T(X(lp), 53.5, txt(ld) || 'load', { pt: 14, bold: true, color: PALETTE[0], wu: 26 }));
    if (cls === 1) { out.push(L(X(ep), 37.5, X(ep), 50, { w: 3.5, color: PALETTE[1], arrow: 'end' })); out.push(T(X(ep), 53.5, txt(ef) || 'effort', { pt: 14, bold: true, color: PALETTE[1], wu: 26 })); }
    else { out.push(L(X(ep), 34.5, X(ep), 21, { w: 3.5, color: PALETTE[1], arrow: 'end' })); out.push(T(X(ep), 17, txt(ef) || 'effort', { pt: 14, bold: true, color: PALETTE[1], wu: 26 })); }
    out.push(T(fx, 58.5, fu.label || 'fulcrum', { pt: 12, color: GREY, wu: 22 }));
    return { w: 100, h: 66, shapes: out, errors, notes: 'machines' }; }
  if (kind === 'ramp') {
    const th = sp.angle, fs = sp.forces || [];
    if (!isNum(th) || th < 5 || th > 60) return { errors: ['machines: ramp needs angle between 5 and 60 degrees'] };
    const A = th * Math.PI / 180, DIR = { weight: -90, normal: th + 90, push_up: th, push_down: th + 180, friction_up: th, friction_down: th + 180 };
    if (fs.length > 5) errors.push('machines: at most 5 forces');
    const names = new Set(); const vec = [];
    fs.forEach((f, i) => { if (!f.name || f.name.length > 24) errors.push(`machines: force ${i + 1} needs a name of 1 to 24 characters`); else if (names.has(f.name)) errors.push(`machines: '${f.name}' is repeated`); names.add(f.name);
      if (!isNum(f.value) || f.value <= 0) errors.push(`machines: ${f.name || 'force ' + (i + 1)} needs a positive value`); if (DIR[f.dir] === undefined) errors.push(`machines: ${f.name || 'force ' + (i + 1)} dir must be weight, normal, push_up, push_down, friction_up or friction_down (relative to the slope)`); else vec.push({ f, a: DIR[f.dir] * Math.PI / 180 }); });
    if (sp.smooth === true && fs.some(f => /^friction/.test(f.dir))) errors.push('machines: the ramp is marked smooth, so it cannot have a friction force');
    if (fs.some(f => f.dir === 'weight') && !fs.some(f => f.dir === 'normal')) errors.push('machines: an object resting on a ramp has a normal (contact) force; add one with dir "normal"');
    if (isNum(sp.height) && isNum(sp.length) && !near(sp.height, sp.length * Math.sin(A), 0.04)) errors.push(`machines: height ${sp.height} and length ${sp.length} do not fit a ${th} degree ramp (height should be ${Math.round(sp.length * Math.sin(A) * 100) / 100})`);
    if (vec.length && !errors.length) { const sx = vec.reduce((t, v) => t + v.f.value * Math.cos(v.a), 0), sy = vec.reduce((t, v) => t + v.f.value * Math.sin(v.a), 0), net = Math.hypot(sx, sy), mx = Math.max(...vec.map(v => v.f.value));
      if (sp.balanced === true && net > 0.03 * mx) errors.push(`machines: marked balanced, but the forces add up to ${Math.round(net * 100) / 100}; check the values against the ${th} degree angle (weight along the slope = weight x sin, normal = weight x cos)`);
      if (sp.balanced === false && net < 0.03 * mx) errors.push('machines: marked unbalanced, but the forces add up to zero'); }
    if (errors.length) return { errors };
    const len = Math.min(62, 36 / Math.sin(A)), run = len * Math.cos(A), rise = len * Math.sin(A), x0 = 16, yb = 56;
    out.push(...polyline([[x0, yb], [x0 + run, yb], [x0 + run, yb - rise], [x0, yb]], { w: 2.5 })); out.push(L(8, yb, x0 + run + 8, yb, { w: 3, color: '595959' }));
    out.push(T(x0 + 9, yb - 1.8, `${Math.round(th * 10) / 10}°`, { pt: 13, bold: true, wu: 8, align: 'l' }));
    if (sp.length_label) out.push(T(x0 + run * 0.2 - 4 * Math.sin(A), yb - rise * 0.2 - 4 * Math.cos(A) - 1, sp.length_label, { pt: 13, bold: true, wu: 16, align: 'r' }));
    if (sp.height_label) out.push(T(x0 + run + 2, yb - rise / 2, sp.height_label, { pt: 13, bold: true, wu: 16, align: 'l' }));
    const t = 0.5, px = x0 + run * t, py = yb - rise * t, ux = Math.cos(A), uy = -Math.sin(A), nyv = -Math.cos(A), bw = 9, bh = 6;
    const cc = [[-bw / 2, 0], [bw / 2, 0], [bw / 2, bh], [-bw / 2, bh]].map(([a, b]) => [px + ux * a + (-Math.sin(A)) * b, py + uy * a + (-Math.cos(A)) * b]);
    out.push(...polyline([...cc, cc[0]], { w: 2 })); const ox = px - Math.sin(A) * bh / 2, oy = py - Math.cos(A) * bh / 2;
    if (sp.object && sp.object.label) { const lb = sp.object.label; if (lb.length <= 7) out.push(T(ox, oy, lb, { pt: 11, bold: true, wu: 9 })); else out.push(T(ox - Math.sin(A) * 15 - 6, oy - Math.cos(A) * 15, lb, { pt: 12, bold: true, wu: 24, align: 'r' })); }
    const k = vec.length ? 20 / Math.max(...vec.map(v => v.f.value)) : 1;
    vec.forEach((v, i) => { const col2 = PALETTE[i % PALETTE.length], ux2 = Math.cos(v.a), uy2 = -Math.sin(v.a), d = 4, l2 = v.f.value * k;
      const x1 = ox + ux2 * d, y1 = oy + uy2 * d, x2 = ox + ux2 * (d + l2), y2 = oy + uy2 * (d + l2);
      out.push(L(x1, y1, x2, y2, { color: col2, w: 3.5, arrow: 'end' }));
      out.push(T(x2 + ux2 * 2.5, y2 + uy2 * 3, v.f.label !== undefined ? v.f.label : `${v.f.name} ${v.f.value} ${v.f.unit || 'N'}`, { pt: 13, bold: true, color: col2, wu: 26, align: Math.abs(ux2) < 0.3 ? 'c' : ux2 > 0 ? 'l' : 'r' })); });
    return { w: 100, h: 66, shapes: out, errors, notes: 'machines' }; }
  return { errors: ['machines: kind must be pulley, lever or ramp'] };
}

// ---------------------------------------------------------------- sankey (energy or quantity flow)
// spec: {input:{label,value,unit}, outputs:[{label,value,useful}]}. Band widths are proportional; outputs must add up to the input.
function buildSankey(sp) {
  const errors = [], inp = sp.input || {}, os = sp.outputs || [], unit = inp.unit || 'J';
  if (!inp.label || !isNum(inp.value) || inp.value <= 0) errors.push('sankey: input needs a label and a positive value');
  if (os.length < 2 || os.length > 4) errors.push('sankey: give 2 to 4 outputs');
  os.forEach((o, i) => { if (!o.label || o.label.length > 30) errors.push(`sankey: output ${i + 1} needs a label of 1 to 30 characters`); if (!isNum(o.value) || o.value <= 0) errors.push(`sankey: output ${i + 1} needs a positive value`); });
  if (errors.length) return { errors };
  const tot = os.reduce((t, o) => t + o.value, 0);
  if (!near(tot, inp.value, 0.01)) errors.push(`sankey: the outputs add up to ${Math.round(tot * 1000) / 1000} ${unit} but the input is ${inp.value} ${unit} (energy is conserved: they must be equal)`);
  if (errors.length) return { errors };
  const out = [], k = 28 / inp.value, gap = 5, H = inp.value * k + gap * (os.length - 1), y0 = 33 - H / 2, inTop = 33 - inp.value * k / 2;
  const x0 = 8, x1 = 34, x2 = 58, x3 = 80, band = (xa, xb, ya, yb, col2) => out.push(R(xa, ya, xb - xa, yb - ya, { fill: col2, line: null }));
  band(x0, x1, inTop, inTop + inp.value * k, 'BFDFF5'); let a = inTop, b = y0;
  os.forEach(o => { const h = o.value * k, col2 = o.useful ? 'BFE5BF' : 'F9D3A8', steps = 28;
    for (let i = 0; i < steps; i++) { const f0 = i / steps, f1 = (i + 1) / steps, e = f => 0.5 - 0.5 * Math.cos(Math.PI * f), t = e((f0 + f1) / 2);
      const ya = a + (b - a) * t; out.push(R(x1 + (x2 - x1) * f0 - 0.05, ya, (x2 - x1) / steps + 0.1, h, { fill: col2, line: null })); }
    band(x2, x3, b, b + h, col2); out.push(L(x2, b, x3, b, { w: 1, color: GREY })); out.push(L(x2, b + h, x3, b + h, { w: 1, color: GREY }));
    out.push(T(x3 + 2, b + h / 2, `${o.label} ${o.value} ${unit}`, { pt: 14, bold: true, wu: 19, align: 'l' })); a += h; b += h + gap; });
  out.push(L(x0, inTop, x1, inTop, { w: 1, color: GREY })); out.push(L(x0, inTop + inp.value * k, x1, inTop + inp.value * k, { w: 1, color: GREY }));
  out.push(T((x0 + x1) / 2, inTop - 4, `${inp.label} ${inp.value} ${unit}`, { pt: 14, bold: true, wu: 28 }));
  return { w: 100, h: 66, shapes: out, errors, notes: 'sankey' };
}

// ---------------------------------------------------------------- waves
// spec: {kind:'transverse'|'longitudinal', cycles:2, wavelength:{label}, amplitude:{label}, show:[...], speed, frequency, wavelength_value}
function buildWaves(sp) {
  const errors = [], kind = sp.kind || 'transverse', cyc = sp.cycles === undefined ? 2 : sp.cycles;
  if (!['transverse', 'longitudinal'].includes(kind)) errors.push('waves: kind must be transverse or longitudinal');
  if (!Number.isInteger(cyc) || cyc < 1 || cyc > 4) errors.push('waves: cycles must be a whole number from 1 to 4');
  const v = sp.speed, f = sp.frequency, lam = sp.wavelength_value;
  [['speed', v], ['frequency', f], ['wavelength_value', lam]].forEach(([k, x]) => { if (x !== undefined && (!isNum(x) || x <= 0)) errors.push(`waves: ${k} must be a positive number`); });
  if (isNum(v) && isNum(f) && isNum(lam) && !near(v, f * lam, 0.02)) errors.push(`waves: speed ${v} does not equal frequency ${f} x wavelength ${lam} = ${Math.round(f * lam * 1000) / 1000} (v = f x lambda)`);
  const show = sp.show || ['wavelength', 'amplitude'];
  if (!Array.isArray(show) || show.some(s => !['wavelength', 'amplitude', 'crest', 'trough', 'rest', 'direction', 'compression', 'rarefaction'].includes(s))) errors.push('waves: show may contain wavelength, amplitude, crest, trough, rest, direction, compression, rarefaction');
  if (kind === 'transverse' && show.some(s => ['compression', 'rarefaction'].includes(s))) errors.push('waves: compressions and rarefactions belong to a longitudinal wave');
  if (kind === 'longitudinal' && show.some(s => ['amplitude', 'crest', 'trough'].includes(s))) errors.push('waves: crests, troughs and amplitude are drawn on a transverse wave; a longitudinal wave has compressions and rarefactions');
  if (errors.length) return { errors };
  const out = [], x0 = 10, x1 = 90, lw = (x1 - x0) / cyc, wl = (sp.wavelength || {}).label, am = (sp.amplitude || {}).label;
  if (kind === 'transverse') {
    const cy = 36, A = 13, pts = [];
    for (let i = 0; i <= cyc * 40; i++) { const x = x0 + lw * i / 40; pts.push([x, cy - A * Math.sin(2 * Math.PI * (x - x0) / lw)]); }
    if (show.includes('rest') || show.includes('amplitude')) out.push(L(x0 - 2, cy, x1 + 2, cy, { w: 1, color: GREY, dash: 'dash' }));
    out.push(...polyline(pts, { w: 3, color: '1F77B4' }));
    const crest = x => x0 + lw * 0.25 + lw * x;
    if (show.includes('crest')) out.push(T(crest(0), cy - A - 4, 'crest', { pt: 14, bold: true, wu: 14 }));
    if (show.includes('trough')) out.push(T(x0 + lw * 0.75, cy + A + 4, 'trough', { pt: 14, bold: true, wu: 14 }));
    if (show.includes('wavelength')) { const xa = crest(0), xb = crest(1) > x1 ? x1 - lw * 0.25 + lw * 0 : crest(1), ya = cy - A - 9;
      if (cyc < 2) { const a = x0, b = x0 + lw; out.push(L(a, ya, b, ya, { w: 1.5 })); out.push(L(b, ya, a, ya, { w: 1.5, arrow: 'end' })); out.push(L(a, ya, b, ya, { w: 1.5, arrow: 'end' })); out.push(T((a + b) / 2, ya - 4, wl || 'wavelength', { pt: 15, bold: true, wu: 30 })); }
      else { out.push(L(xa, ya, xb, ya, { w: 1.5, arrow: 'end' })); out.push(L(xb, ya, xa, ya, { w: 1.5, arrow: 'end' })); out.push(L(xa, ya, xa, cy - A - 1, { w: 1, color: GREY, dash: 'dash' })); out.push(L(xb, ya, xb, cy - A - 1, { w: 1, color: GREY, dash: 'dash' })); out.push(T((xa + xb) / 2, ya - 4, wl || 'wavelength', { pt: 15, bold: true, wu: 30 })); } }
    if (show.includes('amplitude')) { const xc = x0 + lw * 0.25 + (cyc >= 2 ? lw : 0), xt = xc + 5; out.push(L(xt, cy, xt, cy - A, { w: 1.5, arrow: 'end' })); out.push(L(xt, cy - A, xt, cy, { w: 1.5, arrow: 'end' })); out.push(L(xc, cy - A, xt + 2, cy - A, { w: 1, color: GREY, dash: 'dash' })); out.push(T(xt + 3, cy - A / 2, am || 'amplitude', { pt: 15, bold: true, wu: 24, align: 'l' })); }
    if (show.includes('direction')) { out.push(L(40, 62, 62, 62, { w: 2.5, arrow: 'end' })); out.push(T(51, 57, 'direction of travel', { pt: 14, wu: 30 })); }
  } else {
    const cy = 33, n = 34 * cyc + 6, k = 2 * Math.PI / lw, a = lw * 0.22, h = 9;
    for (let i = 0; i < n; i++) { const xr = x0 + (x1 - x0) * i / (n - 1), x = xr + a * Math.sin(k * (xr - x0)); out.push(L(x, cy - h, x, cy + h, { w: 1.6, color: '1F77B4' })); }
    const cen = j => x0 + lw * (j + 0.5), ya = cy - h - 5;
    if (show.includes('compression')) for (let j = 0; j < cyc; j++) out.push(T(cen(j) + a * Math.sin(k * (cen(j) - x0)), cy + h + 5, 'compression', { pt: 13, bold: true, wu: 20 }));
    if (show.includes('rarefaction')) for (let j = 0; j < cyc; j++) { const xr = x0 + lw * j, xx = xr + lw; out.push(T(xr, cy + h + 13, 'rarefaction', { pt: 13, bold: true, wu: 20 })); }
    if (show.includes('wavelength') && cyc >= 2) { const xa = cen(0) + a * Math.sin(k * (cen(0) - x0)), xb = cen(1) + a * Math.sin(k * (cen(1) - x0)); out.push(L(xa, ya, xb, ya, { w: 1.5, arrow: 'end' })); out.push(L(xb, ya, xa, ya, { w: 1.5, arrow: 'end' })); out.push(T((xa + xb) / 2, ya - 4, wl || 'wavelength', { pt: 15, bold: true, wu: 30 })); }
    else if (show.includes('wavelength')) errors.push('waves: a longitudinal wavelength needs cycles of at least 2 (it is measured between two compressions)');
    if (show.includes('direction')) { out.push(L(40, 59, 62, 59, { w: 2.5, arrow: 'end' })); out.push(T(51, 64, 'direction of travel', { pt: 14, wu: 30 })); }
  }
  return { w: 100, h: 66, shapes: out, errors, notes: 'waves' };
}

// ---------------------------------------------------------------- rays (reflection, refraction, lenses)
const MEDIA = { air: 1.0, water: 1.33, glass: 1.5, perspex: 1.49, diamond: 2.42, oil: 1.47 };
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;
function buildRays(sp) {
  const errors = [], kind = sp.kind;
  if (!['reflection', 'refraction', 'lens'].includes(kind)) return { errors: ['rays: kind must be reflection, refraction or lens'] };
  const out = [], showLab = !sp.hide_angle_labels;
  const angleMark = (cx, cy, a0, a1, label) => { out.push(...arc(cx, cy, 11, a0, a1, { w: 1.5 })); if (label) { const m = (a0 + a1) / 2; out.push(T(cx + 19 * Math.cos(m), cy + 19 * Math.sin(m), label, { pt: 14, bold: true, wu: 16 })); } };
  if (kind === 'reflection') {
    const i = sp.incidence, r = sp.reflection;
    if (!isNum(i) || i <= 0 || i >= 85) errors.push('rays: incidence must be an angle between 0 and 85 degrees, measured from the normal');
    if (r !== undefined && r !== null && !(isNum(r) && Math.abs(r - i) <= 0.5)) errors.push(`rays: the angle of reflection must equal the angle of incidence (${i} degrees), not ${r}`);
    if (errors.length) return { errors };
    const cx = 50, cy = 42, len = 28;
    out.push(L(cx - 32, cy, cx + 32, cy, { w: 3 })); for (let x = cx - 30; x <= cx + 30; x += 4) out.push(L(x, cy, x - 3, cy + 4, { w: 1, color: GREY }));
    out.push(L(cx, cy - 34, cx, cy, { w: 1.2, color: GREY, dash: 'dash' })); out.push(T(cx + 4, cy - 33, 'normal', { pt: 13, wu: 12, align: 'l' }));
    out.push(L(cx - len * Math.sin(rad(i)), cy - len * Math.cos(rad(i)), cx, cy, { w: 2.5, color: 'D62728', arrow: 'end' }));
    out.push(L(cx, cy, cx + len * Math.sin(rad(i)), cy - len * Math.cos(rad(i)), { w: 2.5, color: 'D62728', arrow: 'end' }));
    if (showLab) { angleMark(cx, cy, -Math.PI / 2 - rad(i), -Math.PI / 2, `i = ${i}°`); angleMark(cx, cy, -Math.PI / 2, -Math.PI / 2 + rad(i), `r = ${i}°`); }
    out.push(T(cx - len * Math.sin(rad(i)) - 3, cy - len * Math.cos(rad(i)) - 4, 'incident ray', { pt: 13, wu: 20, align: 'r' }));
    out.push(T(cx + len * Math.sin(rad(i)) + 3, cy - len * Math.cos(rad(i)) - 4, 'reflected ray', { pt: 13, wu: 22, align: 'l' }));
    out.push(T(cx, cy + 9, 'plane mirror', { pt: 13, wu: 24 }));
    return { w: 100, h: 66, shapes: out, errors, notes: 'rays' };
  }
  if (kind === 'refraction') {
    const m1 = sp.medium1 || 'air', m2 = sp.medium2 || 'glass', i = sp.incidence, rr = sp.refraction;
    const n1 = MEDIA[m1], n2 = MEDIA[m2];
    if (!n1 || !n2) errors.push(`rays: medium1 and medium2 must be among ${Object.keys(MEDIA).join(', ')}`);
    if (!isNum(i) || i <= 0 || i >= 89) errors.push('rays: incidence must be between 0 and 89 degrees, measured from the normal');
    if (errors.length) return { errors };
    if (m1 === m2) return { errors: ['rays: the two media must differ'] };
    const s = n1 * Math.sin(rad(i)) / n2, tir = s >= 1;
    if (tir && rr !== undefined && rr !== null) errors.push(`rays: at ${i} degrees going from ${m1} into ${m2} the light is totally internally reflected (the critical angle is ${Math.round(deg(Math.asin(n2 / n1)) * 10) / 10} degrees), so there is no refracted angle to show`);
    const r = tir ? null : deg(Math.asin(s));
    if (!tir && rr !== undefined && rr !== null && !(isNum(rr) && Math.abs(rr - r) <= 1.5)) errors.push(`rays: ${m1} to ${m2} at ${i} degrees refracts to about ${Math.round(r * 10) / 10} degrees (n = ${n1} and ${n2}), not ${rr}`);
    if (errors.length) return { errors };
    const cx = 50, cy = 33, len = 26;
    out.push(R(12, cy, 76, 30, { fill: 'E3F0FA', line: null })); out.push(L(12, cy, 88, cy, { w: 2 }));
    out.push(T(14, 8, m1, { pt: 14, bold: true, wu: 20, align: 'l' })); out.push(T(14, 60, m2, { pt: 14, bold: true, wu: 20, align: 'l' }));
    out.push(L(cx, 4, cx, 62, { w: 1.2, color: GREY, dash: 'dash' })); out.push(T(cx + 3, 6, 'normal', { pt: 13, wu: 12, align: 'l' }));
    out.push(L(cx - len * Math.sin(rad(i)), cy - len * Math.cos(rad(i)), cx, cy, { w: 2.5, color: 'D62728', arrow: 'end' }));
    if (showLab) angleMark(cx, cy, -Math.PI / 2 - rad(i), -Math.PI / 2, `i = ${i}°`);
    if (tir) { out.push(L(cx, cy, cx + len * Math.sin(rad(i)), cy - len * Math.cos(rad(i)), { w: 2.5, color: 'D62728', arrow: 'end' })); if (showLab) angleMark(cx, cy, -Math.PI / 2, -Math.PI / 2 + rad(i), `r = ${i}°`); out.push(T(cx, 46, 'total internal reflection', { pt: 14, bold: true, wu: 40 })); }
    else { out.push(L(cx, cy, cx + len * Math.sin(rad(r)), cy + len * Math.cos(rad(r)), { w: 2.5, color: 'D62728', arrow: 'end' })); if (showLab && !sp.hide_refracted_angle) angleMark(cx, cy, Math.PI / 2 - rad(r), Math.PI / 2, `r = ${Math.round(r * 10) / 10}°`); }
    return { w: 100, h: 66, shapes: out, errors, notes: 'rays' };
  }
  // lens
  const type = sp.type, u = sp.object_distance, f = sp.f, h = sp.object_height === undefined ? 3 : sp.object_height;
  if (!['convex', 'concave'].includes(type)) errors.push('rays: lens type must be convex or concave');
  if (!isNum(f) || f <= 0) errors.push('rays: f (focal length) must be a positive number; the type says whether the lens converges or diverges');
  if (!isNum(u) || u <= 0) errors.push('rays: object_distance must be a positive number');
  if (!isNum(h) || h <= 0) errors.push('rays: object_height must be a positive number');
  if (errors.length) return { errors };
  const fe = type === 'convex' ? f : -f;
  if (Math.abs(u - fe) < 1e-9) return { errors: ['rays: the object is at the focal point of a convex lens: the rays leave parallel and no image forms. Choose another object distance'] };
  const v = u * fe / (u - fe), m = -v / u, hi = m * h, real = v > 0;
  if (Math.abs(v) > 6 * Math.max(u, f)) return { errors: ['rays: the image would be very far away; move the object further from the focal point'] };
  if (sp.image_distance !== undefined && !(isNum(sp.image_distance) && near(Math.abs(v), sp.image_distance, 0.03))) errors.push(`rays: with f = ${f} and an object at ${u}, the image is at ${Math.round(Math.abs(v) * 100) / 100} (1/f = 1/u + 1/v), not ${sp.image_distance}`);
  if (sp.magnification !== undefined && !(isNum(sp.magnification) && near(Math.abs(m), sp.magnification, 0.03))) errors.push(`rays: the magnification is ${Math.round(Math.abs(m) * 100) / 100}, not ${sp.magnification}`);
  if (errors.length) return { errors };
  const kx = 38 / Math.max(u, Math.abs(v), 2 * f), ky = 14 / Math.max(h, Math.abs(hi)), cx = 50, cy = 33, X = d => cx + kx * d, Y = d => cy - ky * d, unit = sp.unit || '';
  out.push(L(8, cy, 92, cy, { w: 1.2, color: GREY }));
  const tb = (x, y, s) => { const up = s > 0; out.push(L(x, y, x - 1.6, y + (up ? 4 : -4), { w: 2 })); out.push(L(x, y, x + 1.6, y + (up ? 4 : -4), { w: 2 })); };
  out.push(L(cx, 12, cx, 54, { w: 2.5 }));
  if (type === 'convex') { tb(cx, 12, 1); tb(cx, 54, -1); } else { tb(cx, 16, -1); tb(cx, 50, 1); }
  [-1, 1].forEach(sg => { out.push(L(X(sg * f), cy - 1.8, X(sg * f), cy + 1.8, { w: 1.5 })); out.push(T(X(sg * f), cy + 5, 'F', { pt: 14, bold: true, wu: 6 })); });
  if (sp.show_2f) [-1, 1].forEach(sg => { out.push(L(X(sg * 2 * f), cy - 1.8, X(sg * 2 * f), cy + 1.8, { w: 1.5 })); out.push(T(X(sg * 2 * f), cy + 5, '2F', { pt: 14, bold: true, wu: 8 })); });
  const ox = X(-u), oy = Y(h), ix = X(v), iy = Y(hi);
  out.push(L(ox, cy, ox, oy, { w: 3, color: '1F77B4', arrow: 'end' })); out.push(T(ox, cy + 5 + (ky * h > 0 ? 0 : 0), 'object', { pt: 13, bold: true, wu: 12, color: '1F77B4' }));
  out.push(L(ix, cy, ix, iy, { w: 3, color: real ? '2CA02C' : '2CA02C', dash: real ? undefined : 'dash', arrow: 'end' }));
  if (sp.label_image !== false) out.push(T(ix, iy + (hi > 0 ? -4 : 4), 'image', { pt: 13, bold: true, wu: 12, color: '2CA02C' }));
  const rays = [[cx, oy], [cx, cy]];
  rays.forEach(([px, py]) => {
    out.push(L(ox, oy, px, py, { w: 2, color: 'D62728' }));
    if (real) out.push(L(px, py, ix, iy, { w: 2, color: 'D62728', arrow: 'end' }));
    else { const dx = px - ix, dy = py - iy; let t = (88 - px) / dx; if (Math.abs(py + dy * t - cy) > 28) t = t * 28 / Math.abs(py + dy * t - cy); out.push(L(px, py, px + dx * t, py + dy * t, { w: 2, color: 'D62728', arrow: 'end' })); out.push(L(px, py, ix, iy, { w: 1.5, color: 'D62728', dash: 'dash' })); }
  });
  if (sp.describe_image) out.push(T(50, 62, `Image: ${real ? 'real' : 'virtual'}, ${hi > 0 ? 'upright' : 'inverted'}, ${Math.abs(m) > 1.02 ? 'magnified' : Math.abs(m) < 0.98 ? 'diminished' : 'same size'}`, { pt: 14, bold: true, wu: 60 }));
  return { w: 100, h: 66, shapes: out, errors, notes: 'rays' };
}

// ---------------------------------------------------------------- number line
function buildNumberLine(sp) {
  const errors = [], lo = sp.min, hi = sp.max, st = sp.step === undefined ? 1 : sp.step;
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return { errors: ['numberline: min and max are required and max must be larger'] };
  if (!isNum(st) || st <= 0) return { errors: ['numberline: step must be a positive number'] };
  const n = Math.round((hi - lo) / st); if (n > 24) return { errors: ['numberline: more than 24 steps; use a larger step'] };
  if (Math.abs(lo + n * st - hi) > 1e-9) errors.push('numberline: (max - min) must be a whole number of steps');
  const inR = v => isNum(v) && v >= lo - 1e-9 && v <= hi + 1e-9, X = v => 12 + 76 * (v - lo) / (hi - lo), cy = 36, fmt = v => String(Math.round(v * 10000) / 10000);
  const pts = sp.points || [], iv = sp.intervals || [], jp = sp.jumps || [];
  pts.forEach((p, i) => { if (!inR(p.at)) errors.push(`numberline: point ${i + 1} is outside ${lo} to ${hi}`); });
  iv.forEach((p, i) => { const a = p.from === '-inf' ? lo : p.from, b = p.to === 'inf' ? hi : p.to; if (!inR(a) || !inR(b)) errors.push(`numberline: interval ${i + 1} is outside ${lo} to ${hi}`); else if (a >= b) errors.push(`numberline: interval ${i + 1} needs from < to`); });
  jp.forEach((p, i) => { if (!inR(p.from) || !inR(p.to) || p.from === p.to) errors.push(`numberline: jump ${i + 1} must go between two different values inside the line`); });
  const custom = sp.tick_labels; if (custom && (!Array.isArray(custom) || custom.length !== n + 1)) errors.push(`numberline: tick_labels needs ${n + 1} entries (one per tick)`);
  if (errors.length) return { errors };
  const out = [L(7, cy, 93, cy, { w: 2, arrow: 'end' }), L(93, cy, 7, cy, { w: 2, arrow: 'end' })];
  for (let k = 0; k <= n; k++) { const v = lo + k * st, x = X(v); out.push(L(x, cy - 2.5, x, cy + 2.5, { w: 1.5 })); if (sp.hide_values !== true) out.push(T(x, cy + 8, custom ? custom[k] : fmt(v), { pt: n > 14 ? 13 : 16, wu: 10, tick: false })); }
  iv.forEach((p, i) => { const a = p.from === '-inf' ? lo : p.from, b = p.to === 'inf' ? hi : p.to, c = col(p.color, i);
    out.push(L(X(a), cy, X(b), cy, { w: 6, color: c }));
    if (p.from === '-inf') out.push(L(X(a) + 4, cy, X(a) - 3, cy, { w: 6, color: c, arrow: 'end' })); else out.push(E(X(a), cy, 1.7, 1.7, { fill: p.from_open ? 'FFFFFF' : c, line: c, w: 2 }));
    if (p.to === 'inf') out.push(L(X(b) - 4, cy, X(b) + 3, cy, { w: 6, color: c, arrow: 'end' })); else out.push(E(X(b), cy, 1.7, 1.7, { fill: p.to_open ? 'FFFFFF' : c, line: c, w: 2 }));
    if (p.label) out.push(T((X(a) + X(b)) / 2, cy - 9, p.label, { pt: 15, bold: true, wu: 30, color: c })); });
  pts.forEach((p, i) => { const c = col(p.color, i); out.push(E(X(p.at), cy, 1.8, 1.8, { fill: p.open ? 'FFFFFF' : c, line: c, w: 2 })); if (p.label) out.push(T(X(p.at), cy - 8, p.label, { pt: 16, bold: true, wu: 14, color: c })); });
  jp.forEach((p, i) => { const a = X(p.from), b = X(p.to), c = col(p.color, i + 2), r = Math.abs(b - a) / 2, mid = (a + b) / 2, h = Math.min(r, 12), pp = [];
    for (let k = 0; k <= 16; k++) { const t = Math.PI * k / 16, x = mid + (a < b ? -1 : 1) * r * Math.cos(t), y = cy - 3 - h * Math.sin(t); pp.push([x, y]); }
    out.push(...polyline(pp.slice(0, 15), { w: 2.5, color: c })); out.push(L(pp[15][0], pp[15][1], pp[16][0], pp[16][1], { w: 2.5, color: c, arrow: 'end' }));
    if (p.label) out.push(T(mid, cy - 3 - h - 4, p.label, { pt: 15, bold: true, wu: 24, color: c })); });
  return { w: 100, h: 66, shapes: out, errors, notes: 'numberline' };
}

// ---------------------------------------------------------------- molecule (structural formulae)
const VALENCY = { H: 1, C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1, S: 2, P: 3 };
function formulaCounts(s) {
  const st = [{}]; const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g; let m;
  while ((m = re.exec(s))) { if (m[1]) { const t = st[st.length - 1]; t[m[1]] = (t[m[1]] || 0) + (m[2] ? +m[2] : 1); } else if (m[3]) st.push({}); else if (m[4]) { const g = st.pop(), k = m[5] ? +m[5] : 1, t = st[st.length - 1]; for (const e in g) t[e] = (t[e] || 0) + g[e] * k; } }
  return st[0];
}
function buildMolecule(sp) {
  const errors = [], A = sp.atoms || [], B = sp.bonds || [];
  if (A.length < 2 || A.length > 40) return { errors: ['molecule: give 2 to 40 atoms'] };
  const ids = new Set();
  A.forEach((a, i) => { if (!a.id || ids.has(a.id)) errors.push(`molecule: atom ${i + 1} needs a unique id`); ids.add(a.id); if (!VALENCY[a.el]) errors.push(`molecule: atom ${a.id}: element must be one of ${Object.keys(VALENCY).join(', ')}`); if (!isNum(a.x) || !isNum(a.y)) errors.push(`molecule: atom ${a.id} needs x and y`); });
  if (errors.length) return { errors };
  const by = Object.fromEntries(A.map(a => [a.id, a])), used = Object.fromEntries(A.map(a => [a.id, 0]));
  B.forEach((b, i) => { const o = b.order === undefined ? 1 : b.order; if (!by[b.a] || !by[b.b] || b.a === b.b) { errors.push(`molecule: bond ${i + 1} must join two different atoms by id`); return; } if (![1, 2, 3].includes(o)) { errors.push(`molecule: bond ${b.a}-${b.b} order must be 1, 2 or 3`); return; } used[b.a] += o; used[b.b] += o; });
  if (errors.length) return { errors };
  if (sp.check_valency !== false) A.forEach(a => { if (a.charge) return; if (used[a.id] !== VALENCY[a.el]) errors.push(`molecule: ${a.el} (${a.id}) has ${used[a.id]} bond${used[a.id] === 1 ? '' : 's'} but ${a.el} forms ${VALENCY[a.el]} (valency)`); });
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (Math.hypot(A[i].x - A[j].x, A[i].y - A[j].y) < 0.7) errors.push(`molecule: atoms ${A[i].id} and ${A[j].id} sit on top of each other (keep at least 1 unit apart; a bond is about 1.5 units)`);
  if (sp.formula) { const want = formulaCounts(sp.formula), got = {}; A.forEach(a => { got[a.el] = (got[a.el] || 0) + 1; }); const keys = new Set([...Object.keys(want), ...Object.keys(got)]); keys.forEach(k => { if ((want[k] || 0) !== (got[k] || 0)) errors.push(`molecule: formula ${sp.formula} has ${want[k] || 0} ${k} but the drawing has ${got[k] || 0}`); }); }
  if (errors.length) return { errors };
  const bb = bbox(A.map(a => [a.x, a.y])), w = Math.max(bb.x1 - bb.x0, 0.01), h = Math.max(bb.y1 - bb.y0, 0.01), k = Math.min(74 / w, 44 / h, 17), cx = 50 - k * (bb.x0 + bb.x1) / 2, cy = 33 + k * (bb.y0 + bb.y1) / 2;
  const P = a => [cx + k * a.x, cy - k * a.y], out = [];
  B.forEach(b => { const o = b.order || 1, p = P(by[b.a]), q = P(by[b.b]), d = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / d, uy = (q[1] - p[1]) / d, g = 3.6;
    const s = [p[0] + ux * g, p[1] + uy * g], e = [q[0] - ux * g, q[1] - uy * g], off = o === 1 ? [0] : o === 2 ? [-1.1, 1.1] : [-1.8, 0, 1.8];
    off.forEach(f => out.push(L(s[0] - uy * f, s[1] + ux * f, e[0] - uy * f, e[1] + ux * f, { w: 2 }))); });
  A.forEach(a => { const p = P(a); out.push(T(p[0], p[1], a.el, { pt: 20, bold: true, wu: 8, color: a.el === 'C' ? INK : a.el === 'O' ? 'D62728' : a.el === 'N' ? '1F77B4' : INK })); if (a.charge) out.push(T(p[0] + 4, p[1] - 4, a.charge > 0 ? (a.charge > 1 ? a.charge : '') + '+' : (a.charge < -1 ? -a.charge : '') + '−', { pt: 14, bold: true, wu: 6 })); });
  if (sp.name) out.push(T(50, 62, sp.name, { pt: 16, bold: true, wu: 60 }));
  return { w: 100, h: 66, shapes: out, errors, notes: 'molecule' };
}

// ---------------------------------------------------------------- periodic table (first 36 elements)
function buildPeriodic(sp) {
  const errors = [], max = sp.rows === 'first20' ? 20 : 36, hl = sp.highlight || [];
  const pos = {}; // symbol -> [period, group]
  const grp = [[1, 18], [1, 2, 13, 14, 15, 16, 17, 18], [1, 2, 13, 14, 15, 16, 17, 18], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]];
  let z = 0; grp.forEach((gs, pi) => gs.forEach(g => { z++; pos[SYM[z - 1]] = [pi + 1, g, z]; }));
  const periods = max <= 20 ? 4 : 4;
  hl.forEach((h, i) => { const syms = h.symbols || []; if (h.group !== undefined && !(Number.isInteger(h.group) && h.group >= 1 && h.group <= 18)) errors.push(`periodic: highlight ${i + 1}: group must be 1 to 18`); if (h.period !== undefined && !(Number.isInteger(h.period) && h.period >= 1 && h.period <= 4)) errors.push(`periodic: highlight ${i + 1}: period must be 1 to 4`); syms.forEach(s => { if (!pos[s] || pos[s][2] > max) errors.push(`periodic: highlight ${i + 1}: '${s}' is not among the first ${max} elements`); }); if (!syms.length && h.group === undefined && h.period === undefined) errors.push(`periodic: highlight ${i + 1} needs symbols, a group or a period`); });
  if (errors.length) return { errors };
  const cw = 4.9, ch = 8.2, x0 = 5, y0 = 11, out = [];
  for (let g = 1; g <= 18; g++) out.push(T(x0 + (g - 0.5) * cw, y0 - 4, String(g), { pt: 12, wu: 5, color: GREY }));
  for (let p = 1; p <= periods; p++) out.push(T(x0 - 2.2, y0 + (p - 0.5) * ch, String(p), { pt: 12, wu: 4, color: GREY }));
  const colour = {}; hl.forEach((h, i) => { const c = tintOf(col(h.color, i)); Object.keys(pos).forEach(s => { const [p, g, zz] = pos[s]; if (zz > max) return; if ((h.symbols || []).includes(s) || (h.group === g) || (h.period === p)) colour[s] = c; }); });
  Object.keys(pos).forEach(s => { const [p, g, zz] = pos[s]; if (zz > max) return; out.push(R(x0 + (g - 1) * cw, y0 + (p - 1) * ch, cw - 0.3, ch - 0.3, { fill: colour[s] || 'F5F5F5', line: GREY, w: 0.75 })); if (sp.hide_symbols !== true) out.push(T(x0 + (g - 0.5) * cw - 0.15, y0 + (p - 0.5) * ch - 0.15, s, { pt: 12, bold: true, wu: cw })); });
  out.push(T(50, y0 + periods * ch + 4, 'Group (columns) and period (rows)', { pt: 12, wu: 60, color: GREY }));
  hl.forEach((h, i) => { if (h.label) { out.push(R(8 + i * 30, 56, 4, 4, { fill: tintOf(col(h.color, i)), line: GREY, w: 0.75 })); out.push(T(13 + i * 30, 58, h.label, { pt: 13, wu: 24, align: 'l' })); } });
  return { w: 100, h: 66, shapes: out, errors, notes: 'periodic' };
}

// ---------------------------------------------------------------- public API
const FAMILIES = { geometry: buildGeometry, grid: buildGrid, circuit: buildCircuit, atoms: buildAtoms, flow: buildFlow, apparatus: buildApparatus, graph: buildGraph, forces: buildForces, machines: buildMachines, sankey: buildSankey, waves: buildWaves, rays: buildRays, numberline: buildNumberLine, molecule: buildMolecule, periodic: buildPeriodic };

const FAMILY_DOCS = {
  waves: 'Transverse and longitudinal wave diagrams. spec: {"kind":"transverse","cycles":2,"show":["wavelength","amplitude","crest","trough","rest","direction"],"wavelength":{"label":"wavelength (λ)"},"amplitude":{"label":"amplitude"},"speed":340,"frequency":170,"wavelength_value":2} (kind longitudinal shows compression, rarefaction, wavelength, direction instead; cycles 1 to 4). If speed, frequency and wavelength_value are all given they are checked (v = f x wavelength). Labels are free text; give a number only if the lesson gives it.',
  rays: 'Light-ray diagrams. spec: {"kind":"reflection","incidence":35} (angles from the normal; reflection angle, if given, must equal it). {"kind":"refraction","medium1":"air","medium2":"glass","incidence":40,"refraction":25.4} (media air, water, glass, perspex, diamond, oil; the refracted angle is computed from Snell law and, if you give one, checked within 1.5 degrees; past the critical angle the ray is totally reflected and you must not give a refracted angle). {"kind":"lens","type":"convex","f":5,"object_distance":12,"object_height":3,"show_2f":true,"describe_image":false} (the image is computed from 1/f = 1/u + 1/v and drawn with two principal rays; image_distance or magnification, if given, are checked; use describe_image:true to caption it real/virtual, upright/inverted, magnified/diminished). hide_angle_labels:true or hide_refracted_angle:true when students must measure or find the angle.',
  numberline: 'Number lines. spec: {"min":-5,"max":5,"step":1,"points":[{"at":2,"label":"A","open":false}],"intervals":[{"from":-2,"to":3,"from_open":true,"to_open":false,"label":"-2 < x <= 3"},{"from":1,"to":"inf"}],"jumps":[{"from":0,"to":3,"label":"+3"}],"tick_labels":["0","1/4",...],"hide_values":false}. (max - min) must be a whole number of steps, at most 24; everything must lie on the line. An open circle excludes the end value. tick_labels (one per tick) lets you write fractions.',
  molecule: 'Structural formulae from coordinates, with valency checked. spec: {"atoms":[{"id":"c1","el":"C","x":0,"y":0},{"id":"h1","el":"H","x":0,"y":1.5}],"bonds":[{"a":"c1","b":"h1","order":1}],"formula":"CH4","name":"methane"}. Elements H C N O F Cl Br I S P; a bond is about 1.5 units long; order 1, 2 or 3. Every atom must have exactly its usual number of bonds (H 1, C 4, N 3, O 2, halogens 1) unless it carries a charge; formula, if given, must match the atoms drawn. Use for alkanes, alkenes, alcohols, acids and small molecules. Do not draw a structure students are asked to draw.',
  periodic: 'First 20 or 36 elements of the periodic table with highlighted groups, periods or elements. spec: {"rows":"first20","highlight":[{"group":1,"color":"orange","label":"Group 1"},{"period":3,"color":"blue","label":"Period 3"},{"symbols":["Na","Cl"],"color":"green"}],"hide_symbols":false}. Colours: blue, red, green, orange, purple. hide_symbols:true shows an empty table with the pattern only.',
  machines: 'Pulleys, levers and ramps, with the physics checked. spec: {"kind":"pulley","supporting_ropes":3,"ideal":true,"load":{"label":"Bucket","value":90},"effort":{"label":"Pull","value":30}} (ideal true: effort = load / ropes; ideal false: effort must be larger; supporting_ropes 1 is a fixed pulley). {"kind":"lever","class":1,"fulcrum":{"pos":0.5,"label":"fulcrum"},"load":{"pos":0.2,"label":"Stone","value":600},"effort":{"pos":0.9,"label":"Push","value":300},"balanced":true} (pos 0 to 1 along the beam; class 1 fulcrum between, class 2 load between, class 3 effort between; balanced needs load x distance = effort x distance). {"kind":"ramp","angle":30,"smooth":true,"object":{"label":"Block"},"forces":[{"name":"Weight","value":20,"dir":"weight"},{"name":"Normal","value":17.3,"dir":"normal"},{"name":"Push","value":10,"dir":"push_up"}],"balanced":true,"length_label":"2 m","height_label":"1 m"} (dir weight, normal, push_up, push_down, friction_up, friction_down; with balanced:true the forces must add to zero at that angle; a weight needs a normal force; a smooth ramp has no friction; optional height and length numbers are checked against the angle).',
  sankey: 'Sankey diagram of an energy (or quantity) flow, band widths proportional. spec: {"input":{"label":"Electrical energy","value":100,"unit":"J"},"outputs":[{"label":"Light","value":10,"useful":true},{"label":"Heat","value":90,"useful":false}]}. 2 to 4 outputs; they must add up to the input (energy is conserved). Do not use for a diagram students must draw themselves unless you show the input only.',
  geometry: 'Lines, polygons, circles and marked angles from coordinates. spec: {"points":{"A":[0,0],"B":[6,0],"C":[2,4]},"lines":[{"a":"A","b":"B","label":"6 cm","tick":0,"dash":false}],"circles":[{"c":"O","r":3,"label":""}],"angles":[{"at":"B","from":"A","to":"C","label":"40°","right":false}],"point_labels":true,"scale":"exact"}. Coordinates are maths coordinates (y up). scale "exact" => labelled lengths and angles are checked against the coordinates (build fails if they disagree); "not_to_scale" => a caption says so. Use exact only when you give coordinates that really satisfy the labels. Do NOT label an answer students must find.',
  grid: 'Cartesian grid with plotted shapes, lines, points and vectors (transformations, graphs of lines, coordinates). spec: {"x":[-6,6],"y":[-6,6],"step":1,"shapes":[{"pts":[[1,1],[3,1],[3,2]],"labels":["A","B","C"],"color":"blue"}],"lines":[{"m":2,"c":1,"label":"y = 2x + 1"},{"x":3},{"y":2},{"p":[0,0],"q":[2,3]}],"points":[{"at":[2,3],"label":"P"}],"vectors":[{"from":[0,0],"to":[3,2],"label":"a"}]}. Colours: blue, red, green, orange, purple. Everything must lie inside the window. Never draw the image shape students must find.',
  circuit: 'Circuit diagram in standard symbols. spec: {"source":{"type":"cell|battery","label":"6 V"},"series":[{"type":"switch_closed","label":"S"},{"type":"ammeter","label":""}],"parallel":[[{"type":"bulb","label":"L1"}],[{"type":"resistor","label":"R"}]],"bottom":[]}. Types: cell, battery, bulb, resistor, variable_resistor, switch_open, switch_closed, ammeter, voltmeter, fuse, diode, led. Series parts go along the top wire; each parallel entry is one branch (a vertical column of parts). Ammeters go in series, voltmeters in a parallel branch (checked).',
  atoms: 'Bohr diagrams of atoms and ions (shells with electrons). spec: {"atoms":[{"symbol":"Na","protons":11,"neutrons":12,"shells":[2,8,1],"charge":0,"show_counts":true,"label":"atom","outer_only":false}]}. 1-4 atoms side by side (e.g. Na and Na+). Electron counts are checked against the element and charge (first 36 elements). outer_only draws dots for the outer shell only. Omit neutrons if the lesson does not give them. Do not draw an atom students are asked to draw.',
  graph: 'Data graphs and bar charts with labelled axes. spec: {"kind":"line|scatter|bar","x":{"label":"Time (s)","min":0,"max":10,"step":2},"y":{"label":"Distance (m)","min":0,"max":20,"step":5},"series":[{"name":"Cart A","points":[[0,0],[2,4],[4,8]],"style":"straight|curve|none","best_fit":false,"color":"blue"}],"bars":[{"label":"Day 1","value":12}],"hide_points":false}. Every axis label needs a unit in brackets (Time (s)); for a bar chart x is categories (give x.label, unitless true if it has no unit). Points must lie inside the axes; joined lines need increasing x; best_fit draws a least-squares dashed line (3+ points) and must stay inside the y range. Use hide_points:true to show only empty axes when students must plot the data themselves. Use only values the lesson plan or its data table gives; never plot a result students are asked to find or predict.',
  forces: 'Free-body force diagrams: an object with force arrows drawn in proportion to their values. spec: {"object":{"shape":"box|ball|trolley","label":"Box"},"forces":[{"name":"Weight","dir":"down","value":50},{"name":"Normal force","dir":"up","value":50},{"name":"Push","dir":"right","value":30},{"name":"Friction","dir":"left","value":30}],"balanced":true,"surface":true}. dir is up, down, left, right or an angle in degrees (0 = right, 90 = up). Arrow length is proportional to value, so give real values. balanced true => the build checks that the forces add to zero; balanced false => that they do not; omit balanced when the lesson leaves it for students to decide. A label is built from name and value (override with label, or label "" to hide it). Do not give a value or direction students must find.',
  apparatus: 'Laboratory bench setups from fixed, correctly drawn parts. spec: {"parts":[{"id":"b1","type":"beaker","x":50,"size":"m","liquid":0.6,"colour":"blue"}],"links":[{"from":"f1","to":"t1"}],"labels":[{"on":"b1","text":"water","side":"right","at":"liquid"}]}. Part types: beaker, conical_flask, test_tube, measuring_cylinder, bunsen, tripod, gas_jar, trough, balance, thermometer, funnel, dish, stand. x is the position along the bench, 22 to 78 (parts at different x must not overlap: beakers and flasks are about 15 wide, a trough 30). liquid 0 to 1 (fraction full); colour blue, red, green, orange, purple or clear. A part resting on another gives on:"id" (a vessel on a tripod; a tripod, trough and balance can carry things); a bunsen sits at the same x under its tripod. A thermometer or funnel gives in:"id" (a container). solid:"granules" or "powder" draws solid on the base of a container (needed whenever a label names a solid); stopper:true seals a flask or test tube; a delivery tube is a link from a stoppered vessel to a container. inverted:true on a gas_jar on a trough. stand with holds:"id" clamps a part. Labels: side left or right, at liquid, top or base. The build checks: overlaps, a closed vessel over a flame, a flame heating nothing, a thermometer in no liquid, a tube with no stopper. Do not label what students must identify or predict.',
  flow: 'Boxes joined by arrows: a process flow or a cycle. spec: {"kind":"flow|cycle","nodes":[{"text":"Light is absorbed"},{"text":"..."}],"arrow_labels":["","..."],"per_row":4}. 2-10 nodes, each text up to 60 characters. flow runs left to right and wraps in a snake; cycle places nodes in a ring, last arrow returning to the first. arrow_labels[i] labels the arrow leaving node i. Use for sequences, cycles, food chains, processes.',
};

function buildFigure(json) {
  let sp;
  try { sp = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { errors: ['figure: not valid JSON (' + e.message + ')'] }; }
  if (!sp || !FAMILIES[sp.family]) return { errors: [`figure: family must be one of ${Object.keys(FAMILIES).join(', ')}`] };
  try { const r = FAMILIES[sp.family](sp.spec || {}); r.family = sp.family; return r; } catch (e) { return { errors: [`figure ${sp.family}: could not be built (${e.message})`] }; }
}

// Draw a built figure into box {x,y,w,h} inches. Returns {errors, warnings}.
function drawFigure(pptx, slide, boxIn, fig, opts = {}) {
  const rep = { errors: [], warnings: [] };
  const s = Math.min(boxIn.w / fig.w, boxIn.h / fig.h);
  const ox = boxIn.x + (boxIn.w - fig.w * s) / 2, oy = boxIn.y + (boxIn.h - fig.h * s) / 2;
  const X = v => ox + v * s, Y = v => oy + v * s;
  const font = opts.font || 'Calibri', texts = [];
  for (const sh of fig.shapes) {
    if (sh.t === 'line') {
      const x1 = X(sh.x1), y1 = Y(sh.y1); let x2 = X(sh.x2), y2 = Y(sh.y2);
      if (Math.abs(x2 - x1) < 1e-6) x2 = x1; if (Math.abs(y2 - y1) < 1e-6) y2 = y1; // float noise (cos 270 deg = -1.8e-16) must not flip a vertical or horizontal line
      const line = { color: sh.color, width: sh.w, dashType: sh.dash };
      if (sh.arrow) line.endArrowType = 'triangle';
      slide.addShape(pptx.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: (x2 - x1) * (y2 - y1) < 0, flipH: false, line, ...(x2 < x1 && y2 === y1 ? { flipH: true } : {}), ...(y2 < y1 && x2 === x1 ? { flipV: true } : {}) });
    } else if (sh.t === 'ell') {
      slide.addShape(pptx.ShapeType.ellipse, { x: X(sh.cx - sh.rx), y: Y(sh.cy - sh.ry), w: sh.rx * 2 * s, h: sh.ry * 2 * s, line: sh.line ? { color: sh.line, width: sh.w } : { type: 'none' }, fill: sh.fill ? { color: sh.fill } : { type: 'none' } });
    } else if (sh.t === 'rect') {
      const o = { x: X(sh.x), y: Y(sh.y), w: sh.w * s, h: sh.h * s, line: sh.line ? { color: sh.line, width: sh.w_ } : { type: 'none' }, fill: sh.fill ? { color: sh.fill } : { type: 'none' } };
      if (sh.r) { o.rectRadius = Math.min(sh.w, sh.h) * s * 0.18; slide.addShape(pptx.ShapeType.roundRect, o); } else slide.addShape(pptx.ShapeType.rect, o);
    } else if (sh.t === 'text') {
      let pt = sh.pt, wIn = (sh.wu || 20) * s;
      const lines = sh.text.split('\n').length;
      if (sh.box) { // text inside a node box: shrink to fit, never below 12 pt
        const bw = sh.box[0] * s, bh = sh.box[1] * s;
        while (pt > 12 && heightIn(sh.text, pt, bw - 0.1, true) > bh - 0.06) pt -= 1;
        if (heightIn(sh.text, pt, bw - 0.1, true) > bh - 0.06) rep.errors.push(`figure: box text '${sh.text.slice(0, 30)}' does not fit at 12 pt; shorten it`);
        wIn = bw;
      } else wIn = Math.max(wIn, widthIn(sh.text.replace(/\n.*/s, ''), pt, sh.bold) + 0.12);
      const hIn = sh.box ? sh.box[1] * s : Math.max(0.34, lines * pt * 1.2 / 72 + 0.04);
      const x = sh.align === 'l' ? X(sh.x) : sh.align === 'r' ? X(sh.x) - wIn : X(sh.x) - wIn / 2;
      const y = Y(sh.y) - hIn / 2;
      if (!sh.tick) texts.push({ x, y, w: wIn, h: hIn, t: sh.text });
      slide.addText(sh.text, { x, y, w: wIn, h: hIn, fontFace: font, fontSize: pt, bold: sh.bold, italic: sh.italic, color: sh.color, align: sh.align === 'l' ? 'left' : sh.align === 'r' ? 'right' : 'center', valign: 'middle', margin: 0, fit: 'none' });
    }
  }
  // overlapping labels are a legibility fault
  const tight = 0.04;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    const aw = Math.min(a.w, widthIn(a.t.split('\n')[0], 16, true) + 0.1), bw = Math.min(b.w, widthIn(b.t.split('\n')[0], 16, true) + 0.1);
    const acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
    if (Math.abs(acx - bcx) < (aw + bw) / 2 - tight && Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < Math.min(a.h, b.h) - tight) rep.warnings.push(`figure: labels '${a.t.slice(0, 20)}' and '${b.t.slice(0, 20)}' overlap`);
  }
  rep.scale = s;
  return rep;
}

module.exports = { buildFigure, drawFigure, FAMILIES, FAMILY_DOCS };
