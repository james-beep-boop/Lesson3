'use strict';
// Block layout engine (v2, "engaging" design). Every block is measured with real font metrics, then all
// blocks on a slide are scaled together (never below the legibility floor in config; up to 1.3x when
// there is room) until they fit. If they still do not fit the slide is reported, never silently clipped.
// Block types: text, bullets, numbered (rows with coloured badges or icons), callout, table, cards,
// columns, tiles (icon cards), diagram, resource (built by build_deck.js).
const { heightIn, lineCount, widthIn } = require('./measure');
const { T, CFG, tint, shade, onColour } = require('./theme');
const { drawDiagram, frameOf } = require('./diagrams');
const { buildFigure, drawFigure } = require('./figures');
const frameFor = b => (b.fig && !b.fig.errors.length ? { w: b.fig.w, h: b.fig.h } : frameOf(b.template));
const { iconPath, parseIcon } = require('./icons');

const GAP = 0.2;
const ACCENTS = ['47C6E4', 'D7DF23', 'CF128C', 'FCBA63', 'E44145']; // the five phase colours, used for variety in tiles

function normalize(b) {
  const n = { ...b, items: b.items || [], labels: b.labels || [] };
  if (b.type === 'table') { const rows = b.rows || []; n.headers = rows[0] || []; n.rows = rows.slice(1); }
  if (b.type === 'cards') n.cards = n.items;
  if (b.type === 'columns' && !b.columns) n.columns = n.items.map(s => { const [h, ...r] = String(s).split('::'); const hh = parseIcon(String(s)); return hh.icon ? { icon: hh.icon, heading: hh.text.split('::')[0].trim(), text: hh.text.split('::').slice(1).join('::').trim(), items: [] } : { heading: h.trim(), text: r.join('::').trim(), items: [] }; });
  if (b.type === 'figure') { n.type = 'diagram'; n.template = undefined; n.fig = buildFigure(b.figure); n.highlight = []; }
  if (b.type === 'diagram') { n.template = b.template === 'none' ? undefined : b.template; n.highlight = []; }
  if (b.type === 'tiles') n.tiles = n.items.map(parseIcon);
  if (b.type === 'bullets' || b.type === 'numbered') n.rows = n.items.map(parseIcon);
  if (b.type === 'callout' || b.type === 'stems') n.head = parseIcon(b.text || '');
  return n;
}
const isEmptyCell = c => !String(c || '').trim() || /^[?_\s…]+$/.test(String(c));

const baseTable = { text: b => (b.style === 'question' ? 30 : b.style === 'caption' ? 18 : 24), bullets: () => 24, numbered: () => 24, callout: () => 28, table: () => 20, cards: () => 20, columns: () => 21, stems: () => 28, tiles: () => 22 };
const basePt = b => (baseTable[b.type] || (() => 22))(b);
const capPt = (b, hidden) => (hidden ? 18 : b.type === 'table' ? 22 : b.type === 'cards' ? 24 : b.type === 'columns' ? 24 : b.type === 'tiles' ? 26 : b.type === 'callout' || b.type === 'stems' ? 32 : b.style === 'question' ? 36 : 30);
const floor = (b, hidden) => {
  if (b.type === 'table') return hidden ? CFG.hidden_min_pt : CFG.table_min_pt;
  if (b.type === 'cards' || b.type === 'columns') return hidden ? CFG.hidden_min_pt : 16;
  if (b.style === 'question') return hidden ? CFG.hidden_min_pt : 22;
  return hidden ? CFG.hidden_min_pt : CFG.min_pt;
};

