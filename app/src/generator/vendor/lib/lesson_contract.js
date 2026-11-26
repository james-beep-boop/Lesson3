'use strict';
/**
 * lesson_contract.js — the data-module contract (per lesson and whole module), in ONE place.
 *
 * Used by scripts/validate_corpus.js (after the fact, every data file),
 * scripts/patch_lesson.js (before writing one lesson) and build_docs.js run()
 * (before rendering anything: a violation throws). The first two used to carry
 * their own copy of these lists; a contract change applied to only one copy
 * would have made the two gates silently disagree (2026-10-26).
 *
 * Every rule here exists because a missing/misnamed field used to render as a
 * SILENTLY EMPTY docx cell or a wrong ARES bucket. Since 2026-10-26 run()
 * refuses to render a module that breaks it (the "fail loudly" gate).
 *
 * Not covered here (other copies of the same facts, different languages or
 * jobs): the phase-label enum in src/generate_substrand.py's tool schema, the
 * prompt schema in scripts/repair_stubs.py, phase shading in sections.js /
 * docx_kit.js, and the partner's ares-contract.schema.json.
 */

const SLO_KEYS  = ['purpose', 'knowledge', 'skills', 'attitudes',
                   'keyInquiry', 'purposeInStoryline', 'safetyNotes'];
const TOP_KEYS  = ['number', 'title', 'duration', 'substrand', 'slo', 'overview',
                   'framework', 'teacherReflection', 'summaryTablePrompt'];
const TEXT_KEYS = ['title', 'duration', 'substrand', 'overview', 'teacherReflection'];
const STP_KEYS  = ['observed', 'learned', 'explained'];
const PHASES    = ['Predict Phase', 'Observe Phase', 'Explain Phase',
                   'Driving Question Board (DQB) Creation', 'Model Building Phase'];
const CELL_KEYS = ['learnerExperience', 'teacherMoves',
                   'sensemakingStrategy', 'formativeAssessment'];
const STUB_OVERVIEW_CHARS = 50;

const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;

/** Contract errors for one lesson object, as message strings ([] = valid). */
function checkLesson(l) {
  const errs = [];
  if (typeof l !== 'object' || l === null) return ['lesson is not an object'];

  for (const k of TOP_KEYS) if (!(k in l)) errs.push(`missing top-level "${k}"`);
  for (const k of TEXT_KEYS) {
    if (k in l && !nonEmpty(l[k])) errs.push(`"${k}" is empty`);
  }
  // Stub check is shared so patch_lesson.js --force can't write a stub either.
  if (nonEmpty(l.overview) && l.overview.trim().length < STUB_OVERVIEW_CHARS) {
    errs.push(`stub lesson — overview only ${l.overview.trim().length} chars`);
  }

  // slo: exact key set. Catches the safety<N>otes corruption and any other
  // placeholder damage to key names.
  const slo = l.slo;
  if (typeof slo !== 'object' || slo === null) {
    errs.push('"slo" is not an object');
  } else {
    for (const k of SLO_KEYS) {
      if (!(k in slo)) errs.push(`slo missing "${k}"`);
      else if (!nonEmpty(slo[k])) errs.push(`slo."${k}" is empty`);
    }
    for (const k of Object.keys(slo)) {
      if (!SLO_KEYS.includes(k)) {
        errs.push(`slo has unexpected key "${k}"`
          + (/^safety\d+otes$/.test(k)
              ? ' — placeholder-replacement corruption of "safetyNotes"'
                + ' (see scripts/repair_stubs.py LESSON_SCHEMA)' : ''));
      }
    }
  }

  // summaryTablePrompt: all three cells required and non-empty.
  const stp = l.summaryTablePrompt;
  if (typeof stp !== 'object' || stp === null) {
    errs.push('"summaryTablePrompt" is not an object');
  } else {
    for (const k of STP_KEYS) {
      if (!(k in stp)) errs.push(`summaryTablePrompt missing "${k}" — Summary Table cell renders blank`);
      else if (!nonEmpty(stp[k])) errs.push(`summaryTablePrompt."${k}" is empty`);
    }
    for (const k of Object.keys(stp)) {
      if (!STP_KEYS.includes(k)) errs.push(`summaryTablePrompt has unexpected key "${k}"`);
    }
  }

  // framework: exactly the 5 canonical phases, in order. sections.js keys ARES
  // resource-category matching and row shading off these exact strings.
  const fw = l.framework;
  if (!Array.isArray(fw)) {
    errs.push('"framework" is not an array');
  } else if (fw.length !== PHASES.length) {
    errs.push(`framework has ${fw.length} entries, expected ${PHASES.length}`);
  } else {
    fw.forEach((p, j) => {
      if (typeof p !== 'object' || p === null) { errs.push(`framework[${j}] is not an object`); return; }
      if (p.phase !== PHASES[j]) {
        errs.push(`framework[${j}].phase is ${JSON.stringify(p.phase)}, expected `
          + `${JSON.stringify(PHASES[j])} (sections.js picks ARES resources and row shading by this label)`);
      }
      for (const k of CELL_KEYS) {
        if (!nonEmpty(p[k])) errs.push(`framework[${j}]."${k}" is missing or empty`);
      }
    });
  }
  return errs;
}

