'use strict';
// Generated illustrations (scripts/make_art.py): final, ready-to-place PNGs with rounded corners, one per art id.
// Ids are semantic slugs (e.g. ugali_kitchen) and are REUSED across the 12 lessons of a sub-strand so scenes
// and characters stay consistent. catalogue.json records the prompt, seed and model of every image.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./theme');
const DIR = path.join(ROOT, 'data', 'presentations_art');
function artPath(id) { const p = path.join(DIR, 'final', `${String(id).replace(/[^a-z0-9_]/gi, '')}.png`); return fs.existsSync(p) ? p : null; }
function catalogue() { const p = path.join(DIR, 'catalogue.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; }
module.exports = { artPath, catalogue, DIR };
