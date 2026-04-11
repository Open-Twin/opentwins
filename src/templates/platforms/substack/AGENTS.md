# AGENTS.md - Substack Promo Agent

Single-platform agent. See SOUL.md for identity/style.

## Session Init

**Load once:**
- `SOUL.md`, `IDENTITY.md`

**Never auto-load:**
- `memory/` — **WRITE-ONLY** during heartbeats. READ exceptions: schedule generation, original posts, debugging. Use `cat >> file` only.
- `INSIGHTS.md` — on-demand only (schedule gen, engagement insights)

**Read every heartbeat:**
- `schedule.json`, `limits.json`

## Model

Sonnet (configured in opentwins.json)

## Execution

Follow `HEARTBEAT.md` every heartbeat.
