import type { Request, Response } from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import { ZodError } from 'zod';
import { configExists, saveConfig } from '../../config/loader.js';
import { OpenTwinsConfigSchema, type OpenTwinsConfig } from '../../config/schema.js';
import { generateAgentFiles } from '../../config/generator.js';
import { validateAuth, isClaudeInstalled } from '../../util/claude.js';
import { isChromeInstalled } from '../../browser/chrome.js';
import { getOpenTwinsHome } from '../../util/paths.js';
import { DEFAULT_LIMITS } from '../../config/defaults.js';
import { fileLog } from '../../util/logger.js';
import { PLATFORM_URLS } from '../../util/platform-types.js';
import type { PlatformType } from '../../util/platform-types.js';

// ── GET /api/setup/status ─────────────────────────────────────
// Returns whether the app is configured and whether prerequisites are installed

export async function handleSetupStatus(_req: Request, res: Response): Promise<void> {
  try {
    const [claude, chrome] = await Promise.all([
      isClaudeInstalled(),
      Promise.resolve(isChromeInstalled()),
    ]);
    res.json({
      configured: configExists(),
      prereqs: {
        claude,
        chrome,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
  }
}

// ── POST /api/setup/validate-auth ─────────────────────────────
// Validates the auth credentials without saving anything

export async function handleValidateAuth(req: Request, res: Response): Promise<void> {
  try {
    const { mode, claude_token, api_key } = req.body || {};

    if (mode !== 'subscription' && mode !== 'api_key') {
      res.status(400).json({ ok: false, error: 'Invalid auth mode' });
      return;
    }

    if (mode === 'subscription' && !claude_token) {
      res.status(400).json({ ok: false, error: 'claude_token required' });
      return;
    }
    if (mode === 'api_key' && !api_key) {
      res.status(400).json({ ok: false, error: 'api_key required' });
      return;
    }

    const auth = mode === 'subscription'
      ? { provider: 'anthropic' as const, mode: 'subscription' as const, claude_token }
      : { provider: 'anthropic' as const, mode: 'api_key' as const, api_key };

    const ok = await validateAuth(auth);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Validation failed' });
  }
}

// ── POST /api/setup ───────────────────────────────────────────
// Receives the full setup payload, writes config, generates agent files

interface SetupPayload {
  auth: {
    mode: 'subscription' | 'api_key';
    claude_token?: string;
    api_key?: string;
  };
  name: string;
  display_name: string;
  headline: string;
  bio: string;
  brand_tagline: string;
  role: string;
  certifications: string[];
  conference_mentions: string[];
  experience_hooks: string[];
  pillars: string[];  // simple list of topic names
  platforms: Array<{ platform: string; handle: string }>;
  voice: { formality: 'casual' | 'balanced' | 'professional' };
  timezone: string;
  active_hours: { start: number; end: number };
  pipeline_enabled: boolean;
  force?: boolean;
}

export async function handleSetup(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as SetupPayload;

    // Block unless explicitly forcing re-setup
    if (configExists() && !body.force) {
      res.status(409).json({ error: 'Config already exists. Send force:true to overwrite.' });
      return;
    }

    // Build config object
    const config: OpenTwinsConfig = OpenTwinsConfigSchema.parse({
      auth: {
        provider: 'anthropic',
        mode: body.auth.mode,
        claude_token: body.auth.claude_token,
        api_key: body.auth.api_key,
      },
      name: body.name,
      display_name: body.display_name,
      headline: body.headline,
      bio: body.bio,
      brand_tagline: body.brand_tagline,
      role: body.role,
      certifications: body.certifications || [],
      conference_mentions: body.conference_mentions || [],
      experience_hooks: body.experience_hooks || [],
      banned_phrases: [],
      pillars: (body.pillars || []).filter(Boolean).map((name) => ({
        name,
        topics: [name.toLowerCase()],
        mention_templates: [],
        target_percentage: 0,
      })),
      platforms: (body.platforms || []).map((p) => ({
        platform: p.platform as PlatformType,
        handle: p.handle,
        profile_url: p.handle.startsWith('http') ? p.handle : `${PLATFORM_URLS[p.platform as PlatformType] || ''}${p.handle}`,
        enabled: true,
        limits: DEFAULT_LIMITS[p.platform as PlatformType] || { daily: {} },
      })),
      voice: { formality: body.voice.formality, language: 'en' },
      timezone: body.timezone,
      active_hours: body.active_hours,
      pipeline_start_hour: 6,
      pipeline_enabled: body.pipeline_enabled,
    });

    // Ensure home dir exists
    const home = getOpenTwinsHome();
    if (!existsSync(home)) mkdirSync(home, { recursive: true });

    // Save config and generate agent files
    saveConfig(config);
    const { generated } = await generateAgentFiles(config);
    fileLog('setup', 'Setup completed', { platforms: config.platforms.length, filesGenerated: generated.length });

    res.json({ ok: true, regenerated: generated.length });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Setup failed' });
  }
}
