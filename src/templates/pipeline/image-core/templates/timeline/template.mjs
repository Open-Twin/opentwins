// Timeline layout — vertical chronological progression.
//   Cool steel-dark canvas with warm-orange date markers. Vertical rule line
//   anchors the timeline; each entry sits to the right with a circular node
//   on the line marking its position.
//
// Aesthetic: engineering report / time-series. Distinct from stack
// (undated sequence) — timeline is explicitly time-anchored.
//
// Data shape: { title, entries: [{ when, what, detail? }] } (3-5 entries)

import { escapeHtml } from '../../lib/escape.mjs';
import { requireString, requireArray } from '../../lib/validate.mjs';
import { wrapDoc } from '../_shared/pageSetup.mjs';
import T from '../_shared/tokens.mjs';

export const TEMPLATE_VERSION = '2026-04-20-timeline-v3';

export function validate(data) {
  const errors = [
    requireString(data, 'title'),
    requireArray(data, 'entries', { minLen: 3, maxLen: 5 }),
  ];
  if (Array.isArray(data.entries)) {
    data.entries.forEach((e, i) => {
      if (!e || typeof e !== 'object') {
        errors.push(`entries[${i}]: object required`);
        return;
      }
      if (requireString(e, 'when')) errors.push(`entries[${i}].when: string required`);
      if (requireString(e, 'what')) errors.push(`entries[${i}].what: string required`);
      if (e.detail !== undefined && typeof e.detail !== 'string') {
        errors.push(`entries[${i}].detail: must be a string when provided`);
      }
    });
  }
  const flat = errors.filter(Boolean);
  return { ok: flat.length === 0, errors: flat };
}

export function render(data, { width, height }) {
  const count = data.entries.length;
  const detailSize = count >= 5 ? 26 : count === 4 ? 30 : 36;
  const whatSize   = count >= 5 ? 36 : count === 4 ? 42 : 48;

  const entries = data.entries.map((e) => `
    <div class="entry">
      <div class="node"></div>
      <div class="body">
        <div class="when">${escapeHtml(e.when)}</div>
        <div class="what">${escapeHtml(e.what)}</div>
        ${e.detail ? `<div class="detail">${escapeHtml(e.detail)}</div>` : ''}
      </div>
    </div>
  `).join('');

  const extraCss = `
  body {
    background: ${T.timeline.bg};
    color: ${T.timeline.fg};
    font-family: ${T.fonts.sansSystem};
    padding: 80px 90px 80px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .header {
    flex: 0 0 auto;
    margin-bottom: 30px;
    padding-bottom: 24px;
    border-bottom: 1.5px solid ${T.timeline.rule};
  }
  .title {
    font-family: ${T.fonts.sansSystem};
    font-size: 70px; font-weight: 800;
    line-height: 1.05; letter-spacing: -1.8px;
    color: ${T.timeline.fg};
    max-width: 1020px;
  }
  .entries {
    flex: 1 1 auto;
    display: flex; flex-direction: column;
    position: relative;
    padding-left: 40px;
    min-height: 0;
  }
  /* Vertical timeline rule — anchors every entry's node. */
  .entries::before {
    content: ''; position: absolute;
    left: 18px; top: 16px; bottom: 16px;
    width: 2px; background: ${T.timeline.line};
  }
  .entry {
    flex: 1 1 0;
    display: grid;
    grid-template-columns: 36px 1fr;
    align-items: center;
    gap: 30px;
    padding: 10px 0;
    position: relative;
    min-height: 0;
  }
  .node {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: ${T.timeline.accent};
    box-shadow: 0 0 0 5px ${T.timeline.bg}, 0 0 0 6px ${T.timeline.accent};
    margin-left: -9px;
    grid-column: 1;
  }
  .body {
    grid-column: 2;
    display: flex; flex-direction: column; gap: 6px;
  }
  .when {
    font-family: ${T.fonts.monoTech};
    font-size: 26px; font-weight: 700;
    letter-spacing: 2.5px; text-transform: uppercase;
    color: ${T.timeline.accent};
    line-height: 1.2;
  }
  .what {
    font-family: ${T.fonts.sansSystem};
    font-size: ${whatSize}px; font-weight: 700;
    line-height: 1.2;
    color: ${T.timeline.fg};
    letter-spacing: -0.5px;
  }
  .detail {
    font-family: ${T.fonts.sansSystem};
    font-size: ${detailSize}px;
    font-weight: 400; line-height: 1.4;
    color: ${T.timeline.fgMuted};
    max-width: 900px;
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
