# OpenTwins

[![CI](https://github.com/Open-Twin/opentwins/actions/workflows/ci.yml/badge.svg)](https://github.com/Open-Twin/opentwins/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/opentwins.svg)](https://www.npmjs.com/package/opentwins)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

Your autonomous digital twins across every social platform. [opentwins.ai](https://opentwins.ai)

> Deploy AI agents that engage on LinkedIn, Twitter/X, Reddit, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, and Indie Hackers - using your identity, voice, and content strategy. Powered by Claude.

OpenTwins deploys AI agents that engage on Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, and Indie Hackers - using your identity, voice, and content strategy.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://github.com/anthropics/claude-code) CLI (`npm install -g @anthropic-ai/claude-code`)


## Quick Start

```bash
# Install from npm
npm install -g opentwins

# Initialize - launches a web wizard in your browser
opentwins init

# Launch OpenTwins (scheduler + dashboard) as a background daemon
opentwins start -d   # dashboard at http://localhost:3847
```

Browser profiles for each platform are set up from the dashboard — no CLI step needed.

`opentwins init` checks prerequisites, starts the dashboard, and opens a setup wizard at `http://localhost:3847/setup`. The wizard walks you through authentication, identity, platforms, voice, and schedule — no CLI prompts.

If you prefer the old interactive CLI flow (useful for headless or scripted installs), pass `--cli`:

```bash
opentwins init --cli
```

## Install from Source

```bash
git clone https://github.com/Open-Twin/opentwins.git
cd opentwins

# Install dependencies
npm install
cd src/ui/client && npm install && cd ../../..

# Build
npm run build

# Link globally
npm link

# Verify
opentwins --version
```

## Commands

```
opentwins init              Launch the web setup wizard (default)
opentwins init --cli        Interactive CLI setup (fallback, headless-friendly)
opentwins init --force      Overwrite an existing config
opentwins start             Start scheduler + dashboard (foreground)
opentwins start -d          Same, as a detached background daemon
opentwins stop              Stop the daemon (scheduler + dashboard)
opentwins status            Show agent states and schedule

opentwins run reddit        Run one agent manually
opentwins run pipeline      Run the content pipeline

opentwins browser health    Check all browser sessions
opentwins browser list      List configured profiles

opentwins config show       View current configuration
opentwins logs reddit       View today's activity log
opentwins audit reddit      View today's quality metrics
```

## How It Works

### Platform Agents (10)

Each platform has an autonomous agent that runs hourly during your active hours:

| Platform | Actions |
|----------|---------|
| Reddit | Comments, posts, upvotes, karma building |
| Twitter/X | Replies, tweets, threads, articles, quote tweets |
| LinkedIn | Comments, posts, articles, connection requests |
| Bluesky | Comments, posts, quotes |
| Threads | Comments, posts, quotes |
| Medium | Responses, claps, articles |
| Substack | Comments, notes, newsletters, restacks |
| Dev.to | Comments, articles, reactions |
| Product Hunt | Comments, upvotes, forum engagement |
| Indie Hackers | Comments, posts |

### Content Pipeline (7 stages)

Runs daily to generate fresh content for all platforms:

1. **Trend Scout** - Predicts trending topics
2. **Competitive Intel** - Monitors competitor activity
3. **Engagement Tracker** - Tracks post performance
4. **Network Mapper** - Maps engagement targets
5. **Amplification** - Identifies content to amplify
6. **Content Planner** - Generates daily content brief
7. **Content Writer** - Creates platform-specific content

### Web Dashboard

Access at `http://localhost:3847` when OpenTwins is running (`opentwins start` or `opentwins start -d`). The dashboard can control the scheduler daemon via the Automation On/Off button.

- **Command** — Mission control: KPI cards (agents, runs, tool calls, automation), platform agent cards, recent runs table, content pipeline flow
- **Agents** — Per-agent controls with hero panel (run/stop/remove), today's stats, limits with progress bars, behavior tuning, today's schedule, live activity feed from the latest Claude session
- **Activity** — Sessions grouped by run, each expandable to show the full event feed (thinking, tool calls, errors) with filter chips by event kind
- **Quality** — Today's snapshot KPIs with health coloring, trend charts (volume, disagreement rate, word density, style distribution) over 7/14/30 days
- **Config** — Identity, professional context, content pillars, voice, schedule, and pipeline settings. Saving regenerates agent files automatically

## Architecture

```
~/.opentwins/
  config.json              Your identity and settings
  data.db                  SQLite database (activity, quality, runs)
  workspaces/
    promo-assistant-reddit/   Agent workspace (per platform)
    promo-assistant-twitter/
    ...
    pipeline/                 Content pipeline workspace
  browser-profiles/           Chrome profiles (per platform)
  locks/                      Agent run locks
  logs/                       Execution logs
```

OpenTwins uses:
- **Claude Code** as the AI brain (runs agents via `claude` CLI)
- **Chrome CDP** for browser automation (built-in)
- **Bree** for in-process job scheduling
- **SQLite** for activity tracking and quality metrics
- **Handlebars** templates for identity-swappable agent configs

## Configuration

After `opentwins init`, your config lives at `~/.opentwins/config.json`. Edit it via the web dashboard's **Config** tab or re-run `opentwins init --force` to start the wizard from scratch.

### Authentication

Two options:
- **Claude Code subscription** — Uses OAuth token from `claude setup-token`
- **Anthropic API key** — Uses API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

The setup wizard validates credentials before saving, so you'll know immediately if the token is wrong.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
