import { DurableObject } from "cloudflare:workers";

const DAY_MS = 24 * 60 * 60_000;

/**
 * Free replies an IP got on one UTC day: one SQLite-backed object per IP and
 * day, which deletes itself a day after its first reply.
 */
export class DailyQuota extends DurableObject {
    /** Counts one free reply; false once `limit` were counted */
    async take(limit) {
        const used = (await this.ctx.storage.get("used")) ?? 0;
        if (used >= limit) return false;
        await this.ctx.storage.put("used", used + 1);
        if (used === 0) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
        return true;
    }

    /** Gives back one reply counted by take() */
    async refund() {
        const used = (await this.ctx.storage.get("used")) ?? 0;
        if (used > 0) await this.ctx.storage.put("used", used - 1);
    }

    async alarm() {
        // As in IpSlot: before compat date 2026-02-24, deleteAll() alone keeps
        // the alarm's metadata table
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }
}

/** The next 00:00 UTC, when every IP's quota starts again */
export function nextMidnight(now = Date.now()) {
    return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

const MAX_REMEMBERED_IPS = 10_000;
// Per isolate: IP -> the midnight until which its quota is used up, so its
// further requests that day need no RPC
const usedUpUntilByIp = new Map();

/** Whether `ip`'s quota for today is known to be used up, without an RPC */
export const usedUp = (ip) => usedUpUntilByIp.get(ip) > Date.now();

/** The DailyQuota object of `ip` on the UTC day of `at` */
const quotaOf = (namespace, ip, at) =>
    namespace.getByName(`${new Date(at).toISOString().slice(0, 10)} ${ip}`);

/**
 * Counts one free reply for `ip` in the DAILY_QUOTA namespace, on the UTC day
 * of `at`, when the reply starts; false once it had `limit` that day. RPC
 * errors propagate.
 */
export async function takeQuota(namespace, ip, limit, at) {
    const free = await quotaOf(namespace, ip, at).take(limit);
    if (!free) {
        if (usedUpUntilByIp.size >= MAX_REMEMBERED_IPS) usedUpUntilByIp.clear();
        // From the same `at`: a reply that lands after midnight is not
        // remembered into the new day
        usedUpUntilByIp.set(ip, nextMidnight(at));
    }
    return free;
}

/** Gives back the reply takeQuota counted for `ip` on the UTC day of `at` */
export const refundQuota = (namespace, ip, at) =>
    quotaOf(namespace, ip, at).refund();
