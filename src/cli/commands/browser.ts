import chalk from 'chalk';
import ora from 'ora';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { setupProfile, loginProfile, healthCheck, listProfiles } from '../../browser/manager.js';
import * as log from '../../util/logger.js';
import { PLATFORM_TYPES } from '../../util/platform-types.js';

const browser = program
  .command('browser')
  .description('Manage browser profiles for platform agents');

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
    for (const r of results) {
      const icon = r.healthy ? chalk.green('OK') : chalk.red('EXPIRED');
      console.log(`  ${r.platform.padEnd(12)} ${icon}  port:${r.port}`);
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
        console.log(`  ${p.platform.padEnd(12)} port:${p.port}  ${p.profileDir}`);
      }
    }
    console.log('');
  }));
