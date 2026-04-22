// Hand-rolled schema validation matching existing renderers' assertions.
// Each template module also exports its own validate() as the authoritative
// check; this module provides reusable primitives.

import { InvalidDataError } from './errors.mjs';

export function requireString(obj, field, { minLen = 1, maxLen = Infinity } = {}) {
  const v = obj[field];
  if (v === undefined || v === null || typeof v !== 'string') {
    return `${field}: string required`;
  }
  if (v.length < minLen) return `${field}: too short (min ${minLen})`;
  if (v.length > maxLen) return `${field}: too long (max ${maxLen})`;
  return null;
}

export function requireArray(obj, field, { minLen = 0, maxLen = Infinity, exactLen } = {}) {
  const v = obj[field];
  if (!Array.isArray(v)) return `${field}: array required`;
  if (exactLen !== undefined && v.length !== exactLen) {
    return `${field}: must have exactly ${exactLen} entries (got ${v.length})`;
  }
  if (v.length < minLen) return `${field}: too few entries (min ${minLen})`;
  if (v.length > maxLen) return `${field}: too many entries (max ${maxLen})`;
  return null;
}

export function requireEnum(obj, field, values) {
  const v = obj[field];
  if (!values.includes(v)) return `${field}: must be one of ${values.join(', ')} (got ${JSON.stringify(v)})`;
  return null;
}

export function requireWords(obj, field, { min, max }) {
  const s = obj[field];
  if (typeof s !== 'string') return `${field}: string required`;
  const n = s.trim().split(/\s+/).filter(Boolean).length;
  if (n < min || n > max) return `${field}: must be ${min}–${max} words (got ${n})`;
  return null;
}

// Collect non-null errors. Throws InvalidDataError if any.
export function throwIfErrors(errors, layout) {
  const flat = errors.flat().filter(Boolean);
  if (flat.length === 0) return;
  throw new InvalidDataError(`invalid data for layout "${layout}"`, { errors: flat });
}
