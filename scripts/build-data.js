#!/usr/bin/env node
/**
 * Preprocessing step: build data/hanzi-simplified.json.
 *
 * Sources (fetched at build time, not invented):
 *  - graphics.txt / dictionary.txt from Make Me a Hanzi
 *    https://github.com/skishore/makemeahanzi
 *    Stroke path + median (direction) data is released under the Arphic
 *    Public License (derived from Arphic's KaitiM GB / UKai fonts). See
 *    data/licenses/makemeahanzi-APL and data/licenses/makemeahanzi-COPYING.txt,
 *    which MUST ship alongside this derived JSON. Attribution lives in
 *    README.md "Credits" section.
 *
 *  - cjkvi-simplified.txt from https://github.com/cjkvi/cjkvi-variants
 *    Used ONLY to decide which characters count as "Simplified" for
 *    validation purposes, because graphics.txt itself does not carry a
 *    simplified/traditional flag (it's a shared shape+stroke dataset used
 *    by both scripts wherever a glyph is shared). This is a deviation from
 *    the two data sources named in the original spec (Make Me a Hanzi +
 *    LXGW WenKai GB) -- flagged in README.md/chat because this source's
 *    exact license terms are not clearly stated in its repo (only a bare
 *    "Copyright (c) 2014 CJKVI Database" header, no LICENSE file found).
 *    A raw copy is kept at data/licenses/cjkvi-simplified-source.txt.
 *
 * Run once: `node scripts/build-data.js <path-to-mmh-repo> <path-to-cjkvi-file>`
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function readJsonLines(filePath) {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed));
  }
  return out;
}

function buildTraditionalOnlySet(cjkviPath) {
  const excluded = new Set();
  const raw = fs.readFileSync(cjkviPath, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',');
    if (parts.length !== 3) continue;
    const [left, tag, right] = parts;
    if (
      (tag === 'cjkvi/simplified' || tag === 'cjkvi/variant-simplified' || tag === 'cjkvi/pseudo-simplified') &&
      left !== right
    ) {
      excluded.add(left);
    }
  }
  return excluded;
}

async function main() {
  const [, , mmhDir, cjkviFile] = process.argv;
  if (!mmhDir || !cjkviFile) {
    console.error('Usage: node build-data.js <makemeahanzi-repo-dir> <cjkvi-simplified.txt>');
    process.exit(1);
  }

  const graphics = await readJsonLines(path.join(mmhDir, 'graphics.txt'));
  const dictionary = await readJsonLines(path.join(mmhDir, 'dictionary.txt'));
  const traditionalOnly = buildTraditionalOnlySet(cjkviFile);

  const pinyinByChar = new Map();
  for (const entry of dictionary) {
    pinyinByChar.set(entry.character, entry.pinyin || []);
  }

  const out = {};
  let kept = 0;
  let skippedTraditional = 0;
  let skippedNoStrokes = 0;

  for (const g of graphics) {
    const ch = g.character;
    if (traditionalOnly.has(ch)) {
      skippedTraditional += 1;
      continue;
    }
    if (!g.strokes || !g.strokes.length || !g.medians || !g.medians.length) {
      skippedNoStrokes += 1;
      continue;
    }
    out[ch] = {
      character: ch,
      strokes: g.strokes,
      medians: g.medians,
      pinyin: pinyinByChar.get(ch) || [],
    };
    kept += 1;
  }

  const outPath = path.join(__dirname, '..', 'data', 'hanzi-simplified.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`Kept ${kept} simplified characters.`);
  console.log(`Skipped ${skippedTraditional} traditional-only/variant forms.`);
  console.log(`Skipped ${skippedNoStrokes} entries with no stroke data.`);
  console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
