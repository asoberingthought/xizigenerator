const express = require('express');
const path = require('path');

const validate = require('./lib/validate');
const { generateWorksheetPdf } = require('./lib/pdf');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function parseMaxCharacters(body) {
  const n = parseInt(body.maxCharacters, 10);
  return Number.isFinite(n) && n > 0 ? n : validate.DEFAULT_MAX_CHARACTERS;
}

// Validates input without generating a PDF. Used by the frontend for
// instant feedback before the (slower) generate call.
app.post('/api/validate', (req, res) => {
  const text = String(req.body.text || '');
  const maxCharacters = parseMaxCharacters(req.body);
  const characters = validate.parseInput(text);
  if (!characters.length) {
    return res.json({
      ok: false,
      unsupported: [],
      characters: [],
      error: 'Please enter at least one character.',
    });
  }
  const result = validate.validateCharacters(characters, { maxCharacters });
  res.json({
    ok: result.ok,
    unsupported: result.unsupported,
    characters: result.characters,
    totalCharacters: characters.length,
    overLimit: result.overLimit,
    maxCharacters: result.maxCharacters,
  });
});

// Validates, then streams back a generated PDF worksheet.
app.post('/api/generate', (req, res) => {
  const text = String(req.body.text || '');
  const maxCharacters = parseMaxCharacters(req.body);
  let rowsPerCharacter = null;
  if (req.body.rowsPerCharacter !== undefined && req.body.rowsPerCharacter !== null && req.body.rowsPerCharacter !== '') {
    const n = parseInt(req.body.rowsPerCharacter, 10);
    if (Number.isFinite(n) && n > 0) rowsPerCharacter = n;
  }

  const characters = validate.parseInput(text);
  if (!characters.length) {
    return res.status(400).json({ error: 'Please enter at least one character.' });
  }

  const result = validate.validateCharacters(characters, { maxCharacters });

  if (result.overLimit) {
    return res.status(400).json({
      error: `You entered ${characters.length} characters, which is more than your current limit of ${result.maxCharacters}. ` +
        'Raise the limit or remove some characters.',
      overLimit: true,
      maxCharacters: result.maxCharacters,
      totalCharacters: characters.length,
    });
  }

  if (result.unsupported.length) {
    return res.status(400).json({
      error: `Unsupported character${result.unsupported.length === 1 ? '' : 's'}: ${result.unsupported.join(', ')}. ` +
        'This app only supports Simplified Chinese characters that exist in the Make Me a Hanzi stroke dataset.',
      unsupported: result.unsupported,
    });
  }

  try {
    const doc = generateWorksheetPdf({ characters: result.characters, rowsPerCharacter });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="xizi-worksheet.pdf"');
    doc.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate worksheet PDF. See server logs for details.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Xi Zi worksheet generator running at http://localhost:${PORT}`);
});
