import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { stopDaemon } from '../../scheduler/daemon.js';
import * as log from '../../util/logger.js';

program
  .command('stop')
  .description('Stop the OpenTwins daemon')
  .action(handleAction(async () => {
    const stopped = await stopDaemon();
    if (stopped) {
      log.success('OpenTwins daemon stopped.');
    } else {
      log.warn('No running daemon found.');
    }
  }));
