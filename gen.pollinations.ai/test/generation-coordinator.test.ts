import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { BillingServiceBinding } from "@shared/schemas/billable-event.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob } from "@/middleware/generation-deduplication.ts";
import { executeGeneration } from "@/utils/execute-generation.ts";
import { generateCacheKey } from "@/utils/text-cache.ts";

let testApiKey: string;

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
        billingRequest: {
            token: testApiKey,
            authorization: {
                producer: "gen.pollinations.ai",
                requestId: "request-1",
                estimatedPrice: 0,
                paidOnly: false,
            },
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

beforeEach(async () => {
    ({ key: testApiKey } = await createTestApiKey());
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
        const authorization = await env.DB.prepare(
            "SELECT COUNT(*) AS count FROM billing_authorization WHERE producer = ? AND request_id = ?",
        )
            .bind("gen.pollinations.ai", job.requestId)
            .first<{ count: number }>();
        expect(authorization?.count).toBe(1);
    });

    it("does not execute a generation again after an alarm interruption", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const key = `interrupted-${crypto.randomUUID()}`;
        const job = testJob(key);

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const pending = coordinator.startAndWait(job);
                await waitForAlarm(state);
                const persistedJob =
                    await state.storage.get<Record<string, unknown>>("job");
                expect(persistedJob).not.toHaveProperty("billingRequest");
                expect(JSON.stringify(persistedJob)).not.toContain(testApiKey);
                await state.storage.put("job", {
                    ...persistedJob,
                    started: true,
                });
                await env.TEXT_BUCKET.put(key, "unbilled-partial-result");

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
        const authorization = await env.DB.prepare(
            "SELECT cancelled_at AS cancelledAt FROM billing_authorization WHERE producer = ? AND request_id = ?",
        )
            .bind("gen.pollinations.ai", "request-1")
            .first<{ cancelledAt: number | null }>();
        expect(authorization?.cancelledAt).not.toBeNull();
    });

    it("deletes an unbilled provider result and rejects an identical retry", async () => {
        let providerCalls = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const request = new Request(input);
            if (new URL(request.url).host !== "portkey.test") {
                return new Response(null, { status: 204 });
            }
            providerCalls += 1;
            return Response.json({
                id: "chatcmpl_rejected_settlement",
                object: "chat.completion",
                model: "gpt-5-nano-2025-08-07",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "once" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });
        env.PORTKEY_GATEWAY_URL = "https://portkey.test";
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const requestUrl =
            "https://gen.pollinations.ai/text/hello?model=openai";
        const key = await generateCacheKey(new Request(requestUrl));
        const job = testJob(key);
        job.request = {
            url: requestUrl,
            method: "GET",
            headers: [],
        };
        job.billingRequest.authorization.model = "openai";

        const [first, retry] = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const pending = coordinator.startAndWait(job);
                await waitForAlarm(state);
                const grant = await env.DB.prepare(
                    "SELECT id FROM billing_authorization WHERE producer = ? AND request_id = ?",
                )
                    .bind("gen.pollinations.ai", job.requestId)
                    .first<{ id: string }>();
                if (!grant) throw new Error("Expected billing authorization");
                await env.ENTER_BILLING.cancel(grant.id);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return [await pending, await coordinator.startAndWait(job)];
            },
        );

        expect(first.status).toBe("failed");
        expect(retry.status).toBe("failed");
        expect(providerCalls).toBe(1);
        expect(await env.TEXT_BUCKET.head(key)).toBeNull();
        const ledger = await env.DB.prepare(
            "SELECT COUNT(*) AS count FROM billable_event WHERE request_id = ?",
        )
            .bind(job.requestId)
            .first<{ count: number }>();
        expect(ledger?.count).toBe(0);
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

    it("survives caller disconnect and rejoin with one provider call and debit", async () => {
        const created = await createTestApiKey({
            user: { tierBalance: 1 },
        });
        const requestId = `rejoin-${crypto.randomUUID()}`;
        const requestUrl =
            "https://gen.pollinations.ai/text/hello?model=openai";
        const key = await generateCacheKey(new Request(requestUrl));
        const job = testJob(key);
        job.requestId = requestId;
        job.request = {
            url: requestUrl,
            method: "GET",
            headers: [],
        };
        job.auth = {
            user: { id: created.userId, tier: "seed" },
            apiKey: { id: created.id },
        };
        job.billingRequest = {
            token: created.key,
            authorization: {
                producer: "gen.pollinations.ai",
                requestId,
                estimatedPrice: 0,
                paidOnly: false,
                model: "openai",
            },
        };

        let providerCalls = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const request = new Request(input);
            if (new URL(request.url).host !== "portkey.test") {
                return new Response(null, { status: 204 });
            }
            providerCalls += 1;
            return Response.json({
                id: "chatcmpl_rejoin",
                object: "chat.completion",
                model: "gpt-5-nano-2025-08-07",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "once" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });
        env.PORTKEY_GATEWAY_URL = "https://portkey.test";
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );

        const joinedOutcomes = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const disconnectedCaller = coordinator.startAndWait(job);
                await waitForAlarm(state);
                const rejoinedCaller = coordinator.startAndWait(job);
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return {
                    disconnected: await disconnectedCaller,
                    rejoined: await rejoinedCaller,
                };
            },
        );
        const completedCache = await runInDurableObject(stub, (coordinator) =>
            coordinator.startAndWait(job),
        );

        expect({ ...joinedOutcomes, completedCache }).toEqual({
            disconnected: { status: "cached" },
            rejoined: { status: "cached" },
            completedCache: { status: "cached" },
        });
        expect(providerCalls).toBe(1);
        expect(
            await env.TEXT_BUCKET.get(key).then((body) => body?.text()),
        ).toContain("once");
        const ledger = await env.DB.prepare(
            `SELECT COUNT(*) AS count,
                    SUM(billed_price) AS billedPrice,
                    MAX(telemetry_json) AS telemetryJson
             FROM billable_event WHERE request_id = ?`,
        )
            .bind(requestId)
            .first<{
                count: number;
                billedPrice: number;
                telemetryJson: string;
            }>();
        expect(ledger?.count).toBe(1);
        expect(ledger?.billedPrice).toBeGreaterThan(0);
        expect(JSON.parse(ledger?.telemetryJson ?? "{}")).toMatchObject({
            requestId,
            eventType: "generate.text",
            isBilledUsage: true,
        });
        const balance = await env.DB.prepare(
            "SELECT tier_balance AS tierBalance FROM user WHERE id = ?",
        )
            .bind(created.userId)
            .first<{ tierBalance: number }>();
        expect(balance?.tierBalance).toBeCloseTo(
            1 - (ledger?.billedPrice ?? 0),
            8,
        );
    });

    it("retries only an unacknowledged settlement and never replays provider work", async () => {
        const created = await createTestApiKey({
            user: { tierBalance: 1 },
        });
        const requestId = `settlement-retry-${crypto.randomUUID()}`;
        const authorization = await env.ENTER_BILLING.authorize(created.key, {
            producer: "gen.pollinations.ai",
            requestId,
            estimatedPrice: 0,
            paidOnly: false,
            model: "openai",
        });
        if (!authorization.ok) throw new Error(authorization.error);

        let providerCalls = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const request = new Request(input);
            if (new URL(request.url).host !== "portkey.test") {
                return new Response(null, { status: 204 });
            }
            providerCalls += 1;
            return Response.json({
                id: "chatcmpl_settlement_retry",
                object: "chat.completion",
                model: "gpt-5-nano-2025-08-07",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "once" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            });
        });

        const realBilling = env.ENTER_BILLING;
        let settlementCalls = 0;
        const billing: BillingServiceBinding = {
            introspect: (token) => realBilling.introspect(token),
            authorize: (token, input) => realBilling.authorize(token, input),
            cancel: (id) => realBilling.cancel(id),
            settle: async (id, events) => {
                settlementCalls += 1;
                const result = await realBilling.settle(id, events);
                if (settlementCalls === 1) {
                    throw new Error("settlement acknowledgement lost");
                }
                return result;
            },
        };
        const workerEnv = {
            ...env,
            ENTER_BILLING: billing,
            PORTKEY: undefined,
            PORTKEY_GATEWAY_URL: "https://portkey.test",
        } as unknown as CloudflareBindings;
        const request = () =>
            new Request("https://gen.pollinations.ai/text/hello?model=openai");
        const auth = {
            user: { id: created.userId, tier: "seed" },
            apiKey: { id: created.id },
        };
        const balanceCheckResult = {
            selectedMeterId: "local:tier",
            selectedMeterSlug: "v1:meter:tier",
            balances: { "v1:meter:tier": 1, "v1:meter:pack": 0 },
        };

        const first = await executeGeneration(
            request(),
            auth,
            requestId,
            balanceCheckResult,
            authorization.grant.id,
            workerEnv,
        );
        await first.settlement;
        const second = await executeGeneration(
            request(),
            auth,
            requestId,
            balanceCheckResult,
            authorization.grant.id,
            workerEnv,
        );
        await second.settlement;

        expect(first.result).toEqual({ status: "cached" });
        expect(second.result).toEqual({ status: "cached" });
        expect(providerCalls).toBe(1);
        expect(settlementCalls).toBe(2);
        const ledger = await env.DB.prepare(
            `SELECT COUNT(*) AS count, SUM(billed_price) AS billedPrice
             FROM billable_event WHERE authorization_id = ?`,
        )
            .bind(authorization.grant.id)
            .first<{ count: number; billedPrice: number }>();
        expect(ledger?.count).toBe(1);
        expect(ledger?.billedPrice).toBeGreaterThan(0);
    });
});
