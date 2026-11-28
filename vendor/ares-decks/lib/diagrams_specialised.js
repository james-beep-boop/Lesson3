'use strict';
// Specialised diagram templates: microscope views, the light microscope, specialised animal and plant cells,
// and the levels of organisation. Same conventions as diagrams.js (100 x 56 unit frame, drawing in the
// middle, labels in the left/right columns). Colours match diagrams.js: nucleus purple, mitochondria orange,
// chloroplast green, cell wall green, membrane magenta, vacuole light blue.
const { helpers } = require('./diagrams');
const { ell, box, dot, seg, wave, bean, chloroplast } = helpers;

const MEM = 'C2185B', MEM2 = 'AD1457', WALL = '2E7D32', NUC = ['E8DDF5', '6A3FA0'], VAC = ['D6EEF8', '5DADE2'], CYT = 'FDEBF0';

// grow a shape (ellipse/rect) outward by g units
const grow = (s, g) => ({ ...s, x: s.x - g, y: s.y - g, w: s.w + 2 * g, h: s.h + 2 * g });
// union of overlapping shapes drawn as one blob with a clean outline of thickness d
function blob(parts, fill, line, d = 0.5) {
  return [...parts.map(p => ({ ...grow(p, d), fill: line, line, lw: 0.25 })), ...parts.map(p => ({ ...p, fill, line: fill, lw: 0.25 }))];
}
// layered union (e.g. wall, membrane, cytoplasm): layers = [{g, fill, line, lw}] drawn outermost first
function layers(parts, ls) {
  const out = [];
  for (const L of ls) for (const p of parts) out.push({ ...grow(p, L.g), fill: L.fill, line: L.line, lw: L.lw || 1 });
  return out;
}
function arrow(x1, y1, x2, y2, color = '555555', lw = 1.2, hs = 1.4) {
  const a = Math.atan2(y2 - y1, x2 - x1), o = [seg(x1, y1, x2, y2, color, lw)];
  for (const d of [2.6, -2.6]) o.push(seg(x2, y2, x2 - hs * Math.cos(a + d * 0.3), y2 - hs * Math.sin(a + d * 0.3), color, lw));
  return o;
}
const spots = (pts, r = 0.4, fill = '444444') => pts.map(([x, y]) => dot(x, y, r, fill));
const lab = (a, side, ly) => ({ a, side, ly });

const T = {};

// ---------------------------------------------------------------- onion epidermis (microscope view)
{
  const sh = [], CW = 16, CH = 9.4, X0 = 26, Y0 = 4.4;
  const cell = (x, y, w, nuc) => {
    sh.push(box(x, y, w, CH, 'F6F3D8', WALL, 2.4));
    if (w >= CW - 0.1) sh.push(box(x + 4.6, y + 1.7, w - 6.4, CH - 3.4, VAC[0], VAC[1], 1, 3));
    else sh.push(box(x + 4.6, y + 1.7, w - 4.6 - 0.1, CH - 3.4, VAC[0], VAC[1], 1, 3));
    if (nuc) sh.push(ell(x + 2.5, y + CH / 2, 3.4, 4.6, NUC[0], NUC[1], 1.1), ell(x + 2.5, y + CH / 2, 1.4, 1.4, '8E5CC8', NUC[1], 0.4));
  };
  for (let r = 0; r < 5; r++) {
    const y = Y0 + r * CH;
    if (r % 2 === 0) for (let c = 0; c < 3; c++) cell(X0 + c * CW, y, CW, true);
    else { cell(X0, y, CW / 2, false); cell(X0 + CW / 2, y, CW, true); cell(X0 + CW * 1.5, y, CW, true); cell(X0 + CW * 2.5, y, CW / 2, false); }
  }
  T.onion_epidermis = {
    name: 'Onion epidermal cells (light microscope view)',
    shapes: sh,
    labels: {
      'cell wall': lab([X0, Y0 + 3.2], 'l', 8),
      'nucleus': lab([X0 + 2.5, Y0 + 2 * CH + CH / 2], 'l', 28),
      'cytoplasm': lab([X0 + CW * 2 - 3, Y0 + 0.9], 'r', 5),
      'vacuole': lab([X0 + CW * 1.5 + 9.5, Y0 + CH + 4.7], 'r', 20),
    },
    note: 'Onion bulb epidermal cells as seen under a light microscope. They have no chloroplasts because the bulb grows underground and gets no light. Simplified drawing.',
  };
  // vacuole anchor must sit in a full cell of an odd row: use right-hand cell of row 1
}

