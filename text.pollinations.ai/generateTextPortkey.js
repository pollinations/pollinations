import dotenv from "dotenv";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import debug from "debug";
import { resolveModelConfig } from "./utils/modelResolver.js";
import { generateHeaders } from "./transforms/headerGenerator.js";
import { sanitizeMessages } from "./transforms/messageSanitizer.js";
import { checkLimits } from "./transforms/limitChecker.js";
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
    // Route the legacy public API through the authenticated Gen gateway.
    endpoint: () =>
        process.env.GEN_API_URL ||
        "https://gen.pollinations.ai/v1/chat/completions",

    // Auth header configuration
    authHeaderName: "Authorization",
    authHeaderValue: () => {
        const apiKey = process.env.GEN_API_KEY;
        return apiKey ? `Bearer ${apiKey}` : null;
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

            // 3. Sanitize messages
            result = sanitizeMessages(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
            log(
                "After sanitizeMessages:",
                !!processedOptions.modelDef,
                !!processedOptions.modelConfig,
            );

            // 4. Check limits
            result = checkLimits(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;

            // 5. Process parameters
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

    // The legacy model aliases all resolve to this inexpensive community
    // model. Gen handles provider routing, usage accounting, and billing.
    processedOptions.model = "sharktide/inferenceport.ai-gpt-oss-20b";

    return await genericOpenAIClient(
        processedMessages,
        processedOptions,
        requestConfig,
    );
}
