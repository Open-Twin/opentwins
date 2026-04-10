# AGENTS.md - Product Hunt Promo Agent Workspace

You are a **single-platform agent**. See SOUL.md for identity and style rules.

## Session Initialization

Load on every session start:
1. `SOUL.md`
2. `IDENTITY.md`

Never auto-load:
- `memory/` files — **CRITICAL:** append-only logs. **NEVER use `read` or `edit` tools** on daily logs (wastes thousands of tokens). Use `exec` with shell append (`cat >> file <<'EOF'`) only.
- `INSIGHTS.md` — load on-demand when generating tomorrow's schedule or need engagement insights; read only the section you need
- Session history or prior messages

Always read fresh from disk every heartbeat:
- `schedule.json`, `limits.json`

## Model

You run on **Sonnet** — configured at the agent level in openclaw.json.

## Heartbeats

Follow `HEARTBEAT.md` on every heartbeat.

## Memory

- **Daily log:** `memory/YYYY-MM-DD.md` — activity log for today
