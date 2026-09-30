import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import { parsePositiveInt } from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

afterEach(teardownFetchMock);

describe("parsePositiveInt", () => {
    it("returns undefined for null/empty input", () => {
        expect(parsePositiveInt(null, "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("", "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("   ", "speakers_expected")).toBeUndefined();
    });

    it("accepts positive integers", () => {
        expect(parsePositiveInt("1", "speakers_expected")).toBe(1);
        expect(parsePositiveInt("32", "speakers_expected")).toBe(32);
        expect(parsePositiveInt("999", "speakers_expected")).toBe(999);
    });

    it("rejects non-integers, zero, negatives", () => {
        for (const v of ["0", "-1", "1.5", "abc", "NaN"]) {
            expect(() => parsePositiveInt(v, "speakers_expected")).toThrowError(
                /speakers_expected must be a positive integer/,
            );
        }
    });
});

test.for([
    "text",
    "empty",
])("transcription rejects a %s file field with 400", async (kind, {
    paidApiKey,
}) => {
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    const form = new FormData();
    form.set("model", "google/gemini-3.5-transcribe");
    form.set(
        "file",
        kind === "text"
            ? "not an audio upload"
            : new File([], "empty.wav", { type: "audio/wav" }),
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/audio/transcriptions", {
            method: "POST",
            headers: { authorization: `Bearer ${paidApiKey}` },
            body: form,
        }),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
        error: {
            message: "The file field must contain a non-empty audio file",
        },
    });
    await waitOnExecutionContext(ctx);
    expect(
        mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
    ).toHaveLength(0);
});

test("transcription enforces the API key's allowed models", async ({
    restrictedApiKey,
}) => {
    const mocks = createFetchMock({ tinybird: createMockTinybird() });
    await mocks.enable("tinybird");
    const form = new FormData();
    form.set("model", "google/gemini-3.5-transcribe");
    form.set("file", new File(["audio"], "test.wav", { type: "audio/wav" }));
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/audio/transcriptions", {
            method: "POST",
            headers: { authorization: `Bearer ${restrictedApiKey}` },
            body: form,
        }),
        env,
        ctx,
    );
    expect(response.status).toBe(403);
    await response.arrayBuffer();
    await waitOnExecutionContext(ctx);
    expect(
        mocks.tinybird.state.events.filter((event) => event.isBilledUsage),
    ).toHaveLength(0);
});
