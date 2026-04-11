import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import Handlebars from 'handlebars';
import type { OpenTwinsConfig, PlatformAccount } from './schema.js';
import {
  getWorkspacesDir,
  getPlatformWorkspaceDir,
  getPipelineWorkspaceDir,
  getPlatformTemplateDir,
  getPipelineTemplateDir,
  getTemplatesDir,
} from '../util/paths.js';
import { PLATFORM_TYPES } from '../util/platform-types.js';

// Register Handlebars helpers
Handlebars.registerHelper('join', (arr: string[], sep: string) =>
  Array.isArray(arr) ? arr.join(typeof sep === 'string' ? sep : ', ') : ''
);

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

Handlebars.registerHelper('add1', (index: number) => index + 1);

Handlebars.registerHelper('lowercase', (str: string) =>
  typeof str === 'string' ? str.toLowerCase() : ''
);

Handlebars.registerHelper('ifEq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('pillarsFormatted', (pillars: unknown) =>
  Array.isArray(pillars)
    ? pillars.map((p, i) => `${i + 1}. ${p.name} (${p.topics.join(', ')})`).join('\n')
    : ''
);

Handlebars.registerHelper('mentionTemplatesFormatted', (pillars: unknown) =>
  Array.isArray(pillars)
    ? pillars.filter((p) => p.mention_templates?.length > 0).map((p) => `- ${p.name}: "${p.mention_templates[0]}"`).join('\n')
    : ''
);

Handlebars.registerHelper('pillarDistribution', (pillars: unknown) =>
  Array.isArray(pillars)
    ? pillars.filter((p) => p.target_percentage > 0).map((p) => `  - ${p.target_percentage}% ${p.name}`).join('\n')
    : ''
);

interface TemplateContext {
  // Core identity
  name: string;
  display_name: string;
  headline: string;
  bio: string;
  brand_tagline: string;
  role: string;
  certifications: string[];
  certifications_text: string;
  conference_mentions: string[];
  conferences_text: string;
  experience_hooks: string[];
  banned_phrases: string[];
  pillars: OpenTwinsConfig['pillars'];

  // Platform-specific
  platform: string;
  handle: string | Record<string, string>;
  handle_slug: string;
  profile_url: string;
  premium?: boolean;
  account_age?: string;
  browser_profile: string;

  // Voice
  voice: OpenTwinsConfig['voice'];
  gender_verb_examples: string;

  // Paths
  opentwins_home: string;
  pipeline_workspace: string;

  // Schedule
  timezone: string;
  active_hours: OpenTwinsConfig['active_hours'];

  // Limits (serialized)
  limits_json: string;

  // Behavior
  behavior: {
    style_ratios: { questions: number; statements: number; reactions: number; trailing: number };
    disagree_target_pct: number;
    brand_mention_every_n: number;
    max_word_count: number;
    subreddits?: string[];
    target_accounts?: string[];
    target_companies?: string[];
    hashtags?: Record<string, string[]>;
  };

  // API keys
  api_keys: Record<string, string>;

  // Computed
  brand_tagline_lowercase: string;

  // Extended (for pipeline templates)
  company: string;
  location: string;
  name_uk: string;
  name_variations: string;
  name_search_variations: string[];
  name_search_variations_cyrillic: string[];
  conference_history: string[];
}

