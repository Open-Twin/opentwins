import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { createScheduler, setActiveScheduler } from '../../scheduler/index.js';
import { startDaemon, stopDaemon, isDaemonRunning } from '../../scheduler/daemon.js';
import { resetLimitsIfNeeded } from '../../scheduler/limits-reset.js';
import { getPidFile } from '../../util/paths.js';
import * as log from '../../util/logger.js';

interface StartOptions {
  daemon?: boolean;
  port: string;
}

program
  .command('start')
  .description('Start OpenTwins (scheduler + dashboard)')
  .option('-d, --daemon', 'Run as detached background daemon')
  .option('-p, --port <port>', 'Dashboard port', '3847')
  .action(handleAction(async (opts: StartOptions) => {
    const config = loadConfig();

    // Treat repeat `start` as restart: stop any existing daemon first.
    // Skip when we're the spawned child (OPENTWINS_DAEMON=1) — the pidfile
    // points at our own PID in that case.
    if (process.env.OPENTWINS_DAEMON !== '1' && await isDaemonRunning()) {
      log.info('Existing OpenTwins daemon detected — stopping it first...');
      await stopDaemon();
      // Brief wait for the port to actually release before we try to bind it.
      await new Promise((r) => setTimeout(r, 500));
    }

    // Reset limits on startup
    resetLimitsIfNeeded();

    if (opts.daemon) {
      const extraArgs: string[] = [];
      if (opts.port !== '3847') extraArgs.push('--port', opts.port);
      const pid = await startDaemon(extraArgs);
      log.success(`OpenTwins started as daemon (PID: ${pid})`);
      log.info(`Dashboard available at http://localhost:${opts.port}`);
      return;
    }

    console.log(chalk.bold('Starting OpenTwins...'));
    console.log('');

    const autoRunPlatforms = config.platforms.filter((p) => p.enabled && p.auto_run);
    log.info(`${autoRunPlatforms.length} platform agents set to auto-run`);
    log.info(`Pipeline: ${config.pipeline_enabled ? 'enabled' : 'disabled'}`);
    log.info(`Active hours: ${config.active_hours.start}:00 - ${config.active_hours.end}:00 ${config.timezone}`);

    const scheduler = createScheduler(config);
    await scheduler.start();
    setActiveScheduler(scheduler);
    log.success('Scheduler running');

    const { startDashboard } = await import('../../ui/server.js');
    await startDashboard(parseInt(opts.port));

    // If spawned as detached daemon, write our own PID so parent can track us
    if (process.env.OPENTWINS_DAEMON === '1') {
      const pidFile = getPidFile();
      const pidDir = dirname(pidFile);
      if (!existsSync(pidDir)) mkdirSync(pidDir, { recursive: true });
      writeFileSync(pidFile, String(process.pid), 'utf-8');
    }

    console.log('');
    log.info('Press Ctrl+C to stop.');

    const shutdown = async () => {
      console.log('');
      log.info('Shutting down...');
      await scheduler.stop();
      setActiveScheduler(null);
      // Clean up PID file if we wrote one
      if (process.env.OPENTWINS_DAEMON === '1') {
        try {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(getPidFile());
        } catch { /* ignore */ }
      }
      log.success('Stopped.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }));
