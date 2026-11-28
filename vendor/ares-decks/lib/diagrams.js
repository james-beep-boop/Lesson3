'use strict';
// Vector diagram templates (drawn with PowerPoint shapes: editable, no photos, scales cleanly).
// Frame is 100 x 56 units. The cell sits in the middle (x 25..75) so labels have room both sides.
// A template is reviewed science once; every deck that uses it shows the same drawing and the
// same label names (Manual section 11: one consistent version). Add templates here, not in decks.

const { widthIn } = require('./measure');

const FRAME = { w: 100, h: 56 };
// templates may crop the frame vertically (y0, h) so a wide drawing is not shrunk by empty space
const frameOf = name => ({ x0: 0, w: FRAME.w, y0: 0, h: FRAME.h, ...((TEMPLATES[name] || {}).frame || {}) });

const ell = (cx, cy, w, h, fill, line, lw = 1, dash) => ({ t: 'ellipse', x: cx - w / 2, y: cy - h / 2, w, h, fill, line, lw, dash });
const box = (x, y, w, h, fill, line, lw = 1, r = 0) => ({ t: r ? 'roundRect' : 'rect', x, y, w, h, fill, line, lw, r });
const dot = (x, y, r = 0.45, fill = '222222') => ell(x, y, r * 2, r * 2, fill, fill, 0.25);
const seg = (x1, y1, x2, y2, line = '333333', lw = 1) => ({ t: 'line', x1, y1, x2, y2, line, lw });
function wave(x1, y1, x2, y2, amp, n, line, lw) { // wavy polyline as segments
  const out = []; let px = x1, py = y1;
  for (let i = 1; i <= n; i++) {
    const f = i / n, x = x1 + (x2 - x1) * f, y = y1 + (y2 - y1) * f + (i % 2 ? amp : -amp);
    out.push(seg(px, py, x, y, line, lw)); px = x; py = y;
  }
  return out;
}
function bean(cx, cy, w, h) { // mitochondrion: outer oval, folded inner membrane
  const o = [ell(cx, cy, w, h, 'FBD6A5', 'E07B00', 1.2)];
  const x0 = cx - w * 0.32;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * w * 0.32;
    o.push(seg(x, cy - h * 0.3, x + w * 0.1, cy + h * 0.05, 'E07B00', 0.8), seg(x + w * 0.1, cy + h * 0.05, x, cy + h * 0.3, 'E07B00', 0.8));
  }
  return o;
}
function chloroplast(cx, cy, w, h) {
  const o = [ell(cx, cy, w, h, 'A5D6A7', '2E7D32', 1.2)];
  for (let i = -1; i <= 1; i++) o.push(box(cx + i * w * 0.22 - w * 0.07, cy - h * 0.2, w * 0.14, h * 0.4, '66BB6A', '2E7D32', 0.5));
  return o;
}
function stack(cx, cy, w, n, fill, line) { // Golgi apparatus: stacked flattened sacs
  const o = [];
  for (let i = 0; i < n; i++) o.push(box(cx - (w - i * 0.6) / 2, cy - n * 1.0 + i * 2.0, w - i * 0.6, 1.5, fill, line, 0.8, 1));
  return o;
}
function tangle(x0, y0, w, h, line, lw) { // nucleoid DNA: a looped tangle
  const o = []; const n = 90; let px, py;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = x0 + w / 2 + (w / 2) * (0.75 * Math.sin(3 * t + 0.6) + 0.25 * Math.sin(7 * t));
    const y = y0 + h / 2 + (h / 2) * (0.8 * Math.sin(2 * t) + 0.2 * Math.cos(5 * t));
    if (i) o.push(seg(px, py, x, y, line, lw));
    px = x; py = y;
  }
  return o;
}

