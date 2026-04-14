import type { PlatformLimits } from './schema.js';
import type { PlatformType } from '../util/platform-types.js';

// Conservative starting limits — tuned to keep new accounts under
// platform anti-spam heuristics. Users can raise these manually once
// the account has a track record.
export const DEFAULT_LIMITS: Record<PlatformType, PlatformLimits> = {
  reddit: {
    daily: {
      comments: { limit: 6 },
      upvotes: { limit: 12 },
    },
    weekly: {
      posts: { limit: 1 },
    },
  },
  twitter: {
    daily: {
      promo_replies: { limit: 3 },
      non_promo_engagement: { limit: 10 },
      strategic_replies: { limit: 3 },
    },
    weekly: {
      original_tweets: { limit: 7 },
      quote_tweets: { limit: 3 },
      articles: { limit: 1 },
      polls: { limit: 1 },
    },
  },
  linkedin: {
    daily: {
      comments: { limit: 3 },
      reactions: { limit: 8 },
    },
    weekly: {
      posts: { limit: 3 },
      articles: { limit: 1 },
      connection_requests: { limit: 25 },
      reposts: { limit: 1 },
      polls: { limit: 1 },
    },
  },
  bluesky: {
    daily: {
      comments: { limit: 6 },
    },
    weekly: {
      posts: { limit: 2 },
      quotes: { limit: 2 },
    },
  },
  threads: {
    daily: {
      comments: { limit: 6 },
    },
    weekly: {
      posts: { limit: 2 },
      quotes: { limit: 3 },
    },
  },
  medium: {
    daily: {
      responses: { limit: 3 },
      clap_sessions: { limit: 8 },
    },
  },
  substack: {
    daily: {
      comments: { limit: 3 },
      likes: { limit: 5 },
      subscribes: { limit: 2 },
      notes_posted: { limit: 2 },
      restacks: { limit: 2 },
    },
    weekly: {
      newsletters: { limit: 1 },
    },
  },
  devto: {
    daily: {
      comments: { limit: 3 },
      reactions: { limit: 8 },
    },
    weekly: {
      articles: { limit: 1 },
      tag_follows: { limit: 2 },
    },
  },
  ph: {
    daily: {
      comments: { limit: 4 },
      upvotes: { limit: 6 },
      follows: { limit: 10 },
      bookmarks: { limit: 15 },
    },
  },
  ih: {
    daily: {
      comments: { limit: 3 },
    },
    weekly: {
      posts: { limit: 1 },
    },
  },
};

export const DEFAULT_BEHAVIOR: Record<PlatformType, {
  subreddits?: string[];
  target_accounts?: string[];
  target_companies?: string[];
  hashtags?: Record<string, string[]>;
}> = {
  reddit: {
    subreddits: [],
  },
  twitter: {
    target_accounts: [],
    hashtags: {},
  },
  linkedin: {
    target_accounts: [],
    target_companies: [],
  },
  bluesky: {},
  threads: {},
  medium: {},
  substack: {},
  devto: {},
  ph: {},
  ih: {},
};

export const PIPELINE_STAGES = [
  {
    name: 'trend-scout',
    model: 'sonnet' as const,
    parallel: true,
    timeoutMs: 1800000,
    systemPrompt:
      'You are the Trend Scout agent. ALWAYS read trend-scout/AGENT.md first, then follow trend-scout/cron-prompt.md step by step.',
    prompt: 'Execute your scan for today.',
  },
  {
    name: 'competitive-intel',
    model: 'sonnet' as const,
    parallel: true,
    timeoutMs: 1800000,
    systemPrompt:
      'You are the Competitive Intelligence agent. ALWAYS read competitive-intel/AGENT.md first, then follow competitive-intel/cron-prompt.md step by step. Write briefing file FIRST, then output.',
    prompt: 'Execute your daily briefing.',
  },
  {
    name: 'engagement-tracker',
    model: 'sonnet' as const,
    parallel: true,
    timeoutMs: 1800000,
    systemPrompt:
      'You are the Engagement Tracker agent. ALWAYS read engagement-tracker/AGENT.md first, then follow engagement-tracker/cron-prompt-daily.md step by step.',
    prompt: 'Execute your daily scan.',
  },
  {
    name: 'network-mapper',
    model: 'sonnet' as const,
    parallel: true,
    timeoutMs: 1800000,
    systemPrompt:
      'You are the Network Mapper agent. ALWAYS read network-mapper/AGENT.md first, then follow network-mapper/cron-prompt.md step by step.',
    prompt: 'Execute your daily scan.',
  },
  {
    name: 'amplification',
    model: 'sonnet' as const,
    parallel: false,
    timeoutMs: 1800000,
    systemPrompt:
      'You are the Amplification agent. ALWAYS read amplification/AGENT.md first, then follow amplification/cron-prompt.md step by step.',
    prompt: 'Execute your daily analysis.',
  },
  {
    name: 'content-planner',
    model: 'opus' as const,
    parallel: false,
    timeoutMs: 2400000,
    systemPrompt:
      'You are the Content Planner agent. ALWAYS read content-planner/AGENT.md first, then follow content-planner/cron-prompt.md step by step.',
    prompt: "Generate TODAY's content brief.",
  },
  {
    name: 'content-writer',
    model: 'opus' as const,
    parallel: false,
    timeoutMs: 2400000,
    systemPrompt:
      'You are the Content Writer agent. ALWAYS read content-writer/AGENT.md first, then follow content-writer/cron-prompt.md step by step.',
    prompt: "Produce TODAY's content package.",
  },
];
