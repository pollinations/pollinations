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
import worker from "../src/index.ts";

afterEach(teardownFetchMock);

async function postMultipart(
    path: string,
    fields: Record<string, string>,
): Promise<Response> {
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    const caller = await createTestApiKey({ user: { tierBalance: 100 } });
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);

    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, {
            method: "POST",
            headers: { authorization: `Bearer ${caller.key}` },
            body: form,
        }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

test("rejects an empty model in a multipart speech request", async () => {
    const response = await postMultipart("/v1/audio/speech", {
        input: "hello",
        voice: "alloy",
        model: "",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("model");
});

test("rejects an empty model in a multipart transcription request", async () => {
    const response = await postMultipart("/v1/audio/transcriptions", {
        model: "",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("model");
});

test("rejects an empty model on the timestamped speech endpoint", async () => {
    const response = await postMultipart("/v1/audio/speech/with-timestamps", {
        input: "hello",
        voice: "alloy",
        model: "",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("model");
});
