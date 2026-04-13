import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { test } from "../fixtures.ts";

type AudioChatCompletionResponse = {
    choices: {
        message: {
            content: unknown;
        };
    }[];
    usage: {
        prompt_tokens: number;
    };
};

async function getAuthenticatedUserId(sessionToken: string): Promise<string> {
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const session = (await sessionResponse.json()) as {
        user: { id: string };
    };
    return session.user.id;
}

describe("ElevenLabs TTS", () => {
    test(
        "GET /audio/:text returns audio",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/audio/Hello%20world?voice=alloy`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("audio/");
            expect(response.headers.get("x-tts-voice")).toBe("alloy");

            const arrayBuffer = await response.arrayBuffer();
            expect(arrayBuffer.byteLength).toBeGreaterThan(0);
        },
    );

    test(
        "GET /audio/:text denies non-permitted model for restricted API key",
        { timeout: 30000 },
        async ({ restrictedApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/audio/Hello%20world?voice=alloy",
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${restrictedApiKey}`,
                    },
                },
            );

            expect(response.status).toBe(403);
            const body = await response.json();
            expect((body as { error: { message: string } }).error.message).toBe(
                "Model 'elevenlabs' is not allowed for this API key",
            );
        },
    );

    test(
        "GET /audio/:text rejects text-chat audio models",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/audio/Hello%20world?model=openai-audio&voice=alloy",
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            expect(response.status).toBe(400);
            const body = (await response.json()) as {
                error: { message: string };
            };
            expect(body.error.message).toBe(
                'Model "openai-audio" is registered as text and cannot be used with audio routes.',
            );
            expect(mocks.tinybird.state.events).toHaveLength(0);
        },
    );

    test(
        "POST /v1/audio/speech returns audio",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/audio/speech`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${paidApiKey}`,
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

    test(
        "POST /v1/audio/speech denies non-permitted model for restricted API key",
        { timeout: 30000 },
        async ({ restrictedApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/speech",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${restrictedApiKey}`,
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                        voice: "alloy",
                    }),
                },
            );

            expect(response.status).toBe(403);
            const body = await response.json();
            expect((body as { error: { message: string } }).error.message).toBe(
                "Model 'elevenlabs' is not allowed for this API key",
            );
        },
    );

    test(
        "POST /v1/audio/speech with exhausted budget returns 402",
        { timeout: 30000 },
        async ({ exhaustedBudgetApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/speech",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${exhaustedBudgetApiKey}`,
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                        voice: "alloy",
                    }),
                },
            );

            expect(response.status).toBe(402);
            const body = await response.json();
            expect(
                (body as { error: { message: string } }).error.message,
            ).toContain("budget exhausted");
        },
    );

    test(
        "POST /v1/audio/speech rejects expensive request when balance is positive but below estimated cost",
        { timeout: 30000 },
        async ({ apiKey, mocks, sessionToken }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const db = drizzle(env.DB);
            const userId = await getAuthenticatedUserId(sessionToken);

            await db
                .update(userTable)
                .set({
                    tierBalance: 0.1,
                    packBalance: 0,
                    cryptoBalance: 0,
                })
                .where(eq(userTable.id, userId));

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/speech",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "elevenmusic",
                        input: "A short calm piano melody",
                    }),
                },
            );

            expect(response.status).toBe(402);
            const body = await response.json();
            expect(
                (body as { error: { message: string } }).error.message,
            ).toContain("Insufficient balance");
        },
    );
});

