// Input parsing + validation against the Simplified stroke dataset.
//
// Per Audrey's decision on 2026-07-04: input is single characters only --
// no multi-character word grouping, no combined-word practice section.
// Every non-whitespace character in the input becomes its own worksheet
// page. Whitespace (spaces, newlines, full-width space 　) is purely a
// separator/convenience for typing and carries no grouping meaning.
const strokeData = require('./strokeData');

const DEFAULT_MAX_CHARACTERS = 10; // used when the caller doesn't specify their own cap
const HARD_CEILING = 50; // sanity ceiling regardless of what the user sets -- see README

// Flattens raw textarea input into an ordered, duplicate-preserving list of
// individual characters, stripping all whitespace.
function parseInput(rawText) {
  const stripped = rawText.replace(/[\s　]+/gu, '');
  return Array.from(stripped); // Array.from splits on code points, not UTF-16 units
}

// Validates every character against the Simplified dataset, and (if a max
// is given) checks the count against it. Returns:
//   { ok, unsupported, characters, overLimit, maxCharacters }
// `unsupported` is a de-duplicated, ordered list of the exact characters
// that failed, so the caller can name them explicitly rather than silently
// dropping them. `overLimit` is true when characters.length exceeds
// maxCharacters -- checked independently of `ok` so both problems can be
// reported at once.
function validateCharacters(characters, { maxCharacters = DEFAULT_MAX_CHARACTERS } = {}) {
  const cappedMax = Math.min(Math.max(1, maxCharacters || DEFAULT_MAX_CHARACTERS), HARD_CEILING);

  const unsupported = [];
  const seen = new Set();
  for (const ch of characters) {
    if (!strokeData.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      unsupported.push(ch);
    }
  }

  const overLimit = characters.length > cappedMax;

  return {
    ok: unsupported.length === 0 && !overLimit,
    unsupported,
    characters,
    overLimit,
    maxCharacters: cappedMax,
  };
}

module.exports = { parseInput, validateCharacters, DEFAULT_MAX_CHARACTERS, HARD_CEILING };
