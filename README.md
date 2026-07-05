# Xi Zi (习字) Worksheet Generator

A small web app that generates printable Chinese character-writing practice
worksheets (田字格 / tianzige sheets). Type in individual Simplified Chinese
characters and download a print-ready PDF: one page per character, with a
grayscale-safe stroke-order reference + pinyin, progressive stroke-by-stroke
tracing, and a fixed block of independent-writing rows.

Print-only. No on-screen tracing, no accounts, nothing is stored. See
`BUILD_PROMPT.md` (in the parent project folder) for the full spec this was
built against, and `sample-worksheet-学校.pdf` for the canonical visual
reference.

## Running it

```
npm install
npm start
```

Then open http://localhost:3000. The stroke/pinyin dataset
(`data/hanzi-simplified.json`) is already built and checked in. To rebuild
it from scratch, see "Rebuilding the dataset" below.

## How it works

- **Frontend** (`public/`): text field for characters, a "maximum
  characters per worksheet" number field (user-adjustable, default 10), and
  an optional rows-per-character override. Validates as you type via
  `/api/validate` and shows unsupported characters or over-limit counts by
  name.
- **Backend** (`server.js`, `lib/`): Express app.
  - `lib/strokeData.js` -- loads/queries the preprocessed stroke+pinyin dataset.
  - `lib/validate.js` -- input parsing (flattens to individual characters,
    whitespace is stripped and carries no meaning) + Simplified-character
    validation + max-characters check.
  - `lib/arrows.js` -- turns a stroke's `medians` (centerline) data into a
    numbered start-point and the full render-space path used to draw a
    path-following direction arrow.
  - `lib/layout.js` -- pure page-geometry math (cell sizes, the 7-wide
    tracing grid, fixed writing-row count), independently testable.
  - `lib/pdf.js` -- draws the actual worksheet: tianzige grids, the
    grayscale-safe stroke-order reference (gray template + black
    path-following arrows + plain numbers), pinyin, progressive tracing,
    the modeled writing section, and a closing About/Credits page.
- `data/hanzi-simplified.json` -- preprocessed, Simplified-only stroke +
  pinyin data (see "Data sources" below).
- `fonts/LXGWWenKaiGB-Regular.ttf` -- the Kǎitǐ font used for both the
  character glyphs and the pinyin text (it renders pinyin's tone-mark
  diacritics correctly, which PDFKit's built-in fonts do not).

## Design history (why it looks the way it does)

This went through several rounds of direct feedback on generated samples.
In order:

1. **No English anywhere on the worksheet pages.** No headers, no "N
   strokes" labels, no section titles. Pages start directly with the
   reference cell. Page footers are numeric only ("1 / 5"). The About/
   Credits page is the one exception, kept in English since it's a
   license-attribution notice, not worksheet content.
2. **Stroke-order redesign for grayscale printing.** An early version used
   red circular number badges and short straight arrows -- it read as
   cluttered and didn't reproduce well on a black-and-white printer. It was
   replaced with: the character drawn as a mid-gray template, solid black
   arrows that trace each stroke's *actual* path (via its `medians`
   polyline) ending in an arrowhead, and plain numbers (no circle/fill)
   offset near each stroke's start.
3. **Pinyin placement.** Printed directly beside the reference cell.
4. **Tracing section redesigned twice.** First from a 3-row opacity fade
   (100%→60%→30%→10%) to a progressive cumulative build-up (box 1 = stroke
   1, box 2 = strokes 1-2, etc., all in one uniform light tone). Then
   further refined so every row is always exactly 7 boxes wide, padding
   with repeats of the complete character once a character's own strokes
   run out mid-row.
5. **Writing section made finite.** Originally "fill the rest of the page"
   with blank cells; now a fixed 5 rows, with the complete character
   printed as a model in the first box only, so the whole page (reference,
   tracing, writing) fits on one A4 sheet.
6. **Multi-character word support removed entirely.** An earlier version
   let you type whole words (e.g. 学校) and gave each word its own combined
   practice page in addition to each character's own page. That's gone:
   input is single characters only, one page each, no word grouping.
7. **User-adjustable generation limit.** A number field lets whoever's
   generating the worksheet set their own cap (default 10, hard ceiling 50)
   on how many characters can go into one PDF at a time.

## Implementation note: PDF rendering approach

The spec's suggested architecture was HTML/CSS + inline SVG converted to
PDF via a headless-browser print step (Puppeteer/Playwright). That wasn't
installable in the sandbox this was originally built in (no root access,
and the usual Chromium download hosts were network-blocked), so it renders
directly onto a PDFKit document instead: PDFKit draws the grid/layout/text,
and `svg-to-pdfkit` draws each character's real stroke-path SVG data
straight into the PDF as vector content. If you have a normal-internet
environment and want the original headless-browser pipeline instead, that's
an equally valid implementation of the same spec.

## Data sources

- **Stroke order + shape**: [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)
  (`graphics.txt`, `dictionary.txt`). Arphic Public License -- kept at
  `data/licenses/makemeahanzi-APL/` and `data/licenses/makemeahanzi-COPYING.txt`,
  credited on the PDF's About/Credits page. Revisit this license before any
  closed-source/commercial use.
- **Simplified-vs-Traditional filtering**: [cjkvi-variants](https://github.com/cjkvi/cjkvi-variants)
  (`cjkvi-simplified.txt`) -- an addition beyond the two sources in the
  original spec, since Make Me a Hanzi doesn't itself flag Simplified vs.
  Traditional. **License is unclear** (bare copyright header, no LICENSE
  file found) -- verify before wider distribution, or swap for Unicode's
  Unihan `kSimplifiedVariant`/`kTraditionalVariant` data instead.
- **Reference/tracing font**: [LXGW WenKai GB](https://github.com/lxgw/LxgwWenkaiGB),
  SIL Open Font License 1.1 (`fonts/LXGWWenKaiGB-OFL.txt`).

## Rebuilding the dataset

```
git clone --depth 1 https://github.com/skishore/makemeahanzi.git /tmp/mmh
git clone --depth 1 https://github.com/cjkvi/cjkvi-variants.git /tmp/cjkvi
node scripts/build-data.js /tmp/mmh /tmp/cjkvi/cjkvi-simplified.txt
```

This overwrites `data/hanzi-simplified.json`. See `scripts/build-data.js`
for exactly how Simplified-only filtering works.

## Known limitations / open items

- **Max-characters default (10) and hard ceiling (50)** are reasonable
  defaults, not specified requirements -- adjust in `lib/validate.js` if
  different numbers are wanted.
- **Writing section is a fixed 5 rows**, chosen to guarantee one-page fit;
  more rows could be added at the cost of occasionally spilling to a
  second page for that character.
- **Extremely high-stroke characters** (rare in the Simplified set) may
  still spill a few writing rows onto a second page as a safety fallback.
- **Credits/About page is in English** -- flagged as an intentional
  exception to the "no English" rule, since it's license attribution, not
  worksheet content.
