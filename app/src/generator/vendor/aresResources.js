/**
 * Lesson3-owned ARES resource bridge — pure Node, no recommender, no SQLite.
 *
 * Upstream's renderer (`sections.js`, from link-selection v2 onward) has two ways to get a lesson's
 * resource links: query ARES's content database through `getAllPhaseResources()` (only when a file
 * exists at `DB_PATH`), or — its own supported path for "no database on this machine" — use the
 * `lesson.resourceLinks` already present in the data. Lesson3 stores the resolved, versioned links in
 * Payload and never runs the recommender, so it deliberately takes the second path:
 *
 *   - `DB_PATH` points at a location that can never exist, so `sectionC` keeps each lesson's own
 *     stored `resourceLinks`. That is order-independent, and there is no shared state between
 *     concurrent builds (the previous positional queue could only prove call COUNT, never ORDER).
 *   - `getAllPhaseResources` still has to exist (the pristine file destructures it) but must never be
 *     called; if a future re-pin makes the renderer call it, it throws rather than rendering blanks.
 *   - `takeDiagnostics` is a no-op: link-matching diagnostics are an upstream pipeline artefact that
 *     never reaches the contract JSON (so partial-match "Related topic" labels cannot be reproduced).
 *
 * Upstream's `sectionC` prints one `console.warn` per lesson on the stored-links path. That is
 * accepted: a cold render only, and replacing the global `console.warn` to hide it would let
 * concurrent exports interfere with each other's logging.
 */
'use strict';

const {
  Paragraph, TextRun, ExternalHyperlink,
} = require('docx');

/** A path that cannot exist (a child of a file), so upstream's `fs.existsSync(DB_PATH)` is always false. */
const DB_PATH = '/dev/null/lesson3-no-ares-content-db';

/** See header: reaching this means the vendored renderer changed how it looks up resources. */
function getAllPhaseResources() {
  throw new Error(
    'aresResources: getAllPhaseResources() was called, but Lesson3 has no ARES content database — ' +
      'resources must come from each lesson\'s stored resourceLinks (sectionC stored-links path). ' +
      'The vendored sections.js lookup changed; re-check on re-pin.',
  );
}

/** No link-matching runs in Lesson3, so there are never diagnostics to return. */
function takeDiagnostics() {
  return [];
}

const LINK_COLOUR  = '2E75B6';
const LABEL_COLOUR = '1F3864';
const META_COLOUR  = '595959';

// Render-time http/https re-check (defence in depth). Must stay semantically identical to
// `isSafeHttpUrl` in src/ingest/resourceLinks.ts — that one is the ingest boolean gate; this one is
// the last barrier before a stored URL becomes a hyperlink target. Kept as a separate CommonJS copy
// on purpose: this bridge must not import app ESM/TS (it survives the vendor re-sync).
function safeHttpUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : '';
  } catch (_) {
    return '';
  }
}

/** Same safe-input output as upstream's paragraph builder, with URL-scheme defence in depth. */
function buildResourceParagraphs(resources, phase = '') {
  void phase;
  const fallback = safeHttpUrl(resources && resources.fallback_search_url);
  const paras = [];

  const video = resources && resources.video;
  paras.push(labelPara('📹 VIDEO:'));
  if (video) {
    const url = safeHttpUrl(video.direct_url) || safeHttpUrl(video.exact_search_url) || fallback;
    paras.push(linkPara(video.title, url));
    if (video.source) paras.push(metaPara(`Source: ${video.source}`));
    paras.push(searchLinkPara('🔍 Search ARES for similar videos', video.search_url));
  } else {
    paras.push(...noMatchParas('video', fallback));
  }

  paras.push(spacerPara());

  const reading = resources && resources.reading;
  const readingLabel = reading ? `📖 ${(reading.content_type || 'READING').toUpperCase()}:` : '📖 READING:';
  paras.push(labelPara(readingLabel));
  if (reading) {
    const url = safeHttpUrl(reading.direct_url) || safeHttpUrl(reading.exact_search_url) || fallback;
    paras.push(linkPara(reading.title, url));
    if (reading.source) paras.push(metaPara(`Source: ${reading.source}`));
    paras.push(searchLinkPara('🔍 Search ARES for similar readings', reading.search_url));
  } else {
    paras.push(...noMatchParas('reading', fallback));
  }

  return paras;
}

function labelPara(text) {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [new TextRun({
      text, bold: true, size: 16, font: 'Arial', color: LABEL_COLOUR,
    })],
  });
}

function linkPara(title, url) {
  if (!url) return plainPara(title);
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [
      new ExternalHyperlink({
        link: url,
        children: [new TextRun({
          text: title,
          size: 16,
          font: 'Arial',
          color: LINK_COLOUR,
          underline: { type: 'single', color: LINK_COLOUR },
        })],
      }),
    ],
  });
}

function plainPara(text) {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [new TextRun({ text: text || '', size: 16, font: 'Arial' })],
  });
}

function metaPara(text) {
  return new Paragraph({
    spacing: { before: 0, after: 10 },
    indent: { left: 120 },
    children: [new TextRun({
      text, size: 14, font: 'Arial', color: META_COLOUR,
    })],
  });
}

function spacerPara() {
  return new Paragraph({
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: '', size: 14 })],
  });
}

function searchLinkPara(label, rawUrl) {
  const url = safeHttpUrl(rawUrl);
  if (!url) return metaPara(label);
  return new Paragraph({
    spacing: { before: 0, after: 10 },
    indent: { left: 120 },
    children: [
      new ExternalHyperlink({
        link: url,
        children: [new TextRun({
          text: label,
          size: 14,
          font: 'Arial',
          color: META_COLOUR,
          underline: { type: 'single', color: META_COLOUR },
        })],
      }),
    ],
  });
}

/**
 * "No confident match" block, matching upstream's wording and layout: says so plainly rather than
 * showing a weak link as if it were a good one, then offers the search link and prints the search terms
 * (printed copies lose hyperlinks, and the full URL is ~600 characters).
 */
function noMatchParas(kind, fallback) {
  // `fallback` is already http(s)-safe or '' (buildResourceParagraphs sanitised it); searchLinkPara keeps
  // its own check as the last barrier before a URL becomes a hyperlink target.
  const terms = searchTermsFromUrl(fallback);
  return [
    italicPara(`No closely matching ${kind} in the ARES library for this activity.`),
    searchLinkPara(`🔍 Search ARES for ${kind}s`, fallback),
    ...(terms ? [metaPara(`Search terms: ${terms}`)] : []),
  ];
}

// A malformed percent-escape must not take down the whole document: show no terms instead.
function searchTermsFromUrl(url) {
  const m = /[?&]searchstring=([^&]*)/.exec(url);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' '));
  } catch (_) {
    return '';
  }
}

function italicPara(text) {
  return new Paragraph({
    spacing: { before: 0, after: 20 },
    children: [new TextRun({
      text, italics: true, size: 16, font: 'Arial', color: META_COLOUR,
    })],
  });
}

module.exports = { getAllPhaseResources, buildResourceParagraphs, takeDiagnostics, DB_PATH };
