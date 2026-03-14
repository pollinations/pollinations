/**
 * E2E tests for OpenAI-compatible image endpoints using the official OpenAI SDK.
 *
 * These tests run outside the Cloudflare Workers pool — they hit a real
 * server via HTTP, exactly like a real user would.
 *
 * Usage:
 *   npm run test:e2e
 *
 *   # Custom endpoint:
 *   POLLINATIONS_BASE_URL=http://localhost:3000/api/generate/v1 npm run test:e2e
 *
 * Env vars:
 *   POLLINATIONS_BASE_URL  - OpenAI-compatible base URL (must end with /v1).
 *                            Defaults to https://gen.pollinations.ai/v1
 *   POLLINATIONS_API_KEY   - defaults to ENTER_API_TOKEN_REMOTE from .testingtokens
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { describe, expect, test } from "vitest";

function getApiKey(): string {
    if (process.env.POLLINATIONS_API_KEY)
        return process.env.POLLINATIONS_API_KEY;
    try {
        const tokens = readFileSync(
            resolve(__dirname, "../../.testingtokens"),
            "utf-8",
        );
        const match = tokens.match(/ENTER_API_TOKEN_REMOTE=(.+)/);
        if (match) return match[1].trim();
    } catch {}
    throw new Error("Set POLLINATIONS_API_KEY or ensure .testingtokens exists");
}

const baseURL =
    process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai/v1";
const apiKey = getApiKey();

const client = new OpenAI({ baseURL, apiKey });

describe("OpenAI SDK — /v1/images/generations", () => {
    test(
        "generates an image and returns b64_json",
        { timeout: 60_000 },
        async () => {
            const response = await client.images.generate({
                model: "flux",
                prompt: "a red circle on white background",
                size: "256x256",
                response_format: "b64_json",
            });

            expect(response.data).toHaveLength(1);
            expect(response.data[0].b64_json).toBeDefined();
            expect(response.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );

    test(
        "returns URL when response_format is url",
        { timeout: 60_000 },
        async () => {
            const response = await client.images.generate({
                model: "flux",
                prompt: "a blue square",
                size: "256x256",
                response_format: "url",
            });

            expect(response.data).toHaveLength(1);
            expect(response.data[0].url).toBeDefined();
            expect(response.data[0].url).toContain(
                "gen.pollinations.ai/image/",
            );
        },
    );

    test(
        "defaults to b64_json when response_format omitted",
        { timeout: 60_000 },
        async () => {
            const response = await client.images.generate({
                model: "flux",
                prompt: "a green triangle",
                size: "256x256",
            });

            expect(response.data).toHaveLength(1);
            expect(response.data[0].b64_json).toBeDefined();
        },
    );
});

describe("OpenAI SDK — /v1/images/edits", () => {
    test(
        "edits an image via JSON body with URL",
        { timeout: 120_000 },
        async () => {
            const response = await fetch(`${baseURL}/images/edits`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "flux",
                    prompt: "make it blue",
                    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
                    size: "256x256",
                    seed: 42,
                }),
            });
            expect(response.status).toBe(200);

            const body = (await response.json()) as {
                created: number;
                data: { b64_json?: string }[];
            };
            expect(body.data).toHaveLength(1);
            expect(body.data[0].b64_json).toBeDefined();
            expect(body.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );

    test(
        "edits an image via multipart file upload (OpenAI SDK)",
        { timeout: 120_000 },
        async () => {
            // Use a small image to stay within URL query param limits.
            // The backend receives the image as a data URI in the URL, so very large
            // files (>8KB) will hit HTTP header size limits (431).
            const imageFile = new File(
                [
                    Uint8Array.from(
                        atob(
                            "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8/5+hnoEIwDiqEF8oAABkvQMRzBWtLwAAAABJRU5ErkJggg==",
                        ),
                        (c) => c.charCodeAt(0),
                    ),
                ],
                "test.png",
                { type: "image/png" },
            );

            const response = await client.images.edit({
                model: "flux",
                image: imageFile,
                prompt: "make it blue",
            });

            expect(response.data).toHaveLength(1);
            expect(response.data[0].b64_json).toBeDefined();
            expect(response.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );
});

describe("OpenAI SDK — /v1/models", () => {
    test(
        "lists models including image and text models",
        { timeout: 10_000 },
        async () => {
            const response = await fetch(`${baseURL}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            expect(response.status).toBe(200);

            const body = (await response.json()) as {
                object: string;
                data: { id: string; supported_endpoints?: string[] }[];
            };
            expect(body.object).toBe("list");
            expect(body.data.length).toBeGreaterThan(0);

            // Should include a known image model
            const fluxModel = body.data.find((m) => m.id === "flux");
            expect(fluxModel).toBeDefined();
            expect(fluxModel?.supported_endpoints).toContain(
                "/v1/images/generations",
            );

            // Should include a known text model
            const textModel = body.data.find((m) => m.id === "openai");
            expect(textModel).toBeDefined();
            expect(textModel?.supported_endpoints).toContain(
                "/v1/chat/completions",
            );
        },
    );
});
