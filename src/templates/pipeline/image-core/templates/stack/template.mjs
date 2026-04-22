// Stack layout — bold brand-blue cards on warm ivory.
//   Clean ivory canvas frames 3-5 solid brand-blue cards. Each card has
//   a huge white serif numeral on the left and sans title + muted body
//   on the right. High contrast between canvas and cards; reads from
//   across the room and in a scrolling feed.
//
// Data shape: { title, items[{title, body}], doodle? }.

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-21-stack-bluecards-v1';

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireArray(data, 'items', { minLen: 3, maxLen: 5 }),
  ];
  if (Array.isArray(data.items)) {
    data.items.forEach((it, i) => {
      if (!it || typeof it !== 'object') {
        errors.push(`items[${i}]: object required`);
        return;
      }
      if (requireString(it, 'title')) errors.push(`items[${i}].title: string required`);
      if (requireString(it, 'body')) errors.push(`items[${i}].body: string required`);
    });
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  const count = data.items.length;
  // Size tuned per-count so dense 5-item stacks don't overflow the card.
  const numSize   = count >= 5 ? 80  : count === 4 ? 100 : 120;
  const numCol    = count >= 5 ? 110 : count === 4 ? 130 : 150;
  const titleSize = count >= 5 ? 34  : count === 4 ? 40  : 46;
  const bodySize  = count >= 5 ? 22  : count === 4 ? 26  : 28;
  const cardPad   = count >= 5 ? 22  : count === 4 ? 28  : 34;

  const items = data.items.map((it, i) => `
    <div class="card">
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <div class="card-content">
        <div class="card-title">${escapeHtml(it.title)}</div>
        <div class="card-body">${escapeHtml(it.body)}</div>
      </div>
    </div>
  `).join('');

  const extraCss = `
  body {
    background: #f7f2e8;
    color: ${T.brand.navy};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 72px 72px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 30px;
  }
  .title {
    font-family: ${T.fonts.sansSystem};
    font-size: 78px;
    font-weight: 800;
    line-height: 0.98;
    letter-spacing: -2px;
    color: ${T.brand.navy};
    max-width: 1060px;
    text-wrap: balance;
  }
  .cards {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }
  .card {
    flex: 1 1 0;
    display: grid;
    grid-template-columns: ${numCol}px 1fr;
    align-items: center;
    gap: 28px;
    padding: ${cardPad}px 40px;
    background: ${T.brand.blue};
    border-radius: 18px;
    min-height: 0;
    overflow: hidden;
    box-shadow: 0 14px 32px rgba(10,26,43,0.12);
  }
  .num {
    font-family: ${T.fonts.serifDisplay};
    font-size: ${numSize}px;
    font-weight: 400;
    line-height: 0.92;
    letter-spacing: -3px;
    color: #ffffff;
    font-feature-settings: 'lnum' on;
    text-align: center;
  }
  .card-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    min-width: 0;
  }
  .card-title {
    font-family: ${T.fonts.sansSystem};
    font-size: ${titleSize}px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -1px;
    color: #ffffff;
  }
  .card-body {
    font-family: ${T.fonts.sansSystem};
    font-size: ${bodySize}px;
    font-weight: 400;
    line-height: 1.35;
    color: rgba(255,255,255,0.85);
    max-width: 820px;
  }
  `;

  const body = `
    <div class="header">
      <h1 class="title">${escapeHtml(data.title)}</h1>
    </div>
    <div class="cards">${items}</div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
