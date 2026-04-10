# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-10

### Added
- Initial release of OpenTwins
- Support for 10 platforms: LinkedIn, Twitter/X, Reddit, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers
- CLI with `init`, `run`, `browser setup` commands
- Web dashboard with 6 tabs: Command, Agents, Activity, Usage, Quality, Config
- Web setup wizard for onboarding
- Per-agent interval control with completion-based scheduling
- Browser profile management via OpenClaw
- Session parsing and activity feed from Claude JSONL files
- Content pipeline with daily schedule generation
- Handlebars-based template system for all platform agent files
- Browser cleanup worker (tab cleanup + zombie Chrome killer)
- Health monitoring for OpenClaw gateway and Claude status
- Marketing website at opentwins.ai with blog and SEO