const TEMPLATES = {
  animal_cell: {
    name: 'Animal cell (eukaryote)',
    shapes: [
      ell(50, 28, 50, 52, 'FDEBF0', 'C2185B', 2.5),
      ell(43, 24, 19, 19, 'E8DDF5', '6A3FA0', 1.6),
      ell(42, 23, 6.5, 6.5, '8E5CC8', '6A3FA0', 0.6),
      ...bean(61, 15, 9.5, 5), ...bean(60, 47, 9.5, 5), ...bean(33, 40, 9.5, 5),
      ...wave(51, 36, 64, 36, 0.7, 8, '7B1FA2', 1.3), ...wave(51, 38.4, 64, 38.4, 0.7, 8, '7B1FA2', 1.3), ...wave(51, 40.8, 64, 40.8, 0.7, 8, '7B1FA2', 1.3),
      dot(53, 35.3), dot(56, 35.3), dot(59, 35.3), dot(62, 35.3), dot(54, 41.6), dot(58, 41.6), dot(62, 41.6),
      ...stack(65, 27, 11, 4, 'FFE0B2', 'EF6C00'),
      ell(70, 32, 4.4, 4.4, 'C8E6C9', '2E7D32', 1),
      box(33, 10.6, 3.6, 1.3, '455A64', '455A64', 0.5), box(34.4, 9.1, 1.3, 3.6, '455A64', '455A64', 0.5),
      dot(31, 28), dot(52, 20), dot(46, 47), dot(40, 46), dot(70, 22), dot(34, 20), dot(69, 42),
    ],
    labels: {
      'cell membrane': { a: [25.6, 22], side: 'l', ly: 8 },
      'centrioles': { a: [35, 10.5], side: 'l', ly: 17 },
      'nucleus': { a: [37, 27], side: 'l', ly: 27 },
      'mitochondrion': { a: [30.5, 40], side: 'l', ly: 40 },
      'cytoplasm': { a: [46, 49], side: 'l', ly: 50 },
      'ribosomes': { a: [70, 22], side: 'r', ly: 8 },
      'Golgi apparatus': { a: [71, 27], side: 'r', ly: 17 },
      'lysosome': { a: [72, 32.5], side: 'r', ly: 27 },
      'endoplasmic reticulum': { a: [64, 38], side: 'r', ly: 38 },
    },
    note: 'Simplified labelled drawing of a generalised animal cell.',
  },
  plant_cell: {
    name: 'Plant cell (eukaryote)',
    shapes: [
      box(25, 2, 50, 52, 'F1F8E9', '2E7D32', 5),
      box(26.6, 3.6, 46.8, 48.8, 'F1F8E9', 'AD1457', 1.4),
      box(38, 14, 27, 28, 'D6EEF8', '5DADE2', 1.6, 3),
      ell(32.5, 11, 9, 9, 'E8DDF5', '6A3FA0', 1.6), ell(32, 10.5, 3.2, 3.2, '8E5CC8', '6A3FA0', 0.5),
      ...chloroplast(31, 26, 7.5, 4.2), ...chloroplast(31, 36, 7.5, 4.2), ...chloroplast(69, 22, 7.5, 4.2), ...chloroplast(69, 34, 7.5, 4.2),
      ...chloroplast(45, 47.5, 8, 4), ...chloroplast(58, 8.5, 8, 4),
      ...bean(68, 45, 8, 4.4), ...bean(40, 8, 8, 4.4),
      ...wave(30, 18, 40, 18, 0.5, 6, '7B1FA2', 1.2), ...wave(30, 19.8, 40, 19.8, 0.5, 6, '7B1FA2', 1.2),
      dot(32, 17.3), dot(35, 17.3), dot(38, 17.3),
      ...stack(60, 48, 9, 3, 'FFE0B2', 'EF6C00'),
      dot(30, 45), dot(36, 44), dot(66, 12), dot(70, 28), dot(52, 46), dot(29, 31),
    ],
    labels: {
      'cell wall': { a: [25.0, 6], side: 'l', ly: 6 },
      'nucleus': { a: [28.2, 12], side: 'l', ly: 14 },
      'endoplasmic reticulum': { a: [30, 19], side: 'l', ly: 22 },
      'chloroplast': { a: [27.8, 26], side: 'l', ly: 31 },
      'cytoplasm': { a: [29, 43], side: 'l', ly: 45 },
      'cell membrane': { a: [73.4, 10], side: 'r', ly: 6 },
      'vacuole': { a: [64, 22], side: 'r', ly: 18 },
      'ribosomes': { a: [70, 28], side: 'r', ly: 31 },
      'mitochondrion': { a: [72, 45], side: 'r', ly: 42 },
      'Golgi apparatus': { a: [64.5, 48], side: 'r', ly: 50 },
    },
    note: 'Simplified labelled drawing of a generalised plant cell.',
  },
  bacterium: {
    name: 'Bacterium, e.g. E. coli (prokaryote)',
    frame: { y0: 2, h: 46 },
    shapes: [
      box(25, 14, 52, 28, 'FFF8E1', 'A0522D', 4.5, 14),
      box(26.8, 15.8, 48.4, 24.4, 'FFFDF5', '5D4037', 1.2, 12),
      ...tangle(34, 20, 22, 12, '1565C0', 1.4),
      ell(65, 28, 6.5, 6.5, 'FFFDF5', '1565C0', 1.8),
      ...wave(77, 28, 97, 28, 2.2, 10, '6D4C41', 2),
      dot(31, 19), dot(31, 36), dot(44, 18), dot(48, 37), dot(58, 19), dot(60, 38), dot(70, 19), dot(70, 37), dot(40, 38), dot(62, 25), dot(57, 33), dot(33, 29), dot(52, 18.5),
    ],
    labels: {
      'cell wall': { a: [50, 14.4], side: 'l', ly: 6 },
      'cell membrane': { a: [26.8, 26], side: 'l', ly: 19 },
      'DNA (free in cytoplasm)': { a: [35, 27], side: 'l', ly: 33 },
      'cytoplasm': { a: [50, 36.5], side: 'l', ly: 46 },
      'ribosomes': { a: [58, 19], side: 'r', ly: 8 },
      'flagellum': { a: [88, 28], side: 'r', ly: 18 },
      'plasmid': { a: [65, 31.2], side: 'r', ly: 44 },
    },
    note: 'Simplified labelled drawing of a bacterium. Not to scale: bacteria are much smaller than animal and plant cells.',
  },
};

