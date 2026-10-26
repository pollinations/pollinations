import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, test, vi } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const model = "black-forest-labs/flux.2-klein-4b";
const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const invalidReference =
    "Invalid reference image: Image too small: 63×52. Both dimensions must be at least 64px";

afterEach(teardownFetchMock);

test.for([
    [400, invalidReference],
    [500, "Internal Server Error"],
    [
        503,
        "GPU memory exhausted; use smaller dimensions or fewer reference images.",
    ],
] as const)(
    "Klein preserves backend status %s without charging",
    async ([status, detail]) => {
        const { key, userId } = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const mocks = createFetchMock({ tinybird: createMockTinybird() });
        await mocks.enable("tinybird");
        const backend = vi.fn(async () =>
            Response.json({ detail }, { status }),
        );
        const bindings = withInlineGenerationCoordinator({
            ...env,
            KLEIN_VPC: { fetch: backend } as unknown as Fetcher,
        });
        const before = await getUserBalance(drizzle(env.DB), userId);
        for (const surface of ["native", "openai"]) {
            const ctx = createExecutionContext();
            const request =
                surface === "native"
                    ? new Request(
                          `https://gen.pollinations.ai/image/klein-${crypto.randomUUID()}?model=${model}`,
                          { headers: { authorization: `Bearer ${key}` } },
                      )
                    : new Request(
                          "https://gen.pollinations.ai/v1/images/edits",
                          {
                              method: "POST",
                              headers: {
                                  authorization: `Bearer ${key}`,
                                  "content-type": "application/json",
                              },
                              body: JSON.stringify({
                                  model,
                                  prompt: `Klein ${crypto.randomUUID()}`,
                                  size: "1024x1024",
                                  image: [
                                      {
                                          image_url: `data:image/png;base64,${png}`,
                                      },
                                  ],
                              }),
                          },
                      );
            const response = await worker.fetch(request, bindings, ctx);
            const body = await response.text();
            expect(response.status, `${surface}: ${body}`).toBe(status);
            expect(body).toContain(detail);
            await waitOnExecutionContext(ctx);
        }
        expect(backend).toHaveBeenCalledTimes(2);
        expect(
            mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
        ).toHaveLength(0);
        expect(await getUserBalance(drizzle(env.DB), userId)).toEqual(before);
    },
);

test("Klein successful output is charged once and replayed from cache", async () => {
    const { key, userId } = await createTestApiKey({
        user: { packBalance: 100 },
    });
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    const backend = vi.fn(async () => Response.json([{ image: png }]));
    const bindings = withInlineGenerationCoordinator({
        ...env,
        KLEIN_VPC: { fetch: backend } as unknown as Fetcher,
    });
    const before = await getUserBalance(drizzle(env.DB), userId);
    const url = `https://gen.pollinations.ai/image/klein-${crypto.randomUUID()}?model=${model}&seed=42`;
    for (const cache of ["MISS", "HIT"]) {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(url, { headers: { authorization: `Bearer ${key}` } }),
            bindings,
            ctx,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-cache")).toBe(cache);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(
            Buffer.from(png, "base64"),
        );
        await waitOnExecutionContext(ctx);
    }
    expect(backend).toHaveBeenCalledTimes(1);
    const billed = mocks.tinybird.state.events.filter(
        (event) => event.isBilledUsage,
    );
    expect(billed).toHaveLength(1);
    expect(billed[0]).toMatchObject({
        modelProviderUsed: "vast",
        totalCost: 0.005,
        totalPrice: 0.005,
    });
    const after = await getUserBalance(drizzle(env.DB), userId);
    expect(before.packBalance - after.packBalance).toBeCloseTo(0.005, 8);
});
