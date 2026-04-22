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
  // Square canvases: virtual 1200×1200 scaled to fit (existing behavior).
  // Non-square canvases: body matches actual viewport — templates author
  // for the real dimensions (e.g. banner 1000×420).
  const isSquare = width === height;
  const scale = isSquare ? Math.min(width, height) / REF_SIZE : 1;
  const bodyWidth = isSquare ? REF_SIZE : width;
  const bodyHeight = isSquare ? REF_SIZE : height;
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
    background: transparent;
  }
  body {
    width: ${bodyWidth}px;
    height: ${bodyHeight}px;
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
