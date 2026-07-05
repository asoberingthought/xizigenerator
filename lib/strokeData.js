// Loads and queries the preprocessed simplified-character stroke dataset.
// Source data: Make Me a Hanzi (https://github.com/skishore/makemeahanzi),
// filtered to Simplified-only via cjkvi-variants. See scripts/build-data.js
// and data/licenses/ for provenance + license text (Arphic Public License).
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'hanzi-simplified.json');

let cache = null;

function load() {
  if (!cache) {
    if (!fs.existsSync(DATA_PATH)) {
      throw new Error(
        `Missing ${DATA_PATH}. Run "node scripts/build-data.js <makemeahanzi-dir> <cjkvi-simplified.txt>" first.`
      );
    }
    cache = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
  return cache;
}

function has(char) {
  return Object.prototype.hasOwnProperty.call(load(), char);
}

function get(char) {
  return load()[char] || null;
}

// Joins all known pronunciations with a middle dot, e.g. "xué" or "hái·huán".
// Most single-reading characters just return the one reading.
function pinyinString(char) {
  const entry = get(char);
  if (!entry || !entry.pinyin || !entry.pinyin.length) return '';
  return entry.pinyin.join('·');
}

module.exports = { load, has, get, pinyinString };
