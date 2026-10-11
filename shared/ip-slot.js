import { DurableObject } from "cloudflare:workers";

/**
 * One free generation slot per client IP (one SQLite-backed object per IP).
 *
 * The scheduled alarm time is the only state: the slot is busy until then.
 * The alarm fires when the slot frees, and deleteAll() leaves nothing stored
 * for idle IPs. Keep this class unchanged once deployed: during a gradual
 * deployment each object may run either Worker version.
 */
export class IpSlot extends DurableObject {
    /**
     * @param {number} intervalMs time between the starts of two free generations
     * @param {boolean} canWait whether the caller can wait for the next slot (text streams)
     * @returns {Promise<{action: "go" | "wait" | "full" | "pay", waitMs: number, until: number}>}
     */
    async take(intervalMs, canWait) {
        const now = Date.now();
        const busyUntil = (await this.ctx.storage.getAlarm()) ?? 0;

        if (busyUntil <= now) {
            await this.ctx.storage.setAlarm(now + intervalMs);
            return { action: "go", waitMs: 0, until: now + intervalMs };
        }
        if (!canWait) {
            return { action: "pay", waitMs: 0, until: busyUntil };
        }
        // More than one interval away means a waiter already holds the next slot.
        if (busyUntil - now > intervalMs) {
            return { action: "full", waitMs: 0, until: busyUntil };
        }
        await this.ctx.storage.setAlarm(busyUntil + intervalMs);
        return {
            action: "wait",
            waitMs: busyUntil - now,
            until: busyUntil + intervalMs,
        };
    }

    async alarm() {
        // A take() that landed after this alarm came due set a new one: keep it
        if ((await this.ctx.storage.getAlarm()) === null) {
            await this.ctx.storage.deleteAll();
        }
    }
}

const MAX_REMEMBERED_IPS = 10_000;
// Per isolate: IP -> time its slot is busy until. That time only moves later
// until it passes, so a non-stream request before it gets "pay" without an RPC.
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
    if (busyUntilByIp.size >= MAX_REMEMBERED_IPS) busyUntilByIp.clear();
    busyUntilByIp.set(ip, slot.until);
    return slot;
}
