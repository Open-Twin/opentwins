import chalk from 'chalk';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { getConfigPath } from '../../util/paths.js';

const configCmd = program
  .command('config')
  .description('View or edit configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(handleAction(() => {
    const config = loadConfig();

    console.log(chalk.bold('OpenTwins Configuration'));
    console.log(chalk.dim(`  File: ${getConfigPath()}`));
    console.log('');
    console.log(`  Name: ${config.name} (${config.display_name})`);
    console.log(`  Role: ${config.role}`);
    console.log(`  Brand: ${config.brand_tagline}`);
    console.log(`  Timezone: ${config.timezone}`);
    console.log(`  Active: ${config.active_hours.start}:00 - ${config.active_hours.end}:00`);
    console.log(`  Pipeline: ${config.pipeline_enabled ? 'enabled' : 'disabled'}`);
    console.log('');

    console.log(chalk.bold('  Pillars:'));
    for (const p of config.pillars) {
      console.log(`    - ${p.name}: ${p.topics.join(', ')}`);
    }
    console.log('');

    console.log(chalk.bold('  Platforms:'));
    for (const p of config.platforms) {
      const status = p.enabled ? chalk.green('on') : chalk.dim('off');
      console.log(`    ${p.platform.padEnd(12)} ${status}  @${p.handle}  ${p.profile_url}`);
    }
    console.log('');
  }));

configCmd
  .command('edit')
  .description('Re-run configuration wizard')
  .action(handleAction(() => {
    console.log('Run `opentwins init --force` to reconfigure.');
  }));
