import {
    env,
    runDurableObjectAlarm,
    runInDurableObject,
} from "cloudflare:test";
import { expect, test } from "vitest";
import { takeSlot } from "../../../shared/ip-slot.js";

const INTERVAL = 30_000;

// The slot's alarm time and SQLite size, read inside the object
const storageOf = (stub) =>
    runInDurableObject(stub, async (_slot, state) => ({
        alarm: await state.storage.getAlarm(),
        bytes: state.storage.sql.databaseSize,
    }));

test("the first request goes and holds the slot for one interval", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.1");
    const before = Date.now();
    const slot = await stub.take(INTERVAL, false);

    expect(slot).toMatchObject({ action: "go", waitMs: 0 });
    expect(slot.until).toBeGreaterThanOrEqual(before + INTERVAL);
    expect(slot.until).toBeLessThanOrEqual(Date.now() + INTERVAL);
    expect((await storageOf(stub)).alarm).toBe(slot.until);
});

test("a request that cannot wait pays while the slot is busy", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.2");
    const first = await stub.take(INTERVAL, false);

    expect(await stub.take(INTERVAL, false)).toMatchObject({
        action: "pay",
        waitMs: 0,
        until: first.until,
    });
    expect((await storageOf(stub)).alarm).toBe(first.until);
});

test("a stream waits for the next slot and a second waiter finds it full", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.3");
    const first = await stub.take(INTERVAL, true);
    const waiter = await stub.take(INTERVAL, true);

    expect(waiter.action).toBe("wait");
    expect(waiter.waitMs).toBeGreaterThan(0);
    expect(waiter.waitMs).toBeLessThanOrEqual(INTERVAL);
    expect(waiter.until).toBe(first.until + INTERVAL);

    expect(await stub.take(INTERVAL, true)).toMatchObject({
        action: "full",
        until: waiter.until,
    });
    // Requests that cannot wait pay until the waiter's slot ends
    expect(await stub.take(INTERVAL, false)).toMatchObject({
        action: "pay",
        until: waiter.until,
    });
    expect((await storageOf(stub)).alarm).toBe(waiter.until);
});

test("an overdue slot goes again and its stale alarm keeps the new reservation", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.4");
    const slot = await runInDurableObject(stub, async (ipSlot, state) => {
        await state.storage.setAlarm(Date.now() - 1);
        return ipSlot.take(INTERVAL, false);
    });

    expect(slot.action).toBe("go");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await storageOf(stub)).alarm).toBe(slot.until);
});

test("the alarm frees the slot and leaves nothing stored", async () => {
    const untouched = await storageOf(env.IP_SLOT.getByName("198.51.100.50"));
    const stub = env.IP_SLOT.getByName("198.51.100.5");
    await stub.take(INTERVAL, false);

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await storageOf(stub)).toEqual(untouched);
    expect((await stub.take(INTERVAL, false)).action).toBe("go");
});

test("takeSlot answers a busy non-stream request without calling the object", async () => {
    let calls = 0;
    const namespace = {
        getByName(name) {
            calls++;
            return env.IP_SLOT.getByName(name);
        },
    };
    const ip = "198.51.100.6";
    const first = await takeSlot(namespace, ip, INTERVAL, false);

    expect(first.action).toBe("go");
    expect(await takeSlot(namespace, ip, INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: first.until,
    });
    expect(calls).toBe(1);

    // Streams always ask the object, and a reserved wait extends the memo
    const waiter = await takeSlot(namespace, ip, INTERVAL, true);
    expect(waiter.action).toBe("wait");
    expect(await takeSlot(namespace, ip, INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: waiter.until,
    });
    expect(calls).toBe(2);
});
