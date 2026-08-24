import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { serviceAuthorization } from "@shared/db/service-billing.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@/middleware/generation-deduplication.ts";
import { bindEnterGateway } from "./gateway.ts";

let caller: { key: string; id: string; userId: string };

beforeAll(async () => {
    caller = await createTestApiKey({
        pollenBudget: 10,
        user: { tierBalance: 100 },
    });
});

function testJob(
    key: string,
    body?: string,
    token = caller.key,
): GenerationJob {
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
            user: { id: caller.userId, tier: "seed" },
            apiKey: { id: caller.id },
        },
        requestId: `request-${key}`,
        balanceCheckResult: {
            selectedMeterId: "local:tier",
            selectedMeterSlug: "v1:meter:tier",
            balances: { "v1:meter:tier": 1, "v1:meter:pack": 2 },
        },
        authorize: {
            token,
            requestPath: "/robots.txt",
            estimatedPrice: 0.25,
        },
    };
}

async function authorizationFor(key: string) {
    return drizzle(env.DB)
        .select()
        .from(serviceAuthorization)
        .where(eq(serviceAuthorization.requestId, `request-${key}`))
        .get();
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

        const result = await runInDurableObject(stub, (coordinator) => {
            bindEnterGateway(coordinator);
            return coordinator.startAndWait(testJob(key));
        });

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
                bindEnterGateway(coordinator);
                const owner = coordinator.startAndWait(job);
                const joiner = coordinator.startAndWait(job);
                await waitForAlarm(state);
                const persisted =
                    await state.storage.get<Record<string, unknown>>("job");
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return {
                    persisted,
                    outcomes: await Promise.all([owner, joiner]),
                };
            },
        );
        expect(
            results.outcomes.every((result) => result.status === "failed"),
        ).toBe(true);
        // One authorization for both callers, persisted by id only.
        expect(results.persisted).not.toHaveProperty("authorize");
        const authorization = await authorizationFor(job.cache.key);
        expect(authorization?.id).toBe(results.persisted?.authorizationId);
        expect(authorization?.reservedPrice).toBe(0.25);
        // The executor found no route: nothing settled, reservation released.
        expect(authorization?.canceledAt).not.toBeNull();
    });

    it("returns Enter's denial without scheduling work", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const key = `denied-${crypto.randomUUID()}`;

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                bindEnterGateway(coordinator);
                return {
                    outcome: await coordinator.startAndWait(
                        testJob(key, undefined, "sk_not_a_key"),
                    ),
                    alarm: await state.storage.getAlarm(),
                    job: await state.storage.get("job"),
                };
            },
        );

        expect(result.outcome).toMatchObject({
            status: "denied",
            denial: { status: 401 },
        });
        expect(result.alarm).toBeNull();
        expect(result.job).toBeUndefined();
        expect(await authorizationFor(key)).toBeUndefined();
    });

    it("does not execute a generation again after an alarm interruption", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const key = `interrupted-${crypto.randomUUID()}`;

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                bindEnterGateway(coordinator);
                const pending = coordinator.startAndWait(testJob(key));
                await waitForAlarm(state);
                const job =
                    await state.storage.get<Record<string, unknown>>("job");
                await state.storage.put("job", { ...job, started: true });

                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return pending;
            },
        );

        expect(result.status).toBe("failed");
        if (result.status !== "failed") return;
        expect(new TextDecoder().decode(result.error.body)).toBe(
            "Detached generation was interrupted",
        );
        expect(await env.TEXT_BUCKET.head(key)).toBeNull();
        expect((await authorizationFor(key))?.canceledAt).not.toBeNull();
    });

    it("persists request bodies larger than one storage value", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const status = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                bindEnterGateway(coordinator);
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
