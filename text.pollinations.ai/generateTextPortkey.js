import dotenv from "dotenv";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import debug from "debug";
import { resolveModelConfig } from "./utils/modelResolver.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { sanitizeMessages } from "./transforms/messageSanitizer.js";
import { createImageUrlToBase64Transform } from "./transforms/imageUrlToBase64Transform.js";
import { processParameters } from "./transforms/parameterProcessor.js";
import { findModelByName } from "./availableModels.js";

dotenv.config();

export const log = debug("pollinations:portkey");
const errorLog = debug("pollinations:portkey:error");

// Model mapping is now handled via mappedModel field in availableModels.js

// Default options
const DEFAULT_OPTIONS = {
    model: "openai-fast",
    jsonMode: false,
};

/**
 * Generates text using a local Portkey gateway with OpenAI-compatible endpoints
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options for text generation
 * @returns {Object} - OpenAI-compatible response
 */

/**
 * Configuration object for the Portkey client
 */
const clientConfig = {
    // Use Portkey API Gateway URL from .env with fallback to localhost
    endpoint: () =>
        `${process.env.PORTKEY_GATEWAY_URL || "http://localhost:8787"}/v1/chat/completions`,

    // Auth header configuration
    authHeaderName: "Authorization",
    authHeaderValue: () => {
        // Use the actual Portkey API key from environment variables
        return `Bearer ${process.env.PORTKEY_API_KEY}`;
    },

    // Additional headers will be dynamically set in transformRequest
    additionalHeaders: {},

    // Default options
    defaultOptions: DEFAULT_OPTIONS,
};

/**
 * Generates text using a local Portkey gateway with Azure OpenAI models
 */
export async function generateTextPortkey(messages, options = {}) {
    // Create a copy of options to avoid mutating the original
    let processedOptions = { ...options };

    // Apply model transform if it exists
    let processedMessages = messages;

    if (processedOptions.model) {
        const modelDef = findModelByName(processedOptions.model);
        if (modelDef?.transform) {
            try {
                const transformed = modelDef.transform(
                    messages,
                    processedOptions,
                );
                const {
                    messages: transformedMessages,
                    options: transformedOptions,
                } = transformed;
                processedMessages = transformedMessages;

                // Merge transformed options
                processedOptions = {
                    ...processedOptions,
                    ...transformedOptions,
                };
            } catch (error) {
                errorLog("Error applying transform:", error);
                throw error;
            }
        }
    }

    // Apply transformations sequentially
    if (processedOptions.model) {
        try {
            // 1. Resolve model configuration
            let result = resolveModelConfig(
                processedMessages,
                processedOptions,
            );
            processedMessages = result.messages;
            processedOptions = result.options;
            log(
                "After resolveModelConfig:",
                !!processedOptions.modelDef,
                !!processedOptions.modelConfig,
            );

            // 2. Generate headers
            result = await generateHeaders(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
            log(
                "After generateHeaders:",
                !!processedOptions.modelDef,
                !!processedOptions.modelConfig,
            );

            // 3. Convert image URLs to base64 for Vertex AI
            const imageUrlTransform = createImageUrlToBase64Transform();
            result = await imageUrlTransform(
                processedMessages,
                processedOptions,
            );
            processedMessages = result.messages;
            processedOptions = result.options;
            log(
                "After imageUrlTransform:",
                !!processedOptions.modelDef,
                !!processedOptions.modelConfig,
            );

            // 4. Sanitize messages
            result = sanitizeMessages(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
            log(
                "After sanitizeMessages:",
                !!processedOptions.modelDef,
                !!processedOptions.modelConfig,
            );

            // 5. Process parameters (limit checking removed - handled by enter.pollinations.ai)
            result = processParameters(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
        } catch (error) {
            errorLog("Error in request transformation:", error);
            throw error;
        }
    }

    // Create a fresh config with clean headers for this request
    const requestConfig = {
        ...clientConfig,
        additionalHeaders: processedOptions.additionalHeaders || {},
    };

    // Remove from options since it's now in config
    if (processedOptions.additionalHeaders) {
        delete processedOptions.additionalHeaders;
    }

    return await genericOpenAIClient(
        processedMessages,
        processedOptions,
        requestConfig,
    );
}
