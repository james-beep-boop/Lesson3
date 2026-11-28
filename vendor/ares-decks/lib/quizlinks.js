'use strict';
// Quiz links in decks (provisional ARES convention, decided with the response-capture project 2026-11-21):
//   http://ares.local/quiz/<quiz-id>/<version>/question/<question-id>
// IDs and versions come from data/quiz_registry.json (scripts/quiz_links.py), never from the deck. A link carries no
// class, student or answer. The deck only shows an icon; the teacher starts capture inside ARES.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const REG = path.join(ROOT, 'data', 'quiz_registry.json');
const URL = (quiz, ver, q) => `http://ares.local/quiz/${quiz}/${ver}/question/${q}`;
const SUBJ = { Biology: 'bio', Chemistry: 'chem', Physics: 'phys', Mathematics: 'math', 'Core Mathematics': 'cmath', 'Essential Mathematics': 'emath', 'General Science': 'gsci' };
const quizId = (meta, n) => `${SUBJ[meta.subject]}-g${meta.grade}-${String(meta.substrand_id).toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-|-$/g, '')}-l${String(n).padStart(2, '0')}`;

function registryEntry(meta, lessonNo) {
  if (!fs.existsSync(REG)) return null;
  const id = quizId(meta, lessonNo), e = (JSON.parse(fs.readFileSync(REG, 'utf8')).quizzes || {})[id];
  return e ? { id, ...e } : null;
}

// Where each question's link goes: the question's phase picks the slides; a phase's questions are spread over its slides
// with the last question on the last slide (a transition point). Returns {bySlide: Map(specSlideIdx -> [link]), unplaced, rows}.
function plan(meta, lessonNo, specSlides) {
  const e = registryEntry(meta, lessonNo);
  const out = { quiz: e, bySlide: new Map(), unplaced: [], rows: [] };
  if (!e) return out;
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, e.source), 'utf8')).lessons.find(l => l.number === lessonNo);
  const byPhase = {};
  specSlides.forEach((s, i) => (byPhase[s.phase] = byPhase[s.phase] || []).push(i));
  const grouped = {};
  src.quiz.forEach((q, k) => (grouped[q.phase] = grouped[q.phase] || []).push({ q, rec: e.questions[k] }));
  for (const [ph, items] of Object.entries(grouped)) {
    const sl = byPhase[ph] || [];
    items.forEach(({ q, rec }, j) => {
      if (!sl.length) { out.unplaced.push(rec.id); return; }
      const idx = sl[Math.min(sl.length - 1, Math.max(0, Math.round((j + 1) * sl.length / items.length) - 1))];
      const link = { quiz: e.id, version: e.version, q: rec.id, url: URL(e.id, e.version, rec.id), n: Number(rec.id.slice(1)), phase: ph, placement: q.placement, slideIdx: idx };
      if (!out.bySlide.has(idx)) out.bySlide.set(idx, []);
      out.bySlide.get(idx).push(link); out.rows.push(link);
    });
  }
  for (const v of out.bySlide.values()) v.sort((a, b) => a.n - b.n);
  return out;
}
const allowedUrls = (meta, lessonNo) => { const e = registryEntry(meta, lessonNo); return new Set(e ? e.questions.map(q => URL(e.id, e.version, q.id)) : []); };
module.exports = { plan, allowedUrls, registryEntry, quizId, URL };
