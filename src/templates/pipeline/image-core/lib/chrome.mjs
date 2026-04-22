import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChromeNotFoundError, RenderError } from './errors.mjs';

const execFileAsync = promisify(execFile);

const CHROME_PATHS = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

let _chromePath = null;

export function findChrome() {
  if (_chromePath) return _chromePath;
  _chromePath = CHROME_PATHS.find(existsSync);
  if (!_chromePath) {
    throw new ChromeNotFoundError(
      'Chrome not found in standard locations',
      { searched: CHROME_PATHS },
    );
  }
  return _chromePath;
}

const SHARED_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--default-background-color=00000000',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
];

export async function renderPng({ htmlPath, outPath, width, height, deviceScaleFactor = 2, timeoutMs = 15000 }) {
  const chrome = findChrome();
  const args = [
    ...SHARED_FLAGS,
    `--force-device-scale-factor=${deviceScaleFactor}`,
    `--screenshot=${outPath}`,
    `--window-size=${width},${height}`,
    `file://${htmlPath}`,
  ];
  try {
    await execFileAsync(chrome, args, { timeout: timeoutMs });
  } catch (e) {
    throw new RenderError(
      `Chrome screenshot failed: ${e.message}`,
      { stderr: e.stderr?.toString?.().slice(0, 500) },
    );
  }
  if (!existsSync(outPath)) {
    throw new RenderError(`Chrome exited 0 but ${outPath} not found`);
  }
}

export async function renderPdf({ htmlPath, outPath, width, height, timeoutMs = 20000 }) {
  const chrome = findChrome();
  const args = [
    ...SHARED_FLAGS,
    `--print-to-pdf=${outPath}`,
    '--print-to-pdf-no-header',
    `--window-size=${width},${height}`,
    `file://${htmlPath}`,
  ];
  try {
    await execFileAsync(chrome, args, { timeout: timeoutMs });
  } catch (e) {
    throw new RenderError(
      `Chrome print-to-pdf failed: ${e.message}`,
      { stderr: e.stderr?.toString?.().slice(0, 500) },
    );
  }
  if (!existsSync(outPath)) {
    throw new RenderError(`Chrome exited 0 but ${outPath} not found`);
  }
}
