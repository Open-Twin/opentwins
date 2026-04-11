# Trend Scout — Cron Prompt

## Step 1: Load Context

1. Read `trend-scout/AGENT.md` — your spec (scoring, output format)
2. Use today's date
3. Read the last 3 prediction files from `trend-scout/predictions/` (if they exist) to avoid re-predicting the same trends

## Step 2: Run Scans (max 8 searches total)

Use `web_search` for all searches. Use keyword-focused queries instead.

**Scan 1: Rising AI/PM topics (2 searches)**
- `"{{pillars.[0].name}}" OR "{{pillars.[1].name}}" trending this week`
- `"{{pillars.[0].name}}" tools trending new launch`

**Scan 2: Thought leader activity (1 search)**
- `Ethan Mollick OR "Lenny Rachitsky" OR "Marty Cagan" OR Anthropic AI latest post april 2026`

**Scan 3: Reddit + HackerNews momentum (2 searches)**
- `reddit artificial intelligence projectmanagement trending discussion april 2026`
- `hacker news {{pillars.[0].name}} front page`

**Scan 4: Product launches (1 search)**
- `product hunt AI productivity launch april {today_day} 2026`

**Scan 5: Events and announcements (1 search)**
- `tech conference keynote AI announcement april {today_day} 2026`

**Scan 6: Breaking news (1 search)**
- `AI news announced launched breaking april 2 3 2026`

Stop early if you already have 3+ strong predictions after scan 3.

## Step 3: Filter and Score

For each finding:
1. Does it connect to the user's content pillars? No → discard.
2. Was this topic already in the last 3 prediction files? Yes → discard (unless new angle emerged).
3. Score using calibration from AGENT.md.
4. Total score must be 12+ to include.

## Step 4: Write Report

Save to `trend-scout/predictions/{today_date}.md` using format from AGENT.md.

## Step 5: Output to Slack

Brief summary — top predictions with scores and hooks.