// ---------------------------------------------------------------- cheek (human epithelial) cells
{
  const cellParts = (cx, cy, j) => [
    ell(cx, cy, 22, 13), ell(cx - 7 * j, cy - 1.5, 13, 11), ell(cx + 7.5, cy + 1.8 * j, 12, 10), ell(cx + 0.5, cy + 4, 15, 8),
  ];
  const cells = [[38, 12, 1], [64, 15, -1], [35, 33, -1], [62, 40, 1]];
  const sh = [];
  for (const [cx, cy, j] of cells) {
    sh.push(...blob(cellParts(cx, cy, j), CYT, MEM, 0.75));
    sh.push(...spots([[cx - 7, cy + 2], [cx + 7, cy - 1], [cx - 3, cy + 5], [cx + 6, cy + 4], [cx - 9, cy - 1]], 0.3, 'B0728C'));
    sh.push(...blob([ell(cx + 0.5 * j, cy + 0.5, 7, 6.2)], NUC[0], NUC[1], 0.5));
    sh.push(ell(cx + 0.5 * j, cy + 0.5, 2.1, 2.1, '8E5CC8', NUC[1], 0.4));
  }
  T.cheek_cells = {
    name: 'Human cheek (epithelial) cells',
    shapes: sh,
    labels: {
      'nucleus': lab([38.4, 12.5], 'l', 12),
      'cytoplasm': lab([29.5, 36.5], 'l', 38),
      'cell membrane': lab([75, 15.8], 'r', 14),
    },
    note: 'Cheek cells are flat and irregular in shape. Animal cells have no cell wall, so the cell membrane is the outer boundary. Simplified drawing.',
  };
}

// ---------------------------------------------------------------- light microscope
{
  const G = ['CFD8DC', '455A64'];
  const sh = [
    // base and arm
    box(33, 49, 38, 4.4, '78909C', '37474F', 1.4, 3),
    box(59.5, 15, 6, 35, G[0], G[1], 1.6),
    box(46, 11.5, 19.5, 6, G[0], G[1], 1.6, 2),
    // body tube and eyepiece
    box(47, 5.5, 6, 20, 'B0BEC5', G[1], 1.6),
    box(48, 1.5, 4, 4.4, '607D8B', '37474F', 1.4), box(47.3, 1, 5.4, 1.1, '37474F', '37474F', 0.5),
    // revolving nosepiece, objectives
    box(42, 25, 16, 3, '90A4AE', G[1], 1.4, 2),
    box(43.2, 28, 3.8, 6, '546E7A', '263238', 1.2), box(43.2, 29.2, 3.8, 0.9, 'ECEFF1', 'ECEFF1', 0.3),
    box(48.2, 28, 3.8, 8, '546E7A', '263238', 1.2), box(48.2, 29.4, 3.8, 0.9, 'ECEFF1', 'ECEFF1', 0.3),
    box(53.2, 28, 3.8, 5, '546E7A', '263238', 1.2),
    // stage, slide, stage clips
    box(37, 40, 28, 2.6, '78909C', '37474F', 1.4),
    box(43, 38.6, 14, 1.4, 'E1F5FE', '0277BD', 1),
    seg(41.5, 38.2, 41.5, 40, '263238', 1.8), seg(41.5, 38.2, 44.5, 38.6, '263238', 1.8),
    seg(58.5, 38.2, 58.5, 40, '263238', 1.8), seg(58.5, 38.2, 55.5, 38.6, '263238', 1.8),
    // light source with rays
    box(44, 45, 12, 4, 'FFF176', 'F9A825', 1.4, 3),
    ...[-4, -1.3, 1.3, 4].map(dx => seg(50 + dx, 44.2, 50 + dx * 0.55, 42.8, 'F9A825', 1.2)),
    // focus knobs on the arm
    ell(62.5, 32, 9, 9, 'ECEFF1', G[1], 1.8), ell(62.5, 32, 4.4, 4.4, '90A4AE', G[1], 1.4),
    seg(60.4, 32, 64.6, 32, G[1], 0.8), seg(62.5, 29.9, 62.5, 34.1, G[1], 0.8),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return seg(62.5 + 4.5 * Math.cos(a), 32 + 4.5 * Math.sin(a), 62.5 + 5.4 * Math.cos(a), 32 + 5.4 * Math.sin(a), G[1], 0.9); }),
  ];
  T.light_microscope = {
    name: 'Light microscope',
    shapes: sh,
    labels: {
      'eyepiece': lab([48.3, 3.5], 'l', 3.5),
      'body tube': lab([47, 15], 'l', 11),
      'revolving nosepiece': lab([42, 26.5], 'l', 19),
      'objective lenses': lab([43.2, 32], 'l', 27),
      'stage clips': lab([41.5, 39], 'l', 35),
      'stage': lab([37.4, 41.3], 'l', 43),
      'light source': lab([44.2, 47], 'l', 51),
      'arm': lab([65.5, 20], 'r', 12),
      'fine focus knob': lab([62.5, 32], 'r', 24),
      'coarse focus knob': lab([66.6, 35], 'r', 38),
      'base': lab([70.6, 51.2], 'r', 51),
    },
    note: 'Labelled light microscope (compound microscope).',
  };
}

