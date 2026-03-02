import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("ElevenLabs TTS", () => {
    test(
        "POST /v1/audio/speech returns audio",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/audio/speech`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                        voice: "alloy",
                    }),
                },
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("audio/");
            expect(response.headers.get("x-tts-voice")).toBe("alloy");

            const arrayBuffer = await response.arrayBuffer();
            expect(arrayBuffer.byteLength).toBeGreaterThan(0);
        },
    );
});

describe("ElevenLabs Music", () => {
    test(
        "POST /v1/audio/speech with model=elevenmusic returns audio",
        { timeout: 120000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/audio/speech`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "elevenmusic",
                        input: "A short calm piano melody",
                        voice: "alloy",
                    }),
                },
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("audio/");
            expect(response.headers.get("x-model-used")).toBe("elevenmusic");

            const arrayBuffer = await response.arrayBuffer();
            expect(arrayBuffer.byteLength).toBeGreaterThan(0);
        },
    );
});

describe("Whisper Transcription", () => {
    test(
        "POST /v1/audio/transcriptions returns text",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Fetch a short sample wav to transcribe
            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();

            // Build multipart form data
            const formData = new FormData();
            formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "whisper-large-v3");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as { text: string };
            expect(data.text).toBeDefined();
            expect(data.text.length).toBeGreaterThan(0);

            // Verify usage headers
            expect(response.headers.get("x-model-used")).toBe("whisper");
        },
    );
});

describe("ElevenLabs Transcription", () => {
    test(
        "POST /v1/audio/transcriptions with scribe returns text",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Fetch a short sample wav to transcribe
            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();

            // Build multipart form data
            const formData = new FormData();
            formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "scribe");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as { text: string };
            expect(data.text).toBeDefined();
            expect(data.text.length).toBeGreaterThan(0);

            // Verify usage headers
            expect(response.headers.get("x-model-used")).toBe("scribe");
        },
    );

    test(
        "POST /v1/audio/transcriptions with response_format=text returns plain text",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();

            const formData = new FormData();
            formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "scribe");
            formData.append("response_format", "text");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            const text = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${text}`,
            ).toBe(200);

            expect(response.headers.get("content-type")).toBe(
                "text/plain; charset=utf-8",
            );
            expect(text.length).toBeGreaterThan(0);
        },
    );

    test(
        "POST /v1/audio/transcriptions with response_format=verbose_json returns words",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();

            const formData = new FormData();
            formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "scribe");
            formData.append("response_format", "verbose_json");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as {
                text: string;
                language?: string;
                duration?: number;
                words?: { word: string; start: number; end: number }[];
            };
            expect(data.text).toBeDefined();
            expect(data.text.length).toBeGreaterThan(0);
            expect(data.duration).toBeDefined();
            expect(data.words).toBeDefined();
            expect(Array.isArray(data.words)).toBe(true);
            if (data.words && data.words.length > 0) {
                expect(data.words[0].word).toBeDefined();
                expect(data.words[0].start).toBeGreaterThanOrEqual(0);
                expect(data.words[0].end).toBeGreaterThan(0);
            }
        },
    );

    test(
        "POST /v1/audio/transcriptions with unsupported format returns error",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();

            const formData = new FormData();
            formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "scribe");
            formData.append("response_format", "srt");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: formData,
                },
            );
            const body = await response.text();
            expect(response.status).toBe(400);
            expect(body).toContain("Unsupported response_format");
            expect(body).toContain("srt");
        },
    );
});