function tableGeom(b, w, pt) {
  const cols = b.headers.length;
  const weight = Array.from({ length: cols }, (_, c) => {
    const longest = Math.max(widthIn(b.headers[c], pt, true), ...b.rows.map(r => Math.min(widthIn(String(r[c] || ''), pt), 4.2)));
    return Math.max(1.0, Math.sqrt(longest) * 1.25);
  });
  const sum = weight.reduce((a, v) => a + v, 0), colW = weight.map(v => (v / sum) * w);
  const padX = 0.2, padY = 0.12;
  const rowH = [b.headers, ...b.rows].map((r, ri) => {
    let h = 0; r.forEach((c, ci) => { h = Math.max(h, heightIn(String(c || ' '), pt, colW[ci] - padX, ri === 0)); });
    h += padY; const hasBlank = ri > 0 && r.some(isEmptyCell);
    return Math.max(ri === 0 ? 0.45 : 0.5, hasBlank ? 0.7 : 0, h);
  });
  return { colW, rowH, total: rowH.reduce((a, v) => a + v, 0) };
}
function cardsGeom(b, w, pt) {
  const n = b.cards.length, cols = n <= 4 ? Math.max(1, n) : (n <= 6 ? 3 : 4), gap = 0.15, cw = (w - gap * (cols - 1)) / cols, rows = Math.ceil(n / cols), rh = [];
  for (let r = 0; r < rows; r++) { let h = 0; for (let c = 0; c < cols; c++) { const t = b.cards[r * cols + c]; if (t) h = Math.max(h, heightIn(t, pt, cw - 0.3)); } rh.push(Math.max(0.6, h + 0.25)); }
  return { cols, gap, cw, rh, total: rh.reduce((a, v) => a + v, 0) + gap * (rows - 1) };
}
function columnsGeom(b, w, pt) {
  const n = b.columns.length, gap = 0.2, cw = (w - gap * (n - 1)) / n;
  const parts = b.columns.map(col => {
    const hh = heightIn(col.heading, pt + 3, cw - 0.4 - (col.icon ? 0.6 : 0), true), txt = col.text ? heightIn(col.text, pt, cw - 0.4) : 0;
    const it = (col.items || []).reduce((a, s) => a + heightIn(s, pt, cw - 0.75) + 0.06, 0);
    return Math.max(hh, col.icon ? 0.55 : 0) + 0.1 + txt + (txt && it ? 0.08 : 0) + it;
  });
  return { n, gap, cw, h: Math.max(Math.max(...parts) + 0.45, 1.3) };
}
function tilesGeom(b, w, pt) {
  const n = b.tiles.length, cols = n <= 5 ? n : (n === 6 ? 3 : 4), gap = 0.2, tw = (w - gap * (cols - 1)) / cols, rows = Math.ceil(n / cols), icon = n > 6 ? 0.7 : (n === 5 ? 0.8 : 0.95);
  const rh = [];
  for (let r = 0; r < rows; r++) { let h = 0; for (let c = 0; c < cols; c++) { const t = b.tiles[r * cols + c]; if (t) h = Math.max(h, heightIn(t.text, pt, tw - 0.3, true)); } rh.push(h + icon + 0.5); }
  return { cols, gap, tw, rh, icon, total: rh.reduce((a, v) => a + v, 0) + gap * (rows - 1) };
}
const rowH = (text, pt, w, bullet) => Math.max(0.56, heightIn(text, pt, w - (bullet ? 0.85 : 0.85)) + 0.16);

function measure(b, w, pt) {
  switch (b.type) {
    case 'text': return b.style === 'question' ? Math.max(1.0, heightIn(b.text, pt, w - 1.5, true) + 0.42) : heightIn(b.text, pt, w, b.style === 'emphasis', b.style === 'caption') + 0.04;
    case 'bullets': case 'numbered': return b.rows.reduce((a, r) => a + rowH(r.text, pt, w) + 0.1, 0);
    case 'callout': case 'stems': {
      const lead = b.head.icon ? 0.75 : 0.0, lines = [b.head.text, ...(b.items || [])].filter(Boolean);
      return Math.max(0.3 + lines.reduce((a, s) => a + heightIn(s, pt, w - 0.9 - lead, true) + 0.08, 0), b.head.icon ? 0.95 : 0);
    }
    case 'table': return tableGeom(b, w, pt).total;
    case 'cards': return cardsGeom(b, w, pt).total;
    case 'columns': return columnsGeom(b, w, pt).h;
    case 'tiles': return tilesGeom(b, w, pt).total;
    case 'resource': return 0.62;
    case 'quizlink': return 0.62;
    default: return 0;
  }
}