// ---------------------------------------------------------------- red blood cell
{
  const RB = ['EF9A9A', 'C62828'];
  const side = (cx, cy) => [
    ...blob([ell(cx - 6.5, cy, 8.5, 11), ell(cx + 6.5, cy, 8.5, 11), box(cx - 6.5, cy - 3.2, 13, 6.4, RB[0], RB[1], 1)], RB[0], RB[1], 0.7),
  ];
  T.red_blood_cell = {
    name: 'Red blood cell (erythrocyte)',
    shapes: [
      ell(40, 25, 28, 28, RB[1], RB[1], 0.5), ell(40, 25, 26.6, 26.6, RB[0], RB[0], 0.5),
      ell(40, 25, 11.5, 11.5, 'FFCDD2', 'E57373', 1), ell(40, 25, 15, 15, 'F8B4B4', 'F8B4B4', 0.3), ell(40, 25, 11.5, 11.5, 'FFCDD2', 'E57373', 1),
      ...side(63, 40),
    ],
    labels: {
      'cell membrane': lab([26.5, 20], 'l', 12),
      'cytoplasm (haemoglobin)': lab([33, 33], 'l', 40),
      'side view': lab([77, 40], 'r', 40),
    },
    note: 'Left: face view; right: side view of the biconcave disc. A mature red blood cell has NO nucleus: the space is filled with haemoglobin, which carries oxygen. The flattened centre gives a large surface area for gas exchange.',
  };
  // 'side view' is a pointer to the right-hand drawing, not a structure: keep it out of the structure list by name
  T.red_blood_cell.labels['side view'] = lab([73.5, 40], 'r', 40);
  T.red_blood_cell.labels['face view'] = lab([40, 38.5], 'r', 20);
  T.red_blood_cell.labels['face view'].a = [53.4, 25];
}

// ---------------------------------------------------------------- white blood cell (phagocyte)
{
  const parts = [ell(50, 28, 34, 32), ell(34, 19, 12, 10), ell(66, 18, 12, 9.5), ell(68, 38, 12, 10), ell(52, 46, 14, 8), ell(33, 39, 11, 10.5), ell(46, 11, 10, 7)];
  const sh = [
    ...blob(parts, 'F3E9FA', MEM, 0.8),
    ...spots([[40, 14], [60, 12], [64, 24], [38, 28], [58, 38], [44, 44], [66, 40], [30, 43], [52, 13], [37, 20], [57, 46]], 0.45, 'B39DDB'),
    ...blob([ell(44, 25, 10, 9), ell(53, 28, 11, 9.5), ell(47, 35, 9.5, 8)], 'D1B8EC', NUC[1], 0.6),
  ];
  T.white_blood_cell = {
    name: 'White blood cell (phagocyte)',
    shapes: sh,
    labels: {
      'cell membrane': lab([29.2, 15.3], 'l', 10),
      'nucleus': lab([43, 25], 'l', 27),
      'cytoplasm': lab([36, 38], 'l', 45),
    },
    note: 'A phagocyte: a white blood cell with an irregular outline and a lobed nucleus. It can change shape to engulf and digest bacteria. Simplified drawing.',
  };
}

// ---------------------------------------------------------------- sperm cell
{
  const tailY = x => 28 + (2.6 - 0.045 * (x - 54.5)) * Math.sin((x - 54.5) * 0.62);
  const tail = []; let px = 54.5, py = 28, bx = 54.5;
  for (let x = 55.3; x <= 94; x += 0.8) { const y = tailY(x); tail.push(seg(px, py, x, y, MEM2, 2.4 - (x - 54.5) * 0.03)); px = x; py = y; if (x < 68) bx = x; }
  T.sperm_cell = {
    name: 'Sperm cell',
    shapes: [
      ...tail,
      ell(33, 28, 16, 11.6, CYT, MEM, 2),
      ell(37.5, 28, 10, 8.6, NUC[0], NUC[1], 1.4),
      ell(28.4, 28, 5, 7.4, 'B3E5FC', '0277BD', 1.2),
      box(41.5, 25, 13, 6, 'FDEBF0', MEM, 1.6, 2),
      ...[0, 1, 2, 3, 4].map(i => ell(43.6 + i * 2.5, 28, 2.1, 5.2, 'FBD6A5', 'E07B00', 1)),
    ],
    labels: {
      'acrosome': lab([28.2, 24.6], 'l', 14),
      'nucleus': lab([38, 28], 'l', 28),
      'cell membrane': lab([33, 33.7], 'l', 42),
      'mitochondria': lab([47.5, 25.2], 'r', 12),
      'tail (flagellum)': lab([bx, tailY(bx)], 'r', 38),
      'mid-piece': lab([50, 31], 'r', 47),
    },
    note: 'Sperm cell (drawn larger relative to its tail than in life). The acrosome holds enzymes that digest the egg coat; mitochondria in the mid-piece supply energy for swimming.',
  };
}

// ---------------------------------------------------------------- egg cell (ovum)
{
  const sh = [
    ell(50, 28, 48, 48, 'FFF3C4', 'F9A825', 2.4), ell(50, 28, 43, 43, 'FFFBE6', 'FFE082', 0.8),
    ...[...Array(24).keys()].map(i => { const a = i * Math.PI / 12; return seg(50 + 21.9 * Math.cos(a), 28 + 21.9 * Math.sin(a), 50 + 23.4 * Math.cos(a), 28 + 23.4 * Math.sin(a), 'F9A825', 0.8); }),
    ell(50, 28, 36, 36, CYT, MEM, 2.4),
    ...spots([[36, 20], [40, 38], [60, 36], [62, 22], [48, 44], [52, 12], [38, 30], [64, 30], [44, 14], [58, 44], [33, 26], [56, 16]], 0.7, 'FFE082'),
    ...spots([[41, 41], [66, 27], [47, 16], [55, 41], [35, 33]], 0.45, 'B0728C'),
    ell(49, 27, 11, 11, NUC[0], NUC[1], 1.8), ell(48, 26, 3.4, 3.4, '8E5CC8', NUC[1], 0.5),
  ];
  T.egg_cell = {
    name: 'Egg cell (ovum)',
    shapes: sh,
    labels: {
      'protective jelly coat': lab([29, 14], 'l', 8),
      'cell membrane': lab([32.2, 28], 'l', 28),
      'cytoplasm': lab([38, 38], 'l', 47),
      'nucleus': lab([54, 24], 'r', 22),
    },
    note: 'The egg cell is the largest human cell. The cytoplasm holds food reserves; a protective coat surrounds the cell membrane (zona pellucida in humans). Simplified drawing.',
  };
}

