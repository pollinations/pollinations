/**
 * Pack-balance threshold (in pollen) at or below which auto top-up triggers.
 * Single source of truth — read by both the gen worker (live trigger check)
 * and the enter worker (cron sweep + per-user processing).
 */
export const AUTO_TOP_UP_THRESHOLD_POLLEN = 5;