describe("ElevenLabs Music", () => {
    test(
        "GET /audio/:text with model=elevenmusic returns audio",
        { timeout: 120000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/audio/A%20short%20calm%20piano%20melody?model=elevenmusic&duration=5&instrumental=true`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("audio/");
            expect(response.headers.get("x-model-used")).toBe("elevenmusic");

            const arrayBuffer = await response.arrayBuffer();
            expect(arrayBuffer.byteLength).toBeGreaterThan(0);
        },
    );

    test(
        "POST /v1/audio/speech with model=elevenmusic returns audio",
        { timeout: 120000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/audio/speech`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${paidApiKey}`,
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
        async ({ paidApiKey, mocks }) => {
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

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
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

            // Verify usage headers default to Whisper when model is omitted
            expect(response.headers.get("x-model-used")).toBe("whisper");
        },
    );

    test(
        "POST /v1/audio/transcriptions with exhausted budget returns 402",
        { timeout: 30000 },
        async ({ exhaustedBudgetApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const formData = new FormData();
            formData.append(
                "file",
                new Blob(["test audio"], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "whisper-large-v3");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${exhaustedBudgetApiKey}`,
                    },
                    body: formData,
                },
            );

            expect(response.status).toBe(402);
            const body = await response.json();
            expect(
                (body as { error: { message: string } }).error.message,
            ).toContain("budget exhausted");
        },
    );

    test(
        "POST /v1/audio/transcriptions rejects text-chat audio models",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const formData = new FormData();
            formData.append(
                "file",
                new Blob(["test audio"], { type: "audio/wav" }),
                "test.wav",
            );
            formData.append("model", "openai-audio");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                    body: formData,
                },
            );

            expect(response.status).toBe(400);
            const body = (await response.json()) as {
                error: { message: string };
            };
            expect(body.error.message).toBe(
                'Model "openai-audio" is registered as text and cannot be used with audio routes.',
            );
            expect(mocks.tinybird.state.events).toHaveLength(0);
        },
    );
});

describe("ElevenLabs Transcription", () => {
    test(
        "POST /v1/audio/transcriptions with scribe returns text",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
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
                        authorization: `Bearer ${paidApiKey}`,
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
        async ({ paidApiKey, mocks }) => {
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
                        authorization: `Bearer ${paidApiKey}`,
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
        async ({ paidApiKey, mocks }) => {
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
                        authorization: `Bearer ${paidApiKey}`,
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
        async ({ paidApiKey, mocks }) => {
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
                        authorization: `Bearer ${paidApiKey}`,
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

describe("GET /text/:prompt (audio)", () => {
    test(
        "GET /text/:prompt with openai-audio should return raw audio",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/text/hi?model=openai-audio`,
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(response.status).toBe(200);

            // Verify content-type is audio
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("audio/");

            // Verify response is binary audio data
            const arrayBuffer = await response.arrayBuffer();
            expect(arrayBuffer.byteLength).toBeGreaterThan(0);
        },
    );

    test(
        "with modalities, should return audio output",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-audio",
                        modalities: ["text", "audio"],
                        audio: {
                            voice: "alloy",
                            format: "wav",
                        },
                        messages: [
                            {
                                role: "user",
                                content: "Say hi",
                            },
                        ],
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                choices: {
                    message: {
                        audio: {
                            transcript: string;
                            data: string;
                        };
                    };
                }[];
                usage: {
                    completion_tokens_details: {
                        audio_tokens: number;
                    };
                };
            };
            expect(data.choices).toBeDefined();
            expect(data.choices[0].message.audio).toBeDefined();
            expect(data.choices[0].message.audio.transcript).toBeDefined();
            expect(data.choices[0].message.audio.data).toBeDefined();
            expect(
                data.usage.completion_tokens_details.audio_tokens,
            ).toBeGreaterThan(0);
        },
    );

    test(
        "should transcribe input_audio",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Fetch real speech audio from OpenAI sample and convert to base64
            const audioResponse = await fetch(
                "https://cdn.openai.com/API/docs/audio/alloy.wav",
            );
            const audioBuffer = await audioResponse.arrayBuffer();
            const sampleAudioBase64 =
                Buffer.from(audioBuffer).toString("base64");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-audio",
                        modalities: ["text", "audio"],
                        audio: {
                            voice: "alloy",
                            format: "wav",
                        },
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "What's in this?",
                                    },
                                    {
                                        type: "input_audio",
                                        input_audio: {
                                            data: sampleAudioBase64,
                                            format: "wav",
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as AudioChatCompletionResponse;
            expect(data.choices).toBeDefined();
            expect(data.choices[0].message.content).toBeDefined();
            // Note: Azure OpenAI may not report audio_tokens in prompt_tokens_details
            // even when audio input is provided, so we just verify the request succeeded
            expect(data.usage.prompt_tokens).toBeGreaterThan(0);
        },
    );
});
