import { expect, test } from "vitest";
import { enqueue } from "../ipQueue.js";

test("an anonymous second request is offered payment instead of waiting", async () => {
    const req = {
        method: "GET",
        url: "/prompt/test",
        headers: { "x-forwarded-for": `queue-payment-${Date.now()}` },
    };
    const options = { interval: 150, cap: 1, rejectWhenQueued: true };

    expect(await enqueue(req, () => "first", options)).toBe("first");
    await expect(enqueue(req, () => "second", options)).rejects.toMatchObject({
        status: 429,
        paymentEligible: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 170));
    expect(await enqueue(req, () => "after interval", options)).toBe("after interval");
});

test("a request arriving during the first generation is offered payment immediately", async () => {
    const req = {
        method: "GET",
        url: "/prompt/test",
        headers: { "x-forwarded-for": `queue-inflight-${Date.now()}` },
    };
    let finishFirst;
    let markStarted;
    const started = new Promise((resolve) => {
        markStarted = resolve;
    });
    const first = enqueue(req, () => new Promise((resolve) => {
        finishFirst = resolve;
        markStarted();
    }), { interval: 150, cap: 1, rejectWhenQueued: true });
    await started;

    await expect(enqueue(req, () => "second", {
        interval: 150,
        cap: 1,
        rejectWhenQueued: true,
    })).rejects.toMatchObject({ status: 429, paymentEligible: true });

    finishFirst("first");
    await expect(first).resolves.toBe("first");
});

test("the ordinary queue still waits when payment is unavailable", async () => {
    const req = {
        method: "GET",
        url: "/prompt/test",
        headers: { "x-forwarded-for": `queue-free-${Date.now()}` },
    };
    const options = { interval: 100, cap: 1 };

    expect(await enqueue(req, () => "first", options)).toBe("first");
    const started = Date.now();
    expect(await enqueue(req, () => "second", options)).toBe("second");
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
});
