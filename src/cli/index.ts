export { program } from './program.js';

// Register commands (side-effect imports)
import './commands/init.js';
import './commands/start.js';
import './commands/stop.js';
import './commands/status.js';
import './commands/run.js';
import './commands/browser.js';
import './commands/config.js';
import './commands/logs.js';
import './commands/audit.js';
