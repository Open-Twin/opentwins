// Banner layout — wide cover image for article-style platforms (Dev.to,
// Medium). Designed native for non-square canvases (e.g. 1000×420); the
// shared pageSetup detects non-square and skips the virtual-1200 transform,
// so this template authors directly in the target dimensions.
//
// Aesthetic: clean card surface, dark serif display headline, brand-blue
// kicker, muted subline. Reads well at feed-thumbnail scale (~280×120)
// and at full article-header size.
//
// Data shape: { title, kicker?, subline? }

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-21-banner-v2';

export function validate(data) {
  const errors = [requireString(data, 'title')];
  if (data.kicker !== undefined && typeof data.kicker !== 'string') {
    errors.push('kicker: must be a string when provided');
  }
  if (data.subline !== undefined && typeof data.subline !== 'string') {
    errors.push('subline: must be a string when provided');
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  // Sizes tuned for 1000×420. Shorter canvases get proportionally tighter.
  const extraCss = `
  body {
    background: ${T.clinical.bg};
    background-image:
      radial-gradient(ellipse at 85% 30%, rgba(10,102,194,0.08) 0%, transparent 55%);
    color: ${T.clinical.fg};
    font-family: ${T.fonts.sansSystem};
    padding: 54px 64px;
    display: flex; flex-direction: column; justify-content: center;
    gap: 20px;
    overflow: hidden;
  }
  .kicker {
    font-family: ${T.fonts.monoTech};
    font-size: 18px; font-weight: 700;
    letter-spacing: 3px; text-transform: uppercase;
    color: ${T.brand.blue};
    display: flex; align-items: center; gap: 14px;
    line-height: 1.2;
  }
  .kicker::before {
    content: ''; display: inline-block;
    width: 28px; height: 2px; background: ${T.brand.blue};
  }
  .title {
    font-family: ${T.fonts.serifDisplay};
    font-size: 60px;
    font-weight: 400;
    line-height: 1.02;
    letter-spacing: -1.2px;
    color: ${T.clinical.fg};
    max-width: ${width - 128}px;
    text-wrap: balance;
  }
  .subline {
    font-family: ${T.fonts.sansSystem};
    font-size: 22px;
    font-weight: 400;
    line-height: 1.35;
    color: ${T.clinical.fgMuted};
    max-width: ${width - 160}px;
  }
  `;

  const body = `
    ${data.kicker ? `<div class="kicker">${escapeHtml(data.kicker)}</div>` : ''}
    <h1 class="title">${escapeHtml(data.title)}</h1>
    ${data.subline ? `<div class="subline">${escapeHtml(data.subline)}</div>` : ''}
  `;

  return wrapDoc({ width, height, body, extraCss });
}

export default { render, validate, TEMPLATE_VERSION };
