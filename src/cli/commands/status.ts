import chalk from 'chalk';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { isDaemonRunning } from '../../scheduler/daemon.js';

program
  .command('status')
  .description('Show agent status and next scheduled jobs')
  .action(handleAction(async () => {
    const config = loadConfig();
    const running = await isDaemonRunning();

    console.log(chalk.bold('OpenTwins Status'));
    console.log('');
    console.log(`  Daemon: ${running ? chalk.green('running') : chalk.red('stopped')}`);
    console.log(`  Timezone: ${config.timezone}`);
    console.log(`  Active hours: ${config.active_hours.start}:00 - ${config.active_hours.end}:00`);
    console.log(`  Pipeline: ${config.pipeline_enabled ? chalk.green('enabled') : chalk.dim('disabled')}`);
    console.log('');

    console.log(chalk.bold('  Platform Agents:'));
    for (const p of config.platforms) {
      const status = p.enabled ? chalk.green('enabled') : chalk.dim('disabled');
      console.log(`    ${p.platform.padEnd(12)} ${status}  @${p.handle}`);
    }
    console.log('');
  }));
