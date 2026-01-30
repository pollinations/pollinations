import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Image Fetch Error Handling", () => {
    test(
        "returns 400 for invalid image URLs in vision requests",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test with a non-existent image URL (404)
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "What's in this image?",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: "https://example.com/non-existent-image.jpg",
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
            );

            // Should return 404 (preserving original status) not 500 (server error)
            expect(response.status).toBe(404);

            const error = await response.json();
            expect(error.error).toBeDefined();
            expect(error.error.message).toContain("Failed to fetch image");
            expect(error.error.message).toContain("404");
            expect(error.error.message).toContain("not found");
        },
    );

    test(
        "returns 400 for connection/timeout errors",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test with an invalid domain that will cause connection error
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "claude",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Describe this image",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: "https://invalid-domain-that-does-not-exist-12345.com/image.jpg",
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
            );

            // Connection errors should be 400 (client provided bad URL)
            expect(response.status).toBe(400);

            const error = await response.json();
            expect(error.error).toBeDefined();
            // Check for domain not found error message
            expect(error.error.message).toMatch(/Invalid image URL|domain could not be found/);
        },
    );

    test(
        "returns 400 for non-image content types",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test with a URL that returns HTML instead of an image
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "What's in this image?",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: "https://example.com/",
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
            );

            expect(response.status).toBe(400);

            const error = await response.json();
            expect(error.error).toBeDefined();
            expect(error.error.message).toContain("Invalid content type");
            expect(error.error.message).toContain("expected image/*");
        },
    );

    test(
        "returns 403 for authentication-required images with helpful message",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test with a URL that returns 403 Forbidden
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "claude",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Analyze this image",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            // Using a test endpoint that returns 403
                                            url: "https://httpbin.org/status/403",
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
            );

            // Should preserve the 403 status
            expect(response.status).toBe(403);

            const error = await response.json();
            expect(error.error).toBeDefined();
            // Should have helpful message about authentication
            expect(error.error.message.toLowerCase()).toMatch(/authentication|forbidden|publicly accessible/);
        },
    );

    test(
        "successfully processes valid image URLs",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test with a valid image URL (using a small test image)
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gemini-fast",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Say 'test successful' if you can process this image",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            // Small 1x1 pixel PNG
                                            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 10,
                    }),
                },
            );

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.choices).toBeDefined();
            expect(result.choices[0].message.content.toLowerCase()).toContain("test successful");
        },
    );
});