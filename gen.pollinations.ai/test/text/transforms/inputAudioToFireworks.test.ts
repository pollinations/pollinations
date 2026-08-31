import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

describe("Fireworks audio input", () => {
    it("converts OpenAI input_audio parts for full Inkling", async () => {
        const transform = findModelByName(
            "thinkingmachines/inkling",
        )?.transform;
        if (!transform) throw new Error("full Inkling transform missing");

        const { messages } = await transform(
            [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Transcribe this." },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: "UklGRgAAAABXQVZF",
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
                    url: "data:audio/wav;base64,UklGRgAAAABXQVZF",
                },
            },
            {
                type: "audio_url",
                audio_url: {
                    url: "data:audio/ogg;base64,T2dnUw==",
                },
            },
        ]);
    });

    it("wraps standard 24 kHz mono PCM16 input in a WAV container", async () => {
        const transform = findModelByName(
            "thinkingmachines/inkling",
        )?.transform;
        if (!transform) throw new Error("full Inkling transform missing");

        const { messages } = await transform(
            [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_audio",
                            input_audio: { data: "AAABAA==", format: "pcm16" },
                        },
                    ],
                },
            ],
            {},
        );

        const part = (messages[0].content as Record<string, unknown>[])[0];
        const url = (part.audio_url as { url: string }).url;
        expect(url).toMatch(/^data:audio\/wav;base64,/);
        expect(atob(url.split(",")[1]).slice(0, 12)).toBe(
            "RIFF(\u0000\u0000\u0000WAVE",
        );
    });

    it("rejects malformed audio before Fireworks can return a 500", async () => {
        const transform = findModelByName(
            "thinkingmachines/inkling",
        )?.transform;
        if (!transform) throw new Error("full Inkling transform missing");

        await expect(
            transform(
                [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_audio",
                                input_audio: {
                                    data: "bm90LWF1ZGlv",
                                    format: "wav",
                                },
                            },
                        ],
                    },
                ],
                {},
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "input_audio.data is not valid wav audio.",
        });
    });
});
