'use strict';
// ARES resources of one lesson, from the lesson's `resourceLinks` (data JSON). Only these links may
// appear in a deck (Overrides row 2/3). Null slots are skipped; duplicate URLs collapse to one entry.
const SLOT_ORDER = ['predict', 'observe', 'explain', 'dqb', 'model'];

function iconFor(contentType, title) {
  const t = String(contentType || '').toLowerCase(), n = String(title || '').toLowerCase();
  if (t.includes('video')) return 'video';
  if (t.includes('exercise')) return 'exercise';
  if (t.includes('sim') || t.includes('html5') || n.includes('simulation') || n.includes('phet')) return 'simulation';
  if (t.includes('html') || t.includes('doc') || t.includes('pdf') || t.includes('read')) return 'reading';
  return 'web';
}

function resourceIndex(lesson) {
  const byUrl = new Map();
  const rl = lesson.resourceLinks || {};
  for (const ph of SLOT_ORDER) {
    for (const [slot, r] of Object.entries(rl[ph] || {})) {
      if (!r || typeof r !== 'object' || !r.direct_url) continue;
      const key = `${ph}.${slot}`;
      if (byUrl.has(r.direct_url)) { byUrl.get(r.direct_url).also.push(key); continue; }
      byUrl.set(r.direct_url, { key, title: r.title, source: r.source, content_type: r.content_type, url: r.direct_url, icon: iconFor(r.content_type, r.title), also: [] });
    }
  }
  return [...byUrl.values()];
}

module.exports = { resourceIndex, iconFor };
