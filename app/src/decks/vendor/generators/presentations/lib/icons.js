'use strict';
// Colourful icons (Noto Color Emoji, Apache-2.0; see assets/fetch_icons.py). The authoring step may only
// use names from the catalogue; an unknown name is a validation error, never a silent blank.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'assets', 'emoji');
let _names = null;
function names() { if (!_names) _names = Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, 'catalogue.json'), 'utf8'))); return _names; }
function iconPath(name) { const p = path.join(DIR, `${name}.png`); return fs.existsSync(p) ? p : null; }
// "stove_pot :: The jiko" -> {icon:'stove_pot', text:'The jiko'}; text without a known icon prefix is returned as is
function parseIcon(s) {
  const m = /^\s*([a-z0-9_]+)\s*::\s*([\s\S]*)$/.exec(String(s));
  if (m && iconPath(m[1])) return { icon: m[1], text: m[2].trim() };
  return { icon: null, text: String(s) };
}
function unknownIconPrefixes(s) { const m = /^\s*([a-z0-9_]+)\s*::/.exec(String(s)); return m && !iconPath(m[1]) ? m[1] : null; }
module.exports = { names, iconPath, parseIcon, unknownIconPrefixes };
