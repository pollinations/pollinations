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
import { afterEach, expect } from "vitest";
import worker from "../../src/index.ts";

afterEach(teardownFetchMock);

const SOURCE =
    "https://media.pollinations.ai/c8536c26a4fdc6d93bfba5f6c5a6cd1188856faa1d327962c7dd48e1e2895724";

// A file in a scalar form field is a caller error, never a 500 from string
// methods on the File.
test.for([
    {
        name: "prompt",
        fields: { prompt: "file" },
        expected: "prompt",
    },
    {
        name: "safe",
        fields: { safe: "file" },
        expected: "safe",
    },
])(
    "rejects a file in the $name field of a multipart edit",
    async ({ fields, expected }, { apiKey }) => {
        const mocks = createFetchMock({ tinybird: createMockTinybird() });
        await mocks.enable("tinybird");
        const form = new FormData();
        form.set("prompt", "make it blue");
        form.set("image", SOURCE);
        for (const [key, value] of Object.entries(fields))
            form.set(
                key,
                new Blob([value], { type: "text/plain" }),
                `${key}.txt`,
            );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/images/edits", {
                method: "POST",
                headers: { authorization: `Bearer ${apiKey}` },
                body: form,
            }),
            env,
            ctx,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { message: expect.stringContaining(expected) },
        });
        await waitOnExecutionContext(ctx);
    },
);
