# Changelog

All notable changes to this project will be documented in this file.

## 2026.4.15

### Scheduler & CLI

**New**
- `start` is now a unified launcher — scheduler + dashboard run together; `start -d` runs both as a detached daemon
- Re-running `start` while a daemon is up restarts cleanly (stops the old one first)

**Improved**
- Idle 5-minute cron cycles are silent — only real heartbeats and errors print to stdout
- README quick-start drops the browser CLI commands (setup is in the dashboard); `browser health` and `browser list` kept as debug helpers

**Fixed**
- Editing an agent's interval/auto-run in the dashboard no longer drops the UI session (in-place scheduler reload)
- Trailing `undefined` removed from worker logs

**Removed**
- Standalone `opentwins ui` command (dashboard now bundled into `start`)

### Dashboard

**New**
- 24h timeframe with hourly buckets in Usage and Quality tabs
- Pipeline stage state and run timing surfaced in the UI

**Fixed**
- Quality 24h hour labels no longer double-apply timezone
- Pie chart labels moved outside the donut with connector lines

**Improved**
- Default per-platform limits lowered to safer starting values

### Templates

**New**
- "Handling Clarifying Questions on Your Own Comments" guidance across all 10 platform SOULs
- Per-conversation caps: Medium 3 replies/author/day, PH 3 comments/thread/day
- LinkedIn: article days (Tue/Fri) skip `publish_post` to avoid feed flooding

**Fixed**
- `today_summary.json` updates require Read before Write (avoids `printf` non-ASCII crashes under non-UTF-8 locales)
- `devto-api.sh` and `ph-api.sh` referenced by full path everywhere (bare names didn't resolve without `scripts/` on PATH)
- `limits.json` history trimmed at daily/weekly reset (linkedin/devto/twitter) — was growing unbounded and tripping Read tool's 10k-token cap
- IH post-body selectors handle both `/post/{slug}` (Ember) and `/product/?post=` (Firestore) renderers
- Medium RSS fetch scoped with grep at curl time — raw feed was overflowing harness output cap
- Decorative `exec` prefix stripped from utility commands (was breaking `&&` / `||` chains)

### Website

**New**
- SEO + share polish: favicons, Twitter cards, RSS, manifest, 404, breadcrumbs
- IndexNow key hosted for Bing/Yandex fast indexing
- Homepage links all blog posts directly

## 2026.4.12

### Added
- Built-in Chrome CDP browser automation (replaces OpenClaw dependency)
- Browser HTTP API at `/api/browser/:profile/*` - agents use curl instead of spawning Node processes
- Auto-start Chrome on any browser API call
- Comprehensive E2E test suite (119 tests: config, generator, templates, session parser, quality)
- Logo in dashboard nav, website header/footer, and favicon
- Browser JS enforcement rule in all HEARTBEAT templates

### Changed
- Full templatization of SOUL, HEARTBEAT, IDENTITY, TOOLS, PLAYBOOK, BROWSER-* files across platforms and pipeline
- Removed ALL hardcoded PM/AI domain content - templates fully domain-agnostic
- Content planner pillar balance guardrail and audience safety checks
- Quality tab reads from workspace JSON files (no SQLite dependency)
- Compact Agents page layout
- Sticky "Complete Setup" button on review step

### Fixed
- Session duration calculation (was showing 0)
- `lastRun` persistence across server restarts
- `limits.json` preserved on workspace regeneration
- LinkedIn notification dedup URL-encoding mismatch
- Pie chart label visibility on dark background
- Stop agent now closes browser
- TypeScript ES2023 lib for `Array.findLast()`

### Removed
- OpenClaw dependency (fully replaced with built-in CDP)
- 3 non-core pipeline agents (conference-scout, job-scout, pr-media-monitor)
- Separate browser-cleanup worker (merged into ensureChrome)

## 2026.4.11

### Changed
- Switched to calendar versioning (CalVer): YYYY.M.D
- Templatized all SOUL and HEARTBEAT files - domain content now driven by config
- Rebuilt all platform agent templates from reference repo
- Added browser cleanup worker to Bree scheduler
- Open-source repo setup: LICENSE, CONTRIBUTING, CI, branch protection

## 0.1.0

### Added
- Initial release of OpenTwins
- Support for 10 platforms: LinkedIn, Twitter/X, Reddit, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers
- CLI with `init`, `run`, `browser setup` commands
- Web dashboard with 6 tabs: Command, Agents, Activity, Usage, Quality, Config
- Web setup wizard for onboarding
- Per-agent interval control with completion-based scheduling
- Browser profile management via Chrome CDP
- Session parsing and activity feed from Claude JSONL files
- Content pipeline with daily schedule generation
- Handlebars-based template system for all platform agent files
- Browser cleanup worker (tab cleanup + zombie Chrome killer)
- Health monitoring for Chrome profiles and Claude status
- Marketing website at opentwins.ai with blog and SEO
