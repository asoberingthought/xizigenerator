// Pure page-geometry helpers (points; 1mm = 2.834645pt). Kept dependency-
// free and separate from PDFKit so the math is independently testable.
const MM = 2.834645;

const PAGE = {
  width: 595.28, // A4 pt
  height: 841.89,
};

const MARGIN = 36; // ~12.7mm
const CELL_SIZE = 70; // ~24.7mm -- comfortable for a child's hand
const REFERENCE_CELL_SIZE = 140; // smaller hero cell (still bigger than grid cells so stroke-order numbers/arrows don't collide)
const WRITING_ROW_COUNT = 5; // fixed rows for independent writing, so a character's whole worksheet fits one page
const ROW_GAP = 0; // cells within/between rows touch, like real grid paper
const SECTION_GAP = 16; // vertical breathing room between Reference/Tracing/Write sections
const FOOTER_HEIGHT = 24;

function usableWidth() {
  return PAGE.width - 2 * MARGIN;
}

function cellsPerRow(cellSize = CELL_SIZE) {
  return Math.max(1, Math.floor(usableWidth() / cellSize));
}

function pageContentBottom() {
  return PAGE.height - MARGIN - FOOTER_HEIGHT;
}

module.exports = {
  MM,
  PAGE,
  MARGIN,
  CELL_SIZE,
  REFERENCE_CELL_SIZE,
  WRITING_ROW_COUNT,
  ROW_GAP,
  SECTION_GAP,
  FOOTER_HEIGHT,
  usableWidth,
  cellsPerRow,
  pageContentBottom,
};
