# Changelog

All notable changes to this project will be documented in this file.

## 2026.4.29

### Templates

**Fixed**
- Devto content-writer spec § 11: ban `title:` line in frontmatter — body `# H1` is the only title source. Avoids duplicate-heading rendering when Dev.to uses frontmatter title and renders the body H1 alongside it.

## 2026.4.27

### Templates

**Improved**
- All 10 agents: `first_words` dedup field in `today_summary.json` — rule rejects drafts whose first word matches the last 3 used (avoids "the…the" / "yeah…yeah" streaks within a heartbeat).
- Devto SOUL: contractions rule. Devto BROWSER-engage §J: self-review items 8/9/10 fire at submit time (tricolon cut, contractions check).
- Threads + content-writer: anti-AI drafting rules — no tricolons, no contrastive "isn't X — it's Y", contraction floor when 2+ consecutive sentences have zero contractions.
- Twitter §C broadened from "X is the new Y" only → also bans "isn't X - it's Y" pivots, aphoristic closers ("that's the bet"), and full 3-item source-list citation.
- LinkedIn: 3 mechanical pre-submit self-checks (quote-mirror detection, bare-verb opener, cite-any-number).
- IH SOUL DON'T: tricolon ban, no contrastive, contraction floor.
- Reddit SOUL: never end on universal takeaway / poster line; karma-building subs lead with specific memory not confirming observation.
- Substack SOUL: cap contrastive "X, not Y" at once per session.
- Bluesky SOUL "Anti-AI Conversation Patterns": tricolon ban on 3-item echoes, ban "yeah, and" / "yeah but" openers, skip candidates with no specific phrase/number/tool to cite.

### Dependencies

**Improved**
- typescript 5.9.3 → 6.0.3 (major).
- vitest 4.1.4 → 4.1.5; @vitest/coverage-v8 4.1.4 → 4.1.5.
- @inquirer/prompts 8.4.1 → 8.4.2.
- ora 9.3.0 → 9.4.0.
- better-sqlite3 12.8.0 → 12.9.0.

**Fixed**
- `package-lock.json` regenerated with public `registry.npmjs.org` URLs (had been contaminated with private Artifactory host references — would have broken `npm install` for users outside that network).

## 2026.4.23

### Templates

**Improved**
- Content-writer: ASCII-only punctuation rule (curly quotes / ellipsis / en-dash break CDP paste into Draft.js editors).
- Twitter: early-bail after queries 1-2 if a 20+ likes candidate was seen — saves 60-90s per task.
- Reddit: flair selector + modal guidance for shadow DOM (`r-post-flairs-modal` shadow → `#reddit-post-flair-button`, "View all flairs" hint for hidden flairs, hidden link-field false-signal guard on TEXT submits).
- Substack BROWSER-restack: URL-anchored Notes picker + position-based Articles (walks up from each Restack button to match `/note/c-X` ancestor; picks the `post-ufi-button` after the Comments button — works for any restack count).

**Fixed**
- Bluesky S 3 search extract: move `hasMedia` / `isMemeLikely` declarations above the filter guards + prose warning — guards against Sonnet paraphrase-induced TDZ errors when agents regenerate the evaluate body.

**Removed**
- Devto: cover-image publishing disabled. Dev.to's `/api/images` path dropped inline-URL main_image support; serving covers now requires Cloudflare Images / S3 credentials, which opentwins users shouldn't need to configure.

### Docs

**Removed**
- README: deprecated CLI commands (`run`, `browser`, `logs`, `audit`, `init --cli`) — all available in the dashboard.

## 2026.4.22

### Scheduler & CLI

**New**
- Lifecycle-manage image-core HTTP server with `opentwins start`/`stop` — spawns as child of daemon process, SIGTERM + 2s SIGKILL fallback on shutdown, shares process group.

### Dashboard

**New**
- Per-agent daily audit button — modal with live progress, 7-dimension scoring (mechanical/length/diversity/reply-target/voice/content-ready/execution), grade pill header, markdown-rendered report.

### Templates

