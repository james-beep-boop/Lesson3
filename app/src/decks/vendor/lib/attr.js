'use strict';
// Footer text for decks: read straight from config/attribution.yaml (never hardcoded here).
// Same {YEAR} rule as generators/lib/attribution.js (year: auto = current year at generation).
// Reads the YAML itself so the shared lesson-plan module is not touched (HANDOFF locked decision 8).
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { ROOT } = require('./theme');

const ATTR_PATH = process.env.ATTRIBUTION_YAML || path.join(ROOT, 'config', 'attribution.yaml');

function deckAttribution() {
  const a = yaml.load(fs.readFileSync(ATTR_PATH, 'utf8'));
  for (const k of ['slide_footer', 'lesson_footer']) if (!a[k]) throw new Error(`attribution.yaml has no '${k}' (needed by the deck builder)`);
  const year = a.year === 'auto' ? String(new Date().getFullYear()) : String(a.year);
  const fill = t => String(t).replace(/\{YEAR\}/g, year).replace(/\s+/g, ' ').trim();
  const out = { year, slideFooter: fill(a.slide_footer), lessonFooter: fill(a.lesson_footer), licenseName: a.license && a.license.name };
  for (const k of ['slideFooter', 'lessonFooter']) if (out[k].includes('{YEAR}')) throw new Error('attribution: unreplaced {YEAR}');
  return out;
}

// [Subject] G[grade] · [SoW name] · Lesson [#]  (generated part, Overrides row 1)
function generatedFooter(meta, lessonNo) {
  return `${meta.subject} G${meta.grade} · ${meta.substrand_name} · Lesson ${lessonNo}`;
}
// Text printed on a slide. Title and last slide carry the full lesson_footer; all others the short slide_footer.
function footerText(attr, meta, lessonNo, full) {
  return `${full ? attr.lessonFooter : attr.slideFooter} · ${generatedFooter(meta, lessonNo)}`;
}

module.exports = { deckAttribution, generatedFooter, footerText };
