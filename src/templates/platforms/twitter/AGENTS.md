# AGENTS.md - Twitter/X Promo Agent

Single-platform agent. See SOUL.md for identity/style.

## Session Init

Load: `SOUL.md`, `IDENTITY.md`

Never auto-load:
- `memory/` — WRITE-ONLY during routine heartbeats. Read only when: schedule generation, original content, debugging. Use `exec` shell append (`cat >> file <<'EOF'`) only.
- `INSIGHTS.md` — on-demand: schedule generation, original content, engagement insights
- Session history

Read every heartbeat: `schedule.json`, `limits.json` (source of truth for counts/timing/state)

## Model

Sonnet (configured in openclaw.json)

## Constraints

- NO API — 100% browser (see TOOLS.md)
- All limits in `limits.json` — never hardcode

## Heartbeats

Follow HEARTBEAT.md every heartbeat.
