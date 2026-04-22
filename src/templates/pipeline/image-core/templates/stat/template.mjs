// Stat layout — big number hero.
//   Off-white canvas with subtle grid texture. One dominant tabular numeral
//   (JetBrains Mono, ~300px+) is the hero. Unit line pairs with the number
//   on its own line below, explanation paragraph grounds it.
//
// Aesthetic: data journalism. Distinct from `note` (word-led) — this is
// number-led, lets readers absorb a single metric instantly.
//
// Data shape: { label, value, unit, explanation, source? }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-stat-terminal-v1';

export function validate(data) {
  const errors = [
    requireString(data, 'label'),
    requireString(data, 'value'),
    requireString(data, 'unit'),
    requireString(data, 'explanation'),
  ];
  // value should be short — it's the hero. Long numeric strings break the layout.
  if (typeof data.value === 'string' && data.value.length > 8) {
    errors.push(`value: too long (${data.value.length} chars, max 8 — keep it punchy like "10×" or "47%")`);
  }
  if (data.source !== undefined && typeof data.source !== 'string') {
    errors.push('source: must be a string when provided');
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  // Dashboard / terminal grid pattern. Bright on dark.
  const gridPattern = `
    repeating-linear-gradient(to right, transparent 0 79px, ${T.terminal.gridLine} 79px 80px),
    repeating-linear-gradient(to bottom, transparent 0 79px, ${T.terminal.gridLine} 79px 80px)
  `;

  const extraCss = `
  body {
    background: ${T.terminal.bg};
    background-image: ${gridPattern};
    color: ${T.terminal.fg};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 90px;
    display: flex; flex-direction: column; justify-content: center;
    align-items: center; text-align: center;
    gap: 32px;
    overflow: hidden;
  }
  .number {
    font-family: ${T.fonts.monoTech};
    font-size: 400px;
    font-weight: 700;
    letter-spacing: -14px;
    color: ${T.terminal.accent};
    line-height: 0.9;
    font-feature-settings: 'tnum' on, 'lnum' on;
    text-shadow: 0 0 40px rgba(0,229,164,0.25);
  }
  .unit {
    font-family: ${T.fonts.sansSystem};
    font-size: 56px;
    font-weight: 800;
    color: ${T.terminal.fg};
    max-width: 900px;
    line-height: 1.1;
    letter-spacing: -0.8px;
    text-wrap: balance;
  }
  .explanation {
    font-family: ${T.fonts.sansSystem};
    font-size: 32px;
    font-weight: 400;
    line-height: 1.4;
    color: ${T.terminal.fgMuted};
    max-width: 960px;
    text-wrap: balance;
  }
  `;

  const body = `
    <div class="number">${escapeHtml(data.value)}</div>
    <div class="unit">${escapeHtml(data.unit)}</div>
    <div class="explanation">${escapeHtml(data.explanation)}</div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
