# Content Writer — Cron Prompt

## Step 1: Load Context

1. Read `content-writer/AGENT.md` — your spec (voice per platform, rules, output format, status headers)
2. Use today's date. Read `content-briefs/{today_date}.md` — the brief

If the content brief doesn't exist → output "No brief for today. Skipping." and stop.

Do NOT read any other files. The brief is your single source of truth.

## Step 2: Write the Medium Article

This is the anchor piece. Write it first, then derive platform variants.

Structure:
1. **Title** — intriguing, honest. Not clickbait. Not generic.
2. **Opening** — story, surprising data point, or contrarian take. First 2 sentences must hook.
3. **Body** — 3-4 sections. Mix narrative, insight, and concrete examples. Short paragraphs.
4. **Ending** — question to the reader or forward-looking thought. Never summarize.
5. **Tags** — 5 relevant tags
6. **Image prompt** — specific visual for article header

Save as `medium-article.md`.

Quality check before saving:
- Would YOU stop scrolling to read this? If no, rewrite the opening.
- Does it have at least one specific number, example, or story? If no, add one.
- Is any paragraph longer than 3 sentences? Split it.
- Does it sound like a corporate blog? Rewrite in first person, casual tone.
- Any em dashes or double dashes? Replace with single dash.

## Step 3: Write Article Variants

These are adaptations of the same long-form piece for different platforms:

1. **linkedin-article.md** — Professional thought leadership. More structured than article.md — clear sections, actionable frameworks, discussion prompt at the end. 800-1500 words.
2. **substack-newsletter.md** — Personal, story-driven, newsletter tone. 1000-2000 words. Different angle than article.md — like writing to a friend. No "In this article" or "thanks for reading."
3. **devto-article.md** — Developer-focused, code snippets welcome. Add `canonical_url` and `tags` frontmatter. Can cross-post from article.md with adjustments for dev audience.

## Step 4: Write Short-Form Posts

Each file contains **up to 3 posts**, each with a different angle on the theme. Use this format:

```
## Post 1
status: pending

[post content]

---

## Post 2
status: pending

[post content]

---

## Post 3
status: pending

[post content]
```

Platform agents update `status: pending` → `status: published` after posting.

Write these files (follow per-platform voice rules in AGENT.md):

1. **linkedin-post.md** — Professional but human. Line breaks. End with question. 150-300 words each.
2. **twitter-thread.md** — Each post is a 3-5 tweet thread. Tweets under 280 chars, separated by `\n\n` within each post. First tweet is the hook. Used for `original_tweet` tasks.
3. **twitter-article.md** — Twitter article, 500-800 words. Adapted from Medium style but punchier, shorter paragraphs. Used for `article` tasks.
4. **threads-post.md** — Casual, text-a-friend. `\n\n` paragraphs. 100-300 words each.
5. **bluesky-post.md** — English only, casual. `\n\n` paragraphs. 100-300 words each.
6. **substack-note.md** — Personal, newsletter-adjacent. `\n\n` paragraphs. 100-200 words each.
7. **reddit-post.md** — Each post has subreddit suggestion + title + body. SHORT, value-first, no self-promo.
8. **ih-post.md** — Builder-to-builder, messy, real numbers. Each post stands alone.
9. **ph-comment-angles.md** — NOT posts. Angles and hooks for reacting to launches. No status headers needed for this file.

## Step 5: Handle Amplification (if in brief)

If the brief includes an **Amplification** section:
- Add the adapted content as extra posts INSIDE the relevant platform files (e.g., Post 4 in `twitter-thread.md`)
- Mark with `## Post N (amplified)` and include `source:` line
- Do NOT create separate `amplified-*.md` files

## Step 6: Save

Create directory `content-ready/{today_date}/` and save all files there.

## Step 7: Output to Slack

```
Content Package — {date}

Long-form: medium-article, linkedin-article, twitter-article, substack-newsletter, devto-article
Short posts (3+ each): linkedin, twitter threads, threads, bluesky, substack notes, reddit, ih
PH angles: ✓
Amplified: {count} posts merged into platform files (or "none")

Files: content-ready/{date}/
```
