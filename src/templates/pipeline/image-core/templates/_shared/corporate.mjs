// Corporate aesthetic: system sans/mono, dark navy gradient, brand-blue accents.
// Used by substack/note and linkedin/carousel. Distinct from notebook — these
// two aesthetics live side-by-side intentionally (note/carousel read as
// polished, stack/matrix/venn read as sketched).

import T from './tokens.mjs';

export function corporateHead({ width, height, extraCss = '' }) {
  return `
<meta charset="utf-8">
<style>
  @page { size: ${width}px ${height}px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  html, body { font-family: ${T.fonts.sansSystem}; color: ${T.corporate.text}; }
  body { width: ${width}px; height: ${height}px; }
  ${extraCss}
</style>
`;
}

export function wrap({ width, height, body, extraCss = '' }) {
  return `<!DOCTYPE html><html><head>${corporateHead({ width, height, extraCss })}</head><body>${body}</body></html>`;
}
