/**
 * build_docs.js — Universal document builders
 * =============================================
 * Exports three async functions that produce the three deliverable docx files
 * for any CBE sub-strand, given structured data objects.
 *
 * Usage:
 *   const { buildSoW, buildFinalExplanation, buildSummaryTable } = require('./lib/build_docs');
 *   const doc = await buildSoW(META, UNIT, LESSONS);
 *   const buffer = await Packer.toBuffer(doc);
 *
 * META object:
 *   {
 *     subject:     'Biology',
 *     outputDir:   'Grade 10 Bio/Bio 1.3',
 *     filePrefix:  'Biology_CellStructure',
 *     titleDoc:    'BIOLOGY GRADE 10: CELL STRUCTURE AND SPECIALISATION',
 *     subtitleDoc: 'CBE Phenomenon-Driven Lesson Sequence — Sub-Strand 1.3 (8 Lessons)',
 *     // Optional Section C column label overrides:
 *     col3Label:   'Teacher Moves',              // default
 *     col5Label:   'Formative Assessment Strategy', // default
 *   }
 */
'use strict';

const path     = require('path');
const fs       = require('fs');
const { Document, Packer, PageOrientation } = require('docx');
const { W, C, SZ, SZ_H, SPACE, para, cell, fullHeader, labelRow, makeTable } = require('./docx_kit');
const { TableRow } = require('docx');
const {
  titleBlock, subStrandOverview,
  sectionA, sectionB, sectionC, sectionD, sectionE,
  differentiationTable,
} = require('./sections');

// ── Page setup (landscape US Letter, 0.75" margins) ───────────────────────────
function pageProps() {
  return {
    page: {
      size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
      margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
    },
  };
}

// ── SoW (Lesson Sequence) ─────────────────────────────────────────────────────