// ---------------------------------------------------------------- nerve cell (motor neuron)
{
  const sh = [];
  // dendrites
  const dend = [[[29, 25], [26.6, 21], [25.4, 15]], [[26.6, 21], [24.6, 22.5]], [[28.6, 31.6], [26.4, 36.5], [25.2, 42]], [[26.4, 36.5], [24.4, 35]], [[31.5, 22.3], [30.6, 17], [29.8, 12]], [[30.6, 17], [27.4, 15.2]], [[31.5, 34], [30.8, 40], [30.2, 45.5]], [[30.8, 40], [27.8, 41.8]]];
  for (const d of dend) for (let i = 0; i < d.length - 1; i++) sh.push(seg(d[i][0], d[i][1], d[i + 1][0], d[i + 1][1], MEM, 2.2));
  sh.push(...blob([ell(34, 28, 12, 13), ell(39.5, 28, 5, 4)], CYT, MEM, 0.7));
  sh.push(ell(33.5, 28, 6.4, 6.4, NUC[0], NUC[1], 1.4), ell(33, 27.5, 2.2, 2.2, '8E5CC8', NUC[1], 0.4));
  sh.push(...spots([[30, 24], [37.5, 24.5], [36, 32.5], [30.6, 32]], 0.35, 'B0728C'));
  sh.push(seg(41, 28, 70, 28, MEM, 2.6));
  for (let i = 0; i < 4; i++) sh.push(box(44 + i * 6.2, 25.2, 5, 5.6, 'FFF3C4', 'F9A825', 1.5, 3));
  for (const [tx, ty] of [[74, 19.5], [75.5, 25.5], [75.5, 31], [73.5, 37.5]]) sh.push(seg(70, 28, tx + 0.5, ty, MEM, 2), ell(tx + 0.4, ty, 2.8, 2.8, 'F8BBD0', MEM, 1.4));
  T.nerve_cell = {
    name: 'Motor neuron (nerve cell)',
    shapes: sh,
    labels: {
      'dendrites': lab([25.4, 15.2], 'l', 11),
      'nucleus': lab([32, 27], 'l', 26),
      'cell body': lab([30.5, 34], 'l', 42),
      'myelin sheath': lab([52, 25.2], 'r', 6),
      'axon': lab([62, 28], 'r', 15),
      'axon terminals': lab([73.9, 37.5], 'r', 44),
    },
    note: 'Motor neuron. The axon is drawn much shorter than in life (it can be up to 1 m long). The myelin sheath insulates the axon and speeds up the nerve impulse; the gaps between sheath sections are the nodes of Ranvier.',
  };
}

// ---------------------------------------------------------------- muscle cell (skeletal muscle fibre)
{
  const sh = [box(25, 17, 50, 22, 'FFCDD2', MEM, 2.6, 8)];
  for (let x = 28.5; x < 72; x += 3.4) sh.push(box(x, 21.5, 1.4, 13, 'EF9A9A', 'EF9A9A', 0.25));
  for (const y of [25.5, 28, 30.5, 33]) sh.push(seg(27.5, y, 72.5, y, 'E57373', 0.7));
  const nuc = [[34, 19.8], [46, 19.8], [58, 19.8], [67, 19.8], [40, 36.2], [53, 36.2]];
  for (const [x, y] of nuc) sh.push(ell(x, y, 6.4, 3.2, NUC[0], NUC[1], 1.3));
  sh.push(...bean(32, 27.5, 7, 3.4), ...bean(44, 31, 7, 3.4), ...bean(55, 26.5, 7, 3.4), ...bean(64, 30.5, 7, 3.4));
  T.muscle_cell = {
    name: 'Skeletal muscle cell (fibre)',
    shapes: sh,
    labels: {
      'nuclei': lab([34, 19.8], 'l', 12),
      'striations (stripes)': lab([29.9, 30], 'l', 28),
      'cell membrane': lab([26.2, 36], 'l', 44),
      'mitochondria': lab([64, 30.5], 'r', 12),
      'myofibrils': lab([70, 33], 'r', 40),
    },
    note: 'Part of a skeletal muscle fibre: long, with several nuclei just under the cell membrane. Many mitochondria supply the energy for contraction; the stripes come from the arrangement of the protein filaments in the myofibrils.',
  };
  T.muscle_cell.labels['nuclei'].a = [31, 19.8];
  T.muscle_cell.labels['myofibrils'].a = [70, 28];
  T.muscle_cell.labels['myofibrils'].ly = 40;
}

