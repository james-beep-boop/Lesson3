/**
 * buildSowCompact.js — the LessonSequence (SoW) builder (Lesson3-owned)
 * ==========================================================================
 * The single LessonSequence DOCX layout (see index.ts — the standard/compact
 * two-format system was collapsed to this one on 2026-07-03).
 *
 * It differs from the retired vendored `buildSoW` in exactly ONE way: Section C
 * ("C. Lesson Implementation Framework") drops the **Resource** column and
 * re-balances the remaining five columns:
 *
 *   Phase              1.57"  = 2261 DXA  (fixed — unchanged from Format 1's request)
 *   Learner Experience ~1.98" = 2855 DXA
 *   Teacher Moves      ~1.98" = 2855 DXA
 *   Sensemaking        ~1.98" = 2855 DXA
 *   Formative          ~1.98" = remainder
 *
 * The four flexible columns are derived from the vendored content width `W`
 * (landscape Letter, 0.75" margins = 13680 DXA) so they always fill the row
 * exactly with no overflow, and track any future margin change automatically.
 *
 * This file is NOT part of the byte-pristine vendored generator — it is
 * Lesson3 code that REUSES the vendored primitives (`docx_kit`) and the
 * unchanged section builders (`sections`). Format 1 keeps the pure vendored
 * path (`vendor/lib/build_docs.js`), so its fidelity stays byte-stable.
 *
 * FinalExplanation and SummaryTable are identical across both formats, so
 * only the SoW builder is re-implemented here.
 */
'use strict';

const { Document, Packer, PageOrientation, TableRow } = require('docx');
const {
  W, C, SZ, SZ_H, SPACE, PHASE_COLOUR, cell, fullHeader, makeTable,
} = require('./vendor/lib/docx_kit');
const {
  titleBlock, subStrandOverview,
  sectionA, sectionB, sectionD, sectionE,
  differentiationTable,
} = require('./vendor/lib/sections');

// ── Page setup — identical to the vendored buildSoW (landscape US Letter, 0.75" margins) ──
function pageProps() {
  return {
    page: {
      size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
      margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
    },
  };
}

// ── Section C (Format 2) — no Resource column, re-balanced widths ─────────────
//
// Column widths: Phase fixed at 1.57"; the four remaining columns split the
// rest of the content width (W) evenly. floor-then-remainder so the widths sum
// to W exactly (the last column absorbs the rounding remainder — a few DXA,
// visually imperceptible), mirroring the vendored remainder pattern.
const PHASE_W = 2261;                       // 1.57" — fixed by request
const FLEX    = Math.floor((W - PHASE_W) / 4);
const FLEX_R  = (W - PHASE_W) - FLEX * 3;   // remainder → last column
const CW      = [PHASE_W, FLEX, FLEX, FLEX, FLEX_R];

function sectionCCompact(lesson, config = {}) {
  const col3Label = config.col3Label || 'Teacher Moves';
  const col5Label = config.col5Label || 'Formative Assessment Strategy';

  return makeTable([
    fullHeader('C. LESSON IMPLEMENTATION FRAMEWORK', C.teal, 'FFFFFF', SZ_H, 5),
    new TableRow({ children: [
      cell('Phase',                { fill: C.darkBlue, bold: true, color: 'FFFFFF', w: CW[0], size: SZ }),
      cell('Learner Experience',   { fill: C.medBlue,  bold: true, color: 'FFFFFF', w: CW[1], size: SZ }),
      cell(col3Label,              { fill: C.medBlue,  bold: true, color: 'FFFFFF', w: CW[2], size: SZ }),
      cell('Sensemaking Strategy', { fill: C.teal,     bold: true, color: 'FFFFFF', w: CW[3], size: SZ }),
      cell(col5Label,              { fill: C.medBlue,  bold: true, color: 'FFFFFF', w: CW[4], size: SZ }),
    ]}),
    ...lesson.framework.map(ph => new TableRow({ children: [
      cell(ph.phase,
           { fill: PHASE_COLOUR[ph.phase] || C.grey, bold: true, w: CW[0], size: SZ }),
      cell(ph.learnerExperience,   { fill: C.white, w: CW[1], size: SZ }),
      cell(ph.teacherMoves,        { fill: C.white, w: CW[2], size: SZ }),
      cell(ph.sensemakingStrategy, { fill: C.grey,  w: CW[3], size: SZ }),
      cell(ph.formativeAssessment, { fill: C.white, w: CW[4], size: SZ }),
    ]})),
  ], CW);
}

// ── SoW (Lesson Sequence), Format 2 — mirrors vendored buildSoW exactly,
//    substituting sectionCCompact for the vendored sectionC ──────────────────
async function buildSoWCompact(META, UNIT, LESSONS) {
  const sectionCConfig = {
    subject:   META.subject   || 'Biology',
    col3Label: META.col3Label || 'Teacher Moves',
    col5Label: META.col5Label || 'Formative Assessment Strategy',
  };

  const body = [
    ...titleBlock(META.titleDoc, META.subtitleDoc),
    SPACE(),
    subStrandOverview(UNIT),
    SPACE(),
  ];

  for (const lesson of LESSONS) {
    body.push(
      SPACE(),
      sectionA(lesson),
      SPACE(),
      sectionB(lesson),
      SPACE(),
      sectionCCompact(lesson, sectionCConfig),
      SPACE(),
      sectionD(lesson),
      SPACE(),
      sectionE(lesson),
      SPACE(),
    );
  }

  body.push(SPACE(), differentiationTable(META.differentiationRows));

  return new Document({
    sections: [{ properties: pageProps(), children: body }],
  });
}

module.exports = { buildSoWCompact, Packer };
