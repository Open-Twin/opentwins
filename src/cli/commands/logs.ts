import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { getPlatformWorkspaceDir } from '../../util/paths.js';
import * as log from '../../util/logger.js';

program
  .command('logs <platform>')
  .description("Tail today's activity log for a platform")
  .action(handleAction((platform: string) => {
    const today = new Date().toISOString().split('T')[0];
    const logPath = resolve(getPlatformWorkspaceDir(platform), 'memory', `${today}.md`);

    if (!existsSync(logPath)) {
      log.info(`No activity log for ${platform} today (${today}).`);
      return;
    }

    const content = readFileSync(logPath, 'utf-8');
    console.log(content);
  }));
