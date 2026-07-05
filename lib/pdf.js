// Worksheet -> PDF renderer.
//
// Design note / deviation from the original spec's suggested architecture:
// The spec recommends building each worksheet as HTML/CSS + inline SVG and
// converting to PDF via a headless-browser print step (Puppeteer/Playwright)
// so layout has one CSS source of truth. This sandbox has no way to install
// or download a Chromium binary (no root for apt, and the Chromium download
// hosts Puppeteer/Playwright rely on are network-blocked here), so headless-
// browser PDF export isn't available. Per the spec's own fallback clause
// ("an equivalent approach ... a PDF library that also handles embedded
// fonts and vector paths well is fine"), this renders directly onto a
// PDFKit document instead: PDFKit draws the tianzige grid/layout, and
// `svg-to-pdfkit` draws each character's real stroke-path SVG (same path
// data, same coordinate transform described in the spec) straight into the
// PDF as vector content.
//
// Worksheet body is intentionally text-free (no English labels, no pinyin,
// no headers) per revision request: each character/word page starts
// directly with the reference cell and its stroke order.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');

const strokeData = require('./strokeData');
const { computeStrokeMarkers } = require('./arrows');
const L = require('./layout');

const FONT_PATH = path.join(__dirname, '..', 'fonts', 'LXGWWenKaiGB-Regular.ttf');
const FONT_NAME = 'kaiti';

const GRID_LINE_COLOR = '#b9b9b9';
const GRID_MID_COLOR = '#d8d8d8';
const INK_COLOR = '#1a1a1a';
const LABEL_COLOR = '#8a8a8a';
const TRACE_LIGHT_OPACITY = 0.38; // uniform "light colour" used for progressive tracing cells
const REFERENCE_GLYPH_OPACITY = 0.42; // gray template under the black stroke-order arrows -- reads fine in grayscale print

// ---------- low-level cell drawing ----------

// `strokeLimit` (1-based) restricts the glyph to its first N strokes, so
// tracing cells can build up cumulatively: stroke 1 alone, then 1-2, etc.
function glyphSvg(entry, opacity, strokeLimit = entry.strokes.length) {
  const paths = entry.strokes
    .slice(0, strokeLimit)
    .map((d) => `<path d="${d}" fill="${INK_COLOR}" fill-opacity="${opacity}" stroke="none"/>`)
    .join('');
  return `<svg viewBox="0 0 1024 1024"><g transform="scale(1, -1) translate(0, -900)">${paths}</g></svg>`;
}

function drawTianzigeBox(doc, x, y, size) {
  doc.save();
  doc.lineWidth(1).strokeColor(GRID_LINE_COLOR).rect(x, y, size, size).stroke();
  doc
    .lineWidth(0.6)
    .dash(2, { space: 2 })
    .strokeColor(GRID_MID_COLOR)
    .moveTo(x + size / 2, y)
    .lineTo(x + size / 2, y + size)
    .stroke()
    .moveTo(x, y + size / 2)
    .lineTo(x + size, y + size / 2)
    .stroke();
  doc.undash();
  doc.restore();
}

// The 6% inset applied to every glyph drawn in a cell. Stroke-order markers
// must use this exact same inset (see toCellCoords) or the black arrows drift
// outward from the gray template they're meant to trace.
const GLYPH_CELL_PAD_RATIO = 0.06;

function drawGlyphInCell(doc, entry, x, y, size, opacity, strokeLimit) {
  const pad = size * GLYPH_CELL_PAD_RATIO;
  SVGtoPDF(doc, glyphSvg(entry, opacity, strokeLimit), x + pad, y + pad, {
    width: size - pad * 2,
    height: size - pad * 2,
    preserveAspectRatio: 'xMidYMid meet',
  });
}

// Maps a 1024-unit render-space point into the cell using the SAME padded
// inner box the glyph is drawn into, so markers register exactly on top of the
// gray template (the viewBox is square and drawn with 'meet', so the mapping
// is a uniform scale into [pad, size-pad] with no extra centering offset).
function toCellCoords(pt, x, y, size) {
  const pad = size * GLYPH_CELL_PAD_RATIO;
  const inner = size - pad * 2;
  return { x: x + pad + (pt.x / 1024) * inner, y: y + pad + (pt.y / 1024) * inner };
}

