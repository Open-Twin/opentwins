import { Command } from 'commander';

export const program = new Command();

program
  .name('opentwins')
  .description('Your autonomous digital twins across every social platform')
  .version('0.1.0');
