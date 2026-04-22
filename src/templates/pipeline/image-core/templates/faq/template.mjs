// FAQ layout — Q/A pairs on a calm sage paper.
//   Each entry has a "Q —" marker followed by the question (bold),
//   and an "A —" marker followed by the answer (regular body). 2-4 pairs.
//
// Aesthetic: calm editorial conversation. Distinct from stack (no
// questions), compare (not binary), principle (single thesis).
//
// Data shape: { title, entries: [{ question, answer }] } (2-4 entries)

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-faq-v3';

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireArray(data, 'entries', { minLen: 2, maxLen: 4 }),
  ];
  if (Array.isArray(data.entries)) {
    data.entries.forEach((e, i) => {
      if (!e || typeof e !== 'object') {
        errors.push(`entries[${i}]: object required`);
        return;
      }
      if (requireString(e, 'question')) errors.push(`entries[${i}].question: string required`);
      if (requireString(e, 'answer'))   errors.push(`entries[${i}].answer: string required`);
    });
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  const count = data.entries.length;
  const questionSize = count >= 4 ? 40 : count === 3 ? 46 : 54;
  const answerSize   = count >= 4 ? 26 : count === 3 ? 32 : 38;

  const entries = data.entries.map((e) => `
    <div class="entry">
      <div class="line line-q">
        <span class="marker">Q</span>
        <span class="text question">${escapeHtml(e.question)}</span>
      </div>
      <div class="line line-a">
        <span class="marker muted">A</span>
        <span class="text answer">${escapeHtml(e.answer)}</span>
      </div>
    </div>
  `).join('');

  const extraCss = `
  body {
    background: ${T.faq.bg};
    color: ${T.faq.ink};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 90px 80px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 30px;
    padding-bottom: 24px;
    border-bottom: 1.5px solid ${T.faq.rule};
  }
  .title {
    font-family: ${T.fonts.sansSystem};
    font-size: 70px; font-weight: 800;
    line-height: 1.05; letter-spacing: -1.8px;
    color: ${T.faq.ink};
    max-width: 1020px;
  }
  .entries {
    flex: 1 1 auto;
    display: flex; flex-direction: column;
    min-height: 0;
  }
  .entry {
    flex: 1 1 0;
    display: flex; flex-direction: column;
    justify-content: center;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid ${T.faq.rule};
    min-height: 0;
  }
  .entry:last-child { border-bottom: none; }
  .line {
    display: grid;
    grid-template-columns: 48px 1fr;
    align-items: baseline;
    gap: 16px;
  }
  .marker {
    font-family: ${T.fonts.sansSystem};
    font-size: 40px; font-weight: 800;
    letter-spacing: 0;
    color: ${T.faq.accent};
    line-height: 1;
    text-align: left;
  }
  .marker.muted { color: ${T.faq.inkMuted}; opacity: 0.7; }
  .text {
    font-family: ${T.fonts.sansSystem};
  }
  .question {
    font-size: ${questionSize}px;
    font-weight: 700;
    line-height: 1.2;
    color: ${T.faq.ink};
    letter-spacing: -0.4px;
  }
  .answer {
    font-size: ${answerSize}px;
    font-weight: 400;
    line-height: 1.45;
    color: ${T.faq.inkMuted};
    max-width: 880px;
  }
  `;

  const body = `
    <div class="header">
      <h1 class="title">${escapeHtml(data.title)}</h1>
    </div>
    <div class="entries">${entries}</div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
