/**
 * docx_kit.js — Shared formatting primitives
 * ============================================
 * Pure docx-js helpers with no content knowledge.
 * All generators require this module.
 *
 * Exports: C, PHASE_COLOUR, FONT, SZ, SZ_H, SZ_T, W, SPACE
 *          para, mixedPara, bullet, cell, fullHeader, labelRow, makeTable
 */
'use strict';

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, VerticalAlign,
  BorderStyle, TableLayoutType, PageBreak,
} = require('docx');

// ── Layout constants ──────────────────────────────────────────────────────────
const W    = 13680;   // content width DXA (landscape Letter, 0.75" margins)
const FONT = 'Arial';
const SZ   = 18;      // 9pt body
const SZ_H = 22;      // 11pt section headers
const SZ_T = 28;      // 14pt titles

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  darkBlue:    '1F3864',
  medBlue:     '2E75B6',
  lightBlue:   'D5E8F0',
  teal:        '1F6B75',
  lightTeal:   'D9EEF1',
  green:       '375623',
  lightGreen:  'E2EFDA',
  orange:      'C55A11',
  lightOrange: 'FCE4D6',
  purple:      '7030A0',
  lightPurple: 'EAD1F5',
  grey:        'F2F2F2',
  white:       'FFFFFF',
};

const PHASE_COLOUR = {
  'Predict Phase':                          C.lightPurple,
  'Observe Phase':                          C.lightTeal,
  'Explain Phase':                          C.lightGreen,
  'Driving Question Board (DQB) Creation':  C.lightOrange,
  'Model Building Phase':                   C.lightBlue,
};

// ── Spacer / page break ───────────────────────────────────────────────────────
const SPACE      = () => new Paragraph({ spacing: { after: 120 }, children: [new TextRun('')] });
const PAGE_BREAK = () => new Paragraph({ children: [new PageBreak()] });

// ── Paragraph helpers ─────────────────────────────────────────────────────────

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: opts.after ?? 60, before: opts.before ?? 0 },
    children: [new TextRun({
      text,
      font: FONT,
      size:    opts.size   || SZ,
      bold:    opts.bold   || false,
      color:   opts.color  || '000000',
      italics: opts.italic || false,
    })],
  });
}

function mixedPara(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: opts.after ?? 60, before: opts.before ?? 0 },
    children: runs.map(r => new TextRun({
      text:    r.text,
      font:    FONT,
      size:    r.size  || opts.size || SZ,
      bold:    r.bold    || false,
      italics: r.italic  || false,
      color:   r.color   || '000000',
    })),
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 30, before: 0 },
    indent: { left: 360, hanging: 180 },
    children: [new TextRun({
      text: '\u2013  ' + text,
      font: FONT,
      size:    opts.size  || SZ,
      bold:    opts.bold  || false,
      color:   opts.color || '000000',
      italics: opts.italic || false,
    })],
  });
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function cell(content, opts = {}) {
  const {
    fill   = C.white,
    w      = null,
    span   = 1,
    vAlign = VerticalAlign.TOP,
    bold   = false,
    color  = '000000',
    size   = SZ,
    align  = AlignmentType.LEFT,
    italic = false,
  } = opts;

  let children;
  if (typeof content === 'string') {
    if (content === '') {
      children = [para('', { size })];
    } else {
      children = content.split('\n').map(line => {
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return bullet(line.slice(2), { size, bold, color });
        }
        return para(line, { size, bold, color, align, italic, after: 40 });
      });
    }
  } else if (Array.isArray(content)) {
    children = content;
  } else {
    children = [content];
  }

  const cellDef = {
    verticalAlign: vAlign,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children,
  };
  if (w    !== null) cellDef.width       = { size: w, type: WidthType.DXA };
  if (span  >    1) cellDef.columnSpan   = span;
  return new TableCell(cellDef);
}

function fullHeader(text, fill, textColor = 'FFFFFF', size = SZ_H, numCols = 2) {
  return new TableRow({
    children: [cell(text, {
      fill, color: textColor, bold: true, size,
      align: AlignmentType.CENTER, span: numCols, w: W,
    })],
  });
}

function labelRow(label, content, labelW = 3000, opts = {}) {
  return new TableRow({
    children: [
      cell(label,   { fill: opts.labelFill   || C.lightBlue, bold: true, w: labelW,     size: SZ }),
      cell(content, { fill: opts.contentFill || C.white,     w: W - labelW, size: SZ }),
    ],
  });
}

function makeTable(rows, columnWidths = [W]) {
  return new Table({
    width:        { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    layout:       TableLayoutType.FIXED,
    columnWidths,
    borders: {
      top:     { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
      bottom:  { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
      left:    { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
      right:   { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
      insideH: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
      insideV: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
    },
    rows,
  });
}

module.exports = {
  // Constants
  W, FONT, SZ, SZ_H, SZ_T, C, PHASE_COLOUR, SPACE, PAGE_BREAK,
  // Helpers
  para, mixedPara, bullet, cell, fullHeader, labelRow, makeTable,
};