**New**
- **image-core** platform-agnostic image rendering service scaffolded at `<pipeline>/image-core/` — HTTP server + CLI, 12 visual layouts (stack, matrix, venn, note, carousel, quote, stat, compare, checklist, principle, timeline, faq), 18+ platform routes.
- Banner layout for article cover images (Dev.to 1000×420, Medium 1500×600).
- Writer can emit any of 11 image-core layouts (unlocked from legacy stack/matrix/venn + note).
- Layout rotation rule + 7-day usage log — hot-zone avoidance + cross-platform variety enforcement.
- All 5 platform agents + content-writer sanity checks migrated to image-core CLI.
- New image specs: `devto-cover-image`, `medium-cover-image`, `threads-post-image`, `threads-thread-image`.
- Devto agent uploads cover via `/api/images` + sets `main_image`; Medium agent surfaces cover path in publish alert.
- Threads agent attaches images on Post 1 of single posts + threads; sets native topic tag via `Add a topic` input (S 5d).
- All agents log `Replying to:` field for reply-quality audits.
- image-core writes one JSON line per render/preview/error to `logs/YYYY-MM-DD.log`.

**Improved**
- Stack layout redesigned as bold brand-blue cards on ivory canvas.
- Carousel slides drop eyebrow pill + footer bar — kept only page count in top-right.
- Carousel cover stops `file_label` from wrapping.
- Twitter: per-author daily reply cap, runtime fallback queries, retry-reopen compose dialog (fixes Draft.js duplicate publish).
- Twitter: strategic min_faves floor lowered 100 → 10.
- Threads: runtime fallback queries, profile-verify gate, writer cap fix (500 chars).
- Substack: cold-restack rule now MUST when cold-commented (was SHOULD); require `type` on spec.
- Planner: stop referencing disabled linkedin-article in briefs.
- Devto: exhausted tasks mark `done` — unblocks wasted retry heartbeats.
- Audit prompt: reject fixes that push voice toward AI-like; stateless-heartbeat constraint.

**Fixed**
- LinkedIn: SS 3c like selector covers Pulse; Pulse dedup evaluate inlines the like step (was dead code); sharpen opener-dedup rule.
- LinkedIn SOUL: ban quote-mirror openers, subject-less fragments, dash-aside default.
- Devto SOUL: ban corporate openers/sign-offs; flatten reply voice to match first-comment register.
- Bluesky SOUL: opener-variety + no-quote-mirror reply rules.
- IH SOUL: ban "the X is Y" opener frame + require concrete anchor in deep-thread replies.
- Medium SOUL: ban em-dash parentheticals, "the X is Y" opener, bare "exactly" agreement.
- Reddit SOUL: require casual marker in 30+ word comments, ban same opener back-to-back.
- Substack: ban "and" opener; pre-clear restack dropdown with Escape (Radix toggle).
- Threads SOUL: ban "yeah" reply opener.
- Content-writer: repoint carousel example from deleted legacy renderers.

**Removed**
- Legacy `render-*.mjs` and carousel template/example files from `content-writer/templates/` — image-core CLI is the only renderer now.

## 2026.4.19

### Scheduler & CLI

**New**
- Browser upload endpoint (`POST /api/browser/:profile/upload`) with dual modes: intercept (CDP file-chooser arm) and selector (direct `DOM.setFileInputFiles`).
- Recursive subdir copy in pipeline generator (ships renderer assets at init).
- 6 new tests for the upload endpoint; 338/338 passing.

**Improved**
- `defaults.ts` weekly caps aligned with ported cadence rules: linkedin articles 1→2, bluesky posts 2→7, threads posts 2→5, devto articles 1→2, reddit posts 1→4, ih posts 1→3. Added: linkedin carousels (0, opt-in), substack recommendations.

### Templates

**New**
- LinkedIn document-carousel pipeline (opt-in via `weekly.carousels.limit > 0`): new BROWSER-carousel.md.hbs, 10-slide PDF via headless Chrome, `publish_carousel` task type.
- LinkedIn post-image attachment (SS 10b) with matrix / venn / stack layouts.
- Twitter image attachment (§ 7b) on original_tweet + thread hook (Post 1 only).
- Bluesky reply-chained threads on Mon + Sat with optional Post 1 image + alt text.
- Threads multi-post threads on Tue + Fri (new BROWSER-thread.md.hbs).
- Substack note image attach via selector-mode upload.
- Dev.to `seed_article_comment` task (2h self-seed) + hot-tag gate in devto-api.sh.
- Renderer assets: `render-carousel.mjs`, `render-post-image.mjs` (1200×1200), `render-note-image.mjs` (1080×1080, 2× DPR).

