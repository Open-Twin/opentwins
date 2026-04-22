import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getPlatformWorkspaceDir, getPipelineWorkspaceDir } from '../util/paths.js';

export interface AuditInputs {
  today: string;           // YYYY-MM-DD
  memoryToday: string;
  soul: string;
  insights: string;
  limits: string;
  schedule: string;
  contentReady: string;    // concatenated content-ready files for this platform
  contentBrief: string;    // pipeline content-briefs/{today}.md
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readOr(path: string, fallback: string): string {
  if (!existsSync(path)) return fallback;
  try { return readFileSync(path, 'utf-8'); } catch { return fallback; }
}

// Grep-match content-ready files belonging to this platform.
// Patterns match both per-platform files (linkedin-post.md) and cross-platform
// long-form that the agent may reference (medium-article.md on medium day).
function platformContentPatterns(platform: string): RegExp[] {
  const base = platform === 'ih' ? 'ih' : platform;
  return [
    new RegExp(`^${base}-`, 'i'),
    // content-writer also emits image specs alongside posts
    new RegExp(`^${base}-.*\\.spec\\.json$`, 'i'),
  ];
}

function collectContentReady(platform: string, today: string): string {
  const pipelineDir = getPipelineWorkspaceDir();
  const dir = resolve(pipelineDir, 'content-ready', today);
  if (!existsSync(dir)) return '(no content-ready directory for today)';
  const patterns = platformContentPatterns(platform);
  const files = readdirSync(dir).filter((f) => patterns.some((p) => p.test(f)));
  if (files.length === 0) return '(no content-ready files for this platform today)';
  const parts: string[] = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(dir, f), 'utf-8');
      parts.push(`--- ${f} ---\n${content}`);
    } catch { /* skip */ }
  }
  return parts.join('\n\n');
}

export function gatherAuditInputs(platform: string): AuditInputs {
  const today = todayIso();
  const ws = getPlatformWorkspaceDir(platform);
  const pipelineDir = getPipelineWorkspaceDir();

  return {
    today,
    memoryToday: readOr(resolve(ws, 'memory', `${today}.md`), ''),
    soul: readOr(resolve(ws, 'SOUL.md'), ''),
    insights: readOr(resolve(ws, 'INSIGHTS.md'), ''),
    limits: readOr(resolve(ws, 'limits.json'), '{}'),
    schedule: readOr(resolve(ws, 'schedule.json'), '{}'),
    contentReady: collectContentReady(platform, today),
    contentBrief: readOr(resolve(pipelineDir, 'content-briefs', `${today}.md`), '(no content brief for today)'),
  };
}

