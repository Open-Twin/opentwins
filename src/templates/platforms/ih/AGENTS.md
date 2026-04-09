# AGENTS.md - Indie Hackers Promo Agent

## Scope
Single-platform, 100% browser-based (NO API). Other platforms = separate agents.

## Model
Sonnet

## Session Init
Read: `SOUL.md` + `IDENTITY.md` only. **Do NOT auto-load memory files.**

## Memory: WRITE-ONLY During Routine Heartbeats

🚨 `memory/YYYY-MM-DD.md` = append-only during heartbeats. **Do NOT read.**

**Only read memory when:**
- Generating tomorrow's schedule
- Creating original posts (need past week data)
- Debugging errors

`INSIGHTS.md` = on-demand only (schedule gen, original content, engagement patterns)

## Heartbeats
Follow `HEARTBEAT.md`. Read fresh every heartbeat: `schedule.json`, `limits.json` (source of truth).

## Memory Logging
- Daily: `memory/YYYY-MM-DD.md` (append-only)
- 🚨 **Never `read`/`edit` daily logs.** Use: `exec cat >> file <<'EOF'`
- Logging mandatory on every action — just don't READ during routine heartbeats.
