'use strict';
// Shared look for lesson decks. Colours of the five phases come from config/deck_generation.yaml.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CFG = yaml.load(fs.readFileSync(path.join(ROOT, 'config', 'deck_generation.yaml'), 'utf8'));

const PHASE_ORDER = ['predict', 'observe', 'explain', 'dqb', 'model'];

function luminance(hex) {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function onColour(hex) { return luminance(hex) > 0.35 ? '1A1A1A' : 'FFFFFF'; }
// tint a colour toward white (0..1)
function tint(hex, t) {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return c.map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// darken a colour (for text accents on light backgrounds: lime/orange are unreadable as text)
function shade(hex, t) {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return c.map(v => Math.round(v * (1 - t)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const T = {
  W: 13.333, H: 7.5, MX: 0.55,
  font: CFG.font,
  ink: '1A1A1A', muted: '555555', rule: 'D9D9D9', paper: 'FFFFFF', panel: 'F3F4F6', dark: '111111',
  footerY: 6.98, footerH: 0.4,
  contentTop: 1.75, contentBottom: 6.8,
};
T.contentW = T.W - 2 * T.MX;

module.exports = { ROOT, CFG, PHASE_ORDER, T, luminance, onColour, tint, shade };
