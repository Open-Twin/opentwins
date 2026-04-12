import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// chrome.ts uses ~/.opentwins/chrome-profiles — we intercept homedir by setting
// HOME for this test to isolate files.
const originalHome = process.env.HOME;

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(resolve(tmpdir(), 'opentwins-chrome-'));
  process.env.HOME = tmpHome;
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  process.env.HOME = originalHome;
  vi.restoreAllMocks();
});

describe('browser/chrome profile paths', () => {
  it('getProfilesBaseDir is rooted at $HOME/.opentwins/chrome-profiles', async () => {
    const { getProfilesBaseDir } = await import('../browser/chrome.js');
    expect(getProfilesBaseDir()).toBe(resolve(tmpHome, '.opentwins', 'chrome-profiles'));
  });

  it('getProfileDir is scoped per profile name', async () => {
    const { getProfileDir, getProfilesBaseDir } = await import('../browser/chrome.js');
    expect(getProfileDir('ot-linkedin')).toBe(resolve(getProfilesBaseDir(), 'ot-linkedin'));
  });
});

describe('browser/chrome getProfilePort', () => {
  it('is deterministic for the same profile name', async () => {
    const { getProfilePort } = await import('../browser/chrome.js');
    const a = getProfilePort('ot-linkedin');
    const b = getProfilePort('ot-linkedin');
    expect(a).toBe(b);
  });

  it('falls within the documented 19200-19999 window', async () => {
    const { getProfilePort } = await import('../browser/chrome.js');
    for (const name of ['ot-linkedin', 'ot-twitter', 'ot-reddit', 'ot-bluesky', 'ot-threads', 'ot-medium']) {
      const p = getProfilePort(name);
      expect(p).toBeGreaterThanOrEqual(19200);
      expect(p).toBeLessThan(20000);
    }
  });

  it('gives different profiles different ports (likely but not guaranteed)', async () => {
    const { getProfilePort } = await import('../browser/chrome.js');
    const ports = new Set([
      getProfilePort('ot-linkedin'),
      getProfilePort('ot-twitter'),
      getProfilePort('ot-reddit'),
      getProfilePort('ot-bluesky'),
      getProfilePort('ot-threads'),
    ]);
    // At least 3 distinct values across 5 profile names.
    expect(ports.size).toBeGreaterThanOrEqual(3);
  });

  it('prefers a saved port from ports.json over the hash fallback', async () => {
    // Seed ports.json with a known override.
    const base = resolve(tmpHome, '.opentwins', 'chrome-profiles');
    mkdirSync(base, { recursive: true });
    writeFileSync(resolve(base, 'ports.json'), JSON.stringify({ 'ot-linkedin': 19500 }), 'utf-8');

    const { getProfilePort } = await import('../browser/chrome.js');
    expect(getProfilePort('ot-linkedin')).toBe(19500);
  });

  it('falls back to the hash when ports.json is present but malformed', async () => {
    const base = resolve(tmpHome, '.opentwins', 'chrome-profiles');
    mkdirSync(base, { recursive: true });
    writeFileSync(resolve(base, 'ports.json'), 'not json', 'utf-8');

    const { getProfilePort } = await import('../browser/chrome.js');
    const port = getProfilePort('ot-linkedin');
    expect(port).toBeGreaterThanOrEqual(19200);
    expect(port).toBeLessThan(20000);
  });

  it('falls back to hash when the profile has no entry in ports.json', async () => {
    const base = resolve(tmpHome, '.opentwins', 'chrome-profiles');
    mkdirSync(base, { recursive: true });
    writeFileSync(resolve(base, 'ports.json'), JSON.stringify({ 'ot-twitter': 19444 }), 'utf-8');

    const { getProfilePort } = await import('../browser/chrome.js');
    const port = getProfilePort('ot-linkedin');
    expect(port).toBeGreaterThanOrEqual(19200);
    expect(port).toBeLessThan(20000);
    expect(port).not.toBe(19444);
  });
});

describe('browser/chrome isChromeInstalled', () => {
  it('returns false when no chrome paths exist and PATH lookup fails', async () => {
    // None of the hardcoded darwin/linux/win32 paths exist under our fake HOME.
    // We can't easily mock execSync for `which`, but if Chrome isn't installed on
    // the test host the PATH lookup will also throw. In a CI container without
    // Chrome, this returns false; if Chrome IS installed the test is skipped.
    const hasChromeLocally = existsSync('/usr/bin/google-chrome')
      || existsSync('/usr/bin/google-chrome-stable')
      || existsSync('/usr/bin/chromium')
      || existsSync('/usr/bin/chromium-browser')
      || existsSync('/snap/bin/chromium')
      || existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    if (hasChromeLocally) return; // skip on dev machines with Chrome

    const { isChromeInstalled } = await import('../browser/chrome.js');
    expect(isChromeInstalled()).toBe(false);
  });
});
