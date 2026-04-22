import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBuffer } from './hash.mjs';
import { InvalidRouteError } from './errors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTING_PATH = join(HERE, '..', 'routing.json');
const TOKENS_PATH = join(HERE, '..', 'tokens.json');

let _cached = null;
let _routingMtime = 0;
let _tokensMtime = 0;

function load() {
  const routingStat = statSync(ROUTING_PATH);
  const tokensStat = statSync(TOKENS_PATH);
  if (
    _cached
    && routingStat.mtimeMs === _routingMtime
    && tokensStat.mtimeMs === _tokensMtime
  ) {
    return _cached;
  }

  const routingRaw = readFileSync(ROUTING_PATH);
  const tokensRaw = readFileSync(TOKENS_PATH);
  const routing = JSON.parse(routingRaw.toString('utf8'));
  const tokens = JSON.parse(tokensRaw.toString('utf8'));

  _cached = {
    routing,
    tokens,
    tokensVersion: hashBuffer(tokensRaw),
    routingVersion: hashBuffer(routingRaw),
  };
  _routingMtime = routingStat.mtimeMs;
  _tokensMtime = tokensStat.mtimeMs;
  return _cached;
}

export function allRoutes() {
  return load().routing.routes;
}

export function allPlatforms() {
  const routes = allRoutes();
  return [...new Set(Object.keys(routes).map((k) => k.split('/')[0]))];
}

export function allLayouts(platform) {
  return Object.keys(allRoutes())
    .filter((k) => k.startsWith(`${platform}/`))
    .map((k) => k.split('/')[1]);
}

export function resolveRoute(platform, layout) {
  if (!platform || !layout) {
    throw new InvalidRouteError('platform and layout are required', { platform, layout });
  }
  const key = `${platform}/${layout}`;
  const routes = allRoutes();
  if (!routes[key]) {
    throw new InvalidRouteError(
      `unknown route "${key}"`,
      { platform, layout, available: Object.keys(routes) },
    );
  }
  const { routing } = load();
  return {
    key,
    platform,
    layout,
    ...routes[key],
    deviceScaleFactor: routing.defaults.deviceScaleFactor,
    chromeTimeoutMs: routing.defaults.chromeTimeoutMs,
  };
}

export function tokens() {
  return load().tokens;
}

export function versions() {
  const { tokensVersion, routingVersion } = load();
  return { tokensVersion, routingVersion };
}
