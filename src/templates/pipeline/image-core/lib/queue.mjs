// Serial render queue. Chrome processes don't conflict with each other but
// bounded concurrency keeps resource use predictable. Serial is fine for the
// 5-images/day workload; bump `concurrency` later if needed.

import { QueueFullError } from './errors.mjs';

export class RenderQueue {
  constructor({ concurrency = 1, maxDepth = 10 } = {}) {
    this.concurrency = concurrency;
    this.maxDepth = maxDepth;
    this.running = 0;
    this.pending = [];
  }

  enqueue(fn) {
    if (this.pending.length + this.running >= this.maxDepth) {
      return Promise.reject(new QueueFullError(
        `render queue full (max ${this.maxDepth})`,
        { queued: this.pending.length, running: this.running },
      ));
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ fn, resolve, reject });
      this._drain();
    });
  }

  async _drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const { fn, resolve, reject } = this.pending.shift();
      this.running += 1;
      // Decrement `running` BEFORE settling the caller's promise so that a
      // caller awaiting this task sees accurate queue stats immediately. If
      // we used .finally, the caller could see `running` still incremented
      // in the tick right after their await returns.
      Promise.resolve()
        .then(fn)
        .then(
          (value) => {
            this.running -= 1;
            resolve(value);
            this._drain();
          },
          (err) => {
            this.running -= 1;
            reject(err);
            this._drain();
          },
        );
    }
  }

  stats() {
    return { running: this.running, pending: this.pending.length, maxDepth: this.maxDepth };
  }
}