**Improved**
- **LinkedIn**: publish at 15:00 Kyiv; forced-choice closings on every post; 0-1 hashtag rule (1 broad + 2-3 niche + 1 branded); save-hook on 1 in 3 posts; dead-URL tracking + priority-target pruning; per-author daily cap; follower-band bias in planner.
- **Twitter**: 0-1 hashtag max; fresh-first reply pick (ageMin-based); keyword-family dead-query skip; dead-target demotion; twitter-article 1000-1500w.
- **Bluesky**: 7/week cadence; zero hashtags; like-before-compose in S 4b.
- **Threads**: 5/week cadence; per-author daily cap; spam detection in noise filter.
- **Substack**: newsletter Tue-only at 16:00; Mon-Sat recommendations; cold-breadth rule in browse_and_engage.
- **Medium**: Saturday-only cadence; optional frontmatter with SEO keyword rule.
- **Dev.to**: Wed+Fri article cadence; title rubric (first-person + digit + reveal clause).
- **Reddit**: 4/week cadence (Mon/Wed/Thu/Sat); "Title = literal question + named product" rule.
- **IH**: 3/week with alternating-Sat; ≤55-char titles with ≥1 digit; 9-group routing via S 7.5.
- **Content-planner**: platform-verified engagement targets; Structural-Theme Guardrail (Tue+Fri carousel+thread); dedicated Step 2.5 anti-repetition check.
- **PH**: Follow gated by `daily.follows.limit` (was unlimited auto).

**Fixed**
- LinkedIn SS 4b covers both Pulse AND post detail pages.
- LinkedIn post-detail comment flow likes the top-level post before commenting.
- Substack tracking files no longer pruned (prevents duplicate comments on `/note/` URLs).

**Removed**
- LinkedIn `browse_and_engage` task type (feed saturated) + orphaned SS 3/3b/6 selectors.
- Auto-connect after cold LinkedIn comments (warm notification-reply path unchanged).
- LinkedIn daily likes budget (per-post like-before-commenting preserved).

## 2026.4.17

### Scheduler & CLI

**Improved**
- Serialize `reloadActiveScheduler` so concurrent platform toggles no longer get stuck mid-reload
- Reload no longer blocks on Bree's worker-termination wait (responsive even with long-running workers)

### Dashboard

**New**
- Content Pipeline section: clickable stages with outputs modal, plain-language stage descriptions, markdown rendering for `.md` outputs
- Compact view toggle for Content Pipeline (persists to localStorage)
- Errors KPI card is now click-to-filter
- Activity Log: per-error acknowledge (keeps error visible but dimmed, drops from counts)
- Custom themed DatePicker (replaces native input, opens via portal so it sits above session cards)
- `?previewAgents=N` debug query param for visual checks at any agent count

**Improved**
- Content Pipeline section redesigned: health banner + grouped stage list + uniform rows (was an undifferentiated badge row)
- Platform Agents section: dense table layout aligned to Recent Runs (1 col for ≤3 agents, 2 col for 4+)
- Pipeline modal: text size + width tuned for readability
- Agents KPI label clarified: "configured" / "disabled" instead of misleading "enabled" / "paused"

**Fixed**
- Activity Feed: dropped repeating synthetic "Session complete" events (multi-turn sessions no longer flood the feed)

**Removed**
- Platform Agents expanded card-grid view — the dense list is now the only view

### Templates

**New**
- Tool Selection guidance added to all 10 platform `CLAUDE.md.hbs` files

**Improved**
- Threads: per-author daily comment cap + extended spam-keyword filter
- LinkedIn content writer: hashtags now mandatory + Engagement Targets mention rule
- IH: simplified cookie-banner handling (dropped dedicated dismiss steps)

### Build & Tests

**Fixed**
- Pipeline-runner test no longer pollutes real `~/.opentwins/locks/pipeline-state.json` (was showing fake "Trend Scout failed" in production dashboard)
- Client lockfile regenerated against public npm registry (was pointing at private Artifactory, broke CI)
- Swapped `react-markdown` for `marked` (smaller dep tree, faster CI install)

## 2026.4.16

### Scheduler & CLI

**Improved**
- 5-min cron replaced with main-thread 1-min tick — workers only spawn for due heartbeats; idle cycles cost microseconds vs full worker thread. Latency "due" → "starts" drops from ≤5 min to ≤1 min.
- Expected scheduler noise silenced: `Job "X" is already running` and exit 143 (SIGTERM cancellations) no longer surface as errors.

### Browser API

