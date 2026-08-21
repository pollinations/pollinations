import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchAndUploadMedia,
} from "../utils/coreUtils.js";

async function generateAudio(params, context) {
    requireApiKey(context);

    const { text, ...options } = params;
    const { contentType, mediaUrl } = await fetchAndUploadMedia(
        buildUrl(`/audio/${encodeURIComponent(text)}`, options),
        {},
        context,
    );
    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "Generated audio",
            mimeType: contentType,
        },
        createTextContent(
            { url: mediaUrl, text, ...options, mimeType: contentType },
            true,
        ),
    ]);
}

export const audioTools = [
    [
        "generateAudio",
        "Generate speech, music, or sound and return an unlisted media.pollinations.ai resource link.",
        {
            text: z
                .string()
                .min(1)
                .describe("Text to speak or a music/sound description"),
            voice: z
                .string()
                .optional()
                .describe(
                    "Voice for speech generation. Use listModels with type=audio for voice metadata",
                ),
            response_format: z
                .enum(["mp3", "opus", "aac", "flac", "wav", "pcm"])
                .optional()
                .describe("Audio output format (default: mp3)"),
            model: z
                .string()
                .optional()
                .describe("Audio model. Use listModels with type=audio"),
            duration: z
                .number()
                .optional()
                .describe("Duration in seconds where supported"),
            seconds: z
                .number()
                .min(1)
                .max(380)
                .optional()
                .describe("Duration for stable-audio models"),
            steps: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .describe("Sampling steps for stable-audio models"),
            negative_prompt: z
                .string()
                .optional()
                .describe("Negative prompt for stable-audio models"),
            instrumental: z
                .boolean()
                .optional()
                .describe("Generate instrumental music where supported"),
            instruct: z
                .string()
                .optional()
                .describe("Emotion or style instruction where supported"),
            loop: z
                .boolean()
                .optional()
                .describe("Loop the generated sound effect where supported"),
            prompt_influence: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Prompt influence for sound effects"),
            seed: z.number().int().optional().describe("Random seed"),
            safe: z
                .union([z.string(), z.boolean()])
                .optional()
                .describe("Pollinations safety options"),
        },
        generateAudio,
    ],
];
