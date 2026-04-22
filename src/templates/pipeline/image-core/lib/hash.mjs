import { createHash } from 'node:crypto';

// Stable JSON stringification: sort keys at every level so identical data
// with different key order produces identical hashes.
function canonicalize(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const sorted = {};
  for (const key of Object.keys(v).sort()) sorted[key] = canonicalize(v[key]);
  return sorted;
}

export function hashSpec({ platform, layout, data, templateVersion, tokensVersion, renderVersion, routingVersion }) {
  const canonical = JSON.stringify({
    platform,
    layout,
    data: canonicalize(data),
    templateVersion,
    tokensVersion,
    renderVersion,
    routingVersion,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// Hash of a file's bytes. Used for tokens.json / routing.json fingerprints
// so cache invalidates when either changes.
export function hashBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}
