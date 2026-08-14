import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@/middleware/generation-deduplication.ts";

function testJob(key: string, body?: string): GenerationJob {
    return {
        cache: { storage: "text", key },
        request: {
            url: "https://gen.pollinations.ai/robots.txt",
            method: body === undefined ? "GET" : "POST",
            headers: [],
            ...(body !== undefined && {
                body: new TextEncoder().encode(body),
            }),
        },
        auth: {
            user: { id: "user-1", tier: "seed" },
            apiKey: { id: "key-1" },
        },
        requestId: "request-1",
        balanceCheckResult: {
            selectedMeterId: "local:tier",
            selectedMeterSlug: "v1:meter:tier",
            balances: { "v1:meter:tier": 1, "v1:meter:pack": 2 },
        },
    };
}

async function waitForAlarm(state: DurableObjectState): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await state.storage.getAlarm()) !== null) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Generation alarm was not scheduled");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("GenerationCoordinator", () => {
    it("returns an existing cached generation without scheduling work", async () => {
        const key = `cached-${crypto.randomUUID()}`;
        await env.TEXT_BUCKET.put(key, "cached");
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );

        const result = await runInDurableObject(stub, (coordinator) =>
            coordinator.startAndWait(testJob(key)),
        );

        expect(result).toEqual({ status: "cached" });
    });

    it("joins concurrent callers for the same cache identity", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const job = testJob(`missing-${crypto.randomUUID()}`);

        const results = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const owner = coordinator.startAndWait(job);
                const joiner = coordinator.startAndWait(job);
                await waitForAlarm(state);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return Promise.all([owner, joiner]);
            },
        );
        expect(results.every((result) => result.status === "failed")).toBe(
            true,
        );
    });

    it("persists request bodies larger than one storage value", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const status = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                await state.storage.put("sentinel", "keep");
                const result = coordinator.startAndWait(
                    testJob(
                        `large-${crypto.randomUUID()}`,
                        "x".repeat(2_100_000),
                    ),
                );
                await waitForAlarm(state);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return (await result).status;
            },
        );

        expect(status).toBe("failed");
        const remaining = await runInDurableObject(
            stub,
            async (_coordinator, state) => ({
                sentinel: await state.storage.get("sentinel"),
                job: await state.storage.get("job"),
                body: await state.storage.get("body:0"),
                alarm: await state.storage.getAlarm(),
            }),
        );
        expect(remaining).toEqual({
            sentinel: "keep",
            job: undefined,
            body: undefined,
            alarm: null,
        });
    });
});
