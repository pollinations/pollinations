import {
    createExecutionContext,
    runInDurableObject,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("async generation jobs", () => {
    it("submits with Prefer: respond-async, collects later, and charges once", async () => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const { key: strangerKey } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        env.REPLICATE_API_TOKEN = "not-a-secret-workers-test-only";
        const tinybird = createMockTinybird();
        let executions = 0;
        const output = new Uint8Array(3 * 1024 * 1024);
        output.set(
            Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
                "base64",
            ),
        );
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url = new URL(
                    input instanceof Request ? input.url : String(input),
                );
                if (url.host === "api.replicate.com") {
                    executions++;
                    return Response.json(
                        {
                            id: "async-seedream-test",
                            status: "succeeded",
                            output: [
                                "https://replicate.delivery/async-seedream.png",
                            ],
                        },
                        { status: 201 },
                    );
                }
                if (url.host === "replicate.delivery") {
                    return new Response(output, {
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

        const prompt = `async job coordinator test ${crypto.randomUUID()}`;
        const sourceImage = new Uint8Array(128);
        sourceImage.set(
            Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lPFCAAAAAABJRU5ErkJggg==",
                "base64",
            ),
        );
        const request = (apiKey: string) => {
            const form = new FormData();
            form.set("model", "bytedance/seedream-4.0");
            form.set("prompt", prompt);
            form.set("safe", "false");
            form.set("size", "1024x1024");
            form.set("response_format", "b64_json");
            form.append(
                "image",
                new Blob([sourceImage], { type: "image/png" }),
                "input.png",
            );
            return new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    prefer: "respond-async",
                },
                body: form,
            });
        };

        const before = await getUserBalance(drizzle(env.DB), userId);

        // Submit: an id comes back immediately, before any execution.
        const submit = await SELF.fetch(request(key));
        const submitBody = await submit.text();
        expect(submit.status, submitBody).toBe(202);
        expect(submit.headers.get("location")).toMatch(/^\/v1\/jobs\//);
        const job = JSON.parse(submitBody) as {
            id: string;
            status: string;
            urls: { status: string; result: string };
        };
        expect(job.id).toMatch(/^[a-f0-9]{64}$/);
        expect(["queued", "succeeded"]).toContain(job.status);
        expect(job.urls.result.endsWith(`/v1/jobs/${job.id}/result`)).toBe(
            true,
        );

        // Another account cannot see the job.
        const stranger = await SELF.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${job.id}`, {
                headers: { authorization: `Bearer ${strangerKey}` },
            }),
        );
        expect(stranger.status).toBe(404);

        // The coordinator is addressed by the job id (its DO name).
        const stub = env.GENERATION_COORDINATOR.getByName(job.id);

        // Status eventually reports success.
        let status: { status: string } | undefined;
        await vi.waitFor(
            async () => {
                const response = await SELF.fetch(
                    new Request(
                        `https://gen.pollinations.ai/v1/jobs/${job.id}`,
                        {
                            headers: { authorization: `Bearer ${key}` },
                        },
                    ),
                );
                expect(response.status).toBe(200);
                status = (await response.json()) as { status: string };
                expect(status.status).toBe("succeeded");
            },
            { timeout: 30_000 },
        );
        expect(status).toBeDefined();

        // The result is the generated media, from the durable cache.
        const result = await SELF.fetch(
            new Request(
                `https://gen.pollinations.ai/v1/jobs/${job.id}/result`,
                {
                    headers: { authorization: `Bearer ${key}` },
                },
            ),
        );
        expect(result.status).toBe(200);
        expect(result.headers.get("content-type")).toBe("image/png");
        expect(result.headers.get("x-job-id")).toBe(job.id);
        const bytes = new Uint8Array(await result.arrayBuffer());
        expect(await crypto.subtle.digest("SHA-256", bytes)).toEqual(
            await crypto.subtle.digest("SHA-256", output),
        );

        // An anonymous poll is rejected.
        const anonymous = await SELF.fetch(
            new Request(`https://gen.pollinations.ai/v1/jobs/${job.id}`),
        );
        expect(anonymous.status).toBe(401);

        // Resubmitting the identical request once the job has settled
        // still returns a job handle — collection stays uniform — but
        // points at the settled job, with no second execution and no
        // second charge.
        const resubmit = await SELF.fetch(request(key));
        const resubmitBody = await resubmit.text();
        expect(resubmit.status, resubmitBody).toBe(202);
        const rejoined = JSON.parse(resubmitBody) as {
            id: string;
            status: string;
        };
        expect(rejoined.id).toBe(job.id);
        expect(rejoined.status).toBe("succeeded");
        const recollected = await SELF.fetch(
            new Request(
                `https://gen.pollinations.ai/v1/jobs/${rejoined.id}/result`,
                { headers: { authorization: `Bearer ${key}` } },
            ),
        );
        expect(recollected.status).toBe(200);
        expect(recollected.headers.get("content-type")).toBe("image/png");
        // Drain fully: an unconsumed R2 body keeps storage open past
        // test teardown.
        const recollectedBytes = await recollected.arrayBuffer();
        expect(recollectedBytes.byteLength).toBeGreaterThan(0);

        // The settled job leaves exactly the late-collection record;
        // the pending cleanup alarm is torn down so test isolation holds.
        const settled = await runInDurableObject(
            stub,
            async (_coordinator, state) => [
                ...(await state.storage.list()).keys(),
            ],
        );
        expect(settled).toEqual(["final"]);
        await runInDurableObject(stub, async (_coordinator, state) => {
            await state.storage.deleteAll();
            await state.storage.deleteAlarm();
        });

        // One execution, one billed event, one charge.
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

    it("keeps the sync path untouched when no Prefer header is sent", async () => {
        const { key } = await createTestApiKey({ user: { packBalance: 100 } });
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
                            id: "sync-seedream-test",
                            status: "succeeded",
                            output: [
                                "https://replicate.delivery/sync-seedream.png",
                            ],
                        },
                        { status: 201 },
                    );
                }
                if (url.host === "replicate.delivery") {
                    return new Response(new Uint8Array([1, 2, 3, 4]), {
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
        const prompt = `sync path untouched ${crypto.randomUUID()}`;
        const form = new FormData();
        form.set("model", "bytedance/seedream-4.0");
        form.set("prompt", prompt);
        form.set("safe", "false");
        form.set("size", "1024x1024");
        form.set("response_format", "b64_json");
        form.append(
            "image",
            new Blob([new Uint8Array(64)], { type: "image/png" }),
            "input.png",
        );
        const response = await SELF.fetch(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: { authorization: `Bearer ${key}` },
                body: form,
            }),
        );
        // The OpenAI JSON envelope: the synchronous contract is unchanged.
        const syncBody = await response.text();
        expect(response.status, syncBody).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        const body = JSON.parse(syncBody) as {
            data: { b64_json?: string }[];
        };
        expect(body.data[0]?.b64_json?.length).toBeGreaterThan(0);
        const context = createExecutionContext();
        await waitOnExecutionContext(context).catch(() => undefined);
    });
});