// Try the normal spacing first, then tighter spacing, before giving up on a slide.
function fit(blocks, region, hidden) {
  let f = null;
  for (const gap of [GAP, 0.12, 0.06]) { f = fitGap(blocks, region, hidden, gap); if (f.fits) return f; }
  return f;
}
function fitGap(blocks, region, hidden, GAPV) {
  const flexIdx = blocks.findIndex(b => b.type === 'diagram');
  const top = flexIdx >= 0 ? 1 : 1.3;
  const trySize = s => {
    const pts = blocks.map(b => Math.min(capPt(b, hidden), Math.max(floor(b, hidden), Math.round(basePt(b) * s))));
    const heights = blocks.map((b, i) => measure(b, region.w, pts[i]));
    return { pts, heights, used: heights.reduce((a, v) => a + v, 0) + GAPV * Math.max(0, blocks.length - 1) };
  };
  let res = null, scale = top;
  for (; scale >= 0.4; scale -= 0.04) {
    res = trySize(scale);
    const left = region.h - res.used;
    const need = flexIdx < 0 ? -0.001 : Math.min(3.0, naturalDiagram(blocks[flexIdx], region) - 0.01);
    if (left >= need) return finish(res, blocks, region, flexIdx, scale, true, GAPV);
    if (res.pts.every((p, i) => p <= floor(blocks[i], hidden))) break;
  }
  return finish(res, blocks, region, flexIdx, scale, false, GAPV);
}
function naturalDiagram(b, region) { const fr = frameFor(b), capH = b.text ? heightIn(b.text, 16, region.w, false, true) + 0.08 : 0; return region.w * fr.h / fr.w + capH; }
function finish(res, blocks, region, flexIdx, scale, fits, GAPV) {
  const heights = res.heights.slice();
  if (flexIdx >= 0) {
    const left = region.h - res.used, fr = frameFor(blocks[flexIdx]), capH = blocks[flexIdx].text ? heightIn(blocks[flexIdx].text, 16, region.w, false, true) + 0.08 : 0;
    const dh = Math.min(left, region.w * fr.h / fr.w + capH);
    heights[flexIdx] = Math.max(0, dh); if (dh < Math.min(2.8, naturalDiagram(blocks[flexIdx], region) - 0.01)) fits = false;
  }
  return { pts: res.pts, heights, fits, scale, gap: GAPV, usedH: heights.reduce((a, v) => a + v, 0) + GAPV * Math.max(0, blocks.length - 1) };
}

