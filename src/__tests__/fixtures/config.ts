import type { OpenTwinsConfig } from '../../config/schema.js';

export const VALID_CONFIG: OpenTwinsConfig = {
  auth: {
    provider: 'anthropic',
    mode: 'api_key',
    api_key: 'sk-ant-api03-test-key-1234567890',
  },
  name: 'Alex Johnson',
  display_name: 'Alex',
  headline: 'Online Fitness Coach - Helping busy professionals get strong',
  bio: 'I help busy professionals build strength and lose fat in 3 hours a week.',
  brand_tagline: 'The No-BS Fitness Coach',
  role: 'Online Fitness Coach',
  certifications: ['NASM CPT', 'Precision Nutrition L2'],
  conference_mentions: ['IDEA World', 'NSCA National'],
  experience_hooks: [
    'Coached 500+ busy professionals to their first pull-up',
    'Built a 6-figure coaching business from a garage gym',
  ],
  banned_phrases: ['at my company', 'at my org'],
  pillars: [
    {
      name: 'Strength Training',
      topics: ['progressive overload', 'compound movements', 'recovery'],
      mention_templates: ['in my experience coaching strength...'],
      target_percentage: 40,
    },
    {
      name: 'Nutrition for Busy Professionals',
      topics: ['meal prep', 'protein intake', 'eating on the go'],
      mention_templates: [],
      target_percentage: 35,
    },
    {
      name: 'Building a Coaching Business',
      topics: ['client acquisition', 'online coaching', 'scaling'],
      mention_templates: [],
      target_percentage: 25,
    },
  ],
  platforms: [
    {
      platform: 'linkedin',
      handle: 'alexjohnson-fitness',
      profile_url: 'https://www.linkedin.com/in/alexjohnson-fitness',
      enabled: true,
      heartbeat_interval_minutes: 60,
      limits: {
        daily: {
          comments: { limit: 4 },
          reactions: { limit: 12 },
        },
        weekly: {
          posts: { limit: 5 },
          articles: { limit: 2 },
        },
      },
      behavior: {
        style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 },
        disagree_target_pct: 25,
        brand_mention_every_n: 5,
        max_word_count: 80,
      },
    },
    {
      platform: 'twitter',
      handle: 'alexfitcoach',
      profile_url: 'https://x.com/alexfitcoach',
      enabled: true,
      heartbeat_interval_minutes: 30,
      limits: {
        daily: {
          promo_replies: { limit: 5 },
          non_promo_engagement: { limit: 20 },
        },
      },
      behavior: {
        style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 },
        disagree_target_pct: 25,
        brand_mention_every_n: 5,
        max_word_count: 80,
      },
    },
  ],
  voice: {
    formality: 'casual',
    language: 'en',
  },
  timezone: 'UTC',
  active_hours: { start: 8, end: 23 },
  pipeline_start_hour: 6,
  pipeline_enabled: true,
};

// Config with ALL 10 platforms enabled
export const FULL_CONFIG: OpenTwinsConfig = {
  ...VALID_CONFIG,
  platforms: [
    { platform: 'linkedin', handle: 'alexfitness', profile_url: 'https://www.linkedin.com/in/alexfitness', enabled: true, heartbeat_interval_minutes: 60, limits: { daily: { comments: { limit: 4 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'twitter', handle: 'alexfitcoach', profile_url: 'https://x.com/alexfitcoach', enabled: true, heartbeat_interval_minutes: 30, limits: { daily: { comments: { limit: 5 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'reddit', handle: 'alexfitcoach', profile_url: 'https://reddit.com/user/alexfitcoach', enabled: true, heartbeat_interval_minutes: 40, limits: { daily: { comments: { limit: 10 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'bluesky', handle: 'alexfit.bsky.social', profile_url: 'https://bsky.app/profile/alexfit.bsky.social', enabled: true, heartbeat_interval_minutes: 60, limits: { daily: { comments: { limit: 10 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'threads', handle: 'alexfitcoach', profile_url: 'https://www.threads.net/@alexfitcoach', enabled: true, heartbeat_interval_minutes: 40, limits: { daily: { comments: { limit: 10 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'medium', handle: 'alexfitcoach', profile_url: 'https://medium.com/@alexfitcoach', enabled: true, heartbeat_interval_minutes: 90, limits: { daily: { responses: { limit: 5 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'substack', handle: 'alexfitcoach', profile_url: 'https://alexfitcoach.substack.com', enabled: true, heartbeat_interval_minutes: 90, limits: { daily: { comments: { limit: 4 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'devto', handle: 'alexfitcoach', profile_url: 'https://dev.to/alexfitcoach', enabled: true, heartbeat_interval_minutes: 90, limits: { daily: { comments: { limit: 6 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'ph', handle: 'alexfitcoach', profile_url: 'https://www.producthunt.com/@alexfitcoach', enabled: true, heartbeat_interval_minutes: 90, limits: { daily: { comments: { limit: 8 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
    { platform: 'ih', handle: 'alexfitcoach', profile_url: 'https://www.indiehackers.com/alexfitcoach', enabled: true, heartbeat_interval_minutes: 150, limits: { daily: { comments: { limit: 4 } } }, behavior: { style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 }, disagree_target_pct: 25, brand_mention_every_n: 5, max_word_count: 80 } },
  ],
};

// Banned terms that should NOT appear in generated files (outside of {{ }} context)
export const BANNED_TERMS = [
  'project management',
  'Project Manager',
  'Product Manager',
  'PM tool',
  'PM framework',
  'PM career',
  'PM leader',
  'PM brain',
  'PM angle',
  'PM perspective',
  'PM writing',
  'AI agent',
  'AI-native',
  'AI dashboard',
  'sprint planner',
  'managing AI',
  'open-source PM',
  'agile vs',
  'scrum master',
  'backlog grooming',
  'Jira',
  'Monday.com',
  'LeadDev',
  'PMI',
  'Lenny Rachitsky',
  'Shreyas Doshi',
  'Ethan Mollick',
];
