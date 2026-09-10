/**
 * Runs background work on a timer inside the API process.
 *
 * Deliberately small. A job queue (Agenda, BullMQ) would mean another thing to
 * operate — Redis, or a jobs collection with its own locking — for work that
 * finishes in milliseconds. What those libraries mainly buy is safety when
 * several processes run the same job, and that safety is built into the jobs
 * themselves instead: their writes are conditional updates, so a second
 * instance running the same job at the same moment changes nothing twice.
 *
 * Each job reschedules itself only after its run has finished, so a slow run
 * can never overlap the next, and a failure is logged rather than allowed to
 * stop the timer or crash the server.
 */
export function startJobs(jobs, { logger = console } = {}) {
  const timers = new Set();
  let stopped = false;

  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    // Never keep the process alive just to run a job.
    timer.unref?.();
    timers.add(timer);
  };

  for (const job of jobs) {
    const tick = async () => {
      if (stopped) return;
      try {
        const result = await job.run();
        if (job.shouldLog?.(result)) logger.log(`[jobs] ${job.name}`, result);
      } catch (err) {
        logger.error(`[jobs] ${job.name} failed:`, err?.message || err);
      }
      if (!stopped) later(tick, job.everyMs);
    };
    later(tick, job.firstRunAfterMs ?? job.everyMs);
  }

  return function stopJobs() {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}
