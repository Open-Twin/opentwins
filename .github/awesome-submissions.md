# Awesome-List Submissions Tracker

A tracker for submitting OpenTwins to relevant curated "awesome" lists. Each
entry below has a ready-to-paste submission packet — no rewriting needed.

> **Process note:** These submissions must be filed manually (fork the target
> repo, edit the README in the right section, open a PR). The only exception is
> `hesreallyhim/awesome-claude-code`, which requires an issue instead of a PR.

## Submission metadata (shared across all lists)

| Field            | Value                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Display name     | OpenTwins                                                                                           |
| Repository URL   | https://github.com/Open-Twin/opentwins                                                              |
| Homepage         | https://opentwins.ai                                                                                |
| Author           | Open-Twin                                                                                           |
| Author link      | https://github.com/Open-Twin                                                                        |
| License          | MIT                                                                                                 |
| Keywords         | ai, agents, social-media, automation, digital-twins, claude, claude-code                            |

### Description variants

- **One-liner (≤ 15 words):**
  Autonomous AI agents that engage on 10 social platforms using your identity, voice, and content strategy.

- **Short (1 sentence, ~30 words):**
  CLI that deploys autonomous AI agents to engage on Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, and Indie Hackers — powered by Claude Code and Chrome CDP browser automation.

- **Medium (2–3 sentences):**
  OpenTwins is a CLI and dashboard that runs autonomous digital-twin agents across ten social platforms (Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers). Each agent uses Claude Code as its AI brain and Chrome CDP for real browser automation, with a 7-stage content pipeline for trend scouting, competitive intel, and platform-specific writing. Everything is local: SQLite for activity and quality metrics, Bree for scheduling, a web dashboard at `localhost:3847`.

---

## Target lists

Legend: ☐ not submitted · ◐ submitted, pending review · ☑ merged · ✗ rejected

