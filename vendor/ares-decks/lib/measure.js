'use strict';
// Text measurement with real Calibri-compatible metrics (Carlito) via @napi-rs/canvas,
// so "will it fit" decisions match what PowerPoint/LibreOffice will draw.
const path = require('path');
const os = require('os');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIRS = [path.join(os.homedir(), '.fonts', 'carlito'), '/usr/share/fonts/truetype/crosextra'];
let loaded = false;
function load() {
  if (loaded) return;
  const fs = require('fs');
  const faces = { 'Carlito-Regular.ttf': 'Carlito', 'Carlito-Bold.ttf': 'Carlito', 'Carlito-Italic.ttf': 'Carlito', 'Carlito-BoldItalic.ttf': 'Carlito' };
  let n = 0;
  for (const d of FONT_DIRS) for (const f of Object.keys(faces)) {
    const p = path.join(d, f);
    if (fs.existsSync(p)) { GlobalFonts.registerFromPath(p, 'Carlito'); n++; }
  }
  if (!n) throw new Error('Carlito font not found (needed for text measurement): looked in ' + FONT_DIRS.join(', '));
  loaded = true;
}
const ctx = (() => { const c = createCanvas(10, 10).getContext('2d'); return c; })();

function widthIn(text, pt, bold, italic) {
  load();
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${pt}px Carlito`;
  return ctx.measureText(text).width / 72;
}

// Greedy word wrap -> number of lines in a box of widthIn inches (inner width).
function lineCount(text, pt, boxW, bold, italic) {
  let lines = 0;
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines += 1; continue; }
    let cur = '', n = 1;
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (widthIn(t, pt, bold, italic) <= boxW) cur = t;
      else { if (cur) n++; cur = w; }
    }
    lines += n;
  }
  return lines;
}
const LINE = 1.2; // line height multiple used by PowerPoint for Calibri
function heightIn(text, pt, boxW, bold, italic) { return lineCount(text, pt, boxW, bold, italic) * pt * LINE / 72; }

module.exports = { widthIn, lineCount, heightIn, LINE };
