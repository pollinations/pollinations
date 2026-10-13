import { runInDurableObject, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

// Quest #17256: `Prefer: respond-async` returns a job id right away, the job
// keeps running durably after the submitter left, and only its submitting
// account can read its status or result — with one generation and one charge.

const GEN_ORIGIN = "https://gen.pollinations.ai";
const JOB_ID_PATTERN = /^[0-9a-f]{64}$/;

/** Alarms do not fire on their own in tests; the coordinator alarm runs them. */
async function waitForAlarm(state: DurableObjectState): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await state.storage.getAlarm()) !== null) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Generation alarm was not scheduled");
}

const PNG = new Uint8Array(
    Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
        "base64",
    ),
);

function submitRequest(key: string, prompt: string): Request {
    return new Request(`${GEN_ORIGIN}/v1/images/generations`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            prefer: "respond-async",
        },
        body: JSON.stringify({
            model: "bytedance/seedream-4.0",
            prompt,
            // An explicit seed makes the request identity stable, so a resend
            // joins the same job instead of starting a new generation.
            seed: 1234,
            response_format: "url",
        }),
    });
}

function jobRequest(key: string, path: string): Request {
    return new Request(`${GEN_ORIGIN}${path}`, {
        headers: { authorization: `Bearer ${key}` },
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("async generation jobs", () => {
    it("runs one generation and one charge for a disconnected submitter", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        env.REPLICATE_API_TOKEN = "not-a-secret-workers-test-only";
        const tinybird = createMockTinybird();
        let executions = 0;
        let release!: () => void;
        const providerWaiting = new Promise<void>((resolve) => {
            release = resolve;
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(
                    input instanceof Request ? input.url : String(input),
                );
                if (url.host === "api.replicate.com") {
                    expect(init?.method).toBe("POST");
                    executions++;
                    await providerWaiting;
                    return Response.json(
                        {
                            id: "async-job-test",
                            status: "succeeded",
                            output: [
                                "https://replicate.delivery/async-job.png",
                            ],
                        },
                        { status: 201 },
                    );
                }
                if (url.host === "replicate.delivery") {
                    return new Response(PNG, {
                        headers: { "content-type": "image/png" },
                    });
                }
                if (url.pathname === "/v0/pipes/public_model_stats.json") {
                    return Response.json({ data: [] });
                }
                const handler = tinybird.handlerMap[url.host];
                if (handler) return handler(new Request(input, init));
                throw new Error(
                    `Unexpected outbound request: ${url.host}${url.pathname}`,
                );
            },
        );

        const prompt = `async job test ${crypto.randomUUID()}`;
        const before = await getUserBalance(drizzle(env.DB), userId);

        const submitted = await SELF.fetch(submitRequest(key, prompt));
        expect(submitted.status).toBe(202);
        const accepted = (await submitted.json()) as {
            id: string;
            status: string;
            status_url: string;
        };
        expect(accepted.id).toMatch(JOB_ID_PATTERN);
        expect(accepted.status).toBe("pending");
        expect(accepted.status_url).toBe(
            `${GEN_ORIGIN}/v1/jobs/${accepted.id}`,
        );
        expect(submitted.headers.get("location")).toBe(accepted.status_url);

        const statusPath = `/v1/jobs/${accepted.id}`;
        const pending = await SELF.fetch(jobRequest(key, statusPath));
        expect(pending.status).toBe(200);
        await expect(pending.json()).resolves.toMatchObject({
            id: accepted.id,
            status: "pending",
        });

        const pendingResult = await SELF.fetch(
            jobRequest(key, `${statusPath}/result`),
        );
        expect(pendingResult.status).toBe(409);

        // Resending the same request while it runs joins the job instead
        // of starting a second generation.
        const joined = await SELF.fetch(submitRequest(key, prompt));
        expect(joined.status).toBe(202);
        await expect(joined.json()).resolves.toMatchObject({
            id: accepted.id,
            status: "pending",
        });

        // Another account cannot see or collect the job.
        const other = await createTestApiKey({ user: { packBalance: 1 } });
        const foreign = await SELF.fetch(jobRequest(other.key, statusPath));
        expect(foreign.status).toBe(404);
        const foreignResult = await SELF.fetch(
            jobRequest(other.key, `${statusPath}/result`),
        );
        expect(foreignResult.status).toBe(404);

        release();
        const stub = env.GENERATION_COORDINATOR.getByName(accepted.id);
        await runInDurableObject(stub, async (coordinator, state) => {
            if (await state.storage.get("job")) {
                await waitForAlarm(state);
                await coordinator.alarm();
            }
        });
        await vi.waitFor(
            async () => {
                const response = await SELF.fetch(jobRequest(key, statusPath));
                expect(response.status).toBe(200);
                await expect(response.json()).resolves.toMatchObject({
                    id: accepted.id,
                    status: "succeeded",
                    result_url: `${GEN_ORIGIN}${statusPath}/result`,
                });
            },
            { timeout: 10_000 },
        );

        const result = await SELF.fetch(
            jobRequest(key, `${statusPath}/result`),
        );
        expect(result.status).toBe(200);
        expect(result.headers.get("content-type")).toContain("image/png");
        expect(new Uint8Array(await result.arrayBuffer())).toEqual(PNG);

        // Resubmitting the same request is served from the cache instead
        // of the job API: same generation, no second execution, no second
        // charge.
        const again = await SELF.fetch(submitRequest(key, prompt));
        expect(again.status).toBe(200);
        const reused = (await again.json()) as {
            data: { url?: string }[];
        };
        expect(reused.data[0].url).toContain("media.pollinations.ai/");

        const billed = tinybird.state.events.filter(
            (event) => event.isBilledUsage,
        );
        expect(executions).toBe(1);
        expect(billed).toHaveLength(1);
        expect(billed[0].totalPrice).toBeGreaterThan(0);
        const after = await getUserBalance(drizzle(env.DB), userId);
        expect(before.packBalance - after.packBalance).toBeCloseTo(
            billed[0].totalPrice,
            8,
        );
    }, 60_000);

    it("keeps synchronous behavior when no Prefer header is sent", async () => {
        const { key } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        env.REPLICATE_API_TOKEN = "not-a-secret-workers-test-only";
        const tinybird = createMockTinybird();
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(
                    input instanceof Request ? input.url : String(input),
                );
                if (url.host === "api.replicate.com") {
                    return Response.json(
                        {
                            id: "sync-job-test",
                            status: "succeeded",
                            output: ["https://replicate.delivery/sync-job.png"],
                        },
                        { status: 201 },
                    );
                }
                if (url.host === "replicate.delivery") {
                    return new Response(PNG, {
                        headers: { "content-type": "image/png" },
                    });
                }
                if (url.pathname === "/v0/pipes/public_model_stats.json") {
                    return Response.json({ data: [] });
                }
                const handler = tinybird.handlerMap[url.host];
                if (handler) return handler(new Request(input, init));
                throw new Error(
                    `Unexpected outbound request: ${url.host}${url.pathname}`,
                );
            },
        );

        const submit = submitRequest(key, "sync path test");
        const response = await SELF.fetch(
            new Request(submit.url, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                },
                body: await submit.text(),
            }),
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { data: { url?: string }[] };
        expect(body.data[0].url).toContain("media.pollinations.ai/");
    }, 60_000);
});
