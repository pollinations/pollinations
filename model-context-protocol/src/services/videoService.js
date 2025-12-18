/**
 * Pollinations Video Service
 *
 * Functions and schemas for interacting with the Pollinations Video API
 */

import {
    createMCPResponse,
    createTextContent,
    createVideoContent,
    buildUrl,
} from "../utils/coreUtils.js";
import { z } from "zod";

// Constants
const VIDEO_API_BASE_URL = "https://image.pollinations.ai";

/**
 * Internal function to generate a video URL without MCP formatting
 *
 * @param {string} prompt - The text description of the video to generate
 * @param {Object} options - Additional options for video generation
 * @returns {Object} - Object containing the video URL and metadata
 */
async function _generateVideoUrlInternal(prompt, options = {}) {
    const { model = "veo", seed, width = 1280, height = 720, duration = 5 } = options;

    // Construct the URL with query parameters
    const encodedPrompt = encodeURIComponent(prompt);
    const path = `prompt/${encodedPrompt}`;
    const queryParams = { model, seed, width, height, duration };

    const url = buildUrl(VIDEO_API_BASE_URL, path, queryParams);

    // Return the URL with metadata
    return {
        videoUrl: url,
        prompt,
        width,
        height,
        duration,
        model,
        seed,
    };
}

/**
 * Generates a video URL from a text prompt using the Pollinations Video API
 *
 * @param {Object} params - The parameters for video URL generation
 * @param {string} params.prompt - The text description of the video to generate
 * @param {string} [params.model="veo"] - Model to use for video generation (veo, seedance)
 * @param {number} [params.seed] - Seed for reproducible results
 * @param {number} [params.width=1280] - Width of the video in pixels
 * @param {number} [params.height=720] - Height of the video in pixels  
 * @param {number} [params.duration=5] - Duration of the video in seconds
 * @returns {Promise<Object>} - MCP response object with the generated video URL
 */
async function generateVideoUrl(params) {
    const { prompt, model = "veo", seed, width = 1280, height = 720, duration = 5 } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    if (prompt.length > 1000) {
        throw new Error("Prompt must be 1000 characters or less");
    }

    try {
        const result = await _generateVideoUrlInternal(prompt, {
            model,
            seed,
            width,
            height,
            duration,
        });

        return createMCPResponse([
            createTextContent(
                `Generated ${model} video: "${prompt}"\n\nVideo URL: ${result.videoUrl}\nDimensions: ${width}x${height}\nDuration: ${duration}s\n${seed ? `Seed: ${seed}` : ""}`,
            ),
            createVideoContent(result.videoUrl, result),
        ]);
    } catch (error) {
        throw new Error(`Failed to generate video: ${error.message}`);
    }
}

/**
 * Generates a video URL using the Veo model
 *
 * @param {Object} params - The parameters for video generation
 * @param {string} params.prompt - The text description of the video to generate
 * @param {number} [params.seed] - Seed for reproducible results
 * @param {number} [params.width=1280] - Width of the video in pixels
 * @param {number} [params.height=720] - Height of the video in pixels
 * @param {number} [params.duration=5] - Duration of the video in seconds
 * @returns {Promise<Object>} - MCP response object with the generated video URL
 */
async function generateVeoVideo(params) {
    return generateVideoUrl({ ...params, model: "veo" });
}

/**
 * Generates a video URL using the Seedance model
 *
 * @param {Object} params - The parameters for video generation
 * @param {string} params.prompt - The text description of the video to generate
 * @param {number} [params.seed] - Seed for reproducible results
 * @param {number} [params.width=1280] - Width of the video in pixels
 * @param {number} [params.height=720] - Height of the video in pixels
 * @param {number} [params.duration=5] - Duration of the video in seconds
 * @returns {Promise<Object>} - MCP response object with the generated video URL
 */
async function generateSeedanceVideo(params) {
    return generateVideoUrl({ ...params, model: "seedance" });
}

/**
 * Lists available video models and their capabilities
 *
 * @returns {Promise<Object>} - MCP response object with available video models
 */
async function listVideoModels() {
    const models = [
        {
            name: "veo",
            description: "Google's advanced video generation model with cinematic quality",
            features: ["Text-to-video", "High fidelity", "Cinematic motion", "1080p support"],
            maxDuration: 8,
            defaultSettings: { width: 1280, height: 720, duration: 5 }
        },
        {
            name: "seedance", 
            description: "ByteDance's video generation model with Pro-Fast optimization",
            features: ["Text-to-video", "Pro-Fast processing", "Cinematic quality", "Efficient generation"],
            maxDuration: 10,
            defaultSettings: { width: 1280, height: 720, duration: 5 }
        }
    ];

    return createMCPResponse([
        createTextContent(
            `Available Video Models:\n\n${models.map(model => 
                `• ${model.name.toUpperCase()}: ${model.description}\n  Features: ${model.features.join(", ")}\n  Max Duration: ${model.maxDuration}s\n  Default: ${model.defaultSettings.width}x${model.defaultSettings.height} @ ${model.defaultSettings.duration}s`
            ).join("\n\n")}`,
        ),
    ]);
}

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const videoTools = [
    [
        "generateVideoUrl",
        "Generate a video URL from a text prompt using Pollinations Video API",
        {
            prompt: z
                .string()
                .describe("The text description of the video to generate"),
            model: z
                .enum(["veo", "seedance"])
                .optional()
                .describe("Model to use for video generation (default: veo)"),
            seed: z
                .number()
                .optional()
                .describe("Seed for reproducible results"),
            width: z
                .number()
                .optional()
                .describe("Width of the video in pixels (default: 1280)"),
            height: z
                .number()
                .optional()
                .describe("Height of the video in pixels (default: 720)"),
            duration: z
                .number()
                .optional()
                .describe("Duration of the video in seconds (default: 5, max: 10)"),
        },
        generateVideoUrl,
    ],
    [
        "generateVeoVideo", 
        "Generate a video using Google's Veo model (high-quality cinematic video)",
        {
            prompt: z
                .string()
                .describe("The text description of the video to generate"),
            seed: z
                .number()
                .optional()
                .describe("Seed for reproducible results"),
            width: z
                .number()
                .optional()
                .describe("Width of the video in pixels (default: 1280)"),
            height: z
                .number()
                .optional()
                .describe("Height of the video in pixels (default: 720)"),
            duration: z
                .number()
                .optional()
                .describe("Duration of the video in seconds (default: 5, max: 8)"),
        },
        generateVeoVideo,
    ],
    [
        "generateSeedanceVideo",
        "Generate a video using ByteDance's Seedance model (Pro-Fast optimized)",
        {
            prompt: z
                .string()
                .describe("The text description of the video to generate"),
            seed: z
                .number()
                .optional()
                .describe("Seed for reproducible results"),
            width: z
                .number()
                .optional()
                .describe("Width of the video in pixels (default: 1280)"),
            height: z
                .number()
                .optional()
                .describe("Height of the video in pixels (default: 720)"),
            duration: z
                .number()
                .optional()
                .describe("Duration of the video in seconds (default: 5, max: 10)"),
        },
        generateSeedanceVideo,
    ],
    [
        "listVideoModels",
        "List available video models and their capabilities",
        {},
        listVideoModels,
    ],
];