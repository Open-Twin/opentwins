import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoute, versions } from './routing.mjs';
import { hashSpec } from './hash.mjs';
import * as cache from './cache.mjs';
import { renderPng, renderPdf } from './chrome.mjs';
import { validateSchema } from './jsonschema.mjs';
import { InvalidDataError, TemplateNotFoundError } from './errors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, '..', 'templates');
const SCHEMAS_DIR = join(HERE, '..', 'schemas');

// Incremented when render.mjs or chrome.mjs semantics change in a way that
// should bust the cache. Bump manually when you change rendering behavior.
export const RENDER_VERSION = '2026-04-20-c';

const _templateCache = new Map();
const _schemaCache = new Map();

function loadSchema(name) {
  if (_schemaCache.has(name)) return _schemaCache.get(name);
  const path = join(SCHEMAS_DIR, `${name}.schema.json`);
  const schema = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  _schemaCache.set(name, schema);
  return schema;
}

async function loadTemplate(name) {
  if (_templateCache.has(name)) return _templateCache.get(name);
  const path = join(TEMPLATES_DIR, name, 'template.mjs');
  let mod;
  try {
    mod = await import(path);
  } catch (e) {
    throw new TemplateNotFoundError(
      `template "${name}" failed to load`,
      { path, cause: String(e.message || e) },
    );
  }
  if (typeof mod.render !== 'function' || typeof mod.validate !== 'function') {
    throw new TemplateNotFoundError(
      `template "${name}" must export render() and validate()`,
      { path },
    );
  }
  _templateCache.set(name, mod);
  return mod;
}

// Core render. Used by both HTTP server and CLI.
// Returns: { path, width, height, format, specHash, cacheHit, route, durationMs }
export async function render({ platform, layout, data, force = false }) {
  const started = Date.now();
  const route = resolveRoute(platform, layout);
  const template = await loadTemplate(route.template);
  const input = data || {};

  // Two-layer validation. Schema catches structural issues (types, shape,
  // enums, word counts). Template's hand-rolled validate catches semantic
  // rules the schema can't express. Both run; errors combined.
  const schema = loadSchema(route.template);
  const schemaErrors = schema ? validateSchema(schema, input) : [];
  const templateCheck = template.validate(input);
  const combined = [...schemaErrors, ...(templateCheck.ok ? [] : templateCheck.errors)];
  if (combined.length > 0) {
    throw new InvalidDataError(
      `invalid data for ${platform}/${layout}`,
      { errors: combined },
    );
  }

  const { tokensVersion, routingVersion } = versions();
  const specHash = hashSpec({
    platform,
    layout,
    data,
    templateVersion: template.TEMPLATE_VERSION,
    tokensVersion,
    renderVersion: RENDER_VERSION,
    routingVersion,
  });

  const outputPath = cache.outputPath(specHash, route.format);

  if (!force) {
    const hit = cache.getOutput(specHash, route.format);
    if (hit) {
      return {
        path: hit,
        width: route.width,
        height: route.height,
        format: route.format,
        specHash,
        cacheHit: true,
        route: route.key,
        durationMs: Date.now() - started,
      };
    }
  }

  const html = template.render(data, { width: route.width, height: route.height });
  const htmlPath = cache.writeHtml(specHash, html);

  if (route.format === 'pdf') {
    await renderPdf({
      htmlPath,
      outPath: outputPath,
      width: route.width,
      height: route.height,
      timeoutMs: route.chromeTimeoutMs * 2,
    });
  } else {
    await renderPng({
      htmlPath,
      outPath: outputPath,
      width: route.width,
      height: route.height,
      deviceScaleFactor: route.deviceScaleFactor,
      timeoutMs: route.chromeTimeoutMs,
    });
  }

  cache.writeMeta(specHash, {
    platform,
    layout,
    route: route.key,
    width: route.width,
    height: route.height,
    format: route.format,
    templateVersion: template.TEMPLATE_VERSION,
    tokensVersion,
    routingVersion,
    renderVersion: RENDER_VERSION,
    renderedAt: new Date().toISOString(),
  });

  return {
    path: outputPath,
    width: route.width,
    height: route.height,
    format: route.format,
    specHash,
    cacheHit: false,
    route: route.key,
    durationMs: Date.now() - started,
  };
}
