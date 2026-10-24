import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index.ts";

// The POST /v1/audio/speech request body is hand-written OpenAPI; every other
// speech surface is schema-driven. This pins the hand-written bounds to the
// enforced CreateSpeechRequestSchema values (duration/seconds 0.5-380) so the
// documented contract cannot drift from validation again.
describe("POST /v1/audio/speech documented bounds", () => {
    it("documents the same duration/seconds range the zod schema enforces", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/openapi.json"),
            {
                ENTER: {
                    fetch: async () =>
                        new Response(JSON.stringify({ paths: {} }), {
                            headers: { "Content-Type": "application/json" },
                        }),
                } as unknown as Fetcher,
                ENVIRONMENT: "test",
            } as unknown as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(200);

        const spec = (await response.json()) as {
            paths: Record<string, Record<string, unknown>>;
        };
        const body = (
            (
                (spec.paths["/v1/audio/speech"].post as {
                    requestBody: {
                        content: {
                            "application/json": { schema: { properties: Record<string, { minimum?: number; maximum?: number }> } };
                        };
                    };
                }).requestBody.content["application/json"].schema.properties
            )
        );
        expect(body.duration).toEqual({ type: "number", minimum: 0.5, maximum: 380 });
        expect(body.seconds).toEqual({ type: "number", minimum: 0.5, maximum: 380 });
    });
});
