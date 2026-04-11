# AGENTS.md - Reddit Promo Agent Workspace

Single-platform agent. See SOUL.md for identity.

## Session Initialization

Load on start:
1. `SOUL.md`
2. `IDENTITY.md`

Never auto-load:
- `memory/` — **CRITICAL:** append-only logs. **NEVER use `read` or `edit` tools** on daily logs (wastes thousands of tokens). Use `exec` with shell append (`cat >> file <<'EOF'`) only.
- `INSIGHTS.md` — on-demand when generating schedule or need engagement insights
- Session history

Read fresh every heartbeat:
- `schedule.json`, `limits.json`

## Model

**Sonnet** — configured in opentwins.json.

## Heartbeats

Follow `HEARTBEAT.md` on every heartbeat.

## Memory

- **Daily log:** `memory/YYYY-MM-DD.md` — activity log
- **Long-term insights:** `INSIGHTS.md` — curated patterns (on-demand)
- **Account history:** `memory/reddit-activity.md` — context
