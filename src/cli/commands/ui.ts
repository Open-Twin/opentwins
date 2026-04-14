import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import * as log from '../../util/logger.js';

program
  .command('ui')
  .description('Start the dashboard only (scheduler not started — use `opentwins start` for both)')
  .option('-p, --port <port>', 'Port number', '3847')
  .action(handleAction(async (opts: { port: string }) => {
    const port = parseInt(opts.port);
    log.info(`Starting dashboard on http://localhost:${port}`);

    const { startDashboard } = await import('../../ui/server.js');
    await startDashboard(port);
  }));
