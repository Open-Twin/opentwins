import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenTwinsConfigSchema } from '../config/schema.js';
import { VALID_CONFIG } from './fixtures/config.js';

describe('Config Schema Validation', () => {
  it('accepts a valid config', () => {
    const result = OpenTwinsConfigSchema.parse(VALID_CONFIG);
    expect(result.name).toBe('Alex Johnson');
    expect(result.platforms).toHaveLength(2);
    expect(result.pillars).toHaveLength(3);
  });

  it('rejects missing name', () => {
    const invalid = { ...VALID_CONFIG, name: '' };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects empty pillars', () => {
    const invalid = { ...VALID_CONFIG, pillars: [] };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects more than 7 pillars', () => {
    const pillars = Array(8).fill(null).map((_, i) => ({
      name: `Pillar ${i}`, topics: ['topic'], mention_templates: [], target_percentage: 0,
    }));
    const invalid = { ...VALID_CONFIG, pillars };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects empty platforms', () => {
    const invalid = { ...VALID_CONFIG, platforms: [] };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects subscription auth without token', () => {
    const invalid = {
      ...VALID_CONFIG,
      auth: { provider: 'anthropic' as const, mode: 'subscription' as const },
    };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects api_key auth without key', () => {
    const invalid = {
      ...VALID_CONFIG,
      auth: { provider: 'anthropic' as const, mode: 'api_key' as const },
    };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });

  it('accepts subscription auth with token', () => {
    const valid = {
      ...VALID_CONFIG,
      auth: { provider: 'anthropic' as const, mode: 'subscription' as const, claude_token: 'sk-ant-oat01-test' },
    };
    const result = OpenTwinsConfigSchema.parse(valid);
    expect(result.auth.mode).toBe('subscription');
  });

  it('applies defaults for optional fields', () => {
    const minimal = {
      auth: { provider: 'anthropic' as const, mode: 'api_key' as const, api_key: 'sk-test' },
      name: 'Test',
      display_name: 'T',
      headline: 'Test',
      bio: 'Test bio',
      brand_tagline: 'Test tagline',
      role: 'Tester',
      pillars: [{ name: 'P1', topics: ['t1'] }],
      platforms: [{
        platform: 'linkedin' as const,
        handle: 'test',
        profile_url: 'https://linkedin.com/in/test',
        limits: { daily: { comments: { limit: 4 } } },
      }],
      voice: { formality: 'casual' as const, language: 'en' },
    };
    const result = OpenTwinsConfigSchema.parse(minimal);
    expect(result.certifications).toEqual([]);
    expect(result.conference_mentions).toEqual([]);
    expect(result.experience_hooks).toEqual([]);
    expect(result.timezone).toBe('UTC');
    expect(result.active_hours.start).toBe(8);
    expect(result.active_hours.end).toBe(23);
    expect(result.pipeline_enabled).toBe(true);
    expect(result.voice.formality).toBe('casual');
  });

  it('rejects invalid platform type', () => {
    const invalid = {
      ...VALID_CONFIG,
      platforms: [{ ...VALID_CONFIG.platforms[0], platform: 'facebook' }],
    };
    expect(() => OpenTwinsConfigSchema.parse(invalid)).toThrow();
  });
});

describe('Config Loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('save and load roundtrip', async () => {
    const configPath = resolve(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify(VALID_CONFIG, null, 2), 'utf-8');

    const loaded = JSON.parse(readFileSync(configPath, 'utf-8'));
    const parsed = OpenTwinsConfigSchema.parse(loaded);

    expect(parsed.name).toBe(VALID_CONFIG.name);
    expect(parsed.platforms).toHaveLength(VALID_CONFIG.platforms.length);
    expect(parsed.pillars).toHaveLength(VALID_CONFIG.pillars.length);
  });

  it('configExists returns false for missing file', () => {
    expect(existsSync(resolve(tmpDir, 'config.json'))).toBe(false);
  });
});
