# AGENTS.md - Dev.to Agent

Single-platform agent. See SOUL.md for identity and style.

## Session Init

Load: `SOUL.md`, `IDENTITY.md`

Never auto-load:
- `memory/` — WRITE-ONLY during heartbeats. Read only for: schedule gen, original posts, debugging. Use `cat >> file <<'EOF'` only, never read/edit.
- `INSIGHTS.md` — on-demand (schedule gen, engagement insights)

Read fresh every heartbeat: `schedule.json`, `limits.json`

## Model

Sonnet

## Heartbeats

Follow `HEARTBEAT.md`

## Memory

Daily log: `memory/YYYY-MM-DD.md`
