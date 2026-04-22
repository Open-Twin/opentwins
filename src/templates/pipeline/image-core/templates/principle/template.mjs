// Principle layout — single thesis with supporting paragraphs.
//   Off-white editorial canvas. Small numbered label at top establishes
//   which principle in a series this is. A bold serif principle statement
//   takes the upper third. Below a divider, 2-3 supporting paragraphs set
//   in sans for body-text readability.
//
// Aesthetic: modernist manifesto / page-from-a-book. Distinct from `note`
// (punchy one-liner on dark gradient) — principle is for depth, not punch.
//
// Data shape:
//   { number, category?, principle, paragraphs: string[] (2-3) }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-principle-brandcard-v1';

export function validate(data) {
  const errors = [
    requireString(data, 'number'),
    requireString(data, 'principle'),
  ];
  if (data.category !== undefined && typeof data.category !== 'string') {
    errors.push('category: must be a string when provided');
  }
  if (typeof data.number === 'string' && data.number.length > 4) {
    errors.push(`number: too long (${data.number.length} chars, max 4 — e.g. "03" or "12")`);
  }
  // paragraphs is accepted in the schema for back-compat but no longer rendered.
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  const labelText = data.category
    ? `Principle ${escapeHtml(data.number)} · ${escapeHtml(data.category)}`
    : `Principle ${escapeHtml(data.number)}`;

  const extraCss = `
  body {
    background: ${T.brand.blue};
    background-image:
      radial-gradient(ellipse at top right, rgba(255,255,255,0.08) 0%, transparent 55%),
      radial-gradient(ellipse at bottom left, rgba(0,0,0,0.12) 0%, transparent 55%);
    color: #ffffff;
    font-family: ${T.fonts.serifDisplay};
    padding: 100px 100px;
    display: flex; flex-direction: column; justify-content: center;
    gap: 48px;
    overflow: hidden;
  }
  .label {
    font-family: ${T.fonts.sansSystem};
    font-size: 20px; font-weight: 700;
    letter-spacing: 4px; text-transform: uppercase;
    color: rgba(255,255,255,0.88);
    display: flex; align-items: center; gap: 16px;
    line-height: 1.3;
  }
  .label::before {
    content: ''; display: inline-block;
    width: 36px; height: 2px; background: rgba(255,255,255,0.88);
  }
  .principle {
    font-family: ${T.fonts.serifDisplay};
    font-style: normal;
    font-weight: 400;
    font-size: 86px;
    line-height: 1.08;
    letter-spacing: -1.8px;
    color: #ffffff;
    max-width: 1020px;
    text-wrap: balance;
  }
  `;

  const body = `
    <div class="label">${labelText}</div>
    <h1 class="principle">${escapeHtml(data.principle)}</h1>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
