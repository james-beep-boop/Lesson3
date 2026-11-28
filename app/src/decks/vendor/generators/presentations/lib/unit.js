'use strict';
// UNIT.drivingQuestion in the lesson data is a blob: the unit driving question in quotes, then a
// "KICD KEY INQUIRY QUESTIONS" list. Slides show only the driving question itself.
function drivingQuestion(unit) {
  const s = String(unit.drivingQuestion || '');
  const m = /DRIVING QUESTION:\s*["“]([^"”]+)["”]/i.exec(s);
  if (m) return m[1].trim();
  return s.split(/\n\s*\n/)[0].replace(/^DRIVING QUESTION:\s*/i, '').replace(/^["“]|["”]$/g, '').trim();
}
module.exports = { drivingQuestion };