export function buildAuditPrompt(platform: string, inputs: AuditInputs): string {
  return `# Audit Agent: ${platform}

Score is **directional, not absolute** — use to track trends day-over-day, not to grade one day in isolation.

Date: ${inputs.today}

If \`memory/${inputs.today}.md\` is empty (no activity today), output "Agent has no activity today." and stop.

## Scoring dimensions (7 × 10 = 70 total)

Each dimension uses **tiered scoring** to reduce false precision.

### Dimension 1: Mechanical rule compliance (0–10)

Count violations in comment/reply TEXT (NOT heartbeat metadata or headers). Violations:
- Em-dash \`—\` or \`--\` in output
- Corporate phrases: "Glad it resonated", "Happy building", "Great point", "Thanks for sharing"
- "exactly" as bare agreement opener (not mid-sentence usage)
- "in production" on LinkedIn
- Company mentions: "at my company", "at my org", "at work we", dollar figures for employer size
- Bio-pitch verbatim (e.g., "I run 10+ agents", "as a Director of PM")
- 2+ exclamation marks in one comment

Score: 0 violations → 10 | 1–2 → 7 | 3–5 → 4 | 6+ → 0

### Dimension 2: Length compliance (0–10)

Count overages. Cap per platform:
- LinkedIn: 35 words AND ≤3 sentences
- Bluesky: 300 chars
- Twitter reply: 280 chars
- Others: no strict cap (skip)

Score: 0 overages → 10 | 1–2 → 7 | 3–5 → 4 | 6+ → 0

### Dimension 3: Diversity (opener + structure, 0–10)

Extract lowercase first word of each comment. Count first-word frequencies and structural patterns. Apply penalties from 10:
- >50% start with same first word: −3
- 40–50% start with same first word: −2
- 2+ consecutive comments with same first word (by time order): −2 per streak
- Literal quote-mirror (opener is author's exact phrase repeated back): −2 per instance
- Contrastive pattern "X isn't Y - it's Z" (or equivalent "aren't/isn't/doesn't ... it's/they're"): 3 instances −2, 4+ instances −4
- Other recurring structural pattern 3+ times: −2 per pattern
- Style collapse: any single style >60% of comments when comments ≥5: −2

Floor at 0.

### Dimension 4: Reply-to-target match (0–10)

Look for \`Replying to:\` field (standard) OR fallback fields ("Their text:", "Context:", "Replied to: X — 'text'").

For each reply where target context is available:
- **8–10:** Reply names a specific detail, tool, phrase, or number from the target
- **5–7:** Addresses the topic but doesn't cite specifics
- **2–4:** Generic response that could fit any similar post
- **0–1:** Off-topic or wrong tone

Score = average across replies. If zero replies have target context → **score N/A (not counted in total)** and note "field stabilization in progress."

### Dimension 5: Voice match (0–10)

Mechanical per-platform check. Count comments that FAIL the platform's register:

- **LinkedIn/Medium/Substack:** FAIL if comment has fragments (no subject or no verb) OR uses casual prefixes (\`lol\`, \`tbh\`, \`idk\`, \`nah\`, \`ngl\`).
- **Bluesky/Threads:** FAIL if comment starts with capital letter AND is ≥2 full sentences with no fragments (too polished).
- **Reddit:** FAIL if comment has no casual marker (\`honestly\`, \`tbh\`, \`lol\`, \`yeah\`, \`nah\`, \`idk\`, \`fair\`, \`ha\`) AND is ≥30 words.
- **Twitter:** FAIL if comment is >35 words AND reads corporate (no compression, no punch).
- **Dev.to:** FAIL if comment has no technical specificity (no code, tool name, lib, or specific engineering concept).
- **IH:** FAIL if comment has no concrete number, timeframe, or personal project detail.

Score: 0 fails → 10 | 1–2 → 7 | 3–5 → 4 | 6+ → 0

### Dimension 6: Content-ready quality (0–10)

Read the content-ready file(s) for this agent (included below). If none exist → **score N/A (not counted)**. Score each gate 0 or 2:
- **+2:** Contains specific numbers, tool names, or concrete details (not abstract)
- **+2:** Hook opener (not "In this article", "I want to talk about", "Let's explore", "excited to announce", "thrilled to share")
- **+2:** Anti-AI clean — no em-dashes (\`—\` or \`--\`), no corporate filler, no excessive exclamations (2+ \`!\` anywhere)
- **+2:** Length within platform norms (LinkedIn post 150-250 words, Twitter thread tweets ≤280 chars each, Bluesky post ≤300 chars, articles within their SOUL range)
- **+2:** Theme matches today's brief AND (if file has \`## Post 1 / Post 2 / Post 3\` structure) status-progression is valid — no \`status: published\` duplicated, at least one \`status: pending\` remaining for today if agent hasn't maxed the weekly limit

🚨 **Severe overage cap:** If the primary publish piece (e.g., linkedin-post.md, twitter-thread.md Post 1, substack-newsletter.md) exceeds its platform cap by >20%, **cap Dimension 6 at 5** regardless of other gates. Primary content going long is load-bearing.

### Dimension 7: Execution completeness (0–10)

Check these gates:
- **+4:** Task completion — all scheduled tasks \`status == "completed"\` or \`"done"\` (all=4 | most 80%+=3 | half=2 | few=1 | none=0)
- **+2:** Comment-limit utilization ≥80% (\`daily.comments.current / limit\`). If agent has no comment limit, give +2.
- **+2:** No \`Type="Error"\` entries in today's memory AND no overdue-pending tasks (task \`time < now\` AND \`status == "pending"\` that never ran)
- **+2:** Capacity match — σ(\`max_comments\` across tasks) == \`daily.comments.limit\` in limits.json AND schedule.json \`notes\` field acknowledges relevant INSIGHTS guardrails where applicable (e.g., Twitter: references dead queries + demoted targets from INSIGHTS Miss/Demoted lists)

## Total & grade

- **Total** = sum of scored dimensions
- **Max** = 70 (or 60 if one dimension was N/A, 50 if two were N/A)
- **Percentage** = total / max × 100
- **Grade:** A+ ≥95% | A ≥85% | B+ ≥75% | B ≥65% | C ≥55% | D ≥45% | F <45%

## Output format (use exactly)

\`\`\`
# Agent Audit: ${platform}
Date: ${inputs.today}

## Summary
- Total: {sum}/{max} = {percentage}%
- Grade: {letter}

## Dimension scores

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Mechanical compliance | X/10 | {1-line or "clean"} |
| 2 | Length compliance | X/10 | |
| 3 | Diversity (opener + structure) | X/10 | |
| 4 | Reply-to-target match | X/10 or N/A | |
| 5 | Voice match | X/10 | |
| 6 | Content-ready quality | X/10 or N/A | |
| 7 | Execution completeness | X/10 | |

## Violations (quoted from memory)

{List each with: rule broken, exact quoted text, time. Omit section if none.}

## Patterns to watch

{Recurring openers, style clustering, framing repetition across today's comments. Keep under 6 lines.}

## Top 3 actionable fixes

1. {highest-priority, concrete}
2. {second}
3. {third}

## Strongest single moment

{Best comment/reply + 1-line reasoning.}
\`\`\`

## Rules for the auditor

- Evidence-based: quote exact text for any violation claimed.
- Keep output tight — this gets read, not skimmed.
- Score is directional — don't over-interpret single-day numbers.
- If data is missing for a dimension, mark N/A and adjust the max accordingly (don't zero-pad).
- **Fixes must not push voice toward AI-like.** Reject any fix that adds structure, polish, or grammatical completeness the audience would read as AI-written. Human voice uses punchy fragments, mid-sentence dashes, contractions, speechy closers. If a fix would sanitize those, either narrow its scope or drop it. When unsure, skip the fix — a penalty on the score is cheaper than sterilized voice.
- **Heartbeats are stateless.** Agent has no memory of previous heartbeats' styles. Fixes must be self-contained within a single comment's drafting — do not propose "rotate from yesterday" or "vary from last run" rules.

---

## Input files

### memory/${inputs.today}.md

${inputs.memoryToday || '(empty)'}

### SOUL.md

${inputs.soul || '(missing)'}

### INSIGHTS.md

${inputs.insights || '(missing)'}

### limits.json

\`\`\`json
${inputs.limits}
\`\`\`

### schedule.json

\`\`\`json
${inputs.schedule}
\`\`\`

### content-ready files for today

${inputs.contentReady}

### content brief (${inputs.today})

${inputs.contentBrief}
`;
}
