import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import type { HttpError } from "../../src/image/httpError.ts";
import { generateImageWithVertexAI } from "../../src/image/vertexAIClient.ts";
import googleCloudAuth from "../../src/text/auth/googleCloudAuth.ts";

syncImageEnv({ GOOGLE_PROJECT_ID: "test-project" } as CloudflareBindings, [
    "GOOGLE_PROJECT_ID",
]);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Vertex AI client errors", () => {
    it("preserves upstream metadata for observability", async () => {
        vi.spyOn(googleCloudAuth, "getAccessToken").mockResolvedValue(
            "test-access-token",
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response('{"error":{"message":"provider unavailable"}}', {
                status: 502,
                statusText: "Bad Gateway",
            }),
        );

        await expect(
            generateImageWithVertexAI({
                prompt: "test",
                model: "gemini-2.5-flash-image",
            }),
        ).rejects.toMatchObject({
            name: "HttpError",
            status: 502,
            details: {
                body: '{"error":{"message":"provider unavailable"}}',
            },
            upstreamUrl:
                "https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-2.5-flash-image:generateContent",
        } satisfies Partial<HttpError>);
    });
});
