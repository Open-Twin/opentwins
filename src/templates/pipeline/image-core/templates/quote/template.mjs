// Quote layout — pull-quote with attribution.
//   Warm cream (parchment) canvas. Oversized decorative opening quote mark
//   in the top-left establishes the editorial frame. The quote itself is
//   italic serif, centered, large. Attribution line below in small sans with
//   a leading em-rule.
//
// Aesthetic: literary / editorial column. Distinct from `note` (dark
// gradient + punchy statement) — this is a slower, reflective treatment.
//
// Data shape: { quote, attribution, context? }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireWords } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-quote-v2';

export function validate(data) {
  const errors = [
    requireString(data, 'quote'),
    requireWords(data, 'quote', { min: 6, max: 40 }),
    requireString(data, 'attribution'),
  ];
  if (data.context !== undefined && typeof data.context !== 'string') {
    errors.push('context: must be a string when provided');
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  const extraCss = `
  body {
    background: ${T.parchment.bg};
    background-image:
      radial-gradient(ellipse at 20% 10%, ${T.parchment.bgAccent} 0%, transparent 60%),
      radial-gradient(ellipse at 85% 95%, ${T.parchment.bgAccent} 0%, transparent 55%);
    color: ${T.parchment.ink};
    font-family: ${T.fonts.serifDisplay};
    padding: 100px 110px;
    position: relative;
    overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
    gap: 36px;
  }
  .quote-mark {
    position: absolute;
    top: 50px;
    left: 80px;
    font-family: ${T.fonts.serifDisplay};
    font-style: italic;
    font-size: 380px;
    line-height: 1;
    color: ${T.parchment.quoteMark};
    z-index: 0;
    user-select: none;
  }
  .quote {
    position: relative; z-index: 1;
    font-family: ${T.fonts.serifDisplay};
    font-style: italic;
    font-weight: 400;
    font-size: 88px;
    line-height: 1.08;
    letter-spacing: -1.2px;
    color: ${T.parchment.ink};
    max-width: 980px;
    text-wrap: balance;
  }
  .attribution {
    position: relative; z-index: 1;
    font-family: ${T.fonts.sansSystem};
    font-size: 26px;
    font-weight: 600;
    color: ${T.parchment.ink};
    display: flex; align-items: center; gap: 14px;
  }
  .attribution::before {
    content: ''; display: inline-block;
    width: 32px; height: 2px; background: ${T.parchment.ink};
    opacity: 0.7;
  }
  `;

  const body = `
    <div class="quote-mark" aria-hidden="true">&ldquo;</div>
    <div class="quote">${escapeHtml(data.quote)}</div>
    <div class="attribution">${escapeHtml(data.attribution)}</div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