// Draw a diagram into box {x,y,w,h} (inches). spec: {template, labels:[names], highlight:[names], shapes:[custom]}
function drawDiagram(pptx, slide, boxIn, spec, opts = {}) {
  const fr = frameOf(spec.template);
  const s = Math.min(boxIn.w / fr.w, boxIn.h / fr.h);
  const ox = boxIn.x + (boxIn.w - fr.w * s) / 2, oy = boxIn.y + (boxIn.h - fr.h * s) / 2;
  const X = v => ox + v * s, Y = v => oy + (v - fr.y0) * s;
  const tpl = TEMPLATES[spec.template];
  const shapes = tpl ? tpl.shapes : (spec.shapes || []);
  let pt = opts.labelPt || 16;
  const labelW = 22 * s;                 // width of the label column in inches
  if (tpl) { const longest = Math.max(...Object.keys(tpl.labels).map(k => Math.max(...k.split(/\s+/).map(wd => widthIn(wd, 1, false))))); while (pt > 12 && longest * pt > labelW - 0.05) pt -= 1; }
  const report = { labelsDrawn: [], labelsMissing: [] };
  for (const sh of shapes) {
    if (sh.t === 'line') {
      const x1 = X(sh.x1), y1 = Y(sh.y1), x2 = X(sh.x2), y2 = Y(sh.y2);
      slide.addShape(pptx.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: (x2 - x1) * (y2 - y1) < 0, line: { color: sh.line, width: sh.lw } });
    } else {
      const shapeType = sh.t === 'ellipse' ? pptx.ShapeType.ellipse : (sh.t === 'roundRect' ? pptx.ShapeType.roundRect : pptx.ShapeType.rect);
      const o = { x: X(sh.x), y: Y(sh.y), w: sh.w * s, h: sh.h * s, line: { color: sh.line, width: sh.lw, dashType: sh.dash }, fill: { color: sh.fill } };
      if (sh.t === 'roundRect') o.rectRadius = Math.min(sh.w, sh.h) * s * 0.5 * Math.min(1, (sh.r || 3) / 14);
      slide.addShape(shapeType, o);
    }
  }
  if (tpl) {
    const want = (spec.labels && spec.labels.length) ? spec.labels : Object.keys(tpl.labels);
    const hl = new Set(spec.highlight || []);
    for (const name of want) {
      const L = tpl.labels[name];
      if (!L) { report.labelsMissing.push(name); continue; }
      if (L.hidden) { report.labelsDrawn.push(name); continue; }   // drawn as a caption instead
      const lw = 22, ly = L.ly;
      const lx = L.side === 'l' ? 1 : 100 - lw - 1 + 0;
      const ex = L.side === 'l' ? lx + lw - 0.5 : lx + 0.5; // leader starts at the label edge nearest the cell
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(X(ex), X(L.a[0])), y: Math.min(Y(ly), Y(L.a[1])), w: Math.abs(X(L.a[0]) - X(ex)), h: Math.abs(Y(L.a[1]) - Y(ly)),
        flipV: (X(L.a[0]) - X(ex)) * (Y(L.a[1]) - Y(ly)) < 0, line: { color: '444444', width: 0.9 },
      });
      slide.addShape(pptx.ShapeType.ellipse, { x: X(L.a[0]) - 0.035, y: Y(L.a[1]) - 0.035, w: 0.07, h: 0.07, fill: { color: '444444' }, line: { color: '444444', width: 0.25 } });
      slide.addText(name, {
        x: X(lx), y: Y(ly) - 0.17, w: lw * s, h: 0.34, fontFace: opts.font || 'Calibri', fontSize: pt, bold: hl.has(name), color: '1A1A1A',
        align: L.side === 'l' ? 'right' : 'left', valign: 'middle', margin: 0, fit: 'none',
      });
      report.labelsDrawn.push(name);
    }
  }
  if (tpl && tpl.captions) for (const c of tpl.captions) slide.addText(c.text, { x: X(c.x) - 10 * s, y: Y(c.y) - 0.22, w: 20 * s, h: 0.44, fontFace: opts.font || 'Calibri', fontSize: Math.max(16, pt), bold: true, color: '1A1A1A', align: 'center', valign: 'middle', margin: 0, fit: 'none' });
  return report;
}

module.exports = { TEMPLATES, drawDiagram, FRAME, frameOf, helpers: { ell, box, dot, seg, wave, bean, chloroplast, stack, tangle } };

// More templates live in diagrams_specialised.js (specialised cells, microscope views, organisation levels).
// Loaded after exports are set so that file can require('./diagrams').helpers without a cycle problem.
try { Object.assign(TEMPLATES, require('./diagrams_specialised').TEMPLATES); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
