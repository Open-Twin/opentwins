# Agent Architecture

## Daily Pipeline (by time)

```
05:45  ENGAGEMENT TRACKER + TREND SCOUT + COMPETITIVE INTEL + NETWORK MAPPER (parallel)
       ENGAGEMENT TRACKER (dedicated ot-tracker browser, no conflicts)
       ├─ Reads: ot-tracker browser profile (scrapes all 10 platforms)
       └─ Writes: engagement-tracker/metrics.json
       TREND SCOUT
       ├─ Reads: trend-scout/predictions/ (last 3 days, for dedup)
       │         web_search (8 queries max)
       └─ Writes: trend-scout/predictions/{today}.md
       COMPETITIVE INTEL
       ├─ Reads: web_search (tavily), competitive-intel/state.json
       └─ Writes: competitive-intel/briefings/{date}-daily.md
       NETWORK MAPPER
       ├─ Reads: web_search, network-mapper/contacts.json
       └─ Writes: network-mapper/contacts-active.json

06:45  AMPLIFICATION
       ├─ Reads: engagement-tracker/metrics.json (fresh from 06:00)
       │         agent-*/INSIGHTS.md (all 10)
       └─ Writes: amplification/wins/{date}.md

07:05  CONTENT PLANNER (the brain, Opus)
       ├─ Reads: trend-scout/predictions/{today}.md
       │         competitive-intel/briefings/{today}-daily.md
       │         network-mapper/contacts-active.json
       │         amplification/wins/{today}.md
       │         engagement-tracker/metrics.json
       │         content-planner/pillar-tracker.json
       └─ Writes: content-briefs/{today}.md
       │          content-planner/pillar-tracker.json
       │          agent-*/queries.json (all 10)

07:35  CONTENT WRITER (Opus - the hands)
       ├─ Reads: content-briefs/{today}.md (ONLY input)
       └─ Writes: content-ready/{today}/
                  ├─ medium-article.md        (1 long-form)
                  ├─ linkedin-article.md     (1 long-form variant)
                  ├─ substack-newsletter.md  (1 long-form variant)
                  ├─ devto-article.md        (1 long-form variant)
                  ├─ linkedin-post.md        (3 posts, status: pending)
                  ├─ twitter-thread.md       (3 threads, for original_tweet tasks)
                  ├─ twitter-article.md      (1 long-form, for article tasks)
                  ├─ threads-post.md         (3 posts, status: pending)
                  ├─ bluesky-post.md         (3 posts, status: pending)
                  ├─ substack-note.md        (3 notes, status: pending)
                  ├─ reddit-post.md          (3 posts, status: pending)
                  ├─ ih-post.md              (3 posts, status: pending)
                  └─ ph-comment-angles.md    (angles, no status)

08:00+ PLATFORM AGENTS (10 agents, heartbeats every 20-90m)
       ├─ Reads: content-ready/{today}/*.md    (pick pending posts)
       │         content-briefs/{today}.md      (queries + targets)
       │         workspace own files (schedule, limits, HEARTBEAT, etc.)
       └─ Writes: status: pending -> published  (in content-ready files)
                  own memory/, limits.json, schedule.json, INSIGHTS.md
```

## Data Flow Diagram

```
  web_search ----> TREND SCOUT ----> predictions/{date}.md ---+
                                                              |
  tavily -------> COMPETITIVE INTEL ----> briefings/*.md -----+
                                                              |
  web_search ----> NETWORK MAPPER ----> contacts-active.json -+
                                                              +---> CONTENT PLANNER
  browsers ------> ENGAGEMENT TRACKER ----> metrics.json -----+       |
                                                              |       |
  INSIGHTS.md --> AMPLIFICATION ----> wins/{date}.md ---------+       |
  metrics.json --+                                                    |
                                                                      v
                                                              content-briefs/
                                                                      |
                                                                      v
                                                              CONTENT WRITER (Opus)
                                                                      |
                                                                      v
                                                              content-ready/{date}/
                                                                      |
                      +------------+-----------+----------+-----------+
                      v            v           v          v           v
                   Twitter    LinkedIn     Reddit    Threads/BS    +6 more
                   Agent       Agent       Agent      Agents       agents
                      |            |           |          |           |
                      v            v           v          v           v
                   publish     publish     publish     publish     publish
                   engage      engage      engage      engage      engage
                      |            |           |          |           |
                      +------------+-----------+----------+-----------+
                                               |
                                               v
                                          INSIGHTS.md
                                          metrics.json
                                               |
                                               v
                                     (feeds back to next day)
```

## Agent Summary

| Agent | Type | Model | Schedule | Key Output |
|-------|------|-------|----------|------------|
| Engagement Tracker | cron | sonnet | 05:45 daily Mon-Sat | metrics.json |
| Trend Scout | cron | sonnet | 05:45 daily | trend-scout/predictions/{date}.md |
| Competitive Intel | cron | sonnet | 05:45 daily | briefings/{date}-daily.md |
| Network Mapper | cron | sonnet | 05:45 daily | contacts-active.json |
| Amplification | cron | sonnet | 06:45 daily | amplification/wins/{date}.md (reads fresh metrics from 06:00) |
| Content Planner | cron | opus | 07:05 daily | content-briefs/{date}.md + queries.json x10 |
| Content Writer | cron | opus | 07:35 daily | content-ready/{date}/ (13 files) |
| Twitter | heartbeat | sonnet | every 30m | publish + engage |
| Threads | heartbeat | sonnet | every 40m | publish + engage |
| Reddit | heartbeat | sonnet | every 40m | publish + engage |
| LinkedIn | heartbeat | sonnet | every 90m | publish + engage |
| Medium | heartbeat | sonnet | every 90m | publish + engage |
| Substack | heartbeat | sonnet | every 90m | publish + engage |
| Bluesky | heartbeat | sonnet | every 90m | publish + engage |
| Dev.to | heartbeat | sonnet | every 90m | publish + engage |
| Product Hunt | heartbeat | sonnet | every 90m | publish + engage |
| Indie Hackers | heartbeat | sonnet | every 150m | publish + engage |

**Total: 7 cron agents + 10 platform agents = 17 agents**

## Design Principles

1. **One-direction data flow.** Data agents gather -> Content Planner decides -> Content Writer executes -> Platform agents distribute -> metrics feed back to next cycle.
2. **Separation of concerns.** Brain (Content Planner) is separate from hands (Content Writer). Data agents are separate from decision-making.
3. **Content Writer reads ONLY the brief.** All strategic decisions are made by Content Planner. Writer focuses on quality.
4. **Status tracking.** Short-form posts use `status: pending/published` to prevent duplicate publishing across heartbeats.
5. **Isolated sessions.** All cron agents and heartbeat agents run in isolated sessions (fresh each run, no context accumulation).
