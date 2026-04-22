// Note layout — Substack Note image. Dark gradient, sans-serif, accent highlight.
// Ported from workspace/content-writer/templates/render-note-image.mjs.

import { escapeHtml, escapeRegex } from '../../lib/escape.mjs';
import { requireString, requireWords } from '../../lib/validate.mjs';
import { wrap } from '../_shared/corporate.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-c';

export function validate(data) {
  const errors = [
    requireString(data, 'headline'),
    requireWords(data, 'headline', { min: 5, max: 30 }),
  ];
  if (data.subline !== undefined && typeof data.subline !== 'string') {
    errors.push('subline: must be a string when provided');
  }
  if (data.accent !== undefined && typeof data.accent !== 'string') {
    errors.push('accent: must be a string when provided');
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  let headlineHtml = escapeHtml(data.headline);
  const accent = (data.accent || '').trim();
  if (accent) {
    const re = new RegExp(escapeRegex(escapeHtml(accent)), 'i');
    if (re.test(headlineHtml)) {
      headlineHtml = headlineHtml.replace(re, (m) => `<span class="accent">${m}</span>`);
    }
    // If accent text isn't in headline, fall through — rendered without highlight.
  }
  const subline = (data.subline || '').trim();

  const extraCss = `
  body {
    background: radial-gradient(circle at 20% 18%, #2a5db0 0%, #05070d 75%);
    color: white;
    padding: 110px 100px;
    display: flex; flex-direction: column; justify-content: center;
    overflow: hidden;
  }
  h1 {
    font-size: 104px; font-weight: 800; line-height: 1.03; letter-spacing: -3px;
    color: white; max-width: 900px;
  }
  h1 .accent { color: ${T.brand.blueLight}; }
  .subline {
    margin-top: 44px; font-size: 34px; line-height: 1.4;
    color: rgba(255,255,255,0.82); font-weight: 500; max-width: 860px;
  }
  `;

  const body = `
<h1>${headlineHtml}</h1>
${subline ? `<div class="subline">${escapeHtml(subline)}</div>` : ''}
`;

  return wrap({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