function buildContext(
  config: OpenTwinsConfig,
  platform: PlatformAccount
): TemplateContext {
  const genderExamples =
    config.voice.gender_forms === 'feminine'
      ? 'готувала, робила, пробувала'
      : 'готував, робив, пробував';

  // Extract slug from handle (might be full URL or just slug)
  const handleSlug = (() => {
    const h = typeof platform.handle === 'string' ? platform.handle : '';
    if (h.startsWith('http')) {
      try {
        const segs = new URL(h).pathname.split('/').filter(Boolean);
        return segs[segs.length - 1] || h;
      } catch { return h; }
    }
    return h.startsWith('@') ? h.slice(1) : h;
  })();

  return {
    name: config.name,
    display_name: config.display_name,
    headline: config.headline,
    bio: config.bio,
    brand_tagline: config.brand_tagline,
    role: config.role,
    certifications: config.certifications,
    certifications_text: config.certifications.join(', '),
    conference_mentions: config.conference_mentions,
    conferences_text: config.conference_mentions.join(', '),
    experience_hooks: config.experience_hooks,
    banned_phrases: config.banned_phrases,
    pillars: config.pillars,

    platform: platform.platform,
    handle: platform.handle,
    handle_slug: handleSlug,
    profile_url: platform.profile_url,
    premium: platform.premium,
    account_age: platform.account_age,
    browser_profile: `ot-${platform.platform}`,

    voice: config.voice,
    gender_verb_examples: genderExamples,

    opentwins_home: getWorkspacesDir(),
    pipeline_workspace: getPipelineWorkspaceDir(),

    timezone: config.timezone,
    active_hours: config.active_hours,

    limits_json: JSON.stringify(buildLimitsJson(platform), null, 2),

    api_keys: platform.api_keys || {},

    behavior: platform.behavior || {
      style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 },
      disagree_target_pct: 25,
      brand_mention_every_n: 5,
      max_word_count: 80,
    },

    brand_tagline_lowercase: config.brand_tagline.toLowerCase(),
    company: '',
    location: '',
    name_uk: '',
    name_variations: '',
    name_search_variations: [],
    name_search_variations_cyrillic: [],
    conference_history: config.conference_mentions,
  };
}

function buildHandleMap(config: OpenTwinsConfig): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of config.platforms) {
    map[p.platform] = p.handle;
    // Also add common aliases
    if (p.platform === 'ph') map['producthunt'] = p.handle;
  }
  return map;
}

function buildLimitsJson(platform: PlatformAccount): Record<string, unknown> {
  const result: Record<string, Record<string, Record<string, unknown>>> = {};

  result.daily = {};
  for (const [key, val] of Object.entries(platform.limits.daily)) {
    result.daily[key] = { limit: val.limit, current: 0 };
  }

  if (platform.limits.weekly) {
    result.weekly = {};
    for (const [key, val] of Object.entries(platform.limits.weekly)) {
      result.weekly[key] = { limit: val.limit, current: 0 };
    }
  }

  return result;
}

function renderTemplate(templatePath: string, context: TemplateContext): string {
  const raw = readFileSync(templatePath, 'utf-8');
  const compiled = Handlebars.compile(raw, { noEscape: true });
  return compiled(context);
}

