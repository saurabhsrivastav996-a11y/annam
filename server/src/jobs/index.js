import { releaseDueOrders } from '../services/scheduling.js';

const MINUTE = 60_000;

/**
 * The server's background work. Safe to run in more than one process at the
 * same time — see runner.js for why that matters more here than a queue would.
 */
export const jobs = [
  {
    name: 'release-scheduled-orders',
    // Start times are worked back from prep and the ride; a minute either way is noise.
    everyMs: MINUTE,
    firstRunAfterMs: 5_000,
    run: () => releaseDueOrders(),
    shouldLog: (r) => r.released > 0 || r.cancelled > 0,
  },
];
