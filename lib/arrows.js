// Derives stroke-order number + direction-arrow placement from Make Me a
// Hanzi's `medians` field (the centerline/skeleton of each stroke), per
// the coordinate-system note in the source README: raw points live on a
// 1024x1024 grid with upper-left (0,900) and lower-right (1024,-124), i.e.
// y grows *upward*. We convert every point to standard top-down render
// space (y grows downward, origin top-left) with renderY = 900 - rawY, so
// numbers/arrows can be drawn directly with PDFKit (which is also
// top-down) without living inside the strokes' own scale(1,-1) SVG group.
function toRenderSpace([x, y]) {
  return { x, y: 900 - y };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function normalize(v) {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len };
}

// Returns one marker descriptor per stroke:
//   { index, points }
// where `points` is the stroke's full median polyline transformed into
// 1024-unit render space. The renderer (lib/pdf.js) draws the direction arrow
// *along this actual polyline* -- number offset from points[0] (the start),
// arrowhead at the final point oriented along the last segment -- per the v2
// spec's "arrow traces the stroke's own path" requirement. (An earlier draft
// drew a short straight arrow at the stroke midpoint; that abstract-arrow
// approach was dropped, so no midpoint/half-length geometry is computed here.)
function computeStrokeMarkers(entry) {
  return entry.medians.map((rawMedian, index) => ({
    index,
    points: rawMedian.map(toRenderSpace),
  }));
}

module.exports = { toRenderSpace, computeStrokeMarkers, normalize, subtract, length };
