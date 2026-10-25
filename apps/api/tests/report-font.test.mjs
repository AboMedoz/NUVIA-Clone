import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as pdf from '../src/modules/reports/pdf.mjs';

test('report font covers Arabic, Latin, digits and punctuation in the same exported text run', () => {
  const require = createRequire(import.meta.resolve('pdfkit'));
  const font = require('fontkit').openSync(pdf.REPORT_FONT_PATH);
  for (const character of 'تقرير آراء العملاء 0123456789 waiting_for_model Acceptance Cafe :/-.,()')
    assert.ok(
      font.hasGlyphForCodePoint(character.codePointAt(0)),
      `Missing PDF glyph: ${character}`,
    );
});

test('PDF directional layout keeps Latin status and dates forward inside Arabic paragraphs', () => {
  assert.equal(typeof pdf.directionalRuns, 'function');
  const runs = pdf.directionalRuns('الحالة: waiting_for_model 2026-10-25', 'rtl');
  assert.ok(runs.some((run) => run.text.includes('waiting_for_model')));
  assert.ok(runs.some((run) => run.text.includes('2026-10-25')));
  assert.equal(runs.at(-1).direction, 'rtl');
  assert.ok(runs.at(-1).text.includes('الحالة'));
});