// ---------------------------------------------------------------- ciliated epithelial cell
{
  const sh = [];
  for (let i = 0; i < 7; i++) {
    const x = 41.4 + i * 2.9;
    sh.push(seg(x, 18, x + 0.6, 13, MEM2, 1.5), seg(x + 0.6, 13, x + 1.6, 8, MEM2, 1.5));
  }
  sh.push(box(40, 18, 20, 34, CYT, MEM, 2.4, 4));
  sh.push(...bean(46, 24, 6.4, 3.5), ...bean(54.4, 24.4, 6.4, 3.5), ...bean(50.5, 29.6, 6.4, 3.5));
  sh.push(ell(50, 41.5, 12, 10.5, NUC[0], NUC[1], 1.6), ell(49, 40.5, 3.4, 3.4, '8E5CC8', NUC[1], 0.5));
  sh.push(...spots([[43.5, 34], [57, 34], [43.5, 48], [57, 48], [44, 41], [56.5, 44], [50, 49.5]], 0.38, 'B0728C'));
  T.ciliated_epithelial_cell = {
    name: 'Ciliated epithelial cell',
    shapes: sh,
    labels: {
      'cilia': lab([43.2, 11], 'l', 9),
      'cell membrane': lab([40, 36], 'l', 30),
      'mitochondria': lab([57.5, 24.4], 'r', 14),
      'cytoplasm': lab([57.4, 32], 'r', 28),
      'nucleus': lab([55.5, 43], 'r', 42),
    },
    note: 'Ciliated epithelial cell, e.g. from the lining of the windpipe: the cilia sweep mucus and trapped dust upwards. Mitochondria supply the energy for the beating. Simplified drawing.',
  };
}

// ---------------------------------------------------------------- root hair cell
{
  const parts = [box(33, 4, 34, 22, 'x', 'x', 1, 5), box(46.2, 24, 8.6, 26, 'x', 'x'), ell(50.5, 50.5, 8.6, 7, 'x', 'x')];
  const soil = [];
  const parts2 = [[28, 31], [34, 36], [30, 43], [36, 49], [40, 40], [41, 31], [60, 32], [66, 37], [62, 45], [58, 38], [70, 44], [66, 51], [58, 51], [72, 31], [28, 51], [41, 47]];
  for (const [x, y] of parts2) soil.push(ell(x, y, 5.6, 4.4, 'D7B899', '8D6E63', 1.2), ell(x - 0.6, y - 0.5, 1.6, 1.0, 'EFE0D0', 'EFE0D0', 0.2));
  const drops = [[33, 40], [37, 33], [44, 44], [43, 36], [57, 42], [62, 38], [57, 33], [53, 54], [65, 46], [47, 54]].map(([x, y]) => ell(x, y, 1.9, 2.6, '4FC3F7', '0288D1', 0.8));
  const sh = [
    box(25, 28, 50, 27, 'F5EDE4', 'F5EDE4', 0.3),
    ...soil, ...drops,
    ...layers(parts, [{ g: 1.8, fill: 'A5D6A7', line: WALL, lw: 2.2 }, { g: 0.5, fill: 'F1F8E9', line: MEM2, lw: 1.4 }, { g: 0, fill: 'F1F8E9', line: 'F1F8E9', lw: 0.25 }]),
    ...blob([box(36.5, 8, 27, 13, 'x', 'x', 0, 4), box(48.4, 19, 4.2, 23, 'x', 'x')], VAC[0], VAC[1], 0.5),
    ell(50.5, 46.8, 6.2, 4.4, NUC[0], NUC[1], 1.5), ell(50.5, 46.8, 1.8, 1.8, '8E5CC8', NUC[1], 0.4),
    ...spots([[38, 6.7], [45, 6.4], [56, 6.7], [63, 6.5], [35, 15], [64.5, 17], [47.2, 32], [53.8, 36], [47.4, 41], [53.6, 28], [41, 23], [60, 23]], 0.4, 'B0728C'),
    ...arrow(38.5, 37, 44.4, 38.6, '0288D1', 1.5, 1.4),
    ...arrow(62, 35, 56.4, 36.4, '0288D1', 1.5, 1.4),
  ];
  // drop the stray mitochondrion extras: keep drawing simple (no mitochondria label)
  T.root_hair_cell = {
    name: 'Root hair cell',
    shapes: sh.filter(s => !(s.fill === 'FBD6A5')),
    labels: {
      'cell wall': lab([31.4, 9], 'l', 6),
      'cell membrane': lab([32.7, 15], 'l', 16),
      'root hair': lab([45.4, 35], 'l', 31),
      'cytoplasm': lab([36, 24.7], 'l', 24),
      'vacuole': lab([60, 13], 'r', 10),
      'nucleus': lab([53.4, 47], 'r', 46),
    },
    note: 'Root hair cell: the long thin hair increases the surface area for absorbing water (by osmosis) and mineral ions (by active transport) from the soil. Simplified drawing; soil particles in brown, water in blue.',
  };
  T.root_hair_cell.labels['root hair'].a = [46, 34];
}

