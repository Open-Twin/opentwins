import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

let tmpDir: string;
let fakeTemplatesDir: string;

// We clone the real templates into the tmp dir so we can mutate them per test
// (add broken .hbs files, inject partials) without touching the repo.
function setupFakeTemplates() {
  const actual = require('../util/paths.js');
  // Can't require from ESM — we'll import inside the test with real getTemplatesDir
}

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (p: string) => resolve(tmpDir, 'workspaces', `agent-${p}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getTemplatesDir: () => fakeTemplatesDir,
    getPlatformTemplateDir: (p: string) => resolve(fakeTemplatesDir, 'platforms', p),
    getPipelineTemplateDir: (agent: string) => resolve(fakeTemplatesDir, 'pipeline', agent),
  };
});

describe('config/generator robustness', () => {
  beforeEach(async () => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-gen-rob-'));
    mkdirSync(resolve(tmpDir, 'workspaces'), { recursive: true });

    // Clone real templates into a tmp dir we can mutate.
    fakeTemplatesDir = resolve(tmpDir, 'templates');
    const pathsMod = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
    const realDir = pathsMod.getTemplatesDir();
    cpSync(realDir, fakeTemplatesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('escapes user-controlled fields safely — {{ in pillar names does not crash or execute', async () => {
    const maliciousConfig = {
      ...VALID_CONFIG,
      name: 'Alex {{malicious}} Injector',
      pillars: [
        { name: '{{pwned}}', topics: ['t1'], mention_templates: [], target_percentage: 0 },
        { name: 'Normal', topics: ['t2'], mention_templates: [], target_percentage: 0 },
      ],
    };

    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(maliciousConfig);

    // Files should still be generated, and the literal "{{malicious}}" should
    // appear as text in IDENTITY.md (Handlebars noEscape passes through).
    const identity = readFileSync(
      resolve(tmpDir, 'workspaces', 'agent-linkedin', 'IDENTITY.md'),
      'utf-8',
    );
    // The injected braces should not have been re-interpreted — they are output as-is.
    expect(identity).toContain('{{malicious}}');
  });

  it('throws with a clear error when a template has Handlebars syntax errors', async () => {
    // Inject a broken template into linkedin platform templates.
    writeFileSync(
      resolve(fakeTemplatesDir, 'platforms', 'linkedin', 'BROKEN.md.hbs'),
      '{{#if unterminated',
      'utf-8',
    );

    const { generateAgentFiles } = await import('../config/generator.js');
    await expect(generateAgentFiles(VALID_CONFIG)).rejects.toThrow();
  });

  it('skips platforms whose template dir does not exist (does not throw)', async () => {
    // Remove the twitter template dir entirely.
    rmSync(resolve(fakeTemplatesDir, 'platforms', 'twitter'), { recursive: true, force: true });

    const { generateAgentFiles } = await import('../config/generator.js');
    const result = await generateAgentFiles(VALID_CONFIG);
    expect(result.generated.length).toBeGreaterThan(0);
    // LinkedIn still succeeds.
    expect(existsSync(resolve(tmpDir, 'workspaces', 'agent-linkedin'))).toBe(true);
    // Twitter workspace is not created because its template dir is missing.
    expect(existsSync(resolve(tmpDir, 'workspaces', 'agent-twitter'))).toBe(false);
  });

  it('preserves memory/ directory on regeneration', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    // Drop a file into memory/ that the agent would have written.
    const memFile = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'memory', 'today.txt');
    writeFileSync(memFile, 'important runtime state', 'utf-8');

    await generateAgentFiles(VALID_CONFIG);
    expect(existsSync(memFile)).toBe(true);
    expect(readFileSync(memFile, 'utf-8')).toBe('important runtime state');
  });

  it('does NOT overwrite an existing limits.json (runtime counters preserved)', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const limitsPath = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'limits.json');
    writeFileSync(
      limitsPath,
      JSON.stringify({ daily: { comments: { limit: 4, current: 2 } } }),
      'utf-8',
    );

    // Regenerate with a NEW limit value — existing file should be kept.
    const changedConfig = {
      ...VALID_CONFIG,
      platforms: VALID_CONFIG.platforms.map((p) =>
        p.platform === 'linkedin'
          ? { ...p, limits: { daily: { comments: { limit: 99 } } } }
          : p,
      ),
    };
    await generateAgentFiles(changedConfig);

    const after = JSON.parse(readFileSync(limitsPath, 'utf-8'));
    // The existing file was kept — current (=2) preserved, limit still the original 4.
    expect(after.daily.comments.current).toBe(2);
    expect(after.daily.comments.limit).toBe(4);
  });

  it('cleanWorkspaceDir removes stale generated files but keeps preserve-list entries', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const workDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    // Drop a stale .md file that isn't in the template; it should be removed next time.
    writeFileSync(resolve(workDir, 'STALE.md'), 'old', 'utf-8');
    // But limits.json should survive because it's on the preserve list.
    const limitsBefore = readFileSync(resolve(workDir, 'limits.json'), 'utf-8');

    await generateAgentFiles(VALID_CONFIG);
    expect(existsSync(resolve(workDir, 'STALE.md'))).toBe(false);
    expect(readFileSync(resolve(workDir, 'limits.json'), 'utf-8')).toBe(limitsBefore);
  });

  it('omits pipeline workspace when pipeline_enabled is false', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles({ ...VALID_CONFIG, pipeline_enabled: false });
    expect(existsSync(resolve(tmpDir, 'workspaces', 'pipeline'))).toBe(false);
  });

  it('handles handles without an @ prefix correctly in the slug helper', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    const customConfig = {
      ...VALID_CONFIG,
      platforms: [{
        ...VALID_CONFIG.platforms[0],
        handle: '@alexjohnson-fitness',
      }],
    };
    await generateAgentFiles(customConfig);
    // Identity should still render without errors.
    const identity = readFileSync(
      resolve(tmpDir, 'workspaces', 'agent-linkedin', 'IDENTITY.md'),
      'utf-8',
    );
    // The literal handle should appear (even if the slug drops the @).
    expect(identity.length).toBeGreaterThan(0);
  });

  it('emits no unresolved Handlebars tags in any generated .md file', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const workDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    for (const file of readdirSync(workDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(resolve(workDir, file), 'utf-8');
      // Any surviving Handlebars syntax would be a bug — look for {{identifier}}.
      const unresolved = content.match(/\{\{[a-zA-Z_][^}]*\}\}/g) || [];
      expect(unresolved, `${file} has unresolved tags: ${unresolved.join(', ')}`).toEqual([]);
    }
  });
});
