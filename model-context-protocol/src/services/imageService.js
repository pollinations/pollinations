/**
 * Pollinations Image Service
 *
 * Functions and schemas for interacting with the Pollinations Image API
 */

import {
    createMCPResponse,
    createTextContent,
    createImageContent,
    buildUrl,
} from "../utils/coreUtils.js";
import { z } from "zod";

// Constants
const IMAGE_API_BASE_URL = "https://image.pollinations.ai";

/**
 * Internal function to generate an image URL without MCP formatting
 *
 * @param {string} prompt - The text description of the image to generate
 * @param {Object} options - Additional options for image generation
 * @returns {Object} - Object containing the image URL and metadata
 */
async function _generateImageUrlInternal(prompt, options = {}) {
    const { model, seed, width = 1024, height = 1024 } = options;

    // Construct the URL with query parameters
    const encodedPrompt = encodeURIComponent(prompt);
    const path = `prompt/${encodedPrompt}`;
    const queryParams = { model, seed, width, height };

    const url = buildUrl(IMAGE_API_BASE_URL, path, queryParams);

    // Return the URL with metadata
    return {
        imageUrl: url,
        prompt,
        width,
        height,
        model,
        seed,
    };
}

/**
 * Generates an image URL from a text prompt using the Pollinations Image API
 *
 * @param {Object} params - The parameters for image URL generation
 * @param {string} params.prompt - The text description of the image to generate
 * @param {Object} [params.options={}] - Additional options for image generation
 * @param {string} [params.options.model] - Model name to use for generation
 * @param {number} [params.options.seed] - Seed for reproducible results
 * @param {number} [params.options.width=1024] - Width of the generated image
 * @param {number} [params.options.height=1024] - Height of the generated image
 * @returns {Object} - MCP response object with the image URL
 */
async function generateImageUrl(params) {
    const { prompt, options = {} } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    // Generate the image URL and metadata
    const result = await _generateImageUrlInternal(prompt, options);

    // Return the response in MCP format
    return createMCPResponse([createTextContent(result, true)]);
}

/**
 * Generates an image from a text prompt and returns the image data as base64
 *
 * @param {Object} params - The parameters for image generation
 * @param {string} params.prompt - The text description of the image to generate
 * @param {Object} [params.options={}] - Additional options for image generation
 * @param {string} [params.options.model] - Model name to use for generation
 * @param {number} [params.options.seed] - Seed for reproducible results
 * @param {number} [params.options.width=1024] - Width of the generated image
 * @param {number} [params.options.height=1024] - Height of the generated image
 * @returns {Promise<Object>} - MCP response object with the image data
 */
async function generateImage(params) {
    const { prompt, options = {} } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    // First, generate the image URL (but don't use the MCP response format)
    const urlResult = await _generateImageUrlInternal(prompt, options);

    try {
        // Fetch the image from the URL
        const response = await fetch(urlResult.imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to generate image: ${response.statusText}`);
        }

        // Get the image data as an ArrayBuffer
        const imageBuffer = await response.arrayBuffer();

        // Convert the ArrayBuffer to a base64 string
        const base64Data = Buffer.from(imageBuffer).toString("base64");

        // Determine the mime type from the response headers or default to image/jpeg
        const contentType =
            response.headers.get("content-type") || "image/jpeg";

        const metadata = {
            prompt: urlResult.prompt,
            width: urlResult.width,
            height: urlResult.height,
            model: urlResult.model,
            seed: urlResult.seed,
        };

        // Return the response in MCP format
        return createMCPResponse([
            createImageContent(base64Data, contentType),
            createTextContent(
                `Generated image from prompt: "${prompt}"\n\nImage metadata: ${JSON.stringify(metadata, null, 2)}`,
            ),
        ]);
    } catch (error) {
        console.error("Error generating image:", error);
        throw error;
    }
}

/**
 * List available image generation models from Pollinations API
 *
 * @param {Object} params - The parameters for listing image models
 * @returns {Promise<Object>} - MCP response object with the list of available image models
 */
async function listImageModels(params) {
    try {
        const url = buildUrl(IMAGE_API_BASE_URL, "models");
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.statusText}`);
        }

        const models = await response.json();

        // Return the response in MCP format
        return createMCPResponse([createTextContent(models, true)]);
    } catch (error) {
        console.error("Error listing image models:", error);
        throw error;
    }
}

/**
 * Export tools as complete arrays ready to be passed to server.tool()
 */
export const imageTools = [
    [
        "generateImageUrl",
        "Generate an image URL from a text prompt",
        {
            prompt: z
                .string()
                .describe("The text description of the image to generate"),
            options: z
                .object({
                    model: z
                        .string()
                        .optional()
                        .describe("Model name to use for generation"),
                    seed: z
                        .number()
                        .optional()
                        .describe("Seed for reproducible results"),
                    width: z
                        .number()
                        .optional()
                        .describe("Width of the generated image"),
                    height: z
                        .number()
                        .optional()
                        .describe("Height of the generated image"),
                })
                .optional()
                .describe("Additional options for image generation"),
        },
        generateImageUrl,
    ],

    [
        "generateImage",
        "Generate an image and return the base64-encoded data",
        {
            prompt: z
                .string()
                .describe("The text description of the image to generate"),
            options: z
                .object({
                    model: z
                        .string()
                        .optional()
                        .describe("Model name to use for generation"),
                    seed: z
                        .number()
                        .optional()
                        .describe("Seed for reproducible results"),
                    width: z
                        .number()
                        .optional()
                        .describe("Width of the generated image"),
                    height: z
                        .number()
                        .optional()
                        .describe("Height of the generated image"),
                })
                .optional()
                .describe("Additional options for image generation"),
        },
        generateImage,
    ],

    ["listImageModels", "List available image models", {}, listImageModels],
];
