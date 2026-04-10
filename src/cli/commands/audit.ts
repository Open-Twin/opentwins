import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { program } from '../program.js';
import { handleAction } from '../error-handler.js';
import { getPlatformWorkspaceDir } from '../../util/paths.js';
import * as log from '../../util/logger.js';

program
  .command('audit <platform>')
  .description("Show today's quality metrics for a platform")
  .action(handleAction((platform: string) => {
    const today = new Date().toISOString().split('T')[0];
    const workspace = getPlatformWorkspaceDir(platform);

    const summaryPath = resolve(workspace, 'memory', 'today_summary.json');
    if (!existsSync(summaryPath)) {
      log.info(`No summary data for ${platform} today.`);
      return;
    }

    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));

    console.log(chalk.bold(`Quality Audit: ${platform} (${today})`));
    console.log('');
    console.log(`  Comments: ${summary.comments || 0}`);
    console.log(`  Avg words: ${summary.avg_words || 0}`);
    console.log(`  Disagreements: ${summary.disagreements || 0}`);
    console.log(`  Questions: ${summary.questions || 0}`);
    console.log(`  Last style: ${summary.last_style || 'none'}`);

    if (summary.styles) {
      console.log('');
      console.log(chalk.bold('  Style Distribution:'));
      for (const [style, count] of Object.entries(summary.styles)) {
        console.log(`    ${style}: ${count}`);
      }
    }
    console.log('');
  }));