| # | List                                                                                                         | Section / Category                       | Method      | Status |
| - | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | ----------- | ------ |
| 1 | [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)                      | Tooling                                  | Issue form  | ☐ human UI only — CLI submissions auto-closed per template |
| 2 | [webfuse-com/awesome-claude](https://github.com/webfuse-com/awesome-claude)                                  | Applications › Agents (new subsection)   | PR          | ◐ [#189](https://github.com/webfuse-com/awesome-claude/pull/189) |
| 3 | [jim-schwoebel/awesome_ai_agents](https://github.com/jim-schwoebel/awesome_ai_agents)                        | Building › Tools (alphabetical)          | PR          | ◐ [#216](https://github.com/jim-schwoebel/awesome_ai_agents/pull/216) |
| 4 | [e2b-dev/awesome-ai-agents](https://github.com/e2b-dev/awesome-ai-agents)                                    | Open-source › Productivity               | Form + PR   | ☐ needs Google Form fill first |
| 5 | [kyrolabs/awesome-agents](https://github.com/kyrolabs/awesome-agents)                                        | Automation › Browser                     | PR          | ◐ [#385](https://github.com/kyrolabs/awesome-agents/pull/385) |
| 6 | [Jenqyang/Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents)                                  | Applications › Autonomous Agents         | PR          | ◐ [#174](https://github.com/Jenqyang/Awesome-AI-Agents/pull/174) |
| 7 | [slavakurilyak/awesome-ai-agents](https://github.com/slavakurilyak/awesome-ai-agents)                        | All Projects (alphabetical)              | PR          | ◐ [#224](https://github.com/slavakurilyak/awesome-ai-agents/pull/224) |
| 8 | [caramaschiHG/awesome-ai-agents-2026](https://github.com/caramaschiHG/awesome-ai-agents-2026)                | Task and Workflow Agents › Automation    | PR          | ◐ [#157](https://github.com/caramaschiHG/awesome-ai-agents-2026/pull/157) |
| 9 | [angrykoala/awesome-browser-automation](https://github.com/angrykoala/awesome-browser-automation)            | Tools › AI                               | PR          | ◐ [#99](https://github.com/angrykoala/awesome-browser-automation/pull/99) |
|10 | [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted)            | Social Networking and Forums (stretch)   | PR          | ☐ submit after others land |

Lists intentionally **skipped** (and why):

- `kaushikb11/awesome-llm-agents` — framework-only scope, OpenTwins is an end-user app.
- `ComposioHQ/awesome-claude-skills`, `awesome-claude-plugins` — OpenTwins is not a Skill or Plugin.
- `awesome-claude-code-subagents` — list is limited to subagent prompts.
- `sindresorhus/awesome-nodejs` — submissions paused for spam; CLI bar is "something very awesome" and maintainer redirects CLIs to awesome-cli-apps.
- `agarrharr/awesome-cli-apps` — no natural category (no social / automation / browser-control section); closest is "Browser Replacement" which is for terminal browsers, not browser drivers.
- `Lissy93/awesome-privacy` and the other `awesome-privacy` forks — scope is privacy-respecting *alternatives* to SaaS. OpenTwins operates *on* SaaS, so it's off-topic.
- `transitive-bullshit/awesome-puppeteer`, `mxschmitt/awesome-playwright` — OpenTwins uses raw Chrome CDP, not Puppeteer or Playwright.
- `sindresorhus/awesome` (root directory) — only curated awesome lists go here, not individual projects.
- `awesomelistsio/awesome-oss-alternatives` — intended for projects that replace a specific SaaS, not tools that automate against SaaS.

---

## 1. hesreallyhim/awesome-claude-code (PRIMARY target)

**How to submit:** Open an issue using the "Recommend a Resource" template.
The repo explicitly forbids PRs from anyone other than Claude.

- Issue URL: https://github.com/hesreallyhim/awesome-claude-code/issues/new/choose
- Template: **Recommend a Resource**

**Fields:**

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Display Name   | OpenTwins                                                                                           |
| Category       | Tooling                                                                                             |
| Primary Link   | https://github.com/Open-Twin/opentwins                                                              |
| Author Name    | Open-Twin                                                                                           |
| Author Link    | https://github.com/Open-Twin                                                                        |
| License        | MIT                                                                                                 |
| Description    | CLI and dashboard that deploys autonomous AI agents on 10 social platforms (Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers). Uses Claude Code as the AI brain and Chrome CDP for browser automation, with a local web dashboard for control, activity, and quality metrics. |

**Checklist reminders before filing:**
- [ ] First commit is ≥ 1 week old
- [ ] No duplicate issue open
- [ ] Primary link returns 200
- [ ] Repo README, LICENSE, and CONTRIBUTING present (already true)

---

## 2. webfuse-com/awesome-claude

**Section:** `## Applications`

**Markdown entry (insert alphabetically):**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - Autonomous digital-twin agents that engage on 10 social platforms (Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers), powered by Claude Code and Chrome CDP.
```

**PR title:** `Add OpenTwins to Applications`

---

## 3. jim-schwoebel/awesome_ai_agents

**Section:** `## Marketing AI Agent` (also applicable: `Content Creation`, `Personal Assistant`)

**Markdown entry:**

```markdown
- **[OpenTwins](https://github.com/Open-Twin/opentwins)** - Autonomous digital-twin agents for 10 social platforms (Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers). Runs a 7-stage content pipeline (trend scout → competitive intel → engagement tracker → network mapper → amplification → planner → writer), powered by Claude Code with a local dashboard. [[website](https://opentwins.ai)]
```

**PR title:** `Add OpenTwins under Marketing AI Agent`

---

## 4. e2b-dev/awesome-ai-agents

**Submission form:** https://forms.gle/UXQFCogLYrPFvfoUA (fill this first, then open a PR).

**Section:** `Open-source projects` → `Productivity`

**Markdown entry (keep alphabetical):**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - Autonomous agents for 10 social platforms, powered by Claude Code.
```

**PR title:** `Add OpenTwins (Productivity, open-source)`

---

## 5. kyrolabs/awesome-agents

**Section:** `## Automation` → `### Browser` (OpenTwins drives real Chrome sessions via CDP)

**Markdown entry:**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - Autonomous digital-twin agents across 10 social platforms using Claude Code and Chrome CDP. ![GitHub stars](https://img.shields.io/github/stars/Open-Twin/opentwins?style=social)
```

**PR title:** `Add OpenTwins to Automation › Browser`

---

## 6. Jenqyang/Awesome-AI-Agents

**Section:** `## Applications` → `### Autonomous Agents`

**Markdown entry:**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - Autonomous digital twins that run hourly on 10 social platforms, orchestrated by Claude Code with a 7-stage content pipeline. ![GitHub Repo stars](https://img.shields.io/github/stars/Open-Twin/opentwins)
```

**PR title:** `Add OpenTwins under Applications › Autonomous Agents`

---

## 7. slavakurilyak/awesome-ai-agents

**Section:** `Open-source agents` (alphabetical)

**Markdown entry:**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - Autonomous agents for 10 social platforms, powered by Claude Code and Chrome CDP.
```

**PR title:** `Add OpenTwins to open-source agents`

---

## 8. caramaschiHG/awesome-ai-agents-2026

**Section:** Social / Marketing / Content (whichever exists — check on PR)

**Markdown entry:**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) — Autonomous digital-twin agents across 10 social platforms (Reddit, Twitter/X, LinkedIn, Bluesky, Threads, Medium, Substack, Dev.to, Product Hunt, Indie Hackers), powered by Claude Code with a local dashboard.
```

**PR title:** `Add OpenTwins to social/marketing agents`

---

## 9. angrykoala/awesome-browser-automation

**Section:** `## Tools` → `### AI` (OpenTwins uses Chrome CDP + Claude to drive real browser sessions)

**Markdown entry:**

```markdown
- [OpenTwins](https://github.com/Open-Twin/opentwins) - CLI that drives real Chrome sessions via CDP to run autonomous AI agents on 10 social platforms, powered by Claude Code.
```

**PR title:** `Add OpenTwins under Tools › AI`

---

## 10. awesome-selfhosted/awesome-selfhosted

> ⚠️ **Stretch target.** The list's stated scope is "Free Software network
> services and web applications which can be hosted on your own server(s)."
> OpenTwins is a CLI with a local web dashboard (`localhost:3847`) and stores
> all state locally in SQLite, so it's defensible — but maintainers may reject
> it as "not a network service." Submit only after the others land.

**Section:** `## Social Networking and Forums` (closest fit), or `## Automation`

**Format required** (strict, see
[README](https://github.com/awesome-selfhosted/awesome-selfhosted#anti-features)):

```
[Name](https://homepage/) - Short description (≤ 250 chars). ([Source Code](https://github.com/.../), [Demo](https://demo.url/)) `LICENSE` `LANGUAGE`
```

**Markdown entry:**

```markdown
- [OpenTwins](https://opentwins.ai) - Runs autonomous digital-twin agents across 10 social platforms using Claude Code and local Chrome CDP. All state (config, activity, quality metrics) stays in a local SQLite DB; web dashboard at localhost:3847. ([Source Code](https://github.com/Open-Twin/opentwins)) `MIT` `Nodejs`
```

**Reminders before filing:**
- [ ] Description is ≤ 250 characters
- [ ] Omit redundant words like "open-source", "free", "self-hosted" (implied by the list)
- [ ] Project has ≥ 6 months of recent activity (check before submitting)

**PR title:** `Add OpenTwins to Social Networking and Forums`

---

## PR body template (reusable)

Use this body for every PR above (adjust section name):

```markdown
## Adding OpenTwins

**Project:** [OpenTwins](https://github.com/Open-Twin/opentwins) — autonomous AI agents across 10 social platforms.

**Section:** <SECTION>

**Why it belongs:**
- End-user application built on Claude Code (not a framework or skill)
- Open source, MIT, actively maintained (see releases and CI)
- Has README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, and tests
- Published on npm: https://www.npmjs.com/package/opentwins

**Checklist:**
- [x] Entry is alphabetically ordered within its section
- [x] Link returns 200
- [x] No duplicate entry
- [x] Description is ≤ 2 sentences and follows the list's style
```
