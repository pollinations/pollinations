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
    it("runs a persisted payment request from its alarm and joins waiting callers", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `payment-executor-${crypto.randomUUID()}`,
        );
        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const request = {
                    url: "https://gen.pollinations.ai/not-a-generation-route",
                    method: "POST",
                    headers: [] as [string, string][],
                    body: new Uint8Array(2_100_000),
                };
                const owner = coordinator.startPaymentRequestAndWait(request);
                const joiner = coordinator.startPaymentRequestAndWait(request);
                await waitForAlarm(state);
                expect(await state.storage.get("body:2")).toBeInstanceOf(
                    Uint8Array,
                );
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                const responses = await Promise.all([owner, joiner]);
                expect(responses[0]).toEqual(responses[1]);
                return {
                    status: responses[0].status,
                    stored: await state.storage.get("payment-request"),
                    body: await state.storage.get("body:0"),
                };
            },
        );
        expect(result).toEqual({
            status: 404,
            stored: undefined,
            body: undefined,
        });
    });

    it("does not restart payment work after an interrupted alarm", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `interrupted-payment-${crypto.randomUUID()}`,
        );
        const response = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                const pending = coordinator.startPaymentRequestAndWait({
                    url: "https://gen.pollinations.ai/not-a-generation-route",
                    method: "GET",
                    headers: [],
                });
                await waitForAlarm(state);
                const stored =
                    await state.storage.get<Record<string, unknown>>(
                        "payment-request",
                    );
                await state.storage.put("payment-request", {
                    ...stored,
                    started: true,
                });
                await coordinator.alarm();
                await state.storage.deleteAlarm();
                return pending;
            },
        );
        expect(response.status).toBe(503);
        expect(new TextDecoder().decode(response.body)).toContain(
            "interrupted",
        );
    });

    it("expires only final payment responses by alarm", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `payment-${crypto.randomUUID()}`,
        );
        const now = Date.now();
        vi.spyOn(Date, "now").mockReturnValue(now);

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                expect(
                    await coordinator.startPaymentOperation(
                        "fingerprint",
                        "payment",
                        "proof",
                        "claim",
                        now + 360_000,
                    ),
                ).toEqual({ status: "owner" });
                const response = {
                    status: 200,
                    statusText: "OK",
                    headers: [["payment-response", "receipt"]] as [
                        string,
                        string,
                    ][],
                    body: new TextEncoder().encode("complete"),
                };
                expect(
                    await coordinator.completePaymentOperation(
                        "fingerprint",
                        "payment",
                        "proof",
                        "claim",
                        response,
                        now + 30 * 24 * 60 * 60 * 1000,
                    ),
                ).toBe(true);
                const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
                expect(
                    await coordinator.completeFinalPaymentOperation(
                        "fingerprint",
                        "payment",
                        "proof",
                        response,
                        expiresAt,
                    ),
                ).toBe(true);
                expect(await state.storage.getAlarm()).toBe(expiresAt);

                vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
                await coordinator.alarm();
                return {
                    operation: await state.storage.get("payment-operation"),
                    body: await env.IMAGE_BUCKET.get(
                        `x402/${state.id.toString()}/response`,
                    ),
                    alarm: await state.storage.getAlarm(),
                };
            },
        );

        expect(result).toEqual({
            operation: undefined,
            body: null,
            alarm: null,
        });
    });

    it("replays generated binary responses from R2 and expires the object", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `generated-payment-${crypto.randomUUID()}`,
        );
        const now = Date.now();
        const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
        vi.spyOn(Date, "now").mockReturnValue(now);

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
                await coordinator.startPaymentOperation(
                    "fingerprint",
                    "payment",
                    "proof",
                    "claim",
                    now + 360_000,
                );
                expect(
                    await coordinator.completePaymentOperation(
                        "fingerprint",
                        "payment",
                        "proof",
                        "claim",
                        {
                            status: 200,
                            statusText: "OK",
                            headers: [],
                            body: new Uint8Array(1_000_001),
                        },
                        expiresAt,
                    ),
                ).toBe(true);
                expect(await state.storage.getAlarm()).toBe(expiresAt);

                const object = await env.IMAGE_BUCKET.head(
                    `x402/${state.id.toString()}/response`,
                );
                expect(object?.size).toBe(1_000_001);
                const replay = await coordinator.startPaymentOperation(
                    "fingerprint",
                    "payment",
                    "proof",
                    "second-claim",
                    now + 360_000,
                );
                expect(replay.status).toBe("generated");
                if (replay.status === "generated")
                    expect(replay.response.body).toEqual(
                        new Uint8Array(1_000_001),
                    );

                vi.spyOn(Date, "now").mockReturnValue(expiresAt + 1);
                await coordinator.alarm();
                return {
                    operation: await state.storage.get("payment-operation"),
                    body: await env.IMAGE_BUCKET.get(
                        `x402/${state.id.toString()}/response`,
                    ),
                    alarm: await state.storage.getAlarm(),
                };
            },
        );

        expect(result).toEqual({
            operation: undefined,
            body: null,
            alarm: null,
        });
    });

    it("accepts identical concurrent finalization without replacing a conflicting receipt", async () => {
        const stub = env.GENERATION_COORDINATOR.getByName(
            `final-payment-${crypto.randomUUID()}`,
        );
        const now = Date.now();
        const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
        const generated = {
            status: 200,
            statusText: "OK",
            headers: [] as [string, string][],
            body: new TextEncoder().encode("complete"),
        };
        const final = {
            ...generated,
            headers: [["payment-response", "receipt-1"]] as [string, string][],
        };

        const result = await runInDurableObject(stub, async (coordinator) => {
            await coordinator.startPaymentOperation(
                "fingerprint",
                "payment",
                "proof",
                "claim",
                now + 360_000,
            );
            await coordinator.completePaymentOperation(
                "fingerprint",
                "payment",
                "proof",
                "claim",
                generated,
                expiresAt,
            );

            const identical = await Promise.all([
                coordinator.completeFinalPaymentOperation(
                    "fingerprint",
                    "payment",
                    "proof",
                    final,
                    expiresAt,
                ),
                coordinator.completeFinalPaymentOperation(
                    "fingerprint",
                    "payment",
                    "proof",
                    final,
                    expiresAt + 1,
                ),
            ]);
            const conflicting = await coordinator.completeFinalPaymentOperation(
                "fingerprint",
                "payment",
                "proof",
                {
                    ...final,
                    headers: [["payment-response", "receipt-2"]],
                },
                expiresAt + 2,
            );
            const stored = await coordinator.getFinalPaymentOperation(
                "fingerprint",
                "payment",
                "proof",
            );
            return {
                identical,
                conflicting,
                stored:
                    stored.status === "final"
                        ? {
                              headers: stored.response.headers,
                              body: new TextDecoder().decode(
                                  stored.response.body,
                              ),
                          }
                        : stored,
            };
        });

        expect(result).toEqual({
            identical: [true, true],
            conflicting: false,
            stored: {
                headers: [["payment-response", "receipt-1"]],
                body: "complete",
            },
        });
    });

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

    it("does not execute a generation again after an alarm interruption", async () => {
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
        const stub = env.GENERATION_COORDINATOR.getByName(
            `test-${crypto.randomUUID()}`,
        );
        const key = `interrupted-${crypto.randomUUID()}`;

        const result = await runInDurableObject(
            stub,
            async (coordinator, state) => {
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
