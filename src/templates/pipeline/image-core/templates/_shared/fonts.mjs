// Self-hosted font detection + CSS block generation.
// Runtime behavior:
//   - If ALL required font files exist locally (either .woff2 or .ttf),
//     inline fonts.css with file:// URLs so Chrome headless loads them
//     deterministically.
//   - Otherwise fall back to Google Fonts CDN link (dev convenience).
//     Server startup logs a warning so this state is visible.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = join(HERE, 'fonts');
const FONTS_CSS_PATH = join(HERE, 'fonts.css');

// Bases required by the current template set (stack/matrix/venn).
// note + carousel use system fonts only.
export const REQUIRED_FONT_BASES = [
  'DMSerifDisplay-Regular',
  'DMSerifDisplay-Italic',
  'JetBrainsMono-Variable',
];

export function fontsAvailableLocally() {
  return REQUIRED_FONT_BASES.every((base) =>
    existsSync(join(FONTS_DIR, `${base}.woff2`))
    || existsSync(join(FONTS_DIR, `${base}.ttf`))
  );
}

export function fontsBlock() {
  if (fontsAvailableLocally()) {
    const css = readFileSync(FONTS_CSS_PATH, 'utf8')
      .replace(/url\('fonts\//g, `url('file://${FONTS_DIR}/`);
    return `<style>${css}</style>`;
  }
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">`;
}
