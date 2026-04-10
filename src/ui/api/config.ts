import type { Request, Response } from 'express';
import { existsSync, rmSync } from 'node:fs';
import { loadConfig, saveConfig } from '../../config/loader.js';
import { generateAgentFiles } from '../../config/generator.js';
import { OpenTwinsConfigSchema } from '../../config/schema.js';
import { getPlatformWorkspaceDir } from '../../util/paths.js';
import { ZodError } from 'zod';

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

export async function handleUpdateConfig(req: Request, res: Response): Promise<void> {
  try {
    const current = loadConfig();
    const body = { ...req.body };

    delete body.auth;

    const merged = deepMerge(current as unknown as Record<string, unknown>, body) as Record<string, unknown>;
    merged.auth = current.auth;

    const validated = OpenTwinsConfigSchema.parse(merged);

    // Detect removed platforms and clean up their workspaces
    const oldPlatforms = new Set(current.platforms.map((p) => p.platform));
    const newPlatforms = new Set(validated.platforms.map((p) => p.platform));
    for (const platform of oldPlatforms) {
      if (!newPlatforms.has(platform)) {
        const dir = getPlatformWorkspaceDir(platform);
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true });
        }
      }
    }

    saveConfig(validated);
    const { generated } = await generateAgentFiles(validated);

    res.json({ ok: true, regenerated: generated.length });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
    } else {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
}
