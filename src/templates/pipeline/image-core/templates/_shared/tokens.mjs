// JS-side view of tokens.json. Re-exports as an ESM module so templates
// can import with `import T from '.../tokens.mjs'` instead of parsing JSON.
// Kept in sync manually — tokens.json is still the source of truth for docs.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(HERE, '..', '..', 'tokens.json');

const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

export default tokens;
export const brand = tokens.brand;
export const notebook = tokens.notebook;
export const corporate = tokens.corporate;
export const code = tokens.code;
export const fonts = tokens.fonts;
