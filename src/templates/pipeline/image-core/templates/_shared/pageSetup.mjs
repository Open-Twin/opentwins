// Minimal page scaffolding shared by all image-core templates.
// Provides <head> with font faces + reset CSS + @page size.
// Each template layers its own CSS on top via `extraCss`.
//
// Canvas scaling:
//   All templates design for a 1200×1200 virtual canvas. The actual canvas
//   dimensions come from routing (platform-specific). We keep the body at
//   the virtual 1200×1200 and scale it via CSS transform so templates don't
//   need to know about the real dimensions. Uniform scale = min(width,
//   height) / REF_SIZE. At 1200×1200 scale is 1.0 (no-op). At 1080×1080
//   scale is 0.9 (10% smaller render). Works for any square canvas; for
//   non-square the body sits top-left and the html bg shows below.

import { fontsBlock } from './fonts.mjs';

const REF_SIZE = 1200;

export function pageHead({ width, height, extraCss = '' }) {
  const scale = Math.min(width, height) / REF_SIZE;
  return `
<meta charset="utf-8">
${fontsBlock()}
<style>
  @page { size: ${width}px ${height}px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  html {
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    /* Match body bg so any uncovered area (non-square canvases) blends. */
    background: transparent;
  }
  body {
    /* Always render at the 1200×1200 virtual canvas; templates write their
       CSS as if the canvas were always 1200. The transform below scales it
       to fit the real viewport dimensions. */
    width: ${REF_SIZE}px;
    height: ${REF_SIZE}px;
    margin: 0;
    transform-origin: top left;
    transform: scale(${scale});
  }
  ${extraCss}
</style>
`;
}

export function wrapDoc({ width, height, body, extraCss = '' }) {
  return `<!DOCTYPE html><html><head>${pageHead({ width, height, extraCss })}</head><body>${body}</body></html>`;
}