// Grayscale-friendly stroke order: the character sits underneath as a
// mid-gray template (see REFERENCE_GLYPH_OPACITY below), and each stroke's
// arrow traces its own actual median path in solid black, ending in an
// arrowhead -- rather than an abstract straight arrow -- so it reads as
// "this is how the stroke moves." Numbers are plain (no circle/fill), just
// offset up-left of each stroke's start, to avoid the clutter of bordered
// number badges competing with the arrows for attention.
function drawStrokeMarkers(doc, entry, x, y, size) {
  const markers = computeStrokeMarkers(entry);
  const numberFontSize = 8.2;
  const numberOffset = { x: -8, y: -8 };

  markers.forEach(({ index, points }) => {
    const cellPoints = points.map((p) => toCellCoords(p, x, y, size));
    if (cellPoints.length < 2) return;

    doc.save();
    doc.lineWidth(1.8).lineJoin('round').lineCap('round').strokeColor('#000000');
    doc.moveTo(cellPoints[0].x, cellPoints[0].y);
    for (let i = 1; i < cellPoints.length; i++) {
      doc.lineTo(cellPoints[i].x, cellPoints[i].y);
    }
    doc.stroke();

    // Arrowhead at the stroke's end point, oriented along its final segment.
    const p2 = cellPoints[cellPoints.length - 1];
    const p1 = cellPoints[cellPoints.length - 2];
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLen = 5.6;
    const headWidth = 3.2;
    const backX = p2.x - headLen * Math.cos(angle);
    const backY = p2.y - headLen * Math.sin(angle);
    const leftX = backX - headWidth * Math.sin(angle);
    const leftY = backY + headWidth * Math.cos(angle);
    const rightX = backX + headWidth * Math.sin(angle);
    const rightY = backY - headWidth * Math.cos(angle);
    doc
      .fillColor('#000000')
      .moveTo(p2.x, p2.y)
      .lineTo(leftX, leftY)
      .lineTo(rightX, rightY)
      .closePath()
      .fill();
    doc.restore();

    // Plain stroke number near the start point -- no circle, no fill.
    const start = cellPoints[0];
    doc.save();
    doc
      .font(FONT_NAME)
      .fontSize(numberFontSize)
      .fillColor('#000000')
      .text(String(index + 1), start.x + numberOffset.x, start.y + numberOffset.y, { lineBreak: false });
    doc.restore();
  });
}

function drawEmptyCell(doc, x, y, size) {
  drawTianzigeBox(doc, x, y, size);
}

// ---------- page / cursor management ----------

function makeCursor(doc) {
  return { doc, y: L.MARGIN, page: 1 };
}

function newPage(cursor) {
  cursor.doc.addPage({ size: 'A4', margin: 0 });
  cursor.page += 1;
  cursor.y = L.MARGIN;
}

function ensureRoomFor(cursor, height) {
  if (cursor.y + height > L.pageContentBottom()) {
    newPage(cursor);
  }
}

// Draws `rowCount` full rows of `cellsPerRow` cells starting at cursor.y,
// breaking to a new page whenever a row wouldn't fit.
// `cellFn(rowIndex, colIndex, globalCellIndex, x, y, size)` is called for
// each cell so callers can decide what goes inside it.
function drawRows(cursor, { rowCount, cellsPerRow, cellSize, cellFn }) {
  let globalIndex = 0;
  for (let r = 0; r < rowCount; r++) {
    if (cursor.y + cellSize > L.pageContentBottom()) {
      newPage(cursor);
    }
    for (let c = 0; c < cellsPerRow; c++) {
      const x = L.MARGIN + c * cellSize;
      const y = cursor.y;
      cellFn(r, c, globalIndex, x, y, cellSize);
      globalIndex += 1;
    }
    cursor.y += cellSize;
  }
}

// Progressive stroke-by-stroke tracing: cell 1 shows stroke 1 alone, cell 2
// shows strokes 1-2, cell 3 shows strokes 1-3, and so on until the character
// is complete -- all drawn in one uniform light tone (not a fade). Every row
// always has exactly `cellsPerRow` boxes: once the cumulative sequence
// reaches the full character, any remaining boxes in that row are padded by
// repeating the complete character, so rows never end ragged/short.
function drawProgressiveTracingRows(cursor, { entry, cellsPerRow, cellSize }) {
  const doc = cursor.doc;
  const total = entry.strokes.length;
  const rowCount = Math.max(1, Math.ceil(total / cellsPerRow));
  let idx = 0; // 0-based progress counter (can exceed `total` while padding)
  for (let r = 0; r < rowCount; r++) {
    if (cursor.y + cellSize > L.pageContentBottom()) {
      newPage(cursor);
    }
    for (let c = 0; c < cellsPerRow; c++) {
      const x = L.MARGIN + c * cellSize;
      const y = cursor.y;
      drawTianzigeBox(doc, x, y, cellSize);
      const strokesToShow = idx < total ? idx + 1 : total;
      drawGlyphInCell(doc, entry, x, y, cellSize, TRACE_LIGHT_OPACITY, strokesToShow);
      idx += 1;
    }
    cursor.y += cellSize;
  }
}

// Independent-writing section: a fixed number of rows (default
// WRITING_ROW_COUNT, per Audrey's "5-6 rows will suffice" so the whole
// character fits on one page) with the complete character printed, at full
// opacity, as a model in the very first box only -- every other box is
// blank for the child to write from memory.
function drawWritingSection(cursor, { entry, cellsPerRow, cellSize, rowCount }) {
  const doc = cursor.doc;
  let cellIndex = 0;
  for (let r = 0; r < rowCount; r++) {
    if (cursor.y + cellSize > L.pageContentBottom()) {
      newPage(cursor);
    }
    for (let c = 0; c < cellsPerRow; c++) {
      const x = L.MARGIN + c * cellSize;
      const y = cursor.y;
      drawTianzigeBox(doc, x, y, cellSize);
      if (cellIndex === 0) {
        drawGlyphInCell(doc, entry, x, y, cellSize, 1);
      }
      cellIndex += 1;
    }
    cursor.y += cellSize;
  }
}

