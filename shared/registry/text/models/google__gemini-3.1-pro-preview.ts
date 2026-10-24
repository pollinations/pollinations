import { defineCostVariants, longContextAtLeast } from "../../cost-variants";
import {
    GEMINI_3_SEARCH_BILLING,
    withVertexCacheStorage,
} from "../../gemini-billing";
import { perMillion } from "../../price-helpers";
import type { ModelDefinition } from "../../registry";
import { CHAT_PARAMETERS } from "../../text-parameters";

export const id = "google/gemini-3.1-pro-preview";

export default {
    supportedParameters: CHAT_PARAMETERS.vertexGemini3,
    aliases: ["gemini-3.1-pro", "gemini-2.5-pro", "gemini-large"],
    provider: "google",
    publisher: "Google",
    category: "text",
    addedDate: new Date("2025-11-19").getTime(),
    priceMultiplier: 1,
    paidOnly: true,
    cost: {
        promptTextTokens: perMillion(2.0),
        promptCachedTokens: perMillion(0.2),
        promptCacheWriteTokens: perMillion(2.0),
        promptAudioTokens: perMillion(2.0),
        promptImageTokens: perMillion(2.0),
        promptVideoTokens: perMillion(2.0),
        completionTextTokens: perMillion(12.0),
    },
    // Vertex reprices the whole request from 200K prompt tokens; its single
    // input price covers text, image, audio and video.
    ...defineCostVariants(
        {
            long_context: {
                promptTextTokens: perMillion(4.0),
                promptCachedTokens: perMillion(0.4),
                promptCacheWriteTokens: perMillion(4.0),
                promptAudioTokens: perMillion(4.0),
                promptImageTokens: perMillion(4.0),
                promptVideoTokens: perMillion(4.0),
                completionTextTokens: perMillion(18.0),
            },
        },
        longContextAtLeast(200_000),
        {
            long_context: {
                label: "Long context (200K+)",
                description:
                    "At least 200,000 prompt tokens; text, cached, cache-write, image, audio, video, and output rates increase.",
            },
        },
        "<200K context",
        [
            {
                "key": "context",
                "label": "Context",
                "unit": "tokens",
                "values": {
                    "": "<200K",
                    "long_context": "≥200K",
                },
            },
        ],
    ),
    billing: withVertexCacheStorage(GEMINI_3_SEARCH_BILLING, 4.5),
    title: "Gemini 3.1 Pro Preview",
    description:
        "Top-tier multimodal reasoning over huge documents, images and video",
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    maxReferenceImages: 3600, // Gemini API image-understanding file limit.
    maxReferenceVideos: 10, // Gemini API video-understanding upload limit.
    tools: true,
    reasoning: true,
    search: true,
    contextLength: 1048576,
    isSpecialized: false,
} satisfies ModelDefinition;