// ---------------------------------------------------------------- guard cells
{
  const gap = y => 4 * Math.pow(Math.max(0, 1 - ((y - 28) / 23) ** 2), 0.7);
  const bx = (sx, y) => 50 + sx * (gap(y) + 6.2);
  const ys = [...Array(9).keys()].map(i => 28 + 23 * (i - 4) / 4);
  const sidePts = sx => ys.map(y => ell(bx(sx, y), y, 12.4, 12.5, 'x', 'x'));
  const innerWall = sx => { const o = []; for (let y = 10; y < 46; y += 1.2) o.push(seg(50 + sx * (gap(y) + 0.1), y, 50 + sx * (gap(y + 1.2) + 0.1), y + 1.2, WALL, 4)); return o; };
  const chl = [], cy = [10, 15.5, 21, 26, 42.5, 47];
  for (const sx of [-1, 1]) for (const y of cy) chl.push(...chloroplast(bx(sx, y) + sx * 0.8, y, 5.6, 3.1));
  const sh = [
    ell(50, 28, 6.2, 30, 'EAF4FB', 'EAF4FB', 0.2),
    ...layers([...sidePts(-1), ...sidePts(1)], [{ g: 0.9, fill: WALL, line: WALL, lw: 0.3 }, { g: 0, fill: 'DDF0D5', line: 'DDF0D5', lw: 0.3 }]),
    ...innerWall(-1), ...innerWall(1),
    ...chl,
    ell(bx(-1, 35) - 0.5, 35, 5.4, 5.4, NUC[0], NUC[1], 1.5), ell(bx(1, 35) + 0.5, 35, 5.4, 5.4, NUC[0], NUC[1], 1.5),
  ];
  T.guard_cells = {
    name: 'Guard cells and stoma (surface view)',
    shapes: sh,
    labels: {
      'cell wall': lab([bx(-1, 17) - 6.6, 17], 'l', 9),
      'chloroplast': lab([bx(-1, 21) - 2, 21], 'l', 23),
      'nucleus': lab([bx(-1, 35) - 3, 35], 'l', 38),
      'guard cell': lab([bx(1, 12.8) + 2, 12.8], 'r', 10),
      'stoma': lab([50, 28], 'r', 28),
    },
    note: 'A pair of guard cells surrounds each stoma. The inner wall facing the pore is thicker. Guard cells are the only epidermal cells with chloroplasts. They change shape (turgid or flaccid) to open and close the stoma.',
  };
}

// ---------------------------------------------------------------- xylem vessel
{
  const BR = ['795548', '4E342E'], PA = ['E8D5BE', '8D6E63'];
  const sh = [];
  const x0 = 33, x1 = 67, wl = 5.4;
  sh.push(box(x0, 3, wl, 50, PA[0], PA[1], 1.4), box(x1 - wl, 3, wl, 50, PA[0], PA[1], 1.4));
  sh.push(box(x0 + wl, 3, x1 - x0 - 2 * wl, 50, 'F4FAFD', 'F4FAFD', 0.2));
  for (let y = 5.2; y < 52; y += 5.6) {
    sh.push(box(x0, y, wl + 2.2, 2.2, BR[0], BR[1], 1), box(x1 - wl - 2.2, y, wl + 2.2, 2.2, BR[0], BR[1], 1));
    if (y + 5.6 < 52) sh.push(ell(x0 + wl / 2, y + 3.9, 2.6, 2.4, 'FFF8E1', PA[1], 1), ell(x1 - wl / 2, y + 3.9, 2.6, 2.4, 'FFF8E1', PA[1], 1));
  }
  // perforated end wall between two vessel elements: stubs only, open in the middle
  sh.push(box(x0 + wl, 27.2, 3.2, 1.8, BR[0], BR[1], 1), box(x1 - wl - 3.2, 27.2, 3.2, 1.8, BR[0], BR[1], 1));
  sh.push(...arrow(50, 49, 50, 38, '0288D1', 2, 2.2), ...arrow(50, 23, 50, 8, '0288D1', 2, 2.2));
  T.xylem_vessel = {
    name: 'Xylem vessel',
    shapes: sh,
    labels: {
      'lignified wall': lab([x0 + 1.5, 15.5], 'l', 11),
      'pit': lab([x0 + wl / 2, 20.8], 'l', 27),
      'lumen (hollow)': lab([50, 33], 'r', 28),
    },
    note: 'Xylem vessel: a hollow tube made of dead cells whose end walls have broken down. Rings of lignin strengthen the wall; pits are thin areas where water moves sideways. Blue arrows show the flow of water and mineral ions upwards. There is no cytoplasm.',
  };
  // pit anchor: a pit's y centre
  T.xylem_vessel.labels['pit'].a = [x0 + wl / 2, 5.2 + 5.6 * 2 + 3.9];
  T.xylem_vessel.labels['lignified wall'].a = [x0 + 3.2, 5.2 + 5.6 + 1.1];
  T.xylem_vessel.labels['lignified wall'].ly = 12;
  T.xylem_vessel.labels['pit'].ly = 27;
}

