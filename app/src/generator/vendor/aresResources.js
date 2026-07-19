/**
 * Lesson3-owned ARES resource bridge — pure Node, no recommender, no SQLite.
 *
 * The pristine upstream `sections.js` asks `getAllPhaseResources()` once per lesson. Upstream's
 * implementation shells out to Python; Lesson3 instead places the already-resolved, versioned JSON
 * maps in an AsyncLocalStorage queue for the duration of one build. That keeps concurrent document
 * generations isolated and lets the upstream renderer remain byte-identical.
 */
'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const {
  Paragraph, TextRun, ExternalHyperlink,
} = require('docx');

const resourceContext = new AsyncLocalStorage();

const EMPTY_PHASE = Object.freeze({ video: null, reading: null, fallback_search_url: '' });
const EMPTY_ALL = Object.freeze({
  predict: EMPTY_PHASE,
  observe: EMPTY_PHASE,
  explain: EMPTY_PHASE,
  dqb: EMPTY_PHASE,
  model: EMPTY_PHASE,
});

/**
 * Run one pristine generator build with its lesson resources isolated from concurrent builds.
 *
 * COUNT CONTRACT (implicit coupling to the vendored `sections.js`): the pristine renderer must call
 * `getAllPhaseResources()` exactly once per lesson, in `LESSONS` order — that is how the positional
 * queue stays aligned to each lesson. This holds for the pinned commit; a future re-pin that changes
 * the call pattern would misalign (or blank out) resources. Two loud guards defend the CALL COUNT:
 *   - too MANY calls: `getAllPhaseResources` throws the moment the queue is over-read (below), so a
 *     "called twice" drift fails during the build rather than silently returning EMPTY_ALL.
 *   - too FEW calls: the post-build check here throws if not every queued lesson was consumed.
 * Count alone CANNOT prove iteration ORDER (right number of calls, wrong sequence) — the DOCX
 * fidelity oracle (scripts/adapter-fidelity.ts, run on every re-pin) is the order/output guard.
 */
function withStoredResourceLinks(lessons, build) {
  const queue = Array.isArray(lessons) ? lessons.map((lesson) => lesson.resourceLinks) : [];
  const state = { queue, index: 0 };
  const assertAllConsumed = () => {
    if (state.index < queue.length) {
      throw new Error(
        `aresResources: getAllPhaseResources() called ${state.index} time(s) for ${queue.length} ` +
          `lesson(s) — fewer than one per lesson. Vendored sections.js count contract broken; ` +
          `re-check on re-pin.`,
      );
    }
  };
  const result = resourceContext.run(state, build);
  // `build` is async (buildSoW returns a Promise): assert after it resolves, not before.
  if (result && typeof result.then === 'function') {
    return result.then((value) => {
      assertAllConsumed();
      return value;
    });
  }
  assertAllConsumed();
  return result;
}

/**
 * Called by pristine `sections.js` once per lesson in order (see the count contract above); the
 * lookup arguments are intentionally unused. With no active build context it returns EMPTY_ALL
 * (defensive — the wrapped buildSoW path always has one). Within a context, an over-read (more calls
 * than queued lessons) throws LOUDLY instead of silently returning EMPTY_ALL, so a "called twice"
 * vendor drift is caught during the build rather than shipping blank/misaligned resources.
 */
function getAllPhaseResources() {
  const state = resourceContext.getStore();
  if (!state) return EMPTY_ALL;
  if (state.index >= state.queue.length) {
    throw new Error(
      `aresResources: getAllPhaseResources() called more times than the ${state.queue.length} ` +
        `lesson(s) queued — vendored sections.js resource-lookup count contract broken; ` +
        `re-check on re-pin.`,
    );
  }
  return state.queue[state.index++] || EMPTY_ALL;
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
    paras.push(searchLinkPara('🔍 Search ARES for videos', fallback));
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
    paras.push(searchLinkPara('🔍 Search ARES for readings', fallback));
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

module.exports = { getAllPhaseResources, buildResourceParagraphs, withStoredResourceLinks };
