import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    API_BASE_URL,
    arrayBufferToBase64,
    createAudioContent,
    createMCPResponse,
    createTextContent,
    fetchBinaryWithAuth,
    postChatCompletion,
} from "../utils/coreUtils.js";

async function respondAudio(params) {
    requireApiKey();

    const { prompt, voice = "alloy", format = "mp3" } = params;
    const response = await postChatCompletion({
        model: "openai-audio",
        messages: [{ role: "user", content: prompt }],
        modalities: ["text", "audio"],
        audio: { voice, format },
    });
    const result = await response.json();
    const audio = result.choices?.[0]?.message?.audio;

    if (!audio?.data) {
        throw new Error("Audio response did not include audio data");
    }

    const content = [
        createAudioContent(
            audio.data,
            `audio/${format === "mp3" ? "mpeg" : format}`,
        ),
    ];
    if (audio.transcript) {
        content.push(createTextContent(audio.transcript));
    }
    return createMCPResponse(content);
}

async function sayText(params) {
    requireApiKey();

    const { text, voice = "alloy", format = "mp3", model } = params;
    const body = { input: text, voice, response_format: format };
    if (model) body.model = model;

    const { buffer, contentType } = await fetchBinaryWithAuth(
        `${API_BASE_URL}/v1/audio/speech`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );

    return createMCPResponse([
        createAudioContent(arrayBufferToBase64(buffer), contentType),
    ]);
}

const voiceSchema = z
    .string()
    .describe("Voice name or provider voice ID. Use listModels for discovery.");

export const audioTools = [
    [
        "respondAudio",
        "Generate an audio response to a text prompt. The AI will respond to your prompt with speech.",
        {
            prompt: z
                .string()
                .describe("The text prompt to respond to with audio"),
            voice: voiceSchema
                .optional()
                .describe("Voice to use (default: alloy)"),
            format: z
                .string()
                .optional()
                .describe("Audio format (default: mp3)"),
        },
        respondAudio,
    ],

    [
        "sayText",
        "Generate speech that says the provided text verbatim. Direct text-to-speech.",
        {
            text: z.string().describe("The text to speak verbatim"),
            voice: voiceSchema
                .optional()
                .describe("Voice to use (default: alloy)"),
            format: z
                .string()
                .optional()
                .describe("Audio format (default: mp3)"),
            model: z
                .string()
                .optional()
                .describe("Audio model; omit to use the Gen default"),
        },
        sayText,
    ],
];
