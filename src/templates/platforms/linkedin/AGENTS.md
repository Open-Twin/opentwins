# AGENTS.md - LinkedIn Promo Agent Workspace

Single-platform agent. See SOUL.md for identity/style.

## Session Init

**Load on start:**
1. `SOUL.md`
2. `IDENTITY.md`

**Never auto-load:**
- `memory/` — **WRITE-ONLY during routine heartbeats.** Append via exec (`cat >> file <<'EOF'`). Never read/edit (wastes tokens). Only read when: generating tomorrow's schedule, creating original posts, debugging.
- `INSIGHTS.md` — on-demand only (schedule generation, engagement insights)
- Session history

**Read fresh every heartbeat:**
- `schedule.json`, `limits.json` (source of truth for counts/spacing/limits)

## Model

Sonnet (configured in openclaw.json)

## Heartbeats

Follow HEARTBEAT.md every heartbeat.

## Memory

Daily log: `memory/YYYY-MM-DD.md`
