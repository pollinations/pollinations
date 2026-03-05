import { SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

describe("Audio model listing", () => {
    test("GET /audio/models returns 200 without auth", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/audio/models",
            { method: "GET" },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as unknown[];
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });
});

describe("GET /audio/:text (unauthenticated)", () => {
    test("should require authentication", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/audio/hello%20world",
            { method: "GET" },
        );
        expect(response.status).toBe(401);
        await response.text();
    });
});

describe("POST /v1/audio/speech (unauthenticated)", () => {
    test("should require authentication", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/audio/speech",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "tts-1",
                    input: "Hello world",
                    voice: "alloy",
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });
});

describe("POST /v1/audio/transcriptions (unauthenticated)", () => {
    test("should require authentication", async () => {
        const formData = new FormData();
        formData.append(
            "file",
            new Blob(["fake audio data"], { type: "audio/mpeg" }),
            "test.mp3",
        );
        formData.append("model", "whisper-large-v3");

        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/audio/transcriptions",
            {
                method: "POST",
                body: formData,
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });
});

describe("GET /audio/:text (authenticated)", () => {
    test("with auth, route resolves to audio handler (not forwarded to enter)", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/audio/hello%20world",
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer sk_test_paid",
                },
            },
        );
        // Will fail because ELEVENLABS_API_KEY is not set in test env,
        // but should NOT be 404 (route exists) and NOT be 401 (auth passed)
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(404);
        await response.text();
    });

    test("suno model routes correctly", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/audio/a%20cool%20beat?model=suno",
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer sk_test_paid",
                },
            },
        );
        // Should not be 401 or 404 — route exists and auth passes
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(404);
        await response.text();
    });

    test("elevenmusic model routes correctly", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/audio/a%20jazzy%20tune?model=elevenmusic&duration=30&instrumental=true",
            {
                method: "GET",
                headers: {
                    Authorization: "Bearer sk_test_paid",
                },
            },
        );
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(404);
        await response.text();
    });
});

describe("POST /v1/audio/speech (authenticated)", () => {
    test("with auth, route resolves to speech handler", async () => {
        const response = await SELF.fetch(
            "http://localhost/api/generate/v1/audio/speech",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    Authorization: "Bearer sk_test_paid",
                },
                body: JSON.stringify({
                    model: "tts-1",
                    input: "Hello world",
                    voice: "alloy",
                }),
            },
        );
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(404);
        await response.text();
    });
});

describe("Convenience URL rewrites", () => {
    test("/audio/:text rewrites to /api/generate/audio/:text", async () => {
        const response = await SELF.fetch("http://localhost/audio/test", {
            method: "GET",
        });
        // Should hit the audio route (401 without auth, not 404)
        expect(response.status).toBe(401);
        await response.text();
    });

    test("/v1/audio/speech rewrites to /api/generate/v1/audio/speech", async () => {
        const response = await SELF.fetch(
            "http://localhost/v1/audio/speech",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: "tts-1",
                    input: "Test",
                    voice: "alloy",
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });
});
