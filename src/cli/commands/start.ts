import chalk from 'chalk';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { createScheduler } from '../../scheduler/index.js';
import { startDaemon } from '../../scheduler/daemon.js';
import { resetLimitsIfNeeded } from '../../scheduler/limits-reset.js';
import * as log from '../../util/logger.js';

program
  .command('start')
  .description('Start the OpenTwins scheduler')
  .option('-d, --daemon', 'Run as background daemon')
  .option('--ui', 'Also start the dashboard (localhost:3847)')
  .option('--ui-port <port>', 'Dashboard port', '3847')
  .action(handleAction(async (opts: { daemon?: boolean; ui?: boolean; uiPort?: string }) => {
    const config = loadConfig();

    // Reset limits on startup
    resetLimitsIfNeeded();

    if (opts.daemon) {
      const pid = await startDaemon();
      log.success(`OpenTwins started as daemon (PID: ${pid})`);
      return;
    }

    console.log(chalk.bold('Starting OpenTwins...'));
    console.log('');

    const enabledPlatforms = config.platforms.filter((p) => p.enabled);
    log.info(`${enabledPlatforms.length} platform agents enabled`);
    log.info(`Pipeline: ${config.pipeline_enabled ? 'enabled' : 'disabled'}`);
    log.info(`Active hours: ${config.active_hours.start}:00 - ${config.active_hours.end}:00 ${config.timezone}`);

    const scheduler = createScheduler(config);
    await scheduler.start();
    log.success('Scheduler running');

    // Start dashboard if --ui flag
    if (opts.ui) {
      const port = parseInt(opts.uiPort || '3847');
      const { startDashboard } = await import('../../ui/server.js');
      await startDashboard(port);
    }

    console.log('');
    log.success(`OpenTwins is live. ${opts.ui ? `Dashboard: http://localhost:${opts.uiPort || 3847}` : 'Press Ctrl+C to stop.'}`);

    const shutdown = async () => {
      console.log('');
      log.info('Shutting down...');
      await scheduler.stop();
      log.success('All agents stopped.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }));
