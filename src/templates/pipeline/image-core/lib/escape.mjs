// HTML escaping + limited multiline helper. Every user-supplied string that
// ends up inside a template MUST go through one of these.

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]);
}

// Escape HTML, then convert raw newlines to <br/>. Used for doodles/labels
// that legitimately contain multi-line content. Still escapes everything else.
export function multiline(s) {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

// For regex-based operations on already-escaped content (e.g. note accent match)
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
