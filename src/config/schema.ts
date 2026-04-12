import { z } from 'zod';
import { PLATFORM_TYPES } from '../util/platform-types.js';

const PlatformTypeEnum = z.enum(PLATFORM_TYPES);

const LimitEntrySchema = z.object({
  limit: z.number().int().positive(),
});

const PlatformLimitsSchema = z.object({
  daily: z.record(z.string(), LimitEntrySchema),
  weekly: z.record(z.string(), LimitEntrySchema).optional(),
});

const ContentPillarSchema = z.object({
  name: z.string().min(1),
  topics: z.array(z.string().min(1)).min(1),
  mention_templates: z.array(z.string()).default([]),
  target_percentage: z.number().min(0).max(100).default(0),
});

const PlatformAccountSchema = z.object({
  platform: PlatformTypeEnum,
  handle: z.string().min(1),
  profile_url: z.string().url(),
  enabled: z.boolean().default(true),
  auto_run: z.boolean().default(false),
  premium: z.boolean().optional(),
  account_age: z.string().optional(),
  heartbeat_interval_minutes: z.number().int().min(15).max(480).default(60),
  limits: PlatformLimitsSchema,
  // Platform API keys (for platforms that need them)
  api_keys: z.record(z.string(), z.string()).optional(),
  behavior: z.object({
    style_ratios: z.object({
      questions: z.number().min(0).max(100).default(30),
      statements: z.number().min(0).max(100).default(30),
      reactions: z.number().min(0).max(100).default(20),
      trailing: z.number().min(0).max(100).default(20),
    }).default({}),
    disagree_target_pct: z.number().min(0).max(50).default(25),
    brand_mention_every_n: z.number().min(1).max(20).default(5),
    max_word_count: z.number().min(10).max(500).default(80),
    // Platform-specific content
    subreddits: z.array(z.string()).optional(),
    target_accounts: z.array(z.string()).optional(),
    target_companies: z.array(z.string()).optional(),
    hashtags: z.record(z.string(), z.array(z.string())).optional(),
  }).default({}),
});

const VoiceConfigSchema = z.object({
  formality: z.enum(['casual', 'balanced', 'professional']).default('casual'),
  language: z.string().default('en'),
  gender_forms: z.enum(['masculine', 'feminine']).optional(),
});

const WebhookConfigSchema = z.object({
  type: z.enum(['slack', 'discord', 'telegram']),
  url: z.string().url(),
});

const ActiveHoursSchema = z.object({
  start: z.number().int().min(0).max(23),
  end: z.number().int().min(0).max(23),
});

const AuthConfigSchema = z.object({
  provider: z.enum(['anthropic']).default('anthropic'),
  mode: z.enum(['subscription', 'api_key']),
  // For subscription mode: Claude Code OAuth token
  claude_token: z.string().optional(),
  // For API key mode: Anthropic API key
  api_key: z.string().optional(),
}).refine(
  (data) => {
    if (data.mode === 'subscription') return !!data.claude_token;
    if (data.mode === 'api_key') return !!data.api_key;
    return false;
  },
  { message: 'Provide claude_token for subscription mode or api_key for API key mode' }
);

export const OpenTwinsConfigSchema = z.object({
  auth: AuthConfigSchema,

  // Core identity
  name: z.string().min(1),
  display_name: z.string().min(1),
  headline: z.string().min(1),
  bio: z.string().min(1),
  brand_tagline: z.string().min(1),

  // Professional context
  role: z.string().min(1),
  certifications: z.array(z.string()).default([]),
  conference_mentions: z.array(z.string()).default([]),
  experience_hooks: z.array(z.string()).default([]),
  banned_phrases: z.array(z.string()).default([]),

  // Content pillars
  pillars: z.array(ContentPillarSchema).min(1).max(7),

  // Platform accounts
  platforms: z.array(PlatformAccountSchema).min(1),

  // Voice
  voice: VoiceConfigSchema,

  // Scheduling
  timezone: z.string().default('UTC'),
  active_hours: ActiveHoursSchema.default({ start: 8, end: 23 }),
  pipeline_start_hour: z.number().int().min(0).max(23).default(6),

  // Pipeline opt-in
  pipeline_enabled: z.boolean().default(true),

  // Optional integrations
  notifications: WebhookConfigSchema.optional(),
});

export type OpenTwinsConfig = z.infer<typeof OpenTwinsConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type PlatformAccount = z.infer<typeof PlatformAccountSchema>;
export type PlatformLimits = z.infer<typeof PlatformLimitsSchema>;
export type ContentPillar = z.infer<typeof ContentPillarSchema>;
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;
export type PlatformType = z.infer<typeof PlatformTypeEnum>;
