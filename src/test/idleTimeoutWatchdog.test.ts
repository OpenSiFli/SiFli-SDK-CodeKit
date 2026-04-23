import * as assert from 'assert';
import { describe, it } from 'mocha';
import { createIdleTimeoutWatchdog } from '../utils/idleTimeoutWatchdog';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('idleTimeoutWatchdog', () => {
  it('times out when there is no activity after startup', async () => {
    let timedOut = 0;
    createIdleTimeoutWatchdog(20, () => {
      timedOut += 1;
    });

    await delay(40);
    assert.strictEqual(timedOut, 1);
  });

  it('extends the timeout window while activity continues', async () => {
    let timedOut = 0;
    const watchdog = createIdleTimeoutWatchdog(30, () => {
      timedOut += 1;
    });

    await delay(15);
    watchdog.bump();
    await delay(15);
    watchdog.bump();
    await delay(15);

    assert.strictEqual(timedOut, 0);

    await delay(35);
    assert.strictEqual(timedOut, 1);
  });

  it('stops watching after dispose', async () => {
    let timedOut = 0;
    const watchdog = createIdleTimeoutWatchdog(20, () => {
      timedOut += 1;
    });

    watchdog.dispose();
    await delay(40);

    assert.strictEqual(timedOut, 0);
  });
});
