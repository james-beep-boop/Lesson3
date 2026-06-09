/**
 * sections.js — Section builders for CBE lesson plan documents
 * =============================================================
 * Builds each named section of a lesson plan document.
 * Requires docx_kit for primitives and aresResources for Resource column.
 *
 * All section builders accept a lesson data object.
 * sectionC also accepts a config object for per-subject variations.
 *
 * Exports:
 *   titleBlock(title, subtitle)
 *   subStrandOverview(unit)
 *   sectionA(lesson)
 *   sectionB(lesson)
 *   sectionC(lesson, config)   config: { subject, col3Label, col5Label }
 *   sectionD(lesson)
 *   sectionE(lesson)
 *   differentiationTable(rows)
 */
'use strict';

const { TableRow } = require('docx');
const {
  W, C, SZ, SZ_H, SZ_T, PHASE_COLOUR,
  para, cell, fullHeader, labelRow, makeTable,
} = require('./docx_kit');

// ARES integration — gracefully absent if module not found
let getAllPhaseResources, buildResourceParagraphs;
try {
  ({ getAllPhaseResources, buildResourceParagraphs } = require('../aresResources'));
} catch (_) {
  getAllPhaseResources   = () => ({});
  buildResourceParagraphs = () => [para('(ARES resources unavailable)')];
}

// ── Title block ───────────────────────────────────────────────────────────────

function titleBlock(title, subtitle) {
  return [
    para(title,    { bold: true, size: SZ_T, color: C.darkBlue, align: 'center', after: 30 }),
    para(subtitle, { italic: true, size: SZ_H, color: C.teal,   align: 'center', after: 60 }),
  ];
}

// ── Sub-Strand Overview ───────────────────────────────────────────────────────

function subStrandOverview(unit) {
  const LW = 3000;

  // Helper: accept both naming conventions (old generator names | new schema names)
  const get = (a, b) => unit[a] || unit[b] || '';

  const rows = [
    fullHeader('SUB-STRAND OVERVIEW', C.darkBlue, 'FFFFFF', SZ_H, 2),
    labelRow('Grade Level',    get('gradeLevel',  'gradeLevel'), LW),
    labelRow('Subject',        unit.subject,                     LW),
    labelRow('Strand',         unit.strand,                      LW),
    labelRow('Sub-Strand',     unit.substrand,                   LW),
    labelRow('Total Duration', get('totalDuration', 'duration'), LW),
  ];

  if (get('content', 'subStrandContent')) {
    rows.push(labelRow('Sub-Strand Content', get('content', 'subStrandContent'), LW));
  }

  const outcomes = get('learningOutcomes', 'outcomes');
  if (outcomes) rows.push(labelRow('Learning Outcomes', outcomes, LW));

  const competencies = get('coreCompetencies', 'competencies');
  if (competencies) rows.push(labelRow('Core Competencies', competencies, LW, { labelFill: C.lightBlue }));

  if (unit.values) rows.push(labelRow('Core Values', unit.values, LW, { labelFill: C.lightGreen }));

  if (unit.sep) rows.push(labelRow('Science & Engineering Practices', unit.sep, LW, { labelFill: C.lightBlue }));

  if (unit.pcis) rows.push(labelRow('Pertinent & Contemporary Issues (PCIs)', unit.pcis, LW, { labelFill: C.lightOrange }));

  const careers = get('careers', 'careerConnections');
  if (careers) rows.push(labelRow('Career Connections', careers, LW, { labelFill: C.lightTeal }));

  const focus = get('focus', 'focusForLessons');
  if (focus) rows.push(labelRow('Focus for Lessons', focus, LW, { labelFill: C.lightBlue }));

  const kiq = get('keyInquiryQuestions', 'drivingQuestion');
  if (kiq) rows.push(labelRow('Driving Question / Key Inquiry Questions', kiq, LW, { labelFill: C.lightPurple }));

  if (unit.phenomenon) rows.push(labelRow('Anchoring Phenomenon', unit.phenomenon, LW, { labelFill: C.lightPurple }));

  const storyline = get('storyline', 'storylineThread');
  if (storyline) rows.push(labelRow('Storyline Thread', storyline, LW, { labelFill: C.lightTeal }));

  if (unit.supportingPhenomena) rows.push(labelRow('Supporting Phenomena', unit.supportingPhenomena, LW, { labelFill: C.lightPurple }));

  return makeTable(rows, [LW, W - LW]);
}

