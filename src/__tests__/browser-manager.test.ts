import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;
let mockIsPortInUse: ReturnType<typeof vi.fn>;

vi.mock('../util/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../util/paths.js')>('../util/paths.js');
  return {
    ...actual,
    getBrowserProfilesDir: () => resolve(tmpDir, 'browser-profiles'),
    getBrowserProfilesConfigPath: () => resolve(tmpDir, 'browser-profiles', 'profiles.json'),
  };
});

vi.mock('../browser/chrome.js', () => ({
  launchChrome: vi.fn(async () => ({ pid: 12345, port: 19200, profileName: 'ot-linkedin' })),
  stopChrome: vi.fn(() => true),
  getProfilePort: () => 19200,
  isPortInUse: (...a: unknown[]) => (mockIsPortInUse as unknown as (...args: unknown[]) => unknown)(...a),
  getProfileDir: (name: string) => resolve(tmpDir, 'browser-profiles', name),
}));

vi.mock('../browser/cdp.js', () => ({
  navigateTo: vi.fn(async () => JSON.stringify({ ok: true })),
  openTab: vi.fn(async () => JSON.stringify({ ok: true })),
}));

describe('browser/manager', () => {
  beforeEach(async () => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'opentwins-mgr-'));
    mockIsPortInUse = vi.fn();
    vi.resetModules();
    // Clear call counts on the mocked chrome/cdp modules so each test starts
    // with a fresh tally regardless of test order.
    const chromeMod = await import('../browser/chrome.js');
    const cdpMod = await import('../browser/cdp.js');
    (chromeMod.launchChrome as unknown as ReturnType<typeof vi.fn>).mockClear();
    (chromeMod.stopChrome as unknown as ReturnType<typeof vi.fn>).mockClear();
    (cdpMod.navigateTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    (cdpMod.openTab as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('confirmProfile writes a fresh profiles.json with the entry', async () => {
    const { confirmProfile } = await import('../browser/manager.js');
    confirmProfile('linkedin');

    const cfgPath = resolve(tmpDir, 'browser-profiles', 'profiles.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    expect(cfg.profiles).toHaveLength(1);
    expect(cfg.profiles[0].platform).toBe('linkedin');
    expect(cfg.profiles[0].browserProfile).toBe('ot-linkedin');
    expect(cfg.profiles[0].port).toBe(19200);
  });

  it('confirmProfile replaces an existing entry for the same platform', async () => {
    const { confirmProfile } = await import('../browser/manager.js');
    confirmProfile('linkedin');
    confirmProfile('linkedin');

    const cfg = JSON.parse(readFileSync(resolve(tmpDir, 'browser-profiles', 'profiles.json'), 'utf-8'));
    expect(cfg.profiles).toHaveLength(1);
  });

  it('confirmProfile appends entries for different platforms', async () => {
    const { confirmProfile } = await import('../browser/manager.js');
    confirmProfile('linkedin');
    confirmProfile('twitter');

    const cfg = JSON.parse(readFileSync(resolve(tmpDir, 'browser-profiles', 'profiles.json'), 'utf-8'));
    expect(cfg.profiles).toHaveLength(2);
    expect(cfg.profiles.map((p: { platform: string }) => p.platform).sort()).toEqual(['linkedin', 'twitter']);
  });

  it('listProfiles returns empty when no profiles.json exists', async () => {
    const { listProfiles } = await import('../browser/manager.js');
    expect(await listProfiles()).toEqual([]);
  });

  it('listProfiles returns entries with browserProfile fallback', async () => {
    const { confirmProfile, listProfiles } = await import('../browser/manager.js');
    confirmProfile('reddit');

    const list = await listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0].browserProfile).toBe('ot-reddit');
    expect(list[0].platform).toBe('reddit');
  });

  it('healthCheck reports all profiles as healthy when ports are in use', async () => {
    mockIsPortInUse.mockReturnValue(true);

    const { confirmProfile, healthCheck } = await import('../browser/manager.js');
    confirmProfile('linkedin');
    confirmProfile('twitter');

    const results = await healthCheck();
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.healthy).toBe(true);
      expect(r.status).toMatch(/^running/);
    }
  });

  it('healthCheck reports stopped profiles when ports are free', async () => {
    mockIsPortInUse.mockReturnValue(false);

    const { confirmProfile, healthCheck } = await import('../browser/manager.js');
    confirmProfile('linkedin');

    const [result] = await healthCheck();
    expect(result.healthy).toBe(false);
    expect(result.status).toBe('stopped');
  });

  it('healthCheck is empty when no profiles are configured', async () => {
    const { healthCheck } = await import('../browser/manager.js');
    expect(await healthCheck()).toEqual([]);
  });

  it('corrupt profiles.json is treated as empty', async () => {
    mkdirSync(resolve(tmpDir, 'browser-profiles'), { recursive: true });
    writeFileSync(resolve(tmpDir, 'browser-profiles', 'profiles.json'), '{ bad json', 'utf-8');

    const { listProfiles } = await import('../browser/manager.js');
    expect(await listProfiles()).toEqual([]);
  });

  it('setupProfile launches Chrome and navigates to the platform login URL', async () => {
    const chromeMod = await import('../browser/chrome.js');
    const cdpMod = await import('../browser/cdp.js');
    const { setupProfile } = await import('../browser/manager.js');

    await setupProfile('linkedin');

    expect(chromeMod.launchChrome).toHaveBeenCalledWith('ot-linkedin');
    expect(cdpMod.navigateTo).toHaveBeenCalled();
    const [, url] = (cdpMod.navigateTo as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/linkedin\.com\/login/);
  });

  it('loginProfile errors out when no profile exists for the platform', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { loginProfile } = await import('../browser/manager.js');
    await loginProfile('linkedin');
    // Should NOT have tried to launch Chrome.
    const chromeMod = await import('../browser/chrome.js');
    expect(chromeMod.launchChrome).not.toHaveBeenCalled();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
