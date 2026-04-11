import chalk from 'chalk';
import ora from 'ora';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { setupProfile, confirmProfile, loginProfile, healthCheck, listProfiles } from '../../browser/manager.js';
import { launchChrome, stopChrome } from '../../browser/chrome.js';
import { openTab, navigateTo, closeTab, evaluate, clickElement, snapshot, getTabInfo } from '../../browser/cdp.js';
import * as log from '../../util/logger.js';
import { PLATFORM_TYPES } from '../../util/platform-types.js';

const browser = program
  .command('browser')
  .description('Manage browser profiles and control Chrome for platform agents')
  .option('--browser-profile <name>', 'Browser profile name (e.g. ot-linkedin)')
  .option('--profile <name>', 'Alias for --browser-profile');

// ── Management commands (used by humans) ─────────────────────

browser
  .command('setup <platform>')
  .description('Create a browser profile and login')
  .action(handleAction(async (platform: string) => {
    if (!PLATFORM_TYPES.includes(platform as any)) {
      log.error(`Unknown platform: ${platform}`);
      log.info(`Available: ${PLATFORM_TYPES.join(', ')}`);
      process.exit(1);
    }

    const config = loadConfig();
    const platformConfig = config.platforms.find((p) => p.platform === platform);
    if (!platformConfig) {
      log.error(`Platform ${platform} not configured.`);
      process.exit(1);
    }

    await setupProfile(platform);
    confirmProfile(platform);
  }));

browser
  .command('login <platform>')
  .description('Re-login to an existing browser profile')
  .action(handleAction(async (platform: string) => {
    await loginProfile(platform);
  }));

browser
  .command('health')
  .description('Check all browser profile sessions')
  .action(handleAction(async () => {
    const spinner = ora('Checking browser profiles...').start();
    const results = await healthCheck();
    spinner.stop();

    console.log(chalk.bold('Browser Profile Health'));
    console.log('');
    if (results.length === 0) {
      log.info('No profiles configured. Run: opentwins browser setup <platform>');
    } else {
      for (const r of results) {
        const icon = r.healthy ? chalk.green('OK') : chalk.red('MISSING');
        console.log(`  ${r.platform.padEnd(12)} ${icon}  ${r.browserProfile}  ${chalk.dim(`(${r.status})`)}`);
      }
    }
    console.log('');
  }));

browser
  .command('list')
  .description('List all browser profiles')
  .action(handleAction(async () => {
    const profiles = await listProfiles();

    console.log(chalk.bold('Browser Profiles'));
    console.log('');
    if (profiles.length === 0) {
      log.info('No profiles configured. Run: opentwins browser setup <platform>');
    } else {
      for (const p of profiles) {
        console.log(`  ${p.platform.padEnd(12)} ${p.browserProfile}`);
      }
    }
    console.log('');
  }));

// ── Agent-facing commands (called by templates via Bash tool) ─

function getProfile(): string {
  const opts = browser.opts();
  const name = opts.browserProfile || opts.profile;
  if (!name) {
    console.error('Error: --browser-profile <name> is required');
    process.exit(1);
  }
  return name;
}

browser
  .command('start')
  .description('Launch Chrome with a browser profile')
  .action(handleAction(async () => {
    const name = getProfile();
    const instance = await launchChrome(name);
    console.log(JSON.stringify({ ok: true, pid: instance.pid, port: instance.port, profile: name }));
  }));

browser
  .command('stop')
  .description('Stop Chrome for a browser profile')
  .action(handleAction(async () => {
    const name = getProfile();
    const stopped = stopChrome(name);
    console.log(JSON.stringify({ ok: stopped, profile: name }));
  }));

browser
  .command('open [url]')
  .description('Open a URL in a new tab')
  .action(handleAction(async (url?: string) => {
    const name = getProfile();
    const result = await openTab(name, url || 'about:blank');
    console.log(result);
  }));

browser
  .command('navigate <url>')
  .description('Navigate the active tab to a URL')
  .action(handleAction(async (url: string) => {
    const name = getProfile();
    const result = await navigateTo(name, url);
    console.log(result);
  }));

browser
  .command('close [tabId]')
  .description('Close a tab (active tab if no ID given)')
  .action(handleAction(async (tabId?: string) => {
    const name = getProfile();
    const result = await closeTab(name, tabId);
    console.log(result);
  }));

browser
  .command('evaluate')
  .description('Evaluate JavaScript in the active tab')
  .option('--fn <code>', 'JavaScript function or expression to evaluate')
  .action(handleAction(async (options: { fn?: string }) => {
    const name = getProfile();
    if (!options.fn) {
      console.error('Error: --fn <code> is required');
      process.exit(1);
    }
    const result = await evaluate(name, options.fn);
    console.log(result);
  }));

browser
  .command('click <selector>')
  .description('Click an element by CSS selector')
  .action(handleAction(async (selector: string) => {
    const name = getProfile();
    const result = await clickElement(name, selector);
    console.log(result);
  }));

browser
  .command('snapshot')
  .description('Get a DOM snapshot of the active tab')
  .option('--selector <sel>', 'CSS selector to scope the snapshot')
  .option('--compact', 'Omit empty nodes')
  .option('--interactive', 'Only show interactive elements')
  .option('--depth <n>', 'Max DOM depth', '6')
  .option('--json', 'Output as JSON (default)')
  .action(handleAction(async (options: { selector?: string; compact?: boolean; interactive?: boolean; depth?: string }) => {
    const name = getProfile();
    const result = await snapshot(name, options.selector, {
      compact: !!options.compact,
      interactive: !!options.interactive,
      depth: parseInt(options.depth || '6'),
    });
    console.log(result);
  }));

browser
  .command('tabs')
  .description('List open tabs')
  .action(handleAction(async () => {
    const name = getProfile();
    const result = await getTabInfo(name);
    console.log(result);
  }));

browser
  .command('profiles')
  .description('List all Chrome profiles with status')
  .action(handleAction(async () => {
    const { readdirSync } = await import('node:fs');
    const { getProfilesBaseDir, isPortInUse, getProfilePort } = await import('../../browser/chrome.js');
    const dir = getProfilesBaseDir();
    try {
      const profiles = readdirSync(dir).filter((f: string) => !f.endsWith('.json'));
      const info = profiles.map((name: string) => {
        const port = getProfilePort(name);
        const running = isPortInUse(port);
        return { name, port, status: running ? 'running' : 'stopped' };
      });
      console.log(JSON.stringify(info, null, 2));
    } catch {
      console.log(JSON.stringify([]));
    }
  }));
