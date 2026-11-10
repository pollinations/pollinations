import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";

afterEach(teardownFetchMock);

test("rejects an empty model on /v1/audio/speech", async () => {
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    const caller = await createTestApiKey({ user: { tierBalance: 100 } });

    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/audio/speech", {
            method: "POST",
            headers: {
                authorization: `Bearer ${caller.key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "",
                input: "hello",
                voice: "alloy",
            }),
        }),
        env,
        ctx,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("model");
    await waitOnExecutionContext(ctx);
});
