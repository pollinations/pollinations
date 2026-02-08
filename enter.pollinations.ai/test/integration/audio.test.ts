import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("ElevenLabs TTS", () => {
    test(
        "GET /audio/:text returns audio",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/audio/Hello%20world?voice=alloy`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${apiKey}`,
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

            const data = (await response.json()) as any;
            expect(data.choices).toBeDefined();
            expect(data.choices[0].message.content).toBeDefined();
            // Note: Azure OpenAI may not report audio_tokens in prompt_tokens_details
            // even when audio input is provided, so we just verify the request succeeded
            expect(data.usage.prompt_tokens).toBeGreaterThan(0);
        },
    );
});
