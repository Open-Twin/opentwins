import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { createScheduler } from '../../scheduler/index.js';
import { startDaemon, isDaemonRunning } from '../../scheduler/daemon.js';
import { resetLimitsIfNeeded } from '../../scheduler/limits-reset.js';
import { getPidFile } from '../../util/paths.js';
import * as log from '../../util/logger.js';

program
  .command('start')
  .description('Start the OpenTwins scheduler (cron-style automation)')
  .option('-d, --daemon', 'Run as detached background daemon')
  .action(handleAction(async (opts: { daemon?: boolean }) => {
    const config = loadConfig();

    // Reset limits on startup
    resetLimitsIfNeeded();

    if (opts.daemon) {
      const alreadyRunning = await isDaemonRunning();
      if (alreadyRunning) {
        log.warn('Scheduler daemon is already running. Use `opentwins stop` to stop it first.');
        return;
      }
      const pid = await startDaemon();
      log.success(`OpenTwins scheduler started as daemon (PID: ${pid})`);
      log.info('Use `opentwins ui` to open the dashboard in another terminal.');
      return;
    }

    console.log(chalk.bold('Starting OpenTwins scheduler...'));
    console.log('');

    const enabledPlatforms = config.platforms.filter((p) => p.enabled);
    log.info(`${enabledPlatforms.length} platform agents enabled`);
    log.info(`Pipeline: ${config.pipeline_enabled ? 'enabled' : 'disabled'}`);
    log.info(`Active hours: ${config.active_hours.start}:00 - ${config.active_hours.end}:00 ${config.timezone}`);

    const scheduler = createScheduler(config);
    await scheduler.start();
    log.success('Scheduler running');

    // If spawned as detached daemon, write our own PID so parent can track us
    if (process.env.OPENTWINS_DAEMON === '1') {
      const pidFile = getPidFile();
      const pidDir = dirname(pidFile);
      if (!existsSync(pidDir)) mkdirSync(pidDir, { recursive: true });
      writeFileSync(pidFile, String(process.pid), 'utf-8');
    }

    console.log('');
    log.info('Press Ctrl+C to stop. Run `opentwins ui` in another terminal for the dashboard.');

    const shutdown = async () => {
      console.log('');
      log.info('Shutting down scheduler...');
      await scheduler.stop();
      // Clean up PID file if we wrote one
      if (process.env.OPENTWINS_DAEMON === '1') {
        try {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(getPidFile());
        } catch { /* ignore */ }
      }
      log.success('Scheduler stopped.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }));
