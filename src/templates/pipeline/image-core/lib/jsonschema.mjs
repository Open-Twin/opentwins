// Minimal JSON Schema validator. Supports the subset we use:
//   type (string/array/object/boolean/number/null)
//   required, properties, additionalProperties (false only)
//   items (single schema, not tuple)
//   minItems, maxItems
//   minLength
//   enum
//   x-word-range: [min, max]   (custom — whitespace-separated word count)
//
// Kept deliberately tiny and zero-dep. Not a general-purpose validator —
// if you add constructs to a schema that aren't listed above, extend here.

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  null: (v) => v === null,
};

function formatPath(path) {
  if (!path.length) return 'data';
  return path.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? seg : `.${seg}`)).join('');
}

function wordCount(s) {
  return String(s).trim().split(/\s+/).filter(Boolean).length;
}

export function validateSchema(schema, data, path = []) {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  // type
  if (schema.type) {
    const check = TYPE_CHECKS[schema.type];
    if (check && !check(data)) {
      const actual = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
      errors.push(`${formatPath(path)}: expected ${schema.type}, got ${actual}`);
      return errors; // no point checking deeper
    }
  }

  // enum
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${formatPath(path)}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')} (got ${JSON.stringify(data)})`);
  }

  // string
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${formatPath(path)}: minLength ${schema.minLength}, got ${data.length}`);
    }
    if (schema['x-word-range']) {
      const [min, max] = schema['x-word-range'];
      const n = wordCount(data);
      if (n < min || n > max) {
        errors.push(`${formatPath(path)}: must be ${min}–${max} words (got ${n})`);
      }
    }
  }

  // array
  if (schema.type === 'array') {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`${formatPath(path)}: minItems ${schema.minItems}, got ${data.length}`);
    }
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${formatPath(path)}: maxItems ${schema.maxItems}, got ${data.length}`);
    }
    if (schema.items) {
      data.forEach((item, i) => {
        errors.push(...validateSchema(schema.items, item, [...path, i]));
      });
    }
  }

  // object
  if (schema.type === 'object') {
    if (schema.required) {
      for (const k of schema.required) {
        if (data[k] === undefined) errors.push(`${formatPath([...path, k])}: required`);
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (data[k] !== undefined) {
          errors.push(...validateSchema(sub, data[k], [...path, k]));
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const k of Object.keys(data)) {
        if (!(k in schema.properties)) {
          errors.push(`${formatPath([...path, k])}: unexpected property`);
        }
      }
    }
  }

  return errors;
}