async function buildSoW(META, UNIT, LESSONS) {
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
      sectionC(lesson, sectionCConfig),
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

// ── Final Explanation ─────────────────────────────────────────────────────────

async function buildFinalExplanation(META, FE) {
  const FLW = 3000;
  const FCW = W - FLW;
  const RW3 = Math.floor(FCW / 3);
  const RW3r = FCW - RW3 * 2;

  const body = [
    ...titleBlock(
      `FINAL EXPLANATION: ${META.subject.toUpperCase()} GRADE 10`,
      `Student Assessment Document`,
    ),
    SPACE(),
  ];

  // Student info header
  body.push(makeTable([
    fullHeader(`FINAL EXPLANATION: ${(FE.subjectLabel || META.subject).toUpperCase()}`, C.darkBlue, 'FFFFFF', SZ_H, 2),
    fullHeader('Student Assessment Document', C.medBlue, 'FFFFFF', SZ, 2),
    labelRow('Student Name', '_____________________________________________', FLW),
    labelRow('Class',        '_____________________________________________', FLW),
    labelRow('Date',         '_____________________________________________', FLW),
  ], [FLW, FCW]));

  body.push(SPACE());

  // Instructions
  if (FE.instructions) {
    body.push(makeTable([
      fullHeader('INSTRUCTIONS FOR STUDENTS', C.teal, 'FFFFFF', SZ_H, 2),
      new TableRow({ children: [
        cell(FE.instructions, { fill: C.lightBlue, w: W, size: SZ }),
      ]}),
    ], [W]));
    body.push(SPACE());
  }

  // Sections
  for (const sec of (FE.sections || [])) {
    body.push(makeTable([
      fullHeader(sec.title, C.darkBlue, 'FFFFFF', SZ_H, 2),
      new TableRow({ children: [
        cell(sec.prompt  || '', { fill: C.lightTeal,  bold: true, w: FLW, size: SZ }),
        cell(sec.exemplar || '', { fill: C.white,      w: FCW, size: SZ }),
      ]}),
    ], [FLW, FCW]));
    body.push(SPACE());
  }

  // Rubric
  if (FE.rubric && FE.rubric.length > 0) {
    const rubricRows = [
      fullHeader('RUBRIC', C.darkBlue, 'FFFFFF', SZ_H, 4),
      new TableRow({ children: [
        cell('Criterion',      { fill: C.medBlue, bold: true, color: 'FFFFFF', w: FLW,  size: SZ }),
        cell('Excellent (4)',  { fill: C.teal,    bold: true, color: 'FFFFFF', w: RW3,  size: SZ }),
        cell('Proficient (3)', { fill: C.medBlue, bold: true, color: 'FFFFFF', w: RW3,  size: SZ }),
        cell('Developing (1–2)', { fill: C.teal,  bold: true, color: 'FFFFFF', w: RW3r, size: SZ }),
      ]}),
      ...FE.rubric.map(r => new TableRow({ children: [
        cell(r.criterion,  { fill: C.lightBlue,  w: FLW,  size: SZ }),
        cell(r.excellent,  { fill: C.white,      w: RW3,  size: SZ }),
        cell(r.proficient, { fill: C.grey,       w: RW3,  size: SZ }),
        cell(r.developing, { fill: C.white,      w: RW3r, size: SZ }),
      ]})),
    ];
    body.push(makeTable(rubricRows, [FLW, RW3, RW3, RW3r]));
  }

  return new Document({
    sections: [{ properties: pageProps(), children: body }],
  });
}

// ── Summary Table ─────────────────────────────────────────────────────────────

async function buildSummaryTable(META, ST) {
  const SLW  = 2400;
  const SC3  = Math.floor((W - SLW) / 3);
  const SC3r = W - SLW - SC3 * 2;

  const body = [
    ...titleBlock(
      `SUMMARY TABLE: ${META.subject.toUpperCase()} GRADE 10`,
      `${ST.subStrand || ''} — Teacher Reference (Pre-filled)`,
    ),
    SPACE(),
  ];

  // Header info
  body.push(makeTable([
    fullHeader(`SUMMARY TABLE: ${META.subject.toUpperCase()} GRADE 10`, C.darkBlue, 'FFFFFF', SZ_H, 2),
    labelRow('Sub-Strand',       ST.subStrand    || '', SLW),
    labelRow('Driving Question', ST.drivingQuestion || '', SLW),
  ], [SLW, W - SLW]));

  body.push(SPACE());

  // Instructions
  body.push(makeTable([
    fullHeader('INSTRUCTIONS', C.teal, 'FFFFFF', SZ_H, 2),
    new TableRow({ children: [
      cell(
        'FOR TEACHERS: This is the teacher reference version — each row is pre-filled with expected student responses. ' +
        'Use it to assess student Summary Tables, identify gaps, and prepare discussion questions. ' +
        'The student version has blank cells for students to complete after each lesson.',
        { fill: C.lightTeal, w: W, size: SZ },
      ),
    ]}),
  ], [W]));

  body.push(SPACE());

  // Lesson rows
  const tableRows = [
    new TableRow({ children: [
      cell('Lesson # and Title',                        { fill: C.darkBlue, bold: true, color: 'FFFFFF', w: SLW,  size: SZ }),
      cell('What did I observe?',                       { fill: C.medBlue,  bold: true, color: 'FFFFFF', w: SC3,  size: SZ }),
      cell('What did I learn?',                         { fill: C.teal,     bold: true, color: 'FFFFFF', w: SC3,  size: SZ }),
      cell('How does this explain the phenomenon?',     { fill: C.medBlue,  bold: true, color: 'FFFFFF', w: SC3r, size: SZ }),
    ]}),
    ...(ST.lessons || []).map(l => new TableRow({ children: [
      cell(`Lesson ${l.number}\n${l.title}`, { fill: C.lightBlue,   bold: true, w: SLW,  size: SZ }),
      cell(l.observed  || '',                { fill: C.white,                   w: SC3,  size: SZ }),
      cell(l.learned   || '',                { fill: C.grey,                    w: SC3,  size: SZ }),
      cell(l.explained || '',                { fill: C.white,                   w: SC3r, size: SZ }),
    ]})),
  ];

  body.push(makeTable(tableRows, [SLW, SC3, SC3, SC3r]));

  return new Document({
    sections: [{ properties: pageProps(), children: body }],
  });
}

// ── Runner — generates and saves all three files ──────────────────────────────

async function run(dataModule) {
  const { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE } = dataModule;

  const outBase = path.join(__dirname, '..', '..', 'data', 'outputs', 'docx', META.outputDir);
  if (!fs.existsSync(outBase)) fs.mkdirSync(outBase, { recursive: true });

  const files = [];

  // 1. SoW
  const sowDoc = await buildSoW(META, UNIT, LESSONS);
  const sowPath = path.join(outBase, `${META.filePrefix}_CBE_LessonSequence.docx`);
  await Packer.toBuffer(sowDoc).then(buf => fs.writeFileSync(sowPath, buf));
  files.push(sowPath);
  console.log(`    Saved: ${sowPath}  (${Math.round(fs.statSync(sowPath).size / 1024)} KB)`);

  // 2. Final Explanation
  if (FINAL_EXPLANATION) {
    const feDoc  = await buildFinalExplanation(META, FINAL_EXPLANATION);
    const fePath = path.join(outBase, `${META.filePrefix}_FinalExplanation.docx`);
    await Packer.toBuffer(feDoc).then(buf => fs.writeFileSync(fePath, buf));
    files.push(fePath);
    console.log(`    Saved: ${fePath}  (${Math.round(fs.statSync(fePath).size / 1024)} KB)`);
  }

  // 3. Summary Table
  if (SUMMARY_TABLE) {
    const stDoc  = await buildSummaryTable(META, SUMMARY_TABLE);
    const stPath = path.join(outBase, `${META.filePrefix}_SummaryTable.docx`);
    await Packer.toBuffer(stDoc).then(buf => fs.writeFileSync(stPath, buf));
    files.push(stPath);
    console.log(`    Saved: ${stPath}  (${Math.round(fs.statSync(stPath).size / 1024)} KB)`);
  }

  return files;
}

module.exports = { buildSoW, buildFinalExplanation, buildSummaryTable, run };