// ── Lesson sections ───────────────────────────────────────────────────────────

function sectionA(lesson) {
  const LW = 2400;
  const rows = [
    fullHeader(
      `LESSON ${lesson.number} (${lesson.duration}): ${lesson.title}`,
      C.darkBlue, 'FFFFFF', SZ_H, 2,
    ),
    fullHeader('A. SPECIFIC LEARNING OUTCOMES', C.teal, 'FFFFFF', SZ_H, 2),
    new TableRow({ children: [
      cell('Category',                   { fill: C.medBlue, bold: true, color: 'FFFFFF', w: LW, size: SZ }),
      cell('Specific Learning Outcomes', { fill: C.medBlue, bold: true, color: 'FFFFFF', w: W - LW, size: SZ }),
    ]}),
    labelRow('Purpose',               lesson.slo.purpose,           LW, { labelFill: C.lightBlue }),
    labelRow('Knowledge',             lesson.slo.knowledge,          LW, { labelFill: C.lightBlue }),
    labelRow('Skills',                lesson.slo.skills,             LW, { labelFill: C.lightBlue }),
    labelRow('Attitudes',             lesson.slo.attitudes,          LW, { labelFill: C.lightGreen }),
    labelRow('Key Inquiry Question',  lesson.slo.keyInquiry,         LW, { labelFill: C.lightPurple }),
    labelRow('Purpose in Storyline',  lesson.slo.purposeInStoryline, LW, { labelFill: C.lightTeal }),
    labelRow('Safety Notes',          lesson.slo.safetyNotes,        LW, { labelFill: C.lightOrange }),
  ];
  return makeTable(rows, [LW, W - LW]);
}

function sectionB(lesson) {
  return makeTable([
    fullHeader('B. LESSON OVERVIEW', C.teal, 'FFFFFF', SZ_H, 1),
    new TableRow({ children: [cell(lesson.overview, { fill: C.white, w: W, size: SZ })] }),
  ], [W]);
}

/**
 * sectionC — Lesson Implementation Framework
 * @param {object} lesson
 * @param {object} config
 *   subject   {string}  'Biology' | 'Mathematics' | 'Chemistry' | 'Physics'
 *   col3Label {string}  default 'Teacher Moves'
 *   col5Label {string}  default 'Formative Assessment Strategy'
 */
function sectionC(lesson, config = {}) {
  const subject   = config.subject   || 'Biology';
  const col3Label = config.col3Label || 'Teacher Moves';
  const col5Label = config.col5Label || 'Formative Assessment Strategy';

  const cw = [900, 2300, 2556, 3324, 2300, 2300];

  const aresTopic = lesson.aresKeywords || lesson.title || '';
  const aresRes   = getAllPhaseResources({
    substrand: lesson.substrand || '',
    topic:     aresTopic,
    subject,
  });

  const PHASE_KEY = {
    'Predict Phase':                          'predict',
    'Observe Phase':                          'observe',
    'Explain Phase':                          'explain',
    'Driving Question Board (DQB) Creation':  'dqb',
    'Model Building Phase':                   'model',
  };

  return makeTable([
    fullHeader('C. LESSON IMPLEMENTATION FRAMEWORK', C.teal, 'FFFFFF', SZ_H, 6),
    new TableRow({ children: [
      cell('Phase',         { fill: C.darkBlue, bold: true, color: 'FFFFFF', w: cw[0], size: SZ }),
      cell('Learner Experience', { fill: C.medBlue, bold: true, color: 'FFFFFF', w: cw[1], size: SZ }),
      cell('Resource',      { fill: C.teal,    bold: true, color: 'FFFFFF', w: cw[2], size: SZ }),
      cell(col3Label,       { fill: C.medBlue, bold: true, color: 'FFFFFF', w: cw[3], size: SZ }),
      cell('Sensemaking Strategy', { fill: C.teal, bold: true, color: 'FFFFFF', w: cw[4], size: SZ }),
      cell(col5Label,       { fill: C.medBlue, bold: true, color: 'FFFFFF', w: cw[5], size: SZ }),
    ]}),
    ...lesson.framework.map(ph => new TableRow({ children: [
      cell(ph.phase,
           { fill: PHASE_COLOUR[ph.phase] || C.grey, bold: true, w: cw[0], size: SZ }),
      cell(ph.learnerExperience,    { fill: C.white, w: cw[1], size: SZ }),
      cell(buildResourceParagraphs(aresRes[PHASE_KEY[ph.phase] || 'observe'], ph.phase),
           { fill: C.grey, w: cw[2] }),
      cell(ph.teacherMoves,         { fill: C.white, w: cw[3], size: SZ }),
      cell(ph.sensemakingStrategy,  { fill: C.grey,  w: cw[4], size: SZ }),
      cell(ph.formativeAssessment,  { fill: C.white, w: cw[5], size: SZ }),
    ]})),
  ], cw);
}

