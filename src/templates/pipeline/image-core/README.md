# image-core

Platform-agnostic image rendering service for OpenClaw promo agents. Takes `{platform, layout, data}` and returns a PNG/PDF at the correct dimensions for that platform.

**Status:** parallel to the legacy `workspace/content-writer/templates/render-*.mjs` scripts. Agents and pipelines are unchanged. Migration plan at bottom.

---

## Why

The legacy pipeline has three separate `render-*.mjs` files (850 LOC total) with triplicated HTML/CSS scaffolding, hardcoded dimensions per file, Google Fonts CDN on the render path, and no way for Content Writer or Planner to preview images before emitting spec JSON. `image-core` consolidates that into one service with:

- **Routing table**: `{platform, layout}` → dimensions + template. One place to add new platforms.
- **Shared templates**: layout lives with the template, platform only picks dimensions. Stack on LinkedIn == stack on Twitter.
- **Self-hosted fonts**: no CDN dependency at render time.
- **Content-addressable cache**: `cache/{specHash}.{png,pdf,html,meta.json}`. Deterministic — same spec produces same hash produces same PNG.
- **Template versioning in spec-hash**: bump `TEMPLATE_VERSION` in a template file and the cache automatically busts.
- **HTML retained for debug**: every render keeps the intermediate HTML at `cache/{specHash}.html` for iteration.
- **Preview endpoint**: `GET /preview?platform=X&layout=Y` renders with the template's `preview.json` and returns the image inline. Open it in a browser, tweak the template, refresh.
- **Schema endpoint**: `GET /schemas` exposes JSON Schema for each layout — Writer/Planner can query to know what they can emit.

---

## Install (one-time)

```bash
cd <pipeline-workspace>/image-core

# 1. Download self-hosted fonts (Kalam + Caveat).
#    If you have `woff2_compress` (brew install woff2) you'll get .woff2;
#    otherwise .ttf files and fonts.css is rewritten to match.
npm run download-fonts

# 2. Start the server (127.0.0.1:47293).
bash scripts/start-dev.sh
# or
npm run dev

# 3. Verify.
curl -s http://127.0.0.1:47293/health | jq .

# In another shell:
npm test                   # smoke test against the running server
node cli.mjs preview --platform linkedin --layout stack --open
```

To keep the service running in the background, wire it into your OS service manager of choice (launchd on macOS, systemd on Linux, NSSM on Windows).

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/render` | `{platform, layout, data, force?}` → `{path, width, height, format, specHash, cacheHit, route, durationMs}` |
| GET | `/preview?platform=&layout=[&data=<base64 json>]` | Inline image/PDF. Uses template's `preview.json` when `data` omitted. |
| GET | `/schemas` | All layout data schemas. |
| GET | `/schemas/:layout` | Single layout schema. |
| GET | `/routes` | Platform+layout → dimensions routing table. |
| GET | `/health` | Liveness, Chrome resolved, fonts present, queue, cache stats. |
| GET | `/debug/:hash/html` | Intermediate HTML for a recent render (iteration). |
| GET | `/debug/:hash/meta` | Render metadata sidecar. |
| GET | `/` | Endpoint index. |

**Status codes:** 200 ok, 400 invalid route / bad request, 422 invalid data (`errors` array in body), 429 queue full, 500 render failed, 503 Chrome unavailable.

---

## CLI

Same core as the server, for scripted use.

```bash
node cli.mjs render --platform linkedin --layout stack --data path/to/data.json --out out.png
node cli.mjs preview --platform substack --layout note --open
node cli.mjs routes
node cli.mjs schemas stack
node cli.mjs cache-stats
node cli.mjs cache-purge --max-age-days 14
node cli.mjs health
```

---

## Layouts

Five layouts ship with this build, all ported from the legacy renderers:

| Layout | Aesthetic | Dimensions | Used by |
|---|---|---|---|
| `stack` | Notebook (Kalam + Caveat) | 1200×1200 PNG | `linkedin/twitter/bluesky + stack` |
| `matrix` | Notebook | 1200×1200 PNG | `linkedin/twitter/bluesky + matrix` |
| `venn` | Notebook | 1200×1200 PNG | `linkedin/twitter/bluesky + venn` |
| `note` | Corporate (sans, dark navy, brand-blue) | 1080² / 1200² PNG | `linkedin/twitter/bluesky + note` (1200²), `substack + note` (1080²) |
| `carousel` | Corporate | 1080×1080 × 10-page PDF | `linkedin + carousel` |

**Two aesthetics intentionally coexist.** Notebook = sketched, handwriting, used where content reads as thinking-in-progress. Corporate = polished, used for Substack Notes and LinkedIn document carousels where content reads as finished.

---

## Data shape

```js
// POST /render
{
  "platform": "linkedin",    // linkedin | twitter | bluesky | substack
  "layout":   "stack",       // stack | matrix | venn | note | carousel
  "data":     { ... },       // layout-specific; see /schemas/:layout
  "force":    false          // optional: skip cache lookup
}

