import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

const transform = findModelByName("thinkingmachines/inkling")?.transform;
if (!transform) throw new Error("full Inkling transform missing");

describe("Fireworks audio input", () => {
    it("converts OpenAI input_audio parts for full Inkling", async () => {
        const { messages } = await transform(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Transcribe this." },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: "bm90LWF1ZGlv",
                                format: "wav",
                            },
                        },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: "T2dnUw==",
                                format: "opus",
                            },
                        },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: "AAABAA==",
                                format: "pcm16",
                            },
                        },
                    ],
                },
            ],
            {},
        );

        expect(messages[0].content).toEqual([
            { type: "text", text: "Transcribe this." },
            {
                type: "audio_url",
                audio_url: {
                    url: "data:audio/wav;base64,bm90LWF1ZGlv",
                },
            },
            {
                type: "audio_url",
                audio_url: {
                    url: "data:audio/ogg;base64,T2dnUw==",
                },
            },
            {
                type: "audio_url",
                audio_url: {
                    url: "data:audio/pcm16;base64,AAABAA==",
                },
            },
        ]);
    });
});
