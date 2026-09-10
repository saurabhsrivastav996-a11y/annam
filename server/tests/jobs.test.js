import { startJobs } from '../src/jobs/runner.js';
import { jobs } from '../src/jobs/index.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const silent = { log: () => {}, error: () => {} };

describe('startJobs', () => {
  it('runs a job again and again until stopped', async () => {
    let runs = 0;
    const stop = startJobs(
      [
        {
          name: 'tick',
          everyMs: 10,
          firstRunAfterMs: 0,
          run: async () => {
            runs += 1;
          },
        },
      ],
      { logger: silent }
    );

    await wait(100);
    stop();
    const atStop = runs;
    await wait(50);

    expect(atStop).toBeGreaterThan(2);
    expect(runs).toBe(atStop);
  });

  it('never starts a run while the previous one is still going', async () => {
    let active = 0;
    let mostAtOnce = 0;
    const stop = startJobs(
      [
        {
          name: 'slow',
          everyMs: 1,
          firstRunAfterMs: 0,
          run: async () => {
            active += 1;
            mostAtOnce = Math.max(mostAtOnce, active);
            await wait(25);
            active -= 1;
          },
        },
      ],
      { logger: silent }
    );

    await wait(150);
    stop();

    expect(mostAtOnce).toBe(1);
  });

  it('keeps running after a job throws, and logs why', async () => {
    let runs = 0;
    const errors = [];
    const stop = startJobs(
      [
        {
          name: 'flaky',
          everyMs: 10,
          firstRunAfterMs: 0,
          run: async () => {
            runs += 1;
            throw new Error('boom');
          },
        },
      ],
      { logger: { log: () => {}, error: (...args) => errors.push(args.join(' ')) } }
    );

    await wait(100);
    stop();

    expect(runs).toBeGreaterThan(2);
    expect(errors[0]).toBe('[jobs] flaky failed: boom');
  });

  it('logs a result only when the job says it is worth logging', async () => {
    const logged = [];
    const stop = startJobs(
      [
        { name: 'quiet', everyMs: 10, firstRunAfterMs: 0, run: async () => ({ n: 0 }), shouldLog: (r) => r.n > 0 },
        { name: 'busy', everyMs: 10, firstRunAfterMs: 0, run: async () => ({ n: 1 }), shouldLog: (r) => r.n > 0 },
      ],
      { logger: { log: (label) => logged.push(label), error: () => {} } }
    );

    await wait(60);
    stop();

    expect(logged.length).toBeGreaterThan(0);
    expect(new Set(logged)).toEqual(new Set(['[jobs] busy']));
  });
});

describe('the registered jobs', () => {
  const release = jobs.find((job) => job.name === 'release-scheduled-orders');

  it('releases scheduled orders every minute', () => {
    expect(release.everyMs).toBe(60_000);
  });

  it('only logs a run that released or cancelled something', () => {
    expect(release.shouldLog({ released: 0, cancelled: 0 })).toBe(false);
    expect(release.shouldLog({ released: 1, cancelled: 0 })).toBe(true);
    expect(release.shouldLog({ released: 0, cancelled: 1 })).toBe(true);
  });
});