// ---------------------------------------------------------------- phloem sieve tube
{
  const sh = [];
  const SW = ['FFF8DC', '8D6E63'];
  sh.push(box(29, 3.5, 22, 49, SW[0], SW[1], 2.4));
  sh.push(box(51, 3.5, 17, 24.5, CYT, MEM, 2.2), box(51, 29, 17, 23.5, CYT, MEM, 2.2));
  // thin cytoplasm lining and sap flow inside the sieve tube
  sh.push(box(30.8, 4.5, 2, 47, 'FFE9B8', 'FFE9B8', 0.2), box(47.2, 4.5, 2, 47, 'FFE9B8', 'FFE9B8', 0.2));
  sh.push(...arrow(40, 24.2, 40, 9, 'F9A825', 1.8, 1.8), ...arrow(40, 50, 40, 33, 'F9A825', 1.8, 1.8));
  // sieve plate (perforated cross wall)
  sh.push(box(29, 27.2, 22, 2.2, 'FFD54F', 'E08B00', 1.5));
  for (let i = 0; i < 6; i++) sh.push(ell(31.3 + i * 3.7, 28.3, 1.6, 1.3, 'FFFDF0', 'E08B00', 0.8));
  // plasmodesmata between sieve element and companion cell
  for (const y of [9, 17, 22, 35, 42, 47]) sh.push(box(49.6, y, 2.8, 1.6, 'FFF4D6', 'FFF4D6', 0.2));
  // companion cells: nucleus + many mitochondria
  for (const [cy, ny] of [[15.5, 13], [41, 38]]) {
    sh.push(ell(63, ny, 7, 7.6, NUC[0], NUC[1], 1.6), ell(62.3, ny - 0.5, 2.2, 2.2, '8E5CC8', NUC[1], 0.4));
    const oy = ny === 13 ? [[56, 10], [57.5, 18.6], [65.5, 21.2], [55.5, 24]] : [[56, 33.4], [57.5, 43.6], [65, 46.8], [64.5, 32.6], [56.4, 49]];
    for (const [x, y] of oy) sh.push(...bean(x, y, 5.4, 2.9));
  }
  T.phloem_sieve_tube = {
    name: 'Phloem: sieve tube and companion cell',
    shapes: sh,
    labels: {
      'sieve tube element': lab([29.2, 12], 'l', 10),
      'sieve plate': lab([29.2, 28.3], 'l', 28),
      'cytoplasm': lab([31.8, 44], 'l', 46),
      'companion cell': lab([66.8, 8], 'r', 7),
      'nucleus': lab([66.4, 13], 'r', 19),
      'mitochondrion': lab([65.5, 46.8], 'r', 47),
    },
    note: 'Phloem: sieve tube elements are living cells joined end to end through sieve plates, but they have no nucleus and little cytoplasm. Each is helped by a companion cell with a nucleus and many mitochondria. Arrows show sugars (sucrose) moving in the phloem sap.',
  };
  T.phloem_sieve_tube.labels['nucleus'].a = [63.4, 10.4];
  T.phloem_sieve_tube.labels['nucleus'].ly = 20;
  T.phloem_sieve_tube.labels['nucleus'].a = [66.4, 15];
}

// ---------------------------------------------------------------- palisade cell
{
  const sh = [
    box(36, 4, 28, 48, 'F1F8E9', WALL, 5),
    box(37.7, 5.7, 24.6, 44.6, 'F1F8E9', MEM2, 1.4),
    box(46.6, 10, 6.8, 36.4, VAC[0], VAC[1], 1.6, 3),
    ...spots([[44.5, 14], [55, 21], [44.4, 33], [55.4, 38], [44.6, 44], [55.2, 11], [45, 24]], 0.4, 'B0728C'),
  ];
  for (const y of [9.5, 15.5, 21.5, 34.5, 40.5, 46.5]) sh.push(...chloroplast(41.4, y, 6, 3.4));
  for (const y of [9.5, 15.5, 21.5, 27.5, 33.5, 39.5, 45.5]) sh.push(...chloroplast(58.6, y, 6, 3.4));
  sh.push(ell(41.2, 28.2, 5.4, 6.4, NUC[0], NUC[1], 1.5), ell(41, 28, 1.8, 1.8, '8E5CC8', NUC[1], 0.4));
  T.palisade_cell = {
    name: 'Palisade mesophyll cell (leaf)',
    shapes: sh,
    labels: {
      'cell wall': lab([36.6, 10], 'l', 8),
      'chloroplast': lab([39.4, 21.5], 'l', 19),
      'nucleus': lab([38.6, 28.2], 'l', 30),
      'cell membrane': lab([62.8, 14], 'r', 8),
      'vacuole': lab([50, 28], 'r', 28),
      'cytoplasm': lab([62, 31], 'r', 46),
    },
    note: 'Palisade cell: a tall, column-shaped cell near the upper surface of the leaf, packed with chloroplasts for photosynthesis. Simplified drawing.',
  };
  T.palisade_cell.labels['cell wall'].a = [36.8, 10];
  T.palisade_cell.labels['cytoplasm'].a = [61.4, 43];
  T.palisade_cell.labels['cytoplasm'].ly = 44;
  T.palisade_cell.labels['vacuole'].a = [52.6, 29];
}

