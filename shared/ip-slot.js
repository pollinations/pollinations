import { DurableObject } from "cloudflare:workers";

// Ends a hold whose release() never arrives, e.g. when an isolate stops mid-stream
export const MAX_HOLD_MS = 5 * 60_000;

/**
 * One free generation per client IP at a time, started at least intervalMs
 * after the previous one, as in the VM's per-IP queue. One SQLite-backed
 * object per IP.
 *
 * The scheduled alarm time t is the only state:
 * - t - now > intervalMs: a generation holds the IP (running, or waiting to
 *   start) until its release(), or until t
 * - otherwise, while t > now: the last generation ended and the next may start at t
 *   (so does a hold in its final intervalMs, reached only by a generation
 *   running longer than MAX_HOLD_MS - intervalMs)
 * The alarm fires when the IP frees, and deleteAll() leaves nothing stored for
 * idle IPs. Keep this class unchanged once deployed: during a gradual
 * deployment each object may run either Worker version.
 */
export class IpSlot extends DurableObject {
    /**
     * @param {number} intervalMs time between the starts of two free generations
     * @param {boolean} canWait whether the caller can wait for the next slot (text streams)
     * @returns {Promise<{action: "go" | "wait" | "full" | "pay", waitMs: number, until: number, holdUntil?: number}>}
     *   After a go or wait, no free generation can start before `until`; pass
     *   the result to release() once the generation ends.
     */
    async take(intervalMs, canWait) {
        const now = Date.now();
        const t = (await this.ctx.storage.getAlarm()) ?? 0;

        if (t - now > intervalMs) {
            const until = t - MAX_HOLD_MS + intervalMs;
            return { action: canWait ? "full" : "pay", waitMs: 0, until };
        }
        if (t > now && !canWait) {
            return { action: "pay", waitMs: 0, until: t };
        }
        const start = Math.max(t, now);
        await this.ctx.storage.setAlarm(start + MAX_HOLD_MS);
        return {
            action: start > now ? "wait" : "go",
            waitMs: start - now,
            until: start + intervalMs,
            holdUntil: start + MAX_HOLD_MS,
        };
    }

    /**
     * Ends the hold of a booking from take(): the next free generation may
     * start at its `until`, or at once if that has passed.
     */
    async release({ holdUntil, until }) {
        // An expired hold may already have been replaced by a newer booking
        if ((await this.ctx.storage.getAlarm()) !== holdUntil) return;
        if (until > Date.now()) {
            await this.ctx.storage.setAlarm(until);
        } else {
            await this.ctx.storage.deleteAlarm();
            await this.ctx.storage.deleteAll();
        }
    }

    async alarm() {
        // A take() that landed after this alarm came due set a new one: keep it
        if ((await this.ctx.storage.getAlarm()) === null) {
            // Before compat date 2026-02-24, deleteAll() alone keeps the firing
            // alarm's metadata table, an 8 KB database per IP that never goes
            await this.ctx.storage.deleteAlarm();
            await this.ctx.storage.deleteAll();
        }
    }
}

const MAX_REMEMBERED_IPS = 10_000;
// Per isolate: IP -> the `until` of its latest go or wait. No release() brings
// that forward, so a non-stream request before it gets "pay" without an RPC.
// A pay answer's until is not kept: it can be a hold's end, which release() can.
const busyUntilByIp = new Map();

/**
 * Takes the free slot for `ip` from the IP_SLOT namespace. RPC errors propagate.
 */
export async function takeSlot(namespace, ip, intervalMs, canWait) {
    const busyUntil = busyUntilByIp.get(ip);
    if (!canWait && busyUntil > Date.now()) {
        return { action: "pay", waitMs: 0, until: busyUntil };
    }

    const slot = await namespace.getByName(ip).take(intervalMs, canWait);
    if (slot.action === "go" || slot.action === "wait") {
        if (busyUntilByIp.size >= MAX_REMEMBERED_IPS) busyUntilByIp.clear();
        busyUntilByIp.set(ip, slot.until);
    }
    return slot;
}
