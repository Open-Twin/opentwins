# Changelog

All notable changes to this project will be documented in this file.

## [2026.4.12] - 2026-04-11

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

## [2026.4.11] - 2026-04-11

### Changed
- Switched to calendar versioning (CalVer): YYYY.M.D
- Templatized all SOUL and HEARTBEAT files - domain content now driven by config
- Rebuilt all platform agent templates from reference repo
- Added browser cleanup worker to Bree scheduler
- Open-source repo setup: LICENSE, CONTRIBUTING, CI, branch protection

## [0.1.0] - 2026-04-10

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