function sectionD(lesson) {
  return makeTable([
    fullHeader('D. TEACHER REFLECTION', C.orange, 'FFFFFF', SZ_H, 1),
    new TableRow({ children: [
      cell(lesson.teacherReflection, { fill: C.lightOrange, w: W, size: SZ }),
    ]}),
  ], [W]);
}

function sectionE(lesson) {
  const LW = 3000;
  return makeTable([
    fullHeader('E. SUMMARY TABLE PROMPT  (pre-filled example for this lesson)', C.purple, 'FFFFFF', SZ_H, 2),
    new TableRow({ children: [
      cell('What did I observe?',                   { fill: C.lightPurple, bold: true, w: LW, size: SZ }),
      cell(lesson.summaryTablePrompt.observed,      { fill: C.white, w: W - LW, size: SZ }),
    ]}),
    new TableRow({ children: [
      cell('What did I learn?',                     { fill: C.lightPurple, bold: true, w: LW, size: SZ }),
      cell(lesson.summaryTablePrompt.learned,       { fill: C.white, w: W - LW, size: SZ }),
    ]}),
    new TableRow({ children: [
      cell('How does this explain the phenomenon?', { fill: C.lightPurple, bold: true, w: LW, size: SZ }),
      cell(lesson.summaryTablePrompt.explained,     { fill: C.white, w: W - LW, size: SZ }),
    ]}),
  ], [LW, W - LW]);
}

/**
 * differentiationTable — end-of-document Differentiation & Inclusion table
 * @param {Array} rows  array of { need, support, extension } objects
 *                      defaults to 3 blank rows if omitted
 */
function differentiationTable(rows = []) {
  const LW = 3000;
  const HW = Math.floor((W - LW) / 2);
  const HWr = W - LW - HW;  // remainder column to avoid rounding gap

  const defaultRows = rows.length > 0 ? rows : [
    { need: 'English Language Learners',
      support: 'Provide bilingual glossaries; allow use of first language for initial model drawing.',
      extension: 'Write extended explanations of observations; lead group discussions in English.' },
    { need: 'Students with learning difficulties',
      support: 'Provide structured note frames; pair with a supportive partner during investigations.',
      extension: 'Mentor peers; create additional visual models to explain concepts.' },
    { need: 'Gifted and advanced learners',
      support: 'Access to additional reading materials; challenge questions during DQB.',
      extension: 'Lead model-building discussions; research and present extension topics to class.' },
  ];

  return makeTable([
    fullHeader('DIFFERENTIATION AND INCLUSION', C.darkBlue, 'FFFFFF', SZ_H, 3),
    new TableRow({ children: [
      cell('Learner Need',         { fill: C.medBlue, bold: true, color: 'FFFFFF', w: LW, size: SZ }),
      cell('Support Strategies',   { fill: C.teal,    bold: true, color: 'FFFFFF', w: HW, size: SZ }),
      cell('Extension Strategies', { fill: C.medBlue, bold: true, color: 'FFFFFF', w: HWr, size: SZ }),
    ]}),
    ...defaultRows.map(r => new TableRow({ children: [
      cell(r.need,      { fill: C.lightBlue,  w: LW,  size: SZ }),
      cell(r.support,   { fill: C.white,      w: HW,  size: SZ }),
      cell(r.extension, { fill: C.grey,       w: HWr, size: SZ }),
    ]})),
  ], [LW, HW, HWr]);
}

module.exports = {
  titleBlock, subStrandOverview,
  sectionA, sectionB, sectionC, sectionD, sectionE,
  differentiationTable,
};
