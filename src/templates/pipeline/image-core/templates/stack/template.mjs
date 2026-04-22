// Stack layout — editorial "chapter heading" style.
//   Dark canvas. Massive serif numeral on the left is the hero. Step label
//   (mono caps) + serif body on the right. Hairline rules between items.
//   Flex distribution so 3-5 items share vertical space naturally.
//
// Data shape unchanged: { title, subtitle, items[{title, body}], doodle? }.

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-editorial-v9';

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
  // All sizes scale with count so dense 5-item stacks still fit the canvas
  // without overflow. Body stays ≥26px so text remains legible at mobile
  // feed shrink (~3.5x).
  const itemTitleSize = count >= 5 ? 32 : count === 4 ? 38 : 44;
  const itemBodySize  = count >= 5 ? 26 : count === 4 ? 28 : 32;

  const items = data.items.map((it, i) => `
    <div class="item">
      <div class="item-title"><span class="num">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(it.title)}</div>
      <div class="item-body">${escapeHtml(it.body)}</div>
    </div>
  `).join('');

  // Typography rules for this template — single family, single weight,
  // hierarchy via size + italic + color only.
  //   - DM Serif Display regular throughout
  //   - Italic used only on the header subtitle (one accent)
  //   - Color: ivory-bright for primary, ivory-muted for secondary, brand
  //     accent for numeric counters only
  const extraCss = `
  body {
    background: ${T.editorial.bg};
    color: ${T.editorial.fg};
    font-family: ${T.fonts.serifDisplay};
    padding: 86px 90px 80px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 28px;
    padding-bottom: 24px;
    border-bottom: 1.5px solid ${T.editorial.rule};
  }
  .title {
    font-family: ${T.fonts.serifDisplay};
    font-size: 72px;
    font-weight: 400;
    line-height: 1.03;
    letter-spacing: -1.5px;
    color: ${T.editorial.fg};
    max-width: 1020px;
  }
  .subtitle {
    font-family: ${T.fonts.serifDisplay};
    font-size: 30px;
    font-weight: 400;
    font-style: italic;
    line-height: 1.35;
    color: ${T.editorial.fgMuted};
    max-width: 960px;
  }
  .items {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .item {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: ${count >= 5 ? '12px' : '16px'} 0;
    border-bottom: 1.5px solid ${T.editorial.rule};
    min-height: 0;
  }
  .item:last-child { border-bottom: none; }
  .item-title {
    font-family: ${T.fonts.serifDisplay};
    font-size: ${itemTitleSize}px;
    font-weight: 400;
    line-height: 1.15;
    letter-spacing: -0.5px;
    color: ${T.editorial.fg};
    margin-bottom: 8px;
  }
  .item-title .num {
    font-family: ${T.fonts.serifDisplay};
    font-weight: 400;
    color: ${T.editorial.accent};
    margin-right: 14px;
    font-feature-settings: 'lnum' on;
  }
  .item-body {
    font-family: ${T.fonts.serifDisplay};
    font-size: ${itemBodySize}px;
    font-weight: 400;
    line-height: 1.3;
    color: ${T.editorial.fgMuted};
    max-width: 1020px;
  }
  `;

  const body = `
    <div class="header">
      <h1 class="title">${escapeHtml(data.title)}</h1>
    </div>
    <div class="items">${items}</div>
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
