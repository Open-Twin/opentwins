import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { VALID_CONFIG } from './fixtures/config.js';

// Mock paths to use temp directory
let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (platform: string) => resolve(tmpDir, 'workspaces', `agent-${platform}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getTemplatesDir: () => actual.getTemplatesDir(), // Use real templates
    getPlatformTemplateDir: (platform: string) => actual.getPlatformTemplateDir(platform),
  };
});

describe('Generator', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-gen-'));
    mkdirSync(resolve(tmpDir, 'workspaces'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates workspace directory for each enabled platform', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    for (const p of VALID_CONFIG.platforms.filter((p) => p.enabled)) {
      const dir = resolve(tmpDir, 'workspaces', `agent-${p.platform}`);
      expect(existsSync(dir), `workspace for ${p.platform} should exist`).toBe(true);
    }
  });

  it('creates memory subdirectory', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const memoryDir = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'memory');
    expect(existsSync(memoryDir)).toBe(true);
  });

  it('creates limits.json with valid structure', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const limitsPath = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'limits.json');
    expect(existsSync(limitsPath)).toBe(true);

    const limits = JSON.parse(readFileSync(limitsPath, 'utf-8'));
    expect(limits.daily).toBeDefined();
    expect(limits.daily.comments).toHaveProperty('limit');
    expect(limits.daily.comments).toHaveProperty('current');
    expect(limits.daily.comments.current).toBe(0);
  });

  it('creates schedule.json', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const schedulePath = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'schedule.json');
    expect(existsSync(schedulePath)).toBe(true);
    const schedule = JSON.parse(readFileSync(schedulePath, 'utf-8'));
    expect(schedule).toEqual({});
  });

  it('renders .hbs files and removes extension', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const workDir = resolve(tmpDir, 'workspaces', 'agent-linkedin');
    const files = readdirSync(workDir);

    // Should have .md files (rendered from .hbs), not .hbs files
    expect(files.some((f) => f === 'HEARTBEAT.md')).toBe(true);
    expect(files.some((f) => f === 'SOUL.md')).toBe(true);
    expect(files.some((f) => f === 'IDENTITY.md')).toBe(true);
    expect(files.some((f) => f.endsWith('.hbs'))).toBe(false);
  });

  it('preserves limits.json on re-generation', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    // Modify limits.json to simulate agent runtime updates
    const limitsPath = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'limits.json');
    const limits = JSON.parse(readFileSync(limitsPath, 'utf-8'));
    limits.daily.comments.current = 3;
    writeFileSync(limitsPath, JSON.stringify(limits), 'utf-8');

    // Re-generate
    await generateAgentFiles(VALID_CONFIG);

    // Should preserve the modified value
    const after = JSON.parse(readFileSync(limitsPath, 'utf-8'));
    expect(after.daily.comments.current).toBe(3);
  });

  it('preserves schedule.json on re-generation', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const schedulePath = resolve(tmpDir, 'workspaces', 'agent-linkedin', 'schedule.json');
    writeFileSync(schedulePath, JSON.stringify({ tasks: [{ id: 'test' }] }), 'utf-8');

    await generateAgentFiles(VALID_CONFIG);

    const after = JSON.parse(readFileSync(schedulePath, 'utf-8'));
    expect(after.tasks).toBeDefined();
    expect(after.tasks[0].id).toBe('test');
  });

  it('creates pipeline workspace when enabled', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(VALID_CONFIG);

    const pipelineDir = resolve(tmpDir, 'workspaces', 'pipeline');
    expect(existsSync(pipelineDir)).toBe(true);
    expect(existsSync(resolve(pipelineDir, 'content-briefs'))).toBe(true);
    expect(existsSync(resolve(pipelineDir, 'content-ready'))).toBe(true);
  });

  it('skips disabled platforms', async () => {
    const config = {
      ...VALID_CONFIG,
      platforms: VALID_CONFIG.platforms.map((p) =>
        p.platform === 'twitter' ? { ...p, enabled: false } : p
      ),
    };
    const { generateAgentFiles } = await import('../config/generator.js');
    await generateAgentFiles(config);

    expect(existsSync(resolve(tmpDir, 'workspaces', 'agent-linkedin'))).toBe(true);
    expect(existsSync(resolve(tmpDir, 'workspaces', 'agent-twitter'))).toBe(false);
  });

  it('returns list of generated file paths', async () => {
    const { generateAgentFiles } = await import('../config/generator.js');
    const result = await generateAgentFiles(VALID_CONFIG);

    expect(result.generated).toBeInstanceOf(Array);
    expect(result.generated.length).toBeGreaterThan(0);
    for (const path of result.generated) {
      expect(existsSync(path), `generated file should exist: ${path}`).toBe(true);
    }
  });
});
