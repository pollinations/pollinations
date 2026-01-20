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

const DEFAULT_OPTIONS = {
    model: "openai-fast",
    jsonMode: false,
};

const clientConfig = {
    endpoint: () =>
        `${process.env.PORTKEY_GATEWAY_URL || "http://localhost:8787"}/v1/chat/completions`,
    authHeaderName: "Authorization",
    authHeaderValue: () => `Bearer ${process.env.PORTKEY_API_KEY}`,
    additionalHeaders: {},
    defaultOptions: DEFAULT_OPTIONS,
};

export async function generateTextPortkey(messages: any[], options: any = {}): Promise<any> {
    let processedOptions: any = { ...options };
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

    if (processedOptions.model) {
        try {
            let result = resolveModelConfig(
                processedMessages,
                processedOptions,
            );
            processedMessages = result.messages;
            processedOptions = result.options;
            log("After resolveModelConfig:", !!processedOptions.modelDef, !!processedOptions.modelConfig);

            result = await generateHeaders(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
            log("After generateHeaders:", !!processedOptions.modelDef, !!processedOptions.modelConfig);

            const imageUrlTransform = createImageUrlToBase64Transform();
            result = await imageUrlTransform(
                processedMessages,
                processedOptions,
            );
            processedMessages = result.messages;
            processedOptions = result.options;
            log("After imageUrlTransform:", !!processedOptions.modelDef, !!processedOptions.modelConfig);

            result = sanitizeMessages(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
            log("After sanitizeMessages:", !!processedOptions.modelDef, !!processedOptions.modelConfig);

            result = processParameters(processedMessages, processedOptions);
            processedMessages = result.messages;
            processedOptions = result.options;
        } catch (error) {
            errorLog("Error in request transformation:", error);
            throw error;
        }
    }

    const requestConfig = {
        ...clientConfig,
        additionalHeaders: processedOptions.additionalHeaders || {},
    };

    delete processedOptions.additionalHeaders;

    return genericOpenAIClient(processedMessages, processedOptions, requestConfig);
}
