/**
 * attribution.js — attribution & licensing text for every generated output
 * =========================================================================
 * Single source of truth: config/attribution.yaml. Never hardcode the text.
 * {YEAR} = current calendar year at generation time (year: auto).
 *
 * Placement (handoff 2026-09-29 §3d, samples/Attribution_Placement_Sample):
 *   - substrandHeaderParas(): full block at the TOP of every sub-strand docx
 *     (Lesson Sequence, Final Explanation, Summary Table), in the body after
 *     the title — not Word's repeating page header.
 *   - lessonFooterParas(): short line after EVERY lesson in the Lesson Sequence.
 *   - attribution().footer: plain text for Quick Check decks and Answer Keys.
 * The license name is a hyperlink AND the URL is printed visibly (printed
 * copies lose hyperlinks; schools are offline).
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Paragraph, TextRun, ExternalHyperlink, BorderStyle } = require('docx');

const ATTR_PATH = process.env.ATTRIBUTION_YAML
  || path.join(__dirname, '..', '..', 'config', 'attribution.yaml');

let _cache = null;
function attribution() {
  if (_cache) return _cache;
  const a = yaml.load(fs.readFileSync(ATTR_PATH, 'utf8'));
  const year = a.year === 'auto' ? String(new Date().getFullYear()) : String(a.year);
  const fill = t => String(t).replace(/\{YEAR\}/g, year);
  _cache = {
    year,
    license: a.license,
    footer: fill(a.lesson_footer),
    header: a.substrand_header.map(h => ({ label: h.label, text: fill(h.text) })),
  };
  if ([_cache.footer, ..._cache.header.map(h => h.text)].some(t => t.includes('{YEAR}'))) {
    throw new Error('attribution: unreplaced {YEAR} placeholder');
  }
  return _cache;
}

const FONT = 'Arial';
const LINK = '1F6B75';

/**
 * Split text into TextRuns, turning the license name / full name / URL into
 * hyperlinks. The URL stays visible as text either way.
 */
function linkedRuns(text, style) {
  const { license } = attribution();
  const targets = [license.full_name, license.url, license.name]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const rx = new RegExp(targets.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const runs = [];
  let last = 0;
  for (const m of text.matchAll(rx)) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), ...style }));
    runs.push(new ExternalHyperlink({
      link: license.url,
      children: [new TextRun({ text: m[0], ...style, color: LINK, underline: { type: 'single', color: LINK } })],
    }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), ...style }));
  return runs;
}

/** Full attribution block for the top of a sub-strand document. */
function substrandHeaderParas() {
  const { header } = attribution();
  const size = 17;
  const paras = [new Paragraph({
    spacing: { before: 120, after: 80 },
    children: [new TextRun({ text: 'ATTRIBUTION AND LICENSING', bold: true, size: 20, font: FONT, color: '1F3864' })],
  })];
  header.forEach((h, i) => {
    paras.push(new Paragraph({
      spacing: { before: 0, after: 60 },
      border: i === header.length - 1
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 6 } } : undefined,
      children: [
        new TextRun({ text: `${h.label}: `, bold: true, size, font: FONT }),
        ...linkedRuns(h.text, { size, font: FONT }),
      ],
    }));
  });
  return paras;
}

/** Short footer line placed after each lesson in the Lesson Sequence. */
function lessonFooterParas() {
  return [new Paragraph({
    spacing: { before: 160, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB', space: 4 } },
    children: linkedRuns(attribution().footer, { size: 14, font: FONT, color: '666666' }),
  })];
}

module.exports = { attribution, substrandHeaderParas, lessonFooterParas, linkedRuns };
