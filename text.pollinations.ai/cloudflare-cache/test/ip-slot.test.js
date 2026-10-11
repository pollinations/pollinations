import { env, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { MAX_HOLD_MS, takeSlot } from "../../../shared/ip-slot.js";

const INTERVAL = 30_000;

// The slot's alarm time and SQLite size, read inside the object
const storageOf = (stub) =>
    runInDurableObject(stub, async (_slot, state) => ({
        alarm: await state.storage.getAlarm(),
        bytes: state.storage.sql.databaseSize,
    }));

// A generation that started `ago` ms before now and still runs
const runningSince = (stub, ago) =>
    runInDurableObject(stub, async (_slot, state) => {
        const start = Date.now() - ago;
        await state.storage.setAlarm(start + MAX_HOLD_MS);
        return { holdUntil: start + MAX_HOLD_MS, until: start + INTERVAL };
    });

test("the first request goes and holds the IP", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.1");
    const before = Date.now();
    const slot = await stub.take(INTERVAL, false);

    expect(slot).toMatchObject({ action: "go", waitMs: 0 });
    expect(slot.until).toBeGreaterThanOrEqual(before + INTERVAL);
    expect(slot.until).toBeLessThanOrEqual(Date.now() + INTERVAL);
    expect(slot.holdUntil).toBe(slot.until - INTERVAL + MAX_HOLD_MS);
    expect((await storageOf(stub)).alarm).toBe(slot.holdUntil);
});

test("a generation that runs past the interval still blocks the IP", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.2");
    const running = await runningSince(stub, 60_000);

    expect(await stub.take(INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: running.until,
    });
    expect(await stub.take(INTERVAL, true)).toMatchObject({ action: "full" });
    expect((await storageOf(stub)).alarm).toBe(running.holdUntil);
});

test("after a release, a stream waits out the interval and holds the IP", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.3");
    const first = await stub.take(INTERVAL, true);
    await stub.release(first);

    expect(await stub.take(INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: first.until,
    });
    const waiter = await stub.take(INTERVAL, true);
    expect(waiter.action).toBe("wait");
    expect(waiter.waitMs).toBeGreaterThan(0);
    expect(waiter.waitMs).toBeLessThanOrEqual(INTERVAL);
    expect(waiter.until).toBe(first.until + INTERVAL);
    expect(waiter.holdUntil).toBe(first.until + MAX_HOLD_MS);

    // The waiter holds the IP like a running generation
    expect(await stub.take(INTERVAL, true)).toMatchObject({ action: "full" });
    expect(await stub.take(INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: waiter.until,
    });
});

test("a release after the interval frees the IP at once and leaves nothing stored", async () => {
    const untouched = await storageOf(env.IP_SLOT.getByName("198.51.100.40"));
    const stub = env.IP_SLOT.getByName("198.51.100.4");
    await stub.release(await runningSince(stub, 40_000));

    expect(await storageOf(stub)).toEqual(untouched);
    expect((await stub.take(INTERVAL, false)).action).toBe("go");
});

test("a late release leaves a newer booking alone", async () => {
    const stub = env.IP_SLOT.getByName("198.51.100.5");
    // The booking before this one, whose hold ran out
    const expired = await runningSince(stub, MAX_HOLD_MS + INTERVAL);
    await runInDurableObject(stub, (_slot, state) => state.storage.deleteAll());
    const current = await stub.take(INTERVAL, false);
    await stub.release(expired);

    expect(current.action).toBe("go");
    expect((await storageOf(stub)).alarm).toBe(current.holdUntil);
});

test("a hold that is never released ends at its alarm and leaves nothing stored", async () => {
    const untouched = await storageOf(env.IP_SLOT.getByName("198.51.100.50"));
    const stub = env.IP_SLOT.getByName("198.51.100.6");
    await stub.take(INTERVAL, false);
    // Let the runtime fire the alarm, shortened from 5 minutes.
    // runDurableObjectAlarm() deletes the alarm before calling alarm(), which
    // hides what deleteAll() leaves behind when the alarm really fires
    await runInDurableObject(stub, (_slot, state) =>
        state.storage.setAlarm(Date.now() + 200),
    );

    await expect
        .poll(() => storageOf(stub), { timeout: 5000 })
        .toEqual(untouched);
    expect((await stub.take(INTERVAL, false)).action).toBe("go");
});

test("an alarm that runs after a new booking leaves it alone", async () => {
    // A take() can land after the runtime starts an alarm and before alarm()
    // runs; alarm() then sees the new booking and must not wipe the object
    const stub = env.IP_SLOT.getByName("198.51.100.7");
    const marker = await runInDurableObject(stub, async (ipSlot, state) => {
        await ipSlot.take(INTERVAL, false);
        await state.storage.put("marker", 1);
        await ipSlot.alarm();
        return state.storage.get("marker");
    });

    expect(marker).toBe(1);
});

test("takeSlot answers a busy non-stream request without calling the object", async () => {
    let calls = 0;
    const namespace = {
        getByName(name) {
            calls++;
            return env.IP_SLOT.getByName(name);
        },
    };
    const ip = "198.51.100.8";
    const first = await takeSlot(namespace, ip, INTERVAL, false);

    expect(first.action).toBe("go");
    expect(await takeSlot(namespace, ip, INTERVAL, false)).toEqual({
        action: "pay",
        waitMs: 0,
        until: first.until,
    });
    expect(calls).toBe(1);

    // Streams always ask the object
    expect((await takeSlot(namespace, ip, INTERVAL, true)).action).toBe("full");
    expect(calls).toBe(2);
});

test("takeSlot forgets a hold's end once its generation is released", async () => {
    const ip = "198.51.100.9";
    const stub = env.IP_SLOT.getByName(ip);
    // In its last interval, a hold answers pay until its 5-minute end
    const running = await runningSince(stub, MAX_HOLD_MS - INTERVAL / 2);

    expect((await takeSlot(env.IP_SLOT, ip, INTERVAL, false)).action).toBe(
        "pay",
    );
    await stub.release(running);
    expect((await takeSlot(env.IP_SLOT, ip, INTERVAL, false)).action).toBe(
        "go",
    );
});