**Fixed**
- Tolerant JSON parser on `/api/browser/*`. Agents writing regex (`\d`, `\s`, `\w`, `\.`) inside `evaluate` payloads no longer crash on JSON.parse — server retries with auto-doubled escapes and returns a structured error hint instead of an HTML stack trace.

### Dashboard

**Fixed**
- "Next" countdown freezes correctly while running (shows "after current run") and stops resetting on refresh when overdue (shows "starting soon").
- "Last run" timestamp updates without manual refresh.
- Final "Session complete" activity-feed event appears after a run finishes.
- `/api/status` now polls every 10s so schedule state transitions surface without reload.

### Templates

**New**
- Lightweight `ROTATE OUT` anti-repetition: planner skims last 3-5 briefs and lists overplayed terms; writer avoids them.

**Improved**
- Threads + Bluesky content-writer specs use hard CHARACTER limits (Threads 500, Bluesky 300) instead of word counts that exceeded platform caps.

**Removed**
- PH: redundant `streak_keeper` task and standalone S6 procedure (browse_and_engage already maintains the streak).
- All platforms: redundant `generate_tomorrow_schedule` end-of-day task (HEARTBEAT's morning check covers it).

### CI

**New**
- 4 tests for scheduler tick.
- `claude-code-review` workflow now has `Bash(gh:*)` permissions — previous runs silently denied the plugin's `gh pr review` call, so no review was ever posted on PRs.

**Improved**
- Node version matrix updated.

## 2026.4.15

### Scheduler & CLI

**New**
- `start` is now a unified launcher — scheduler + dashboard run together; `start -d` runs both as a detached daemon
- Re-running `start` while a daemon is up restarts cleanly (stops the old one first)

**Improved**
- Idle 5-minute cron cycles are silent — only real heartbeats and errors print to stdout
- README quick-start drops the browser CLI commands (setup is in the dashboard); `browser health` and `browser list` kept as debug helpers

**Fixed**
- Editing an agent's interval/auto-run in the dashboard no longer drops the UI session (in-place scheduler reload)
- Trailing `undefined` removed from worker logs

**Removed**
- Standalone `opentwins ui` command (dashboard now bundled into `start`)

### Dashboard

**New**
- 24h timeframe with hourly buckets in Usage and Quality tabs
- Pipeline stage state and run timing surfaced in the UI

**Fixed**
- Quality 24h hour labels no longer double-apply timezone
- Pie chart labels moved outside the donut with connector lines

**Improved**
- Default per-platform limits lowered to safer starting values

### Templates

**New**
- "Handling Clarifying Questions on Your Own Comments" guidance across all 10 platform SOULs
- Per-conversation caps: Medium 3 replies/author/day, PH 3 comments/thread/day
- LinkedIn: article days (Tue/Fri) skip `publish_post` to avoid feed flooding

**Fixed**
- `today_summary.json` updates require Read before Write (avoids `printf` non-ASCII crashes under non-UTF-8 locales)
- `devto-api.sh` and `ph-api.sh` referenced by full path everywhere (bare names didn't resolve without `scripts/` on PATH)
- `limits.json` history trimmed at daily/weekly reset (linkedin/devto/twitter) — was growing unbounded and tripping Read tool's 10k-token cap
- IH post-body selectors handle both `/post/{slug}` (Ember) and `/product/?post=` (Firestore) renderers
- Medium RSS fetch scoped with grep at curl time — raw feed was overflowing harness output cap
- Decorative `exec` prefix stripped from utility commands (was breaking `&&` / `||` chains)

### Website

**New**
- SEO + share polish: favicons, Twitter cards, RSS, manifest, 404, breadcrumbs
- IndexNow key hosted for Bing/Yandex fast indexing
- Homepage links all blog posts directly

## 2026.4.14

### Scheduler & CLI

**Improved**
- Platform-wide structured logging (JSONL)

### Dashboard

**New**
- Per-agent auto-run toggle replaces global daemon start/stop
- Logs tab surfaces the new structured logs

**Improved**
- Auto-select newly added agent in Agents tab
- Auto-run UX improvements and agent stop reliability
- Compact activity-log session cards into single-row layout
- Insights preview height increased

### Browser API

**New**
- CDP-native `/type` endpoint for reliable text input across all platforms
- Data parameter for `evaluate` endpoint — eliminates inline text placeholders

**Fixed**
- CDP arrow function IIFE wrapping

### Templates

**Improved**
- Rewrote all platform BROWSER templates to curl heredoc format
- Converted remaining JS code blocks to curl heredoc in HEARTBEAT files
- Removed hardcoded limit values from all platform templates
- Apostrophe safety warning added to all HEARTBEAT and BROWSER-engage templates
- INSIGHTS.md preserved during workspace regeneration

**Fixed**
- Twitter agent treats zero mentions as normal, not a load failure
- Reddit comment template — focus via focusin + async submit

### CI

**Improved**
- Dropped Node 18 from CI matrix (vitest 4.x requires Node 20+)

## 2026.4.13

### Scheduler & CLI

**Improved**
- Decoupled scheduler from dashboard — Pause Agents actually stops the daemon
- `opentwins start` = scheduler only, `opentwins ui` = dashboard only (further unified in 2026.4.15)

### Dashboard

**New**
- Next-run countdown in agent hero stats
- First-run hint banner when agents are paused

**Improved**
- Redesigned Agents page: compact hero, merged Limits & Behavior panel, inline stats
- Insights card: fixed-height preview with markdown rendering, click-to-expand modal
- "Start Agents" / "Pause Agents" button redesign with action icons
- Command tab: meaningful action counts, compact 5-row Recent Runs

**Removed**
- Signal Quality section and browser health pill

### Templates

**Fixed**
- Removed `exec` prefix from grep/cat/printf (Claude Code compatibility)
- Medium: replaced broken `/recommended` tag suffix with search + niche tags

**Improved**
- Substack: comment style ratios templatized from config

### CI

**New**
- Tests added to CI pipeline (322 tests)

## 2026.4.12

### Browser API

**New**
- Built-in Chrome CDP browser automation (replaces OpenClaw dependency)
- Browser HTTP API at `/api/browser/:profile/*` — agents use curl instead of spawning Node processes
- Auto-start Chrome on any browser API call

**Removed**
- OpenClaw dependency (fully replaced with built-in CDP)
- Separate browser-cleanup worker (merged into ensureChrome)

### Templates

**Improved**
- Full templatization of SOUL, HEARTBEAT, IDENTITY, TOOLS, PLAYBOOK, BROWSER-* files across platforms and pipeline
- Removed ALL hardcoded PM/AI domain content — templates fully domain-agnostic
- Content planner pillar balance guardrail and audience safety checks
- Browser JS enforcement rule in all HEARTBEAT templates

**Fixed**
- LinkedIn notification dedup URL-encoding mismatch
- `limits.json` preserved on workspace regeneration

### Dashboard

**Improved**
- Quality tab reads from workspace JSON files (no SQLite dependency)
- Compact Agents page layout
- Sticky "Complete Setup" button on review step
- Logo in nav

**Fixed**
- Session duration calculation (was showing 0)
- `lastRun` persistence across server restarts
- Pie chart label visibility on dark background
- Stop agent now closes browser

### Pipeline

**Removed**
- 3 non-core pipeline agents (conference-scout, job-scout, pr-media-monitor)

### Website

**New**
- Logo in header/footer and favicon

### Other

**New**
- Comprehensive E2E test suite (119 tests: config, generator, templates, session parser, quality)

**Fixed**
- TypeScript ES2023 lib for `Array.findLast()`

## 2026.4.11

### Scheduler & CLI

**Improved**
- Browser cleanup worker added to Bree scheduler

### Templates

**Improved**
- Templatized all SOUL and HEARTBEAT files — domain content now driven by config
- Rebuilt all platform agent templates from reference repo

### Other

**Changed**
- Switched to calendar versioning (CalVer): YYYY.M.D
- Open-source repo setup: LICENSE, CONTRIBUTING, CI, branch protection

## 0.1.0

### Initial release

- Support for 10 platforms: LinkedIn, Twitter/X, Reddit, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers
- CLI with `init`, `run`, `browser setup` commands
- Web dashboard with 6 tabs: Command, Agents, Activity, Usage, Quality, Config
- Web setup wizard for onboarding
- Per-agent interval control with completion-based scheduling
- Browser profile management via Chrome CDP
- Session parsing and activity feed from Claude JSONL files
- Content pipeline with daily schedule generation
- Handlebars-based template system for all platform agent files
- Browser cleanup worker (tab cleanup + zombie Chrome killer)
- Health monitoring for Chrome profiles and Claude status
- Marketing website at opentwins.ai with blog and SEO