// 200 response
{
  "path":     "/abs/path/to/cache/{hash}.png",
  "width":    1200,
  "height":   1200,
  "format":   "png",
  "specHash": "a1b2c3d4e5f60708",
  "cacheHit": false,
  "route":    "linkedin/stack",
  "durationMs": 1247
}
```

Caller owns lifecycle of the file after `path` is returned. If you need a copy at a specific path, `copyFileSync(result.path, myPath)`.

---

## Spec hashing

`specHash = sha256(canonical({platform, layout, data, templateVersion, tokensVersion, routingVersion, renderVersion})).slice(0,16)`

- `templateVersion` — constant exported by each template module; bump when that template's output changes.
- `tokensVersion` — content hash of `tokens.json`; changes automatically when you edit a color/font.
- `routingVersion` — content hash of `routing.json`; changes when you add a route or tweak dimensions.
- `renderVersion` — constant in `lib/render.mjs`; bump when render pipeline semantics change.

Effect: changing a template busts only that template's cache entries; changing tokens busts everything; identical specs in two calls hit cache.

---

## Operational notes

- **Binds to 127.0.0.1 by default** — localhost only. Not auth-protected; don't expose beyond the machine.
- **Serial queue** (`QUEUE_CONCURRENCY=1` default). Chrome spawns per render. Bump up only if you observe a bottleneck; returns 429 when queue depth exceeds `QUEUE_MAX_DEPTH` (default 10).
- **Cache lives at `cache/`** — gitignored. `scripts/cleanup-cache.sh` prunes entries older than 30 days; wire into cron daily.
- **Logs live at `logs/YYYY-MM-DD.log`** — one JSON line per request.
- **Slack alerts on 5xx** via `SLACK_TOKEN` + `IMAGE_CORE_SLACK_CHANNEL` env vars. Silent if unset.

---

## Configuration

Env vars (all optional):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `47293` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `QUEUE_CONCURRENCY` | `1` | Parallel Chromes allowed |
| `QUEUE_MAX_DEPTH` | `10` | Reject with 429 beyond this |
| `NODE_ENV` | `production` | `development` also logs to stderr |
| `SLACK_TOKEN` | — | Slack bot token for failure alerts |
| `IMAGE_CORE_SLACK_CHANNEL` | — | Channel for failure alerts |

---

## Migration plan (agents + content-writer)

This build does **not** touch agents or content-writer. Legacy `render-*.mjs` scripts continue to work. When you're ready to migrate:

1. **Writer/Planner first** (greenfield callers). Both can start calling `GET /preview` during generation to sanity-check visuals before emitting spec JSON.
2. **Content-writer second** (optional). Replace the inline `render-*.mjs` invocations in `workspace/content-writer/` with CLI shims that call image-core:
   ```bash
   # Legacy: node render-post-image.mjs spec.json out.png
   # Equivalent via image-core CLI:
   node /path/to/workspace/image-core/cli.mjs render \
     --platform linkedin --layout stack --data spec.json --out out.png
   ```
3. **Platform agents last**. Once Writer/content-writer have been stable on image-core for a week, update each `BROWSER-*.md` to call the image-core CLI (or `curl` the HTTP endpoint) instead of the legacy renderers. Delete legacy `render-*.mjs` only after all platform agents are migrated + 1 additional week stable.

Rollback path at each step: revert the single file change, legacy renderers still exist.

---

## What's deliberately NOT here

- **No auth / rate limits beyond queue** — localhost only, single user.
- **No persistent Chrome via CDP** — premature at 5 images/day. Each render spawns a fresh Chrome (matches legacy behavior, ~1s cold start).
- **No job queue / async renders** — sync with 15–30s Chrome timeout per request.
- **No S3/CDN** — caller handles file upload; `path` points into local cache.
- **No visual regression tests** — add later if templates start drifting. `/preview` + browser refresh is the current iteration loop.
- **No EXIF stripping** — Chrome headless doesn't write EXIF.
- **No template hot-reload** — restart server to pick up template changes in development. The preview endpoint is fast enough that this isn't painful.

---

## File layout

```
<pipeline-workspace>/image-core/
  README.md
  package.json                ← zero-deps Node.js app
  .gitignore
  routing.json                ← platform+layout → dims + template
  tokens.json                 ← design tokens (source of truth)
  server.mjs                  ← HTTP server
  cli.mjs                     ← CLI wrapping same core

  lib/
    render.mjs                ← main orchestrator
    chrome.mjs                ← Chrome invocation (execFile)
    cache.mjs                 ← content-addressable cache
    hash.mjs                  ← spec hashing (sha256, canonicalized)
    escape.mjs                ← HTML escaping + multiline
    validate.mjs              ← schema validation primitives
    routing.mjs               ← routing.json loader + resolver
    queue.mjs                 ← bounded render queue
    alert.mjs                 ← Slack alerting on 5xx
    errors.mjs                ← typed errors → HTTP status codes

  templates/
    _shared/
      tokens.mjs              ← JS-side tokens export
      fonts.css               ← self-hosted @font-face
      fonts/                  ← populated by scripts/download-fonts.sh
      notebook.mjs            ← notebook aesthetic wrapper
      corporate.mjs           ← corporate aesthetic wrapper
    stack/
      template.mjs            ← render(data, {w,h}) + validate(data) + TEMPLATE_VERSION
      preview.json            ← sample data for /preview endpoint
    matrix/ ...
    venn/ ...
    note/ ...
    carousel/ ...

  schemas/
    stack.schema.json         ← exposed via /schemas/:layout
    matrix.schema.json
    venn.schema.json
    note.schema.json
    carousel.schema.json

  scripts/
    download-fonts.sh
    cleanup-cache.sh
    start-dev.sh

  test/
    smoke.mjs                 ← end-to-end test against running server

  cache/                      ← gitignored
  logs/                       ← gitignored
```
