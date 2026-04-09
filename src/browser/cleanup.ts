import { execaCommand } from 'execa';
import * as log from '../util/logger.js';

export async function killZombieChrome(): Promise<void> {
  try {
    await execaCommand(
      "ps aux | grep '[C]hrome.*remote-debugging-port' | awk '{print $2}' | xargs kill -9 2>/dev/null || true",
      { shell: true, reject: false }
    );
    log.success('Killed zombie Chrome processes');
  } catch {
    log.info('No zombie Chrome processes found');
  }
}

export async function cleanupBrowserTabs(): Promise<void> {
  try {
    // Close all tabs except the first one for each profile
    const result = await execaCommand(
      "curl -s http://127.0.0.1:18801/json 2>/dev/null | python3 -c 'import sys,json; tabs=json.load(sys.stdin); [print(t[\"id\"]) for t in tabs[1:]]' 2>/dev/null || true",
      { shell: true, reject: false }
    );
    if (result.stdout) {
      log.info(`Cleaned up browser tabs`);
    }
  } catch {
    // Ignore errors
  }
}
