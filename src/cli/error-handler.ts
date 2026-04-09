import * as log from '../util/logger.js';

export function handleAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void> | void
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof Error) {
        log.error(err.message);
      } else {
        log.error(String(err));
      }
      process.exit(1);
    }
  };
}
