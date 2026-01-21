import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

describe("GET /text/:prompt (audio)", () => {
    test(
        "GET /text/:prompt with openai-audio should return raw audio",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/text/hi?model=openai-audio`,
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
                `http://localhost:3000/api/v1/chat/completions`,
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
                `http://localhost:3000/api/v1/chat/completions`,
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
