#!/usr/bin/env node
'use strict';
/**
 * build_deck.js — builds ONE lesson deck (.pptx) from
 *   1. the lesson's data JSON  (read-only: lesson data is never written here),
 *   2. an authored deck spec    (src/generate_deck.py output; schema: config/deck_spec.schema.json),
 *   3. config/attribution.yaml  (footer text; never hardcoded) and data/logos.
 * Design authority: docs/presentations/BUILD_MANUAL.md as changed by OVERRIDES.md.
 *
 *   node generators/presentations/build_deck.js <data.json> <lessonNo> <spec.json> <out.pptx>
 * Also writes <out>.layout.json (layout errors/warnings). Exit 1 if layout errors exist.
 * Structure/rule validation of the finished file is done independently by scripts/validate_deck.js.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const PptxGenJS = require('pptxgenjs');
const { ROOT, CFG, PHASE_ORDER, T, onColour, tint, shade } = require('./lib/theme');
const { heightIn, lineCount, widthIn } = require('./lib/measure');
const { deckAttribution, footerText } = require('./lib/attr');
const quizLinks = require('./lib/quizlinks');
const { resourceIndex } = require('./lib/resources');
const { render } = require('./lib/blocks');
const { drivingQuestion } = require('./lib/unit');
const { iconPath } = require('./lib/icons');
const { artPath } = require('./lib/art');
const PHASE_ICON = { predict: 'thinking', observe: 'magnifier', explain: 'speech', dqb: 'pushpin', model: 'pencil' };

const ASSETS = path.join(__dirname, 'assets');
const ARES_AR = (() => { const b = fs.readFileSync(path.join(ASSETS, 'logo_ares_trimmed.png')); return b.readUInt32BE(16) / b.readUInt32BE(20); })();
// the ARES source PNG carries wide white margins; a trimmed copy (same artwork) is used so both logos read at a similar size
const LOGO = { seavuria: path.join(ROOT, CFG.logos.seavuria), ares: path.join(ASSETS, 'logo_ares_trimmed.png') };
const LOGO_AR = { seavuria: 460 / 92, ares: ARES_AR };

function lessonLength(lesson) {
  const m = String(lesson.duration).match(new RegExp(CFG.lesson_length_regex));
  const n = m && +m[1];
  if (!CFG.lesson_lengths_allowed.includes(n)) throw new Error(`lesson ${lesson.number}: duration '${lesson.duration}' has no leading ${CFG.lesson_lengths_allowed.join('/')} minutes figure`);
  return n;
}
const plural = n => `${n} minute${n === 1 ? '' : 's'}`;

function composeNotes(n, o = {}) {
  const L = [];
  const sec = (label, items) => { const v = (Array.isArray(items) ? items : [items]).filter(s => s && String(s).trim()); if (v.length) { L.push('', label, ...v.map(s => (Array.isArray(items) ? '• ' + s : s))); } };
  if (o.phaseHeader) L.push(o.phaseHeader);
  if (o.time !== undefined) L.push(`TIME: ${plural(o.time)}${o.timeNote ? ' ' + o.timeNote : ''}`);
  if (o.lead) sec(o.lead.label, o.lead.items);
  sec('DO', n.do); sec('SAY', n.say);
  if (n.wait_time && n.wait_time.trim()) sec('WAIT TIME', n.wait_time);
  sec('LOOK FOR', n.look_for); sec('IF…', n.if_then); sec('WHY THIS WORKS', n.why_this_works);
  sec('ANSWER KEY', n.answer_key); sec('SCIENCE NOTE FOR YOU', n.science_note);
  if (o.resourceLines && o.resourceLines.length) sec('RESOURCE LINKS (plain URLs, for printed copies)', o.resourceLines);
  if (o.tail) sec(o.tail.label, o.tail.items);
  return L.join('\n').replace(/^\n+/, '');
}

function build(dataPath, lessonNo, specPath, outPath) {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const lesson = data.LESSONS.find(l => l.number === lessonNo);
  if (!lesson) throw new Error(`lesson ${lessonNo} not in ${dataPath}`);
  const meta = data.META, nLessons = data.LESSONS.length, lessonLen = lessonLength(lesson);
  const attr = deckAttribution();
  const res = resourceIndex(lesson);
  const resMap = {};
  for (const r of res) { r.iconPath = path.join(ASSETS, `icon_${r.icon}.png`); resMap[r.key] = r; for (const a of r.also) resMap[a] = r; }
  const matchOf = {};
  for (const rn of spec.glance.resource_notes) matchOf[rn.key] = rn;

  const report = { lesson: lessonNo, errors: [], warnings: [], layout: [], slides: [] };
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${meta.subject} G${meta.grade} ${meta.substrand_name} Lesson ${lessonNo}: ${lesson.title}`;
  pptx.author = 'SeaVuria and ARES Education';
  pptx.company = 'SeaVuria and ARES Education';
  pptx.theme = { headFontFace: CFG.font, bodyFontFace: CFG.font };

  const notesOf = [];                 // parallel to slides
  const quizRows = [];                // quiz links placed on slides (written beside the deck)
  const startSlide = (kind, o = {}) => {
    const s = pptx.addSlide();
    if (o.dark) s.background = { color: T.dark };
    if (o.hidden) s.hidden = true;
    report.slides.push(kind + (o.label ? ':' + o.label : '')); report.layout.push({ slide: report.slides.length, kind });
    return s;
  };

  // ---- footer: text from attribution.yaml + generated part; both logos on every slide
  function footer(slide, full, dark) {
    const txt = footerText(attr, meta, lessonNo, full);
    const logoH = 0.5, lw1 = logoH * LOGO_AR.seavuria, lw2 = logoH * LOGO_AR.ares;
    const panelW = lw1 + lw2 + 0.5, textW = T.W - 2 * T.MX - panelW - 0.3, pt = 10;
    const th = heightIn(txt, pt, textW), top = Math.min(T.H - 0.18 - th, T.H - 0.18 - logoH);
    slide.addText(txt, { x: T.MX, y: T.H - 0.18 - th, w: textW, h: th, fontFace: CFG.font, fontSize: pt, color: dark ? 'BBBBBB' : '666666', margin: 0, valign: 'bottom', fit: 'none' });
    const px = T.W - T.MX - panelW, py = T.H - 0.18 - logoH - 0.06;
    if (dark) slide.addShape(pptx.ShapeType.roundRect, { x: px, y: py, w: panelW, h: logoH + 0.12, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF', width: 0 } });
    slide.addImage({ path: LOGO.ares, x: px + 0.15, y: py + 0.06, w: lw2, h: logoH, altText: 'ARES Education logo' });
    slide.addImage({ path: LOGO.seavuria, x: px + 0.15 + lw2 + 0.2, y: py + 0.06, w: lw1, h: logoH, altText: 'SeaVuria logo' });
    return Math.min(T.H - 0.18 - th, py) - 0.12; // bottom of the usable content region
  }

  // ---- header: phase pill, optional "check for understanding" pill, title, instruction line
  function header(slide, o) {
    const ph = o.phase ? CFG.phases[o.phase] : null;
    let y = 0.32;
    if (o.pillText) {
      const label = o.pillText.toUpperCase(), w = widthIn(label, 11, true) + 0.55;
      const fill = ph ? ph.hex : (o.pillFill || '111111');
      slide.addShape(pptx.ShapeType.roundRect, { x: T.MX, y, w, h: 0.32, rectRadius: 0.16, fill: { color: fill }, line: { color: fill, width: 0 } });
      slide.addText(label, { x: T.MX, y, w, h: 0.32, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 11, bold: true, color: onColour(fill), margin: 0, charSpacing: 1.5 });
    }
    if (o.cfu) {
      const label = 'CHECK FOR UNDERSTANDING', w = widthIn(label, 11, true) + 0.55;
      slide.addShape(pptx.ShapeType.roundRect, { x: T.W - T.MX - w, y, w, h: 0.32, rectRadius: 0.16, fill: { color: 'FFFFFF' }, line: { color: T.ink, width: 1.75 } });
      slide.addText(label, { x: T.W - T.MX - w, y, w, h: 0.32, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 11, bold: true, color: T.ink, margin: 0, charSpacing: 1 });
    }
    y = 0.78;
    const bx = o.badge && iconPath(o.badge) ? 0.95 : 0;
    if (bx) {
      const fill = o.phase ? tint(CFG.phases[o.phase].hex, 0.8) : 'E8EAED', ring = o.phase ? CFG.phases[o.phase].hex : '888888';
      slide.addShape(pptx.ShapeType.ellipse, { x: T.MX, y: y, w: 0.78, h: 0.78, fill: { color: fill }, line: { color: ring, width: 2.5 } });
      slide.addImage({ path: iconPath(o.badge), x: T.MX + 0.14, y: y + 0.14, w: 0.5, h: 0.5, altText: '' });
    }
    let pt = 32; const tw = T.contentW - bx;
    while (pt > 24 && lineCount(o.title, pt, tw, true) > 2) pt -= 2;
    if (lineCount(o.title, pt, tw, true) > 2) report.errors.push(`title too long for 2 lines at ${pt}pt: '${o.title}'`);
    const th = heightIn(o.title, pt, tw, true);
    slide.addText(o.title, { x: T.MX + bx, y, w: tw, h: th, fontFace: CFG.font, fontSize: pt, bold: true, color: o.dark ? 'FFFFFF' : T.ink, margin: 0, valign: 'top', fit: 'none' });
    y += th + 0.08;
    if (o.subtitle) {
      let spt = 20; while (spt > 18 && lineCount(o.subtitle, spt, tw) > 2) spt -= 1;
      const sh = heightIn(o.subtitle, spt, tw);
      slide.addText(o.subtitle, { x: T.MX + bx, y, w: tw, h: sh, fontFace: CFG.font, fontSize: spt, color: T.muted, margin: 0, valign: 'top', fit: 'none' });
      y += sh + 0.08;
    }
    return Math.max(y, bx ? 0.78 + 0.78 + 0.05 : 0) + 0.12;
  }
  // soft decorative shapes behind the content (phase tint), drawn first so they sit under everything
  function decor(slide, hex) {
    slide.addShape(pptx.ShapeType.ellipse, { x: T.W - 3.5, y: T.H - 3.2, w: 5.4, h: 5.4, fill: { color: tint(hex, 0.9) }, line: { color: tint(hex, 0.9), width: 0 } });
    slide.addShape(pptx.ShapeType.ellipse, { x: T.W - 1.7, y: -1.1, w: 2.6, h: 2.6, fill: { color: tint(hex, 0.93) }, line: { color: tint(hex, 0.93), width: 0 } });
  }
  function timerPill(slide, t, x, yy, w) {
    slide.addShape(pptx.ShapeType.roundRect, { x, y: yy, w, h: 0.95, rectRadius: 0.2, fill: { color: T.dark }, line: { color: T.dark, width: 0 } });
    slide.addImage({ path: iconPath('stopwatch'), x: x + 0.15, y: yy + 0.12, w: 0.5, h: 0.5, altText: '' });
    slide.addText(t.time, { x: x + 0.6, y: yy + 0.04, w: w - 0.7, h: 0.6, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 30, bold: true, color: 'FFFFFF', margin: 0 });
    slide.addText(t.label, { x: x + 0.1, y: yy + 0.63, w: w - 0.2, h: 0.28, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 12, color: 'DDDDDD', margin: 0 });
  }
  function timerColumn(slide, timers, y) { timers.forEach((t, i) => timerPill(slide, t, T.W - T.MX - 2.3, y + i * 1.1, 2.3)); }
  // generated illustration (or a clearly marked placeholder if the art step has not produced it yet)
  function artPanel(slide, id, alt, x, y, w, h, phaseHex, fallbackIcon) {
    const p = artPath(id), d = Math.min(w, h);
    if (p) { slide.addImage({ path: p, x: x + (w - d) / 2, y: y + (h - d) / 2, w: d, h: d, altText: alt || id }); return true; }
    if (!process.env.DECK_ALLOW_MISSING_ART) report.errors.push(`illustration '${id}' has not been generated yet (run scripts/make_art.py)`);
    slide.addShape(pptx.ShapeType.roundRect, { x: x + (w - d) / 2, y: y + (h - d) / 2, w: d, h: d, rectRadius: 0.25, fill: { color: tint(phaseHex, 0.85) }, line: { color: phaseHex, width: 2, dashType: 'dash' } });
    if (iconPath(fallbackIcon)) slide.addImage({ path: iconPath(fallbackIcon), x: x + (w - 1.4) / 2, y: y + (h - 1.4) / 2 - 0.2, w: 1.4, h: 1.4, altText: alt || id });
    slide.addText(`[illustration: ${id}]`, { x: x + (w - d) / 2, y: y + (h + 1.4) / 2 - 0.1, w: d, h: 0.4, align: 'center', fontFace: CFG.font, fontSize: 12, color: T.muted, margin: 0 });
    return false;
  }

  // ===================== 1. Title slide =====================
  {
    const s = startSlide('title', { dark: true });
    const kicker = `GRADE ${meta.grade} ${meta.subject.toUpperCase()}  ·  ${meta.substrand_name.toUpperCase()}  ·  LESSON ${lessonNo} OF ${nLessons}  ·  ${lessonLen} MINUTES`;
    const lw = 6.9;
    s.addText(kicker, { x: T.MX, y: 0.6, w: lw, h: 0.55, fontFace: CFG.font, fontSize: 13, bold: true, color: CFG.phases.observe.hex, margin: 0, charSpacing: 1.2, valign: 'top', fit: 'none' });
    const shortTitle = spec.lesson_title_short || lesson.title;
    // shrink the title until the title, one-liner and the five phase rows all fit above the long footer
    let pt = 52, th, dy, oh, py0; const rowh = 0.44;
    for (; pt >= 32; pt -= 4) {
      th = heightIn(shortTitle, pt, lw, true); dy = 1.2 + th + 0.25; oh = heightIn(spec.lesson_oneliner, 22, lw); py0 = dy + oh + 0.3;
      if (lineCount(shortTitle, pt, lw, true) <= 3 && py0 + 0.3 + 5 * rowh <= T.H - 1.4) break;
    }
    s.addText(shortTitle, { x: T.MX, y: 1.2, w: lw, h: th, fontFace: CFG.font, fontSize: pt, bold: true, color: 'FFFFFF', margin: 0, valign: 'top', fit: 'none' });
    s.addText(spec.lesson_oneliner, { x: T.MX, y: dy, w: lw, h: oh, fontFace: CFG.font, fontSize: 22, color: 'DDDDDD', margin: 0, valign: 'top', fit: 'none' });
    // the five phases, one row each, under the text
    s.addText("TODAY'S LESSON", { x: T.MX, y: py0 - 0.05, w: 4, h: 0.3, fontFace: CFG.font, fontSize: 12, bold: true, color: 'BBBBBB', margin: 0, charSpacing: 2 });
    PHASE_ORDER.forEach((k, i) => {
      const ph = CFG.phases[k], yy = py0 + 0.3 + i * rowh;
      s.addShape(pptx.ShapeType.ellipse, { x: T.MX, y: yy + 0.06, w: 0.36, h: 0.36, fill: { color: ph.hex }, line: { color: ph.hex, width: 0 } });
      s.addImage({ path: iconPath(PHASE_ICON[k]), x: T.MX + 0.05, y: yy + 0.11, w: 0.26, h: 0.26, altText: '' });
      s.addText(ph.label, { x: T.MX + 0.55, y: yy, w: 4.5, h: rowh - 0.04, fontFace: CFG.font, fontSize: 20, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
    });
    if (py0 + 0.3 + 5 * rowh > T.H - 1.3) report.errors.push('title slide: title, one-liner and phase list do not fit above the footer (shorten the title or one-liner)');
    // hero illustration
    const hero = spec.hero || {};
    const hx = T.MX + lw + 0.4, hw = T.W - T.MX - hx, hh = T.H - 0.6 - 1.5;
    artPanel(s, hero.art_id || 'hero_missing', hero.alt, hx, 0.5, hw, hh, CFG.phases.predict.hex, hero.icon || 'microscope');
    footer(s, true, true);
    notesOf.push(composeNotes({}, { lead: { label: 'PURPOSE OF THIS LESSON', items: spec.purpose }, tail: null }) + '\n\n' + composeNotes({}, { lead: { label: 'BEFORE CLASS', items: spec.before_class } }) + (spec.do_not_show.length ? '\n\n' + composeNotes({}, { lead: { label: 'DO NOT SHOW YET', items: spec.do_not_show } }) : ''));
  }

  // ===================== 2. How these lessons work (hidden, same in every deck) =====================
  {
    const s = startSlide('how', { hidden: true });
    let y = header(s, { pillText: 'Teacher only · hidden', pillFill: '444444', title: 'How these lessons work: one routine, five phases' });
    const rows = [
      ['predict', 'Students write their own idea BEFORE anyone teaches. Writing first gives every student a starting point.'],
      ['observe', 'Students look at evidence: a story, pictures, diagrams, a practical. They record what they see.'],
      ['explain', 'You help students make sense of the evidence. Now you can name the idea, law or equation.'],
      ['dqb', 'Students add evidence and new questions to the class board. The board shows how thinking grows.'],
      ['model', 'Students keep ONE model and revise it in a new colour each lesson. They say what evidence changed it.'],
    ];
    rows.forEach(([k, t], i) => {
      const ph = CFG.phases[k], yy = y + i * 0.62;
      s.addShape(pptx.ShapeType.roundRect, { x: T.MX, y: yy, w: 2.9, h: 0.5, rectRadius: 0.1, fill: { color: ph.hex }, line: { color: ph.hex, width: 0 } });
      s.addText(ph.label, { x: T.MX, y: yy, w: 2.9, h: 0.5, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 16, bold: true, color: onColour(ph.hex), margin: 0 });
      s.addText(t, { x: T.MX + 3.1, y: yy, w: T.contentW - 3.1, h: 0.5, valign: 'middle', fontFace: CFG.font, fontSize: 16, color: T.ink, margin: 0 });
    });
    y += 5 * 0.62 + 0.2;
    s.addText('Three habits in every lesson', { x: T.MX, y, w: 6, h: 0.35, fontFace: CFG.font, fontSize: 18, bold: true, color: T.ink, margin: 0 });
    s.addText([
      { text: 'Wait time. ', options: { bold: true } }, { text: 'After you ask a question, stay silent. Count slowly to 10.', options: { breakLine: true } },
      { text: "Don't correct yet. ", options: { bold: true } }, { text: 'In Predict, every idea is welcome. We test the ideas later.', options: { breakLine: true } },
      { text: 'Call on everyone. ', options: { bold: true } }, { text: 'Choose students yourself, not only raised hands.' },
    ], { x: T.MX, y: y + 0.4, w: 7.4, h: 1.1, fontFace: CFG.font, fontSize: 16, color: T.ink, margin: 0, valign: 'top', paraSpaceAfter: 4 });
    s.addShape(pptx.ShapeType.roundRect, { x: 8.3, y: y + 0.05, w: T.W - T.MX - 8.3, h: 1.45, rectRadius: 0.1, fill: { color: T.panel }, line: { color: T.rule, width: 1 } });
    s.addText([{ text: 'CHECK FOR UNDERSTANDING', options: { bold: true, breakLine: true } }, { text: 'A slide with this label has a quick check. Use LOOK FOR and IF… in the notes.' }], { x: 8.5, y: y + 0.1, w: T.W - T.MX - 8.7, h: 1.35, fontFace: CFG.font, fontSize: 16, color: T.ink, margin: 0, valign: 'middle' });
    footer(s, false, false);
    notesOf.push(['TEACHER ONLY — HIDDEN SLIDE', '', 'HOW TO USE THE NOTES', 'Every slide has notes written for you, in the same order:',
      '• TIME — how long to spend.', '• DO — what to do, step by step.', '• SAY — words you can read aloud. Change them to suit your class.', '• WAIT TIME — how long to stay silent after a question.',
      '• LOOK FOR — what to listen and look for.', '• IF… — what to do if students are stuck or equipment fails.', '• WHY THIS WORKS — the reason behind the strategy.', '• ANSWER KEY — a model answer for every student task.',
      '', 'Open Presenter View in Slide Show to see the notes while students see the slide.'].join('\n'));
  }

  // ===================== 3. Lesson at a glance (hidden) =====================
  {
    const s = startSlide('glance', { hidden: true });
    const fb = footer(s, false, false);
    let y = header(s, { pillText: 'Teacher only · hidden', pillFill: '444444', title: `Lesson ${lessonNo} at a glance` });
    const gl = spec.glance, groupLabel = g => (g === 'opening' ? 'Opening' : g === 'summary' ? 'Summary' : CFG.phases[g].label);
    const total = gl.rows.reduce((a, r) => a + r.minutes, 0);
    const tw = 8.0;
    const rows = [['Phase', 'Time', 'What students do'], ...gl.rows.map(r => [groupLabel(r.group), `${r.minutes} min`, r.what]), ['Total', `${total} min`, '']];
    const hpt = 12;
    const tg = { x: T.MX, y, w: tw };
    const colW = [1.9, 0.9, tw - 2.8];
    const rowH = rows.map((r, i) => Math.max(0.3, heightIn(r[2] || ' ', hpt, colW[2] - 0.2, i === 0) + 0.1));
    const cells = rows.map((r, i) => r.map((c, ci) => {
      const g = i > 0 && i < rows.length - 1 ? gl.rows[i - 1].group : null, fill = i === 0 ? '555555' : (g && g !== 'opening' && g !== 'summary' ? tint(CFG.phases[g].hex, 0.75) : 'F3F4F6');
      return { text: c, options: { bold: i === 0 || ci === 0 || i === rows.length - 1, color: i === 0 ? 'FFFFFF' : T.ink, fill: { color: ci < 2 || i === 0 ? fill : 'FFFFFF' } } };
    }));
    s.addTable(cells, { x: tg.x, y: tg.y, w: tw, colW, rowH, fontFace: CFG.font, fontSize: hpt, valign: 'middle', border: { type: 'solid', pt: 0.75, color: 'BBBBBB' }, margin: [0.03, 0.08, 0.03, 0.08] });
    const tblH = rowH.reduce((a, v) => a + v, 0);
    // right column: materials + fallback
    const rx = T.MX + tw + 0.3, rw = T.W - T.MX - rx;
    const mats = gl.materials.map(m => '• ' + m).join('\n');
    const mh = heightIn('Materials per group', 13, rw, true) + heightIn(mats || 'None', hpt, rw) + 0.1;
    s.addText([{ text: 'Materials per group', options: { bold: true, fontSize: 13, breakLine: true } }, { text: mats || 'None', options: { fontSize: hpt } }], { x: rx, y, w: rw, h: mh, fontFace: CFG.font, color: T.ink, margin: 0, valign: 'top', fit: 'none' });
    const fh = heightIn('If equipment is short', 13, tw, true) + heightIn(gl.fallback, hpt + 1, tw) + 0.1;
    s.addText([{ text: 'If equipment is short', options: { bold: true, fontSize: 13, breakLine: true } }, { text: gl.fallback, options: { fontSize: hpt + 1 } }], { x: T.MX, y: y + tblH + 0.2, w: tw, h: fh, fontFace: CFG.font, color: T.ink, margin: 0, valign: 'top', fit: 'none' });
    // fallback sits under the table (left), materials in the right column; resources get their own hidden slide
    const rightBottom = y + mh, leftBottom = y + tblH + 0.2 + fh;
    if (Math.max(rightBottom, leftBottom) > fb) report.errors.push(`glance slide too tall: content ends at ${Math.max(rightBottom, leftBottom).toFixed(2)} in, footer starts at ${fb.toFixed(2)} in`);
    notesOf.push(['TEACHER ONLY — HIDDEN SLIDE', '', 'IF EQUIPMENT OR MATERIALS ARE MISSING', gl.fallback, '', 'The ARES resources for this lesson, with a match note for each, are on the next hidden slide.'].join('\n'));
  }

  // ===================== 3b. ARES resources (hidden): icon, match tag, title, why =====================
  if (res.length) {
    const s = startSlide('resources', { hidden: true });
    const fb = footer(s, false, false);
    const y = header(s, { pillText: 'Teacher only · hidden', pillFill: '444444', title: `ARES resources for Lesson ${lessonNo}` });
    const tagColour = { best_match: '2E7D32', preview_first: 'B26A00', use_later: '1565C0', do_not_use: 'B71C1C' }, tagText = { best_match: 'BEST MATCH', preview_first: 'PREVIEW FIRST', use_later: 'USE LATER', do_not_use: 'DO NOT USE' };
    const ncol = res.length > 5 ? 2 : 1, gapx = 0.3, cw = (T.contentW - gapx * (ncol - 1)) / ncol, perCol = Math.ceil(res.length / ncol);
    const noteOf = r => (matchOf[r.key] || { match: 'preview_first', note: '' });
    let pt = 15, placed = null;
    for (; pt >= CFG.hidden_min_pt; pt--) {
      const hs = res.map(r => { const mn = noteOf(r); return Math.max(0.62, heightIn(`${tagText[mn.match]}  ${r.title}`, pt, cw - 0.75, true) + heightIn(`${r.source}. ${mn.note || ''}`, pt - 1, cw - 0.75) + 0.2); });
      const colH = c => hs.slice(c * perCol, (c + 1) * perCol).reduce((a, v) => a + v + 0.08, 0);
      if (Math.max(...Array.from({ length: ncol }, (_, c) => colH(c))) <= fb - y) { placed = hs; break; }
    }
    if (!placed) { placed = res.map(() => 0.62); report.errors.push('resources slide: the match notes do not fit even at the minimum size (shorten the notes)'); pt = CFG.hidden_min_pt; }
    const colY = Array(ncol).fill(y);
    res.forEach((r, i) => {
      const c = Math.floor(i / perCol), x = T.MX + c * (cw + gapx), h = placed[i], mn = noteOf(r), link = mn.match === 'do_not_use' ? undefined : { url: r.url, tooltip: r.title };
      s.addShape(pptx.ShapeType.roundRect, { x, y: colY[c], w: cw, h, rectRadius: 0.08, fill: { color: mn.match === 'do_not_use' ? 'FDECEA' : (mn.match === 'best_match' ? 'EAF6EC' : (mn.match === 'use_later' ? 'E8F0FB' : 'FFF6E5')) }, line: { color: tagColour[mn.match], width: 1 } });
      s.addImage({ path: r.iconPath, x: x + 0.12, y: colY[c] + (h - 0.42) / 2, w: 0.42, h: 0.42, hyperlink: link, altText: `${r.title} (${r.content_type}) - opens an ARES resource` });
      s.addText([{ text: tagText[mn.match] + '  ', options: { bold: true, color: tagColour[mn.match], fontSize: pt - 2 } }, { text: r.title, options: { bold: true, color: '1F4E79', fontSize: pt, hyperlink: link, breakLine: true } }, { text: `${r.source}. ${mn.note || ''}`, options: { color: T.ink, fontSize: pt - 1 } }], { x: x + 0.65, y: colY[c], w: cw - 0.75, h, fontFace: CFG.font, margin: 0, valign: 'middle', fit: 'none' });
      colY[c] += h + 0.08;
    });
    const resLines = gl_notes_lines();
    notesOf.push(['TEACHER ONLY — HIDDEN SLIDE', '', 'RESOURCE LINKS (plain URLs, for printed copies)', ...resLines.map(l => '• ' + l), '', 'Click an icon in Slide Show to open the resource in ARES. DO NOT USE resources are listed so you know why they were left out.'].join('\n'));
    function gl_notes_lines() { return spec.glance.resource_notes.map(rn => { const r = resMap[rn.key]; return r ? `${tagText[rn.match]}: ${r.title} (${r.source}, ${r.content_type}). ${rn.note}  ${r.url}` : `UNKNOWN KEY ${rn.key}`; }); }
  }

  // ===================== 4. Unit map =====================
  {
    const s = startSlide('unitmap');
    decor(s, CFG.phases.observe.hex);
    const fb = footer(s, false, false);
    let y = header(s, { pillText: 'Unit map', pillFill: '111111', title: 'Where we are in the unit' });
    const n = data.LESSONS.length, perCol = Math.ceil(n / 2), colw = (T.contentW - 0.4) / 2;
    const mapTitle = i => ((spec.unit_map_titles || []).length === n && spec.unit_map_titles[i]) || data.LESSONS[i].title;
    const availH = fb - y - 1.9;
    let pt = 18; let rowH;
    const rowsNeeded = (p) => data.LESSONS.map((l, i) => Math.max(0.46, heightIn(mapTitle(i), p, colw - 0.9) + 0.14));
    for (; pt >= 14; pt--) { const rh = rowsNeeded(pt); const col = c => rh.slice(c * perCol, (c + 1) * perCol).reduce((a, v) => a + v, 0); if (Math.max(col(0), col(1)) <= availH) { rowH = rh; break; } }
    if (!rowH) { rowH = rowsNeeded(14); report.errors.push('unit map: lesson titles do not fit'); pt = 14; }
    const colY = [y, y];
    data.LESSONS.forEach((l, i) => {
      const c = i < perCol ? 0 : 1, x = T.MX + c * (colw + 0.4), cur = l.number === lessonNo, done = l.number < lessonNo;
      const yy = colY[c], h = rowH[i];
      s.addShape(pptx.ShapeType.roundRect, { x, y: yy, w: colw, h: h - 0.06, rectRadius: 0.08, fill: { color: cur ? CFG.phases.observe.hex : (done ? 'E8EAED' : T.panel) }, line: { color: cur ? shade(CFG.phases.observe.hex, 0.4) : T.rule, width: cur ? 2 : 0.75 } });
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.1, y: yy + (h - 0.06) / 2 - 0.19, w: 0.38, h: 0.38, fill: { color: cur ? T.dark : (done ? '888888' : 'FFFFFF') }, line: { color: cur ? T.dark : '888888', width: 1 } });
      s.addText(String(l.number), { x: x + 0.1, y: yy + (h - 0.06) / 2 - 0.19, w: 0.38, h: 0.38, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 12, bold: true, color: cur ? 'FFFFFF' : (done ? 'FFFFFF' : T.ink), margin: 0 });
      s.addText(mapTitle(i), { x: x + 0.62, y: yy, w: colw - 0.7 - (cur ? 1.55 : 0), h: h - 0.06, valign: 'middle', fontFace: CFG.font, fontSize: pt, bold: cur, color: T.ink, margin: 0, fit: 'none' });
      if (cur) s.addText('YOU ARE HERE', { x: x + colw - 1.6, y: yy, w: 1.5, h: h - 0.06, align: 'right', valign: 'middle', fontFace: CFG.font, fontSize: 12, bold: true, color: T.dark, margin: 0 });
      colY[c] += h;
    });
    const by = Math.max(colY[0], colY[1]) + 0.15;
    const so = `So far: ${spec.so_far}`, dq = `Driving question: ${drivingQuestion(data.UNIT)}`;
    const sh = heightIn(so, 18, T.contentW - 0.4), dh = heightIn(dq, 18, T.contentW - 0.5, true);
    s.addText(so, { x: T.MX, y: by, w: T.contentW, h: sh, fontFace: CFG.font, fontSize: 18, color: T.ink, margin: 0, valign: 'top', fit: 'none' });
    const dy = by + sh + 0.15;
    s.addShape(pptx.ShapeType.roundRect, { x: T.MX, y: dy, w: T.contentW, h: dh + 0.3, rectRadius: 0.1, fill: { color: T.dark }, line: { color: T.dark, width: 0 } });
    s.addText(dq, { x: T.MX + 0.25, y: dy + 0.05, w: T.contentW - 0.5, h: dh + 0.2, fontFace: CFG.font, fontSize: 18, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle', fit: 'none' });
    if (dy + dh + 0.3 > fb) report.errors.push(`unit map: content ends at ${(dy + dh + 0.3).toFixed(2)} in, footer starts at ${fb.toFixed(2)} in`);
    notesOf.push(composeNotes(spec.unit_map_notes, { time: spec.unit_map_minutes, lead: null }));
  }

  // ===================== 5. Goals and key words =====================
  {
    const s = startSlide('goals');
    decor(s, CFG.phases.predict.hex);
    const fb = footer(s, false, false);
    let y = header(s, { pillText: 'Today', pillFill: '111111', title: 'By the end of this lesson you can…' });
    const gw = 7.0, goalCol = [CFG.phases.predict.hex, CFG.phases.observe.hex, CFG.phases.explain.hex];
    let pt = 26; const goalH = (p) => spec.goals.map(g => Math.max(0.75, heightIn(g, p, gw - 0.95) + 0.2));
    while (pt > 20 && goalH(pt).reduce((a, v) => a + v, 0) + 0.2 * 2 > fb - y) pt--;
    let gy = y;
    spec.goals.forEach((g, i) => {
      const h = goalH(pt)[i], c = goalCol[i % 3];
      s.addShape(pptx.ShapeType.ellipse, { x: T.MX, y: gy + h / 2 - 0.28, w: 0.56, h: 0.56, fill: { color: c }, line: { color: c, width: 0 } });
      s.addText(String(i + 1), { x: T.MX, y: gy + h / 2 - 0.28, w: 0.56, h: 0.56, align: 'center', valign: 'middle', fontFace: CFG.font, fontSize: 20, bold: true, color: onColour(c), margin: 0 });
      const [first, ...rest] = g.split(' ');
      s.addText([{ text: first + ' ', options: { bold: true } }, { text: rest.join(' ') }], { x: T.MX + 0.8, y: gy, w: gw - 0.8, h, valign: 'middle', fontFace: CFG.font, fontSize: pt, color: T.ink, margin: 0, fit: 'none' });
      gy += h + 0.2;
    });
    if (gy - 0.2 > fb) report.errors.push('goals do not fit');
    const kx = T.MX + gw + 0.4, kw = T.W - T.MX - kx;
    let kpt = 18; const kh = (p) => heightIn('Key words', p + 2, kw - 0.4, true) + 0.15 + spec.key_words.reduce((a, k) => a + heightIn(k.word, p, kw - 0.4, true) + heightIn(k.definition, p - 2, kw - 0.4) + 0.12, 0);
    while (kpt > 14 && kh(kpt) + 0.4 > fb - y) kpt--;
    if (kpt < CFG.min_pt) report.warnings.push(`key words set at ${kpt}pt (below ${CFG.min_pt}pt student minimum)`);
    if (kh(kpt) + 0.4 > fb - y) report.errors.push('key words do not fit');
    s.addShape(pptx.ShapeType.roundRect, { x: kx, y, w: kw, h: kh(kpt) + 0.4, rectRadius: 0.12, fill: { color: T.panel }, line: { color: T.rule, width: 1 } });
    const runs = [{ text: 'Key words', options: { bold: true, fontSize: kpt + 2, breakLine: true, paraSpaceAfter: 6 } }];
    spec.key_words.forEach((k, i) => { runs.push({ text: k.word, options: { bold: true, fontSize: kpt, breakLine: true } }); runs.push({ text: k.definition, options: { fontSize: kpt - 2, color: T.muted, breakLine: i < spec.key_words.length - 1, paraSpaceAfter: 6 } }); });
    s.addText(runs, { x: kx + 0.2, y: y + 0.2, w: kw - 0.4, h: kh(kpt), fontFace: CFG.font, color: T.ink, margin: 0, valign: 'top', fit: 'none' });
    notesOf.push(composeNotes(spec.goals_notes, { time: spec.goals_minutes }));
  }

  // ===================== 6. Safety (practicals and demonstrations only) =====================
  if (spec.safety.rules.length) {
    const s = startSlide('safety');
    const fb = footer(s, false, false);
    let y = header(s, { pillText: 'Safety first', pillFill: 'B71C1C', title: spec.safety.title });
    render(pptx, s, [{ type: 'numbered', items: spec.safety.rules }], { x: T.MX, y, w: T.contentW, h: fb - y }, { phaseHex: 'B71C1C', report });
    notesOf.push(composeNotes(spec.safety.notes, { time: spec.safety.minutes }));
  }

  // ===================== 7. Phase slides =====================
  const phaseMinutes = {};
  for (const sl of spec.slides) phaseMinutes[sl.phase] = (phaseMinutes[sl.phase] || 0) + sl.minutes;
  const seenPhase = new Set();
  const quizPlan = quizLinks.plan(meta, lessonNo, spec.slides);
  if (quizPlan.unplaced.length) report.warnings.push(`quiz questions with no slide in their phase (no link placed): ${quizPlan.unplaced.join(', ')}`);
  for (const [slideIdx, sl] of spec.slides.entries()) {
    const ph = CFG.phases[sl.phase], s = startSlide('phase', { label: sl.phase });
    decor(s, ph.hex);
    const fb = footer(s, false, false);
    const y = header(s, { phase: sl.phase, pillText: ph.label, title: sl.title, subtitle: sl.subtitle, cfu: sl.check_for_understanding, badge: PHASE_ICON[sl.phase] });
    const art = sl.blocks.find(bk => bk.type === 'illustration');
    const hasTimers = sl.timers && sl.timers.length;
    const aw = art ? Math.min(4.6, fb - y) : 0;
    let region = { x: T.MX, y, w: T.contentW - (art ? aw + 0.4 : 0), h: fb - y };
    if (art) {
      const ax = T.W - T.MX - aw, ay = y + Math.max(0, (fb - y - aw) / 2);
      artPanel(s, art.items[0], art.text, ax, ay, aw, aw, ph.hex, PHASE_ICON[sl.phase]);
      if (hasTimers) sl.timers.forEach((t, i) => timerPill(s, t, ax + 0.15, ay + 0.15 + i * 1.05, 2.0));
    } else if (hasTimers) { region = { ...region, w: region.w - 2.5 }; timerColumn(s, sl.timers, y); }
    // resource icons referenced by the slide go in a final block
    const blocks = sl.blocks.filter(bk => bk.type !== 'illustration');
    if (sl.resources && sl.resources.length) {
      for (const k of sl.resources) { const m = matchOf[k]; if (m && m.match === 'do_not_use') report.errors.push(`slide '${sl.title}' shows resource ${k}, which the glance notes mark DO NOT USE`); }
      blocks.push({ type: 'resource', resource_keys: sl.resources });
    }
    const qlinks = quizPlan.bySlide.get(slideIdx) || [];
    if (qlinks.length) blocks.push({ type: 'quizlink', links: qlinks });
    render(pptx, s, blocks, region, { phaseHex: ph.hex, report, resources: resMap, label: sl.title });
    const first = !seenPhase.has(sl.phase); seenPhase.add(sl.phase);
    const phaseHeader = first ? `${ph.label.toUpperCase()}${sl.phase === 'dqb' ? '' : ' PHASE'} (${plural(phaseMinutes[sl.phase])} total)` : undefined;
    const resLines = (sl.resources || []).map(k => resMap[k] ? `${resMap[k].title} (${resMap[k].source}): ${resMap[k].url}` : null).filter(Boolean);
    qlinks.forEach(l => resLines.push(`Quiz question ${l.q} (opens in ARES; you start capture there): ${l.url}`));
    notesOf.push(composeNotes(sl.notes, { phaseHeader, time: sl.minutes, timeNote: sl.time_note, resourceLines: resLines }));
    if (qlinks.length) quizRows.push(...qlinks.map(l => ({ slide: report.slides.length, ...l })));
  }

  // ===================== 8. Summary table =====================
  {
    const s = startSlide('summary');
    decor(s, CFG.phases.model.hex);
    const fb = footer(s, true, false);
    const y = header(s, { phase: 'model', pillText: 'Summary Table', pillFill: '111111', badge: 'memo', title: `Summary Table: Lesson ${lessonNo}`, subtitle: 'Fill in the Lesson ' + lessonNo + ' row of your Summary Table.' });
    const sm = spec.summary;
    const blocks = [{ type: 'columns', columns: [
      { icon: 'eyes', heading: 'What did I observe?', text: sm.observe_prompt }, { icon: 'books', heading: 'What did I learn?', text: sm.learn_prompt }, { icon: 'lightbulb', heading: 'How does this explain the phenomenon?', text: sm.explain_prompt },
    ] }, { type: 'text', text: `Next lesson: ${String(sm.next_lesson).replace(/^\s*next lesson:\s*/i, '')}`, style: 'emphasis' }];
    render(pptx, s, blocks, { x: T.MX, y, w: T.contentW, h: fb - y }, { phaseHex: '777777', report });
    const ak = [`Observe: ${sm.answer_observe}`, `Learn: ${sm.answer_learn}`, `Explain: ${sm.answer_explain}`];
    notesOf.push(composeNotes({ ...(sm.notes || {}), answer_key: ak }, { time: sm.minutes, timeNote: 'at the end, or as homework', tail: { label: 'TEACHER REFLECTION', items: sm.reflection } }));
  }

  // ---- minutes check (authoring repair loop reads this) ----
  const sum = (spec.unit_map_minutes + spec.goals_minutes + (spec.safety.rules.length ? spec.safety.minutes : 0) + spec.slides.reduce((a, s) => a + s.minutes, 0) + spec.summary.minutes);
  if (sum !== lessonLen) report.errors.push(`slide minutes add up to ${sum}, lesson is ${lessonLen} minutes`);
  const gsum = spec.glance.rows.reduce((a, r) => a + r.minutes, 0);
  if (gsum !== lessonLen) report.errors.push(`glance rows add up to ${gsum}, lesson is ${lessonLen} minutes`);

  report.notes_count = notesOf.length;
  return pptx.write({ outputType: 'nodebuffer' }).then(async buf => {
    const out = await withNotes(buf, notesOf);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out);
    fs.writeFileSync(outPath.replace(/\.pptx$/, '.layout.json'), JSON.stringify(report, null, 1));
    const qp = outPath.replace(/\.pptx$/, '.quizlinks.csv');
    if (quizRows.length) fs.writeFileSync(qp, ['slide,quiz_id,version,question_id,url,phase,placement,status', ...quizRows.map(r => [r.slide, r.quiz, r.version, r.q, r.url, r.phase, JSON.stringify(r.placement), 'auto: spread across the phase; confirm the transition'].join(','))].join('\n') + '\n');
    else if (fs.existsSync(qp)) fs.unlinkSync(qp);
    return report;
  });
}

// pptxgenjs writes a notes string as ONE text run, so line breaks are lost in PowerPoint. Rewrite each
// notes body as real paragraphs with the labels in bold.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LABEL = /^(PURPOSE OF THIS LESSON|BEFORE CLASS|DO NOT SHOW YET|TIME:|DO$|SAY$|WAIT TIME$|LOOK FOR$|IF…$|WHY THIS WORKS$|ANSWER KEY$|SCIENCE NOTE FOR YOU$|TEACHER REFLECTION$|RESOURCE LINKS|RESOURCES FROM|IF EQUIPMENT|HOW TO USE|TEACHER ONLY|[A-Z][A-Z ]+ PHASE \(|DRIVING QUESTION BOARD \()/;
// pptxgenjs embeds a separate copy of an image for every use (the logos on every slide, each icon...). Collapse identical
// media files to one and repoint the slide relationships: a deck drops from ~12 MB to a few MB.
async function dedupeMedia(zip) {
  const crypto = require('crypto');
  const canon = new Map(), remap = new Map();
  for (const name of Object.keys(zip.files).filter(n => /^ppt\/media\/./.test(n) && !zip.files[n].dir)) {
    const h = crypto.createHash('sha1').update(await zip.file(name).async('nodebuffer')).digest('hex') + path.extname(name);
    if (canon.has(h)) remap.set(path.basename(name), path.basename(canon.get(h))); else canon.set(h, name);
  }
  for (const n of Object.keys(zip.files).filter(n => /^ppt\/(slides|notesSlides|slideLayouts|slideMasters)\/_rels\/.+\.rels$/.test(n))) {
    let x = await zip.file(n).async('string'), changed = false;
    x = x.replace(/Target="\.\.\/media\/([^"]+)"/g, (m, f) => { if (remap.has(f)) { changed = true; return `Target="../media/${remap.get(f)}"`; } return m; });
    if (changed) zip.file(n, x);
  }
  for (const f of remap.keys()) zip.remove('ppt/media/' + f);
  return remap.size;
}
async function withNotes(buf, notesOf) {
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < notesOf.length; i++) {
    const p = `ppt/notesSlides/notesSlide${i + 1}.xml`;
    let xml = await zip.file(p).async('string');
    const paras = notesOf[i].split('\n').map(line => {
      const b = LABEL.test(line);
      return `<a:p><a:r><a:rPr lang="en-GB" sz="1200"${b ? ' b="1"' : ''}/><a:t>${esc(line)}</a:t></a:r></a:p>`;
    }).join('');
    // the notes body is the shape holding <p:ph type="body" .../>
    const re = /(<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph[^>]*type="body"[^>]*\/>[\s\S]*?<p:txBody>[\s\S]*?<a:lstStyle\/>)([\s\S]*?)(<\/p:txBody>)/;
    if (!re.test(xml)) throw new Error('notes XML shape not recognised in ' + p);
    xml = xml.replace(re, (m, a, _b, c) => a + paras + c);
    zip.file(p, xml);
  }
  await dedupeMedia(zip);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

if (require.main === module) {
  const [dataPath, no, specPath, out] = process.argv.slice(2);
  if (!out) { console.error('usage: build_deck.js <data.json> <lessonNo> <spec.json> <out.pptx>'); process.exit(2); }
  build(dataPath, +no, specPath, out).then(r => {
    console.log(`built ${out}: ${r.slides.length} slides, ${r.errors.length} layout error(s), ${r.warnings.length} warning(s)`);
    r.errors.forEach(e => console.log('  ERROR ' + e)); r.warnings.forEach(w => console.log('  warn  ' + w));
    process.exit(r.errors.length ? 1 : 0);
  }).catch(e => { console.error(e.stack || e.message); process.exit(2); });
}
module.exports = { build, lessonLength, composeNotes };
