# OpenTwins

Your autonomous digital twins across every social platform.

OpenTwins deploys AI agents that engage on Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, and Indie Hackers - using your identity, voice, and content strategy.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://github.com/anthropics/claude-code) CLI (`npm install -g @anthropic-ai/claude-code`)
- [OpenClaw](https://github.com/nicepkg/openclaw) CLI for browser automation (`npm install -g openclaw`)

## Quick Start

```bash
# Install from npm
npm install -g opentwins

# Initialize - walks you through identity, platforms, and auth
opentwins init

# Set up browser profiles (one per platform)
opentwins browser setup reddit
opentwins browser setup twitter
opentwins browser setup linkedin
# ... repeat for each platform

# Start everything (scheduler + dashboard)
opentwins start --ui
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
opentwins init              Set up your identity, platforms, and auth
opentwins start             Start the agent scheduler
opentwins start --ui        Start scheduler + web dashboard
opentwins start -d          Start as background daemon
opentwins stop              Stop the daemon
opentwins status            Show agent states and schedule

opentwins run reddit        Run one agent manually
opentwins run pipeline      Run the content pipeline

opentwins browser setup <platform>   Create browser profile + login
opentwins browser login <platform>   Re-login to expired session
opentwins browser health             Check all browser sessions
opentwins browser list               List configured profiles

opentwins config show       View current configuration
opentwins ui                Start web dashboard only

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

Access at `http://localhost:3847` when running `opentwins start --ui` or `opentwins ui`.

- **Command** - Agent status, pipeline status, recent runs, quality overview
- **Agents** - Per-agent controls: run/stop, edit limits, view schedule
- **Activity** - Searchable log of all posted content
- **Quality** - Style distribution, disagreement rate, word count trends
- **Config** - Edit identity, platforms, and settings live

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
- **OpenClaw** for browser automation (CDP-based)
- **Bree** for in-process job scheduling
- **SQLite** for activity tracking and quality metrics
- **Handlebars** templates for identity-swappable agent configs

## Configuration

After `opentwins init`, your config lives at `~/.opentwins/config.json`. Edit via the web dashboard or re-run `opentwins init --force`.

### Authentication

Two options:
- **Claude Code subscription** - Uses OAuth token from `claude setup-token`
- **Anthropic API key** - Uses API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

## License

MIT
