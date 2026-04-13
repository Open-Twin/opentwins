import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { FULL_CONFIG, BANNED_TERMS } from './fixtures/config.js';
import { PLATFORM_TYPES } from '../util/platform-types.js';

let tmpDir: string;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getOpenTwinsHome: () => tmpDir,
    getWorkspacesDir: () => resolve(tmpDir, 'workspaces'),
    getPlatformWorkspaceDir: (platform: string) => resolve(tmpDir, 'workspaces', `agent-${platform}`),
    getPipelineWorkspaceDir: () => resolve(tmpDir, 'workspaces', 'pipeline'),
    getTemplatesDir: () => actual.getTemplatesDir(),
    getPlatformTemplateDir: (platform: string) => actual.getPlatformTemplateDir(platform),
  };
});

// Generate all workspaces once before all tests
beforeAll(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-tpl-'));
  const { mkdirSync } = await import('node:fs');
  mkdirSync(resolve(tmpDir, 'workspaces'), { recursive: true });

  const { generateAgentFiles } = await import('../config/generator.js');
  await generateAgentFiles(FULL_CONFIG);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// Helper: read all .md and .json files in a workspace
function readWorkspaceFiles(platform: string): Array<{ name: string; content: string }> {
  const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
  if (!existsSync(dir)) return [];
  const files: Array<{ name: string; content: string }> = [];
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.md') || f.endsWith('.json')) {
      files.push({ name: f, content: readFileSync(resolve(dir, f), 'utf-8') });
    }
  }
  return files;
}

describe('Template Variable Resolution', () => {
  it.each(PLATFORM_TYPES)('%s: no unresolved {{ in generated files', (platform) => {
    const files = readWorkspaceFiles(platform);
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      // Allow {{ in JSON values that are template examples in docs
      // But catch real unresolved variables like {{name}} {{role}} etc
      const unresolvedMatches = f.content.match(/\{\{[a-zA-Z_][a-zA-Z0-9_.#/]*\}\}/g) || [];
      // Filter out expected patterns in documentation (curl examples, code blocks)
      const real = unresolvedMatches.filter((m) =>
        !m.includes('browser_profile') && // curl examples in docs reference this
        !m.includes('today_date') && // runtime variable
        !m.includes('targetIdx') && // code template
        !m.includes('handle') // some docs reference {{handle}}
      );
      expect(real, `${platform}/${f.name} has unresolved variables: ${real.join(', ')}`).toEqual([]);
    }
  });
});

describe('No Hardcoded PM/AI Content', () => {
  // Anti-AI detection phrases are OK - they're platform-generic guidance
  const ALLOWED_CONTEXT = [
    'Anti-AI', 'AI Accusation', 'AI Detection', 'AI writing', 'AI-generated',
    'reads like AI', 'ChatGPT', 'AI wrote', 'AI tricks', 'AI tell',
    'AI patterns', 'AI slop', 'Draft.js',
  ];

  it.each(PLATFORM_TYPES)('%s: no banned PM/AI terms in generated files', (platform) => {
    const files = readWorkspaceFiles(platform);

    for (const f of files) {
      for (const term of BANNED_TERMS) {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = f.content.match(regex);
        if (matches) {
          // Check if every match is within an allowed context
          for (const match of matches) {
            const idx = f.content.indexOf(match);
            const context = f.content.slice(Math.max(0, idx - 100), idx + match.length + 100);
            const isAllowed = ALLOWED_CONTEXT.some((ac) => context.includes(ac));
            expect(isAllowed, `${platform}/${f.name} contains banned term "${term}" outside allowed context:\n...${context}...`).toBe(true);
          }
        }
      }
    }
  });
});

describe('Template Content Checks', () => {
  it.each(PLATFORM_TYPES)('%s: HEARTBEAT.md contains browser API curl syntax', (platform) => {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
    const heartbeat = resolve(dir, 'HEARTBEAT.md');
    if (!existsSync(heartbeat)) return; // Some platforms may not have it
    const content = readFileSync(heartbeat, 'utf-8');
    expect(content).toContain('curl -s -X POST http://localhost:3847/api/browser/');
  });

  it.each(PLATFORM_TYPES)('%s: HEARTBEAT.md contains browser close step', (platform) => {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
    const heartbeat = resolve(dir, 'HEARTBEAT.md');
    if (!existsSync(heartbeat)) return;
    const content = readFileSync(heartbeat, 'utf-8');
    expect(content).toMatch(/close|HEARTBEAT_OK/i);
  });

  it.each(PLATFORM_TYPES)('%s: IDENTITY.md or SOUL.md contains configured name or handle', (platform) => {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
    const identity = resolve(dir, 'IDENTITY.md');
    const soul = resolve(dir, 'SOUL.md');
    const identityContent = existsSync(identity) ? readFileSync(identity, 'utf-8') : '';
    const soulContent = existsSync(soul) ? readFileSync(soul, 'utf-8') : '';
    const combined = identityContent + soulContent;
    // At minimum, the handle or name should appear somewhere in identity/soul
    const platformConfig = FULL_CONFIG.platforms.find((p) => p.platform === platform);
    const handle = platformConfig?.handle || '';
    const hasIdentity = combined.includes(FULL_CONFIG.name) || combined.includes(handle) || combined.includes(FULL_CONFIG.role);
    expect(hasIdentity, `${platform}: neither name, handle, nor role found in IDENTITY/SOUL`).toBe(true);
  });

  it.each(PLATFORM_TYPES)('%s: SOUL.md contains role or brand_tagline', (platform) => {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
    const soul = resolve(dir, 'SOUL.md');
    if (!existsSync(soul)) return;
    const content = readFileSync(soul, 'utf-8');
    const hasRole = content.includes(FULL_CONFIG.role) || content.includes(FULL_CONFIG.brand_tagline);
    expect(hasRole, `${platform}: SOUL.md should contain role or brand_tagline`).toBe(true);
  });

  it.each(PLATFORM_TYPES)('%s: queries.json is valid JSON with pillar names', (platform) => {
    const dir = resolve(tmpDir, 'workspaces', `agent-${platform}`);
    const queries = resolve(dir, 'queries.json');
    if (!existsSync(queries)) return;
    const content = readFileSync(queries, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.search_queries).toBeInstanceOf(Array);
    // At least one query should reference a pillar name
    const queryTexts = parsed.search_queries.map((q: { query: string }) => q.query);
    const hasPillar = FULL_CONFIG.pillars.some((p) =>
      queryTexts.some((q: string) => q.includes(p.name))
    );
    expect(hasPillar, `queries.json should reference pillar names`).toBe(true);
  });

  it.each(PLATFORM_TYPES)('%s: browser_profile is ot-{platform}', (platform) => {
    const files = readWorkspaceFiles(platform);
    const heartbeat = files.find((f) => f.name === 'HEARTBEAT.md');
    if (!heartbeat) return;
    expect(heartbeat.content).toContain(`ot-${platform}`);
  });
});