function drawCharacterBlock(cursor, char, { rowsPerCharacter }) {
  const entry = strokeData.get(char);
  const cellsPerRow = L.cellsPerRow();
  const cellSize = L.CELL_SIZE;
  const refSize = L.REFERENCE_CELL_SIZE;

  // --- Section 1: reference cell (numbered + directional stroke order), ---
  // --- with pinyin printed beside it.                                    ---
  const refX = L.MARGIN;
  const refY = cursor.y;
  drawTianzigeBox(cursor.doc, refX, refY, refSize);
  drawGlyphInCell(cursor.doc, entry, refX, refY, refSize, REFERENCE_GLYPH_OPACITY);
  drawStrokeMarkers(cursor.doc, entry, refX, refY, refSize);

  const pinyin = strokeData.pinyinString(char);
  if (pinyin) {
    const pinyinFontSize = 26;
    cursor.doc
      .font(FONT_NAME)
      .fontSize(pinyinFontSize)
      .fillColor(INK_COLOR)
      .text(pinyin, refX + refSize + 20, refY + refSize / 2 - pinyinFontSize / 2, { lineBreak: false });
  }
  cursor.y += refSize + L.SECTION_GAP;

  // --- Section 2: progressive stroke-by-stroke tracing (light, cumulative), 7 boxes per row ---
  drawProgressiveTracingRows(cursor, { entry, cellsPerRow, cellSize });
  cursor.y += L.SECTION_GAP;

  // --- Section 3: independent writing, fixed row count, model in box 1 ---
  const rowsToUse = rowsPerCharacter != null ? rowsPerCharacter : L.WRITING_ROW_COUNT;
  drawWritingSection(cursor, { entry, cellsPerRow, cellSize, rowCount: Math.max(1, rowsToUse) });
}

function drawCreditsPage(cursor) {
  // Kept in English intentionally: this is a licence-attribution page, not
  // part of the child-facing worksheet content. See README for the
  // "remove all English" scope discussion.
  newPage(cursor);
  const doc = cursor.doc;
  const x = L.MARGIN;
  let y = L.MARGIN;
  doc.font(FONT_NAME).fontSize(18).fillColor(INK_COLOR).text('About & Credits', x, y);
  y += 32;
  const body = [
    'Stroke order, shape, and direction data: Make Me a Hanzi',
    'https://github.com/skishore/makemeahanzi',
    'Derived from the Arphic PL KaitiM GB / PL UKai fonts, released under the',
    'Arphic Public License. The license text is included with this app in',
    'data/licenses/makemeahanzi-APL and data/licenses/makemeahanzi-COPYING.txt.',
    '',
    'Simplified-character filtering: cjkvi-variants (cjkvi-simplified.txt)',
    'https://github.com/cjkvi/cjkvi-variants -- used only to decide which',
    'characters count as Simplified, since the stroke dataset above does not',
    'itself distinguish Simplified from Traditional forms.',
    '',
    'Reference / tracing font: LXGW WenKai GB',
    'https://github.com/lxgw/LxgwWenkaiGB -- a Kaiti (standard script)',
    'handwriting font, licensed under the SIL Open Font License 1.1',
    '(see fonts/LXGWWenKaiGB-OFL.txt).',
    '',
    'This worksheet is a print-only practice aid generated for personal or',
    'classroom use. No user data is stored by this application.',
  ];
  doc.font(FONT_NAME).fontSize(10.5).fillColor('#333333');
  for (const line of body) {
    doc.text(line, x, y, { width: L.usableWidth() });
    y = doc.y + 4;
  }
}

// Numeric-only footer (no English words) so page tracking survives without
// violating the "no English in the worksheet" requirement.
function stampFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc
      .font(FONT_NAME)
      .fontSize(8)
      .fillColor(LABEL_COLOR)
      .text(`${i + 1} / ${range.count}`, L.MARGIN, L.PAGE.height - L.MARGIN, {
        width: L.usableWidth(),
        align: 'center',
        lineBreak: false,
      });
  }
}

// ---------- public entry point ----------

// options: { characters: string[], rowsPerCharacter?: number }
// Single-character input only (per Audrey's decision): no word grouping,
// no combined-word section -- every character gets exactly one page.
function generateWorksheetPdf({ characters, rowsPerCharacter = null }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, autoFirstPage: false });
  doc.registerFont(FONT_NAME, FONT_PATH);
  doc.addPage({ size: 'A4', margin: 0 });

  const cursor = makeCursor(doc);

  characters.forEach((char, index) => {
    if (index > 0) newPage(cursor);
    drawCharacterBlock(cursor, char, { rowsPerCharacter });
  });

  drawCreditsPage(cursor);
  stampFooters(doc);
  doc.end();
  return doc;
}

module.exports = { generateWorksheetPdf };
