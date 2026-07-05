const form = document.getElementById('worksheet-form');
const textEl = document.getElementById('text');
const maxCharactersEl = document.getElementById('maxCharacters');
const rowsEl = document.getElementById('rowsPerCharacter');
const feedbackEl = document.getElementById('feedback');
const submitBtn = document.getElementById('submit-btn');

let debounceTimer = null;

function showFeedback(message, kind) {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${kind}`;
  feedbackEl.hidden = false;
}

function clearFeedback() {
  feedbackEl.hidden = true;
  feedbackEl.textContent = '';
}

function currentMaxCharacters() {
  const n = parseInt(maxCharactersEl.value, 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Live validation as the user types: names unsupported characters and
// flags exceeding the user's own max-characters setting before they ever
// click "Generate".
textEl.addEventListener('input', scheduleValidate);
maxCharactersEl.addEventListener('change', scheduleValidate);

function scheduleValidate() {
  clearTimeout(debounceTimer);
  const text = textEl.value.trim();
  if (!text) { clearFeedback(); return; }
  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, maxCharacters: currentMaxCharacters() }),
      });
      const data = await res.json();
      if (data.unsupported && data.unsupported.length) {
        showFeedback(
          `Not supported (not Simplified, or not in the stroke dataset): ${data.unsupported.join(', ')}`,
          'error'
        );
      } else if (data.overLimit) {
        showFeedback(
          `You've entered ${data.totalCharacters} characters, which is more than your current limit of ${data.maxCharacters}. Raise the limit above or remove some characters.`,
          'error'
        );
      } else {
        clearFeedback();
      }
    } catch (e) {
      // Silently ignore live-validation network hiccups; submit will re-check.
    }
  }, 350);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = textEl.value.trim();
  if (!text) {
    showFeedback('Please enter at least one character.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating...';
  clearFeedback();

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        maxCharacters: currentMaxCharacters(),
        rowsPerCharacter: rowsEl.value || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showFeedback(data.error || 'Something went wrong generating the worksheet.', 'error');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xizi-worksheet.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showFeedback('Network error while generating the worksheet. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate PDF worksheet';
  }
});