/**
 * Contract errors for a whole data module ([] = valid): every field the
 * renderers in build_docs.js / sections.js print into a cell, so nothing
 * renders blank. Parts the partner contract lets be absent, and that the
 * renderer then leaves out whole, stay optional: FINAL_EXPLANATION /
 * SUMMARY_TABLE may be null ("null until authored"), FE.instructions and
 * FE.rubric may be absent. If present, they must be complete.
 * opts.requireDocs: FE and ST must exist (validate_corpus.js: a finished corpus).
 * Lesson errors are prefixed "L<n>: " (or "L@<index>: " if the lesson has no number).
 */
function checkModule(mod, opts = {}) {
  const errs = [];
  const { META, UNIT, LESSONS, FINAL_EXPLANATION: FE, SUMMARY_TABLE: ST } = mod || {};
  const need = (obj, keys, where) => {
    for (const k of keys) if (!nonEmpty(obj[k])) errs.push(`${where}.${k} is missing or empty`);
  };

  if (typeof META !== 'object' || META === null) errs.push('META is missing');
  else {
    need(META, ['subject', 'titleDoc', 'subtitleDoc', 'filePrefix', 'outputDir'], 'META');
    if (META.grade == null) errs.push('META.grade is missing');
  }

  if (typeof UNIT !== 'object' || UNIT === null) errs.push('UNIT is missing');
  else {
    need(UNIT, ['gradeLevel', 'subject', 'strand', 'substrand'], 'UNIT');
    if (!nonEmpty(UNIT.totalDuration) && !nonEmpty(UNIT.duration)) {
      errs.push('UNIT.totalDuration (or UNIT.duration) is missing or empty');
    }
    // UNIT.subject feeds the "Subject:" row in the Lesson Sequence docx.
    if (META && nonEmpty(META.subject) && nonEmpty(UNIT.subject) && META.subject !== UNIT.subject) {
      errs.push(`META.subject (${META.subject}) !== UNIT.subject (${UNIT.subject})`);
    }
  }

  if (!Array.isArray(LESSONS) || LESSONS.length === 0) {
    errs.push('LESSONS is missing or empty');
  } else {
    LESSONS.forEach((l, i) => {
      const at = `L${l && l.number !== undefined ? l.number : `@${i}`}`;
      for (const e of checkLesson(l)) errs.push(`${at}: ${e}`);
    });
    const nums = LESSONS.map(l => l && l.number);
    const expected = nums.map((_, i) => i + 1);
    if (JSON.stringify(nums) !== JSON.stringify(expected)) {
      errs.push(`lesson numbers are [${nums}], expected [${expected}]`);
    }
  }

  if (typeof FE !== 'object' || FE === null) {
    if (opts.requireDocs) errs.push('FINAL_EXPLANATION is missing');
  } else {
    if (!Array.isArray(FE.sections) || FE.sections.length === 0) {
      errs.push('FINAL_EXPLANATION.sections is missing or empty');
    } else {
      FE.sections.forEach((s, i) => need(s || {}, ['title', 'prompt', 'exemplar'], `FINAL_EXPLANATION.sections[${i}]`));
    }
    if (FE.rubric != null && !Array.isArray(FE.rubric)) {
      errs.push('FINAL_EXPLANATION.rubric is not an array');
    } else if (FE.rubric) {
      FE.rubric.forEach((r, i) => need(r || {}, (process.env.CBE_LEGACY_RUBRIC === '1'   // revise_build.py baseline render only (R0 data, three levels); see CONTRACT_CHANGELOG.md R1
                                         ? ['criterion', 'excellent', 'proficient', 'developing']
                                         : ['criterion', 'excellent', 'proficient', 'developing', 'belowExpectations']),
                                       `FINAL_EXPLANATION.rubric[${i}]`));
    }
  }

  if (typeof ST !== 'object' || ST === null) {
    if (opts.requireDocs) errs.push('SUMMARY_TABLE is missing');
  } else {
    need(ST, ['subStrand', 'drivingQuestion'], 'SUMMARY_TABLE');
    if (!Array.isArray(ST.lessons) || ST.lessons.length === 0) {
      errs.push('SUMMARY_TABLE.lessons is missing or empty');
    } else {
      if (Array.isArray(LESSONS) && ST.lessons.length !== LESSONS.length) {
        errs.push(`SUMMARY_TABLE has ${ST.lessons.length} rows, LESSONS has ${LESSONS.length}`);
      }
      ST.lessons.forEach((l, i) => {
        need(l || {}, ['title', ...STP_KEYS], `SUMMARY_TABLE.lessons[${i}]`);
        if (!l || l.number == null) errs.push(`SUMMARY_TABLE.lessons[${i}].number is missing`);
      });
    }
  }
  return errs;
}

module.exports = { SLO_KEYS, TOP_KEYS, TEXT_KEYS, STP_KEYS, PHASES, CELL_KEYS,
                   STUB_OVERVIEW_CHARS,
                   nonEmpty, checkLesson, checkModule };