function copyDirRecursive(src: string, dest: string, context?: TemplateContext): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath, context);
    } else if (entry.endsWith('.hbs') && context) {
      const outputName = entry.replace(/\.hbs$/, '');
      const content = renderTemplate(srcPath, context);
      writeFileSync(join(dest, outputName), content, 'utf-8');
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function cleanWorkspaceDir(dir: string): void {
  if (!existsSync(dir)) return;
  // Remove generated .md files but preserve memory/, schedule.json, and agent runtime data
  const preserve = new Set(['memory', 'schedule.json', 'queries.json', 'limits.json']);
  for (const entry of readdirSync(dir)) {
    if (preserve.has(entry)) continue;
    const entryPath = join(dir, entry);
    if (statSync(entryPath).isDirectory()) continue; // Keep all subdirs (memory/, etc.)
    rmSync(entryPath);
  }
}

export async function generateAgentFiles(config: OpenTwinsConfig): Promise<{ generated: string[] }> {
  const generated: string[] = [];
  const workspacesDir = getWorkspacesDir();
  ensureDir(workspacesDir);

  // Generate platform agent workspaces
  for (const platformAccount of config.platforms) {
    if (!platformAccount.enabled) continue;

    const templateDir = getPlatformTemplateDir(platformAccount.platform);
    if (!existsSync(templateDir)) {
      continue; // Skip platforms without templates
    }

    const outputDir = getPlatformWorkspaceDir(platformAccount.platform);
    ensureDir(outputDir);
    cleanWorkspaceDir(outputDir);
    ensureDir(join(outputDir, 'memory'));

    const context = buildContext(config, platformAccount);
    const files = readdirSync(templateDir);

    for (const file of files) {
      const srcPath = join(templateDir, file);

      if (statSync(srcPath).isDirectory()) {
        // Recursively copy subdirectory (e.g., scripts/), rendering .hbs files
        copyDirRecursive(srcPath, join(outputDir, file), context);
        generated.push(join(outputDir, file));
        continue;
      }

      const isTemplate = file.endsWith('.hbs');
      if (isTemplate) {
        const outputName = file.replace(/\.hbs$/, '');
        const outputPath = join(outputDir, outputName);
        const content = renderTemplate(srcPath, context);
        writeFileSync(outputPath, content, 'utf-8');
        generated.push(outputPath);
      } else {
        const outputPath = join(outputDir, file);
        copyFileSync(srcPath, outputPath);
        generated.push(outputPath);
      }
    }

    // Write limits.json from config (only if it doesn't exist — preserve runtime counters)
    const limitsPath = join(outputDir, 'limits.json');
    if (!existsSync(limitsPath)) {
      writeFileSync(limitsPath, JSON.stringify(buildLimitsJson(platformAccount), null, 2) + '\n', 'utf-8');
      generated.push(limitsPath);
    }

    // Create empty schedule.json
    const schedulePath = join(outputDir, 'schedule.json');
    if (!existsSync(schedulePath)) {
      writeFileSync(schedulePath, '{}', 'utf-8');
    }
  }

  // Generate pipeline workspace
  if (config.pipeline_enabled) {
    const pipelineDir = getPipelineWorkspaceDir();
    ensureDir(pipelineDir);
    ensureDir(join(pipelineDir, 'content-briefs'));
    ensureDir(join(pipelineDir, 'content-ready'));

    const pipelineTemplatesBase = resolve(getTemplatesDir(), 'pipeline');
    if (existsSync(pipelineTemplatesBase)) {
      const pipelineAgents = readdirSync(pipelineTemplatesBase);

      // Build a pipeline context (no specific platform)
      const pipelineContext: TemplateContext = {
        name: config.name,
        display_name: config.display_name,
        headline: config.headline,
        bio: config.bio,
        brand_tagline: config.brand_tagline,
        role: config.role,
        certifications: config.certifications,
        certifications_text: config.certifications.join(', '),
        conference_mentions: config.conference_mentions,
        conferences_text: config.conference_mentions.join(', '),
        experience_hooks: config.experience_hooks,
        banned_phrases: config.banned_phrases,
        pillars: config.pillars,
        platform: 'pipeline',
        handle: buildHandleMap(config),
        handle_slug: '',
        profile_url: '',
        browser_profile: '',
        voice: config.voice,
        gender_verb_examples: '',
        opentwins_home: getWorkspacesDir(),
        pipeline_workspace: pipelineDir,
        timezone: config.timezone,
        active_hours: config.active_hours,
        limits_json: '{}',
        api_keys: {},
        behavior: {
          style_ratios: { questions: 30, statements: 30, reactions: 20, trailing: 20 },
          disagree_target_pct: 25,
          brand_mention_every_n: 5,
          max_word_count: 80,
        },
        brand_tagline_lowercase: config.brand_tagline.toLowerCase(),
        company: '',
        location: '',
        name_uk: '',
        name_variations: '',
        name_search_variations: [config.name],
        name_search_variations_cyrillic: [],
        conference_history: config.conference_mentions,
      };

      for (const entry of pipelineAgents) {
        const entryPath = join(pipelineTemplatesBase, entry);
        const stat = statSync(entryPath);

        if (stat.isDirectory()) {
          // Agent subdirectory
          const agentOutputDir = join(pipelineDir, entry);
          ensureDir(agentOutputDir);

          const files = readdirSync(entryPath);
          for (const file of files) {
            const srcPath = join(entryPath, file);
            const isTemplate = file.endsWith('.hbs');

            if (isTemplate) {
              const outputName = file.replace(/\.hbs$/, '');
              const outputPath = join(agentOutputDir, outputName);
              const content = renderTemplate(srcPath, pipelineContext);
              writeFileSync(outputPath, content, 'utf-8');
              generated.push(outputPath);
            } else {
              const outputPath = join(agentOutputDir, file);
              copyFileSync(srcPath, outputPath);
              generated.push(outputPath);
            }
          }
        } else {
          // Shared file at pipeline root (ARCHITECTURE.md, SOUL.md, etc.)
          const isTemplate = entry.endsWith('.hbs');
          if (isTemplate) {
            const outputName = entry.replace(/\.hbs$/, '');
            const outputPath = join(pipelineDir, outputName);
            const content = renderTemplate(entryPath, pipelineContext);
            writeFileSync(outputPath, content, 'utf-8');
            generated.push(outputPath);
          } else {
            const outputPath = join(pipelineDir, entry);
            copyFileSync(entryPath, outputPath);
            generated.push(outputPath);
          }
        }
      }
    }
  }

  return { generated };
}