function render(pptx, slide, rawBlocks, region, opts) {
  // A diagram next to other blocks: text in a narrow left column, the diagram large on the right
  // (a landscape slide has far more room sideways than downwards).
  const dIdx = rawBlocks.findIndex(b => b.type === 'diagram' || b.type === 'figure');
  if (dIdx >= 0 && rawBlocks.length > 1 && !opts._nested) {
    const others = rawBlocks.filter((_, i) => i !== dIdx), onlyQuestion = others.length === 1 && others[0].type === 'text' && others[0].style === 'question';
    const lw = onlyQuestion ? Math.min(5.2, region.w * 0.42) : Math.min(4.3, region.w * 0.36);  // a lone question box gets a wider column so it does not wrap word by word
    render(pptx, slide, rawBlocks.filter((_, i) => i !== dIdx), { x: region.x, y: region.y, w: lw, h: region.h }, { ...opts, _nested: true });
    return render(pptx, slide, [rawBlocks[dIdx]], { x: region.x + lw + 0.3, y: region.y, w: region.w - lw - 0.3, h: region.h }, { ...opts, _nested: true });
  }
  const blocks = rawBlocks.map(normalize);
  const { phaseHex = '47C6E4', hidden = false, report, resources = {} } = opts;
  const f = fit(blocks, region, hidden);
  let y = region.y;
  blocks.forEach((b, i) => {
    const pt = f.pts[i], h = f.heights[i], w = region.w, x = region.x;
    const common = { fontFace: CFG.font, margin: 0, fit: 'none', valign: 'top' };
    if (b.type === 'text' && b.style === 'question') {
      slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.22, fill: { color: tint(phaseHex, 0.86) }, line: { color: phaseHex, width: 2.25 } });
      const d = Math.min(0.78, h - 0.2);
      slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.22, y: y + (h - d) / 2, w: d, h: d, fill: { color: phaseHex }, line: { color: phaseHex, width: 0 } });
      slide.addText('?', { x: x + 0.22, y: y + (h - d) / 2, w: d, h: d, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 34, bold: true, color: onColour(phaseHex), margin: 0 });
      slide.addText(b.text, { ...common, x: x + 0.22 + d + 0.25, y: y + 0.05, w: w - d - 0.7, h: h - 0.1, fontSize: pt, bold: true, color: T.ink, valign: 'middle' });
    } else if (b.type === 'text') {
      const o = { ...common, x, y, w, h, fontSize: pt, color: b.style === 'caption' ? T.muted : T.ink, bold: b.style === 'emphasis', italic: b.style === 'caption' };
      if (b.style === 'emphasis') o.color = shade(phaseHex, 0.5);
      slide.addText(b.text, o);
    } else if (b.type === 'bullets' || b.type === 'numbered') {
      let ry = y;
      b.rows.forEach((r, k) => {
        const rh = rowH(r.text, pt, w);
        if (r.icon) slide.addImage({ path: iconPath(r.icon), x, y: ry + (rh - 0.52) / 2, w: 0.52, h: 0.52, altText: '' });
        else if (b.type === 'numbered') {
          slide.addShape(pptx.ShapeType.ellipse, { x, y: ry + (rh - 0.5) / 2, w: 0.5, h: 0.5, fill: { color: phaseHex }, line: { color: phaseHex, width: 0 } });
          slide.addText(String(k + 1), { x, y: ry + (rh - 0.5) / 2, w: 0.5, h: 0.5, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 20, bold: true, color: onColour(phaseHex), margin: 0 });
        } else slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.14, y: ry + rh / 2 - 0.11, w: 0.22, h: 0.22, fill: { color: phaseHex }, line: { color: shade(phaseHex, 0.3), width: 1 } });
        slide.addText(r.text, { ...common, x: x + 0.72, y: ry, w: w - 0.8, h: rh, fontSize: pt, color: T.ink, valign: 'middle' });
        ry += rh + 0.1;
      });
    } else if (b.type === 'callout' || b.type === 'stems') {
      slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.14, fill: { color: tint(phaseHex, 0.8) }, line: { color: tint(phaseHex, 0.35), width: 1.25 } });
      slide.addShape(pptx.ShapeType.rect, { x: x + 0.02, y: y + 0.18, w: 0.1, h: h - 0.36, fill: { color: phaseHex }, line: { color: phaseHex, width: 0 } });
      const lead = b.head.icon ? 0.75 : 0;
      if (b.head.icon) slide.addImage({ path: iconPath(b.head.icon), x: x + 0.3, y: y + (h - 0.6) / 2, w: 0.6, h: 0.6, altText: '' });
      const runs = [b.head.text, ...(b.items || [])].filter(Boolean).map((s, k, a) => ({ text: s, options: { bold: true, breakLine: k < a.length - 1, paraSpaceAfter: 6 } }));
      slide.addText(runs, { ...common, x: x + 0.4 + lead, y: y + 0.15, w: w - 0.7 - lead, h: h - 0.3, fontSize: pt, color: T.ink, valign: 'middle' });
    } else if (b.type === 'tiles') {
      const g = tilesGeom(b, w, pt); let ty = y;
      for (let r = 0; r < g.rh.length; r++) {
        for (let c = 0; c < g.cols; c++) {
          const t = b.tiles[r * g.cols + c]; if (!t) continue;
          const tx = x + c * (g.tw + g.gap), acc = ACCENTS[(r * g.cols + c) % 5];
          slide.addShape(pptx.ShapeType.roundRect, { x: tx, y: ty, w: g.tw, h: g.rh[r], rectRadius: 0.16, fill: { color: tint(acc, 0.78) }, line: { color: acc, width: 2 } });
          if (t.icon) slide.addImage({ path: iconPath(t.icon), x: tx + (g.tw - g.icon) / 2, y: ty + 0.15, w: g.icon, h: g.icon, altText: t.text });
          slide.addText(t.text, { ...common, x: tx + 0.15, y: ty + 0.2 + g.icon, w: g.tw - 0.3, h: g.rh[r] - g.icon - 0.3, fontSize: pt, bold: true, color: T.ink, align: 'center', valign: 'middle' });
        }
        ty += g.rh[r] + g.gap;
      }
    } else if (b.type === 'table') {
      const g = tableGeom(b, w, pt), hdrFill = shade(phaseHex, 0.62);
      const rows = [b.headers.map(hd => ({ text: hd, options: { bold: true, color: 'FFFFFF', fill: { color: hdrFill } } })),
        ...b.rows.map(r => r.map((c, ci) => ({ text: String(c || ''), options: { bold: ci === 0, fill: { color: ci === 0 ? tint(phaseHex, 0.82) : 'FFFFFF' }, color: isEmptyCell(c) ? 'AAAAAA' : T.ink } })))];
      slide.addTable(rows, { x, y, w, colW: g.colW, rowH: g.rowH, fontFace: CFG.font, fontSize: pt, valign: 'middle', border: { type: 'solid', pt: 1, color: 'B0B0B0' }, margin: [0.05, 0.1, 0.05, 0.1] });
    } else if (b.type === 'cards') {
      const g = cardsGeom(b, w, pt); let cy = y;
      for (let r = 0; r < g.rh.length; r++) {
        for (let c = 0; c < g.cols; c++) {
          const t = b.cards[r * g.cols + c]; if (!t) continue; const cx = x + c * (g.cw + g.gap);
          slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: cy, w: g.cw, h: g.rh[r], rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: '777777', width: 1.5, dashType: 'dash' } });
          slide.addText(t, { ...common, x: cx + 0.15, y: cy, w: g.cw - 0.3, h: g.rh[r], fontSize: pt, color: T.ink, align: 'center', valign: 'middle' });
        }
        cy += g.rh[r] + g.gap;
      }
    } else if (b.type === 'columns') {
      const g = columnsGeom(b, w, pt);
      b.columns.forEach((col, k) => {
        const cx = x + k * (g.cw + g.gap), acc = b.columns.length > 1 ? phaseHex : phaseHex;
        slide.addShape(pptx.ShapeType.roundRect, { x: cx, y, w: g.cw, h, rectRadius: 0.12, fill: { color: tint(acc, 0.82) }, line: { color: tint(acc, 0.4), width: 1.25 } });
        const off = col.icon ? 0.6 : 0;
        if (col.icon) slide.addImage({ path: iconPath(col.icon), x: cx + 0.18, y: y + 0.16, w: 0.5, h: 0.5, altText: '' });
        slide.addText(col.heading, { ...common, x: cx + 0.2 + off, y: y + 0.18, w: g.cw - 0.4 - off, h: Math.max(0.5, heightIn(col.heading, pt + 3, g.cw - 0.4 - off, true)), fontSize: pt + 3, bold: true, color: shade(acc, 0.5), valign: col.icon ? 'middle' : 'top' });
        const bodyY = y + 0.18 + Math.max(col.icon ? 0.55 : 0, heightIn(col.heading, pt + 3, g.cw - 0.4 - off, true)) + 0.1;
        const runs = [];
        if (col.text) runs.push({ text: col.text, options: { fontSize: pt, color: T.ink, breakLine: !!(col.items && col.items.length), paraSpaceAfter: 5 } });
        (col.items || []).forEach((s, j, a) => runs.push({ text: s, options: { fontSize: pt, color: T.ink, bullet: { indent: 16 }, breakLine: j < a.length - 1, paraSpaceAfter: 3 } }));
        if (runs.length) slide.addText(runs, { ...common, x: cx + 0.2, y: bodyY, w: g.cw - 0.4, h: y + h - bodyY - 0.1, fontFace: CFG.font });
      });
    } else if (b.type === 'diagram') {
      const capH = b.text ? heightIn(b.text, 16, w, false, true) + 0.08 : 0;
      if (b.fig) {
        if (b.fig.errors.length) b.fig.errors.forEach(e => report.errors.push(e));
        else {
          const fr = drawFigure(pptx, slide, { x, y, w, h: Math.max(0, h - capH) }, b.fig, { font: CFG.font });
          fr.errors.forEach(e => report.errors.push(e)); fr.warnings.forEach(e => report.warnings.push(e));
        }
        if (b.text) slide.addText(b.text, { ...common, x, y: y + h - capH + 0.04, w, h: capH, fontSize: 16, italic: true, color: T.muted, align: 'center' });
        y += h + f.gap; return;
      }
      const rep = drawDiagram(pptx, slide, { x, y, w, h: Math.max(0, h - capH) }, { template: b.template, labels: b.labels, highlight: b.highlight, shapes: b.shapes }, { labelPt: 16, font: CFG.font });
      if (rep.labelsMissing.length) report.errors.push(`diagram '${b.template}': unknown labels ${rep.labelsMissing.join(', ')}`);
      if (b.text) slide.addText(b.text, { ...common, x, y: y + h - capH + 0.04, w, h: capH, fontSize: 16, italic: true, color: T.muted, align: 'center' });
    } else if (b.type === 'quizlink') {
      let rx = x;
      const iconQ = require('path').join(__dirname, '..', 'assets', 'icon_quiz.png');
      for (const l of b.links) {
        const text = b.links.length > 1 || l.n > 1 ? `Check understanding (question ${l.n})` : 'Check understanding';
        const lw = Math.min(5.2, widthIn(text, 16, true) + 0.1);
        slide.addImage({ path: iconQ, x: rx, y: y + 0.05, w: 0.5, h: 0.5, hyperlink: { url: l.url, tooltip: text }, altText: `${text} - opens quiz question ${l.q} in ARES` });
        slide.addText(text, { ...common, x: rx + 0.58, y: y + 0.05, w: lw, h: 0.5, fontSize: 16, bold: true, color: 'A3125F', valign: 'middle', hyperlink: { url: l.url, tooltip: text } });
        rx += 0.58 + lw + 0.35; if (rx > x + w) report.warnings.push('quiz link row wider than the slide area');
      }
    } else if (b.type === 'resource') {
      let rx = x;
      for (const key of b.resource_keys || []) {
        const r = resources[key]; if (!r) { report.errors.push(`resource key '${key}' not in this lesson's resourceLinks`); continue; }
        const lw = Math.min(5.2, widthIn(r.title, 16, false) + 0.1);
        slide.addImage({ path: r.iconPath, x: rx, y: y + 0.05, w: 0.5, h: 0.5, hyperlink: { url: r.url, tooltip: r.title }, altText: `${r.title} (${r.content_type}) - opens an ARES resource` });
        slide.addText(r.title, { ...common, x: rx + 0.58, y: y + 0.05, w: lw, h: 0.5, fontSize: 16, color: '1F4E79', valign: 'middle', hyperlink: { url: r.url, tooltip: r.title } });
        rx += 0.58 + lw + 0.35; if (rx > x + w) report.warnings.push('resource row wider than the slide area');
      }
    }
    y += h + f.gap;
  });
  if (!f.fits) report.errors.push(`${opts.label ? "slide '" + opts.label + "': " : ''}content does not fit: needs ${f.usedH.toFixed(2)} in, has ${region.h.toFixed(2)} in at the minimum legible sizes (shorten the slide or split it)`);
  report.layout.push({ scale: +f.scale.toFixed(2), pts: f.pts, usedH: +f.usedH.toFixed(2), regionH: +region.h.toFixed(2) });
  return f;
}

module.exports = { render, fit, measure, GAP, isEmptyCell, normalize };