// ---------------------------------------------------------------- levels of organisation
{
  const IW = 12, IH = 9.6, X0 = 5, DX = 19, CY = [24, 24, 24, 24, 24];
  const sh = [];
  const ix = i => X0 + i * DX;
  const PK = ['F8BBD0', MEM];
  // 1 cell: a single smooth-muscle (spindle) cell
  {
    const x = ix(0), cy = CY[0];
    sh.push(ell(x + IW / 2, cy, 11.6, 4.6, PK[0], PK[1], 1.8), ell(x + IW / 2, cy, 3.4, 2.4, NUC[0], NUC[1], 1.2));
  }
  // 2 tissue: group of spindle cells
  {
    const x = ix(1), cy = CY[1];
    [[-3.2, 0], [-1.1, 1.2], [1.1, 0], [3.2, 1.2]].forEach(([dy, dx]) => {
      sh.push(ell(x + IW / 2 + dx - 0.6, cy + dy, 9.6, 2.9, PK[0], PK[1], 1.3), ell(x + IW / 2 + dx - 0.6, cy + dy, 2.4, 1.5, NUC[0], NUC[1], 0.8));
    });
  }
  // 3 organ: heart
  {
    const x = ix(2) + IW / 2, cy = CY[2];
    sh.push(...blob([ell(x - 2.7, cy - 1.4, 5.8, 5.6), ell(x + 2.7, cy - 1.4, 5.8, 5.6), ell(x, cy + 0.6, 8.6, 5.2), ell(x, cy + 2.6, 5, 4.2), ell(x, cy + 3.8, 2.2, 2.4)], 'EF9A9A', 'C62828', 0.55));
    sh.push(box(x - 0.6, cy - 5, 1.9, 3.2, 'EF9A9A', 'C62828', 1.2), box(x - 3.9, cy - 5.2, 1.6, 3.6, '90CAF9', '1565C0', 1.2));
  }
  // 4 organ system: simple digestive system (gullet, liver, stomach, coiled intestine)
  {
    const x = ix(3), cy = CY[3], px = x + IW / 2;
    sh.push(seg(px - 0.6, cy - 4.6, px - 0.6, cy - 2.4, 'E57373', 2.6));
    sh.push(ell(px - 3.8, cy - 2.6, 3.8, 3, 'A1887F', '6D4C41', 1));
    sh.push(...blob([ell(px + 0.6, cy - 1.6, 6.4, 4.2)], 'FFCC80', 'EF6C00', 0.5));
    sh.push(seg(px + 0.6, cy + 0.4, px + 0.6, cy + 1.4, 'E57373', 2.4));
    sh.push(box(px - 4.8, cy + 1.2, 9.6, 4.2, 'FFCDD2', 'E57373', 1.6, 3));
    sh.push(...wave(px - 3.8, cy + 3.3, px + 3.8, cy + 3.3, 0.9, 8, 'E57373', 1.3));
  }
  // 5 organism: a simple human figure
  {
    const x = ix(4) + IW / 2, cy = CY[4];
    sh.push(ell(x, cy - 3.7, 2.8, 2.8, 'FFCC80', 'EF6C00', 1.4));
    sh.push(box(x - 1.9, cy - 2.1, 3.8, 4.6, 'FFCC80', 'EF6C00', 1.4, 2));
    sh.push(seg(x - 1.9, cy - 1.4, x - 4, cy + 1.6, 'EF6C00', 2), seg(x + 1.9, cy - 1.4, x + 4, cy + 1.6, 'EF6C00', 2));
    sh.push(seg(x - 0.9, cy + 2.4, x - 1.6, cy + 4.8, 'EF6C00', 2.2), seg(x + 0.9, cy + 2.4, x + 1.6, cy + 4.8, 'EF6C00', 2.2));
  }
  // arrows: out of the right of icon i, along and down to the top of icon i+1
  for (let i = 0; i < 4; i++) {
    sh.push(...arrow(ix(i) + IW + 0.8, CY[i], ix(i + 1) - 0.8, CY[i], '607D8B', 2.5, 1.8));
  }
  T.levels_of_organisation = {
    name: 'Levels of organisation',
    shapes: sh,
    frame: { y0: 12, h: 30 },
    // captions under each icon (the five level names read left to right); the labels below are accepted
    // by name but drawn as these captions
    captions: ['cell', 'tissue', 'organ', 'organ system', 'organism'].map((t, i) => ({ text: t, x: ix(i) + IW / 2, y: CY[i] + IH / 2 + 4.5 })),
    labels: {
      'cell': { hidden: true, a: [0, 0], side: 'l', ly: 0 }, 'tissue': { hidden: true, a: [0, 0], side: 'l', ly: 0 }, 'organ': { hidden: true, a: [0, 0], side: 'l', ly: 0 },
      'organ system': { hidden: true, a: [0, 0], side: 'l', ly: 0 }, 'organism': { hidden: true, a: [0, 0], side: 'l', ly: 0 },
    },
    note: 'Levels of organisation, from simplest to most complex: cell, tissue, organ, organ system, organism. Example shown: muscle cell, muscle tissue, heart, digestive system, human.',
  };
}

// every template keeps its anchors inside the frame
exports.TEMPLATES = T;
