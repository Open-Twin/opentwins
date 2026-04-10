import ora from 'ora';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { loadConfig } from '../../config/loader.js';
import { runPlatformAgent } from '../../scheduler/agent-runner.js';
import { runPipeline } from '../../scheduler/pipeline-runner.js';
import * as log from '../../util/logger.js';
import { PLATFORM_TYPES } from '../../util/platform-types.js';

program
  .command('run <target>')
  .description('Run a single agent or pipeline manually')
  .option('--stage <stage>', 'Run a specific pipeline stage')
  .action(handleAction(async (target: string, opts: { stage?: string }) => {
    const config = loadConfig();

    if (target === 'pipeline') {
      const spinner = ora('Running content pipeline...').start();
      await runPipeline(config, opts.stage);
      spinner.succeed('Pipeline completed');
      return;
    }

    if (!PLATFORM_TYPES.includes(target as any)) {
      log.error(`Unknown target: ${target}. Use a platform name or 'pipeline'.`);
      log.info(`Available: ${PLATFORM_TYPES.join(', ')}, pipeline`);
      process.exit(1);
    }

    const platform = config.platforms.find((p) => p.platform === target);
    if (!platform) {
      log.error(`Platform ${target} not configured. Run 'opentwins init' first.`);
      process.exit(1);
    }

    const spinner = ora(`Running ${target} agent...`).start();
    await runPlatformAgent(config, target, { skipActiveHoursCheck: true, skipIntervalCheck: true });
    spinner.succeed(`${target} agent completed`);
  }));
