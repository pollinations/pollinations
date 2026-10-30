import debug from "debug";
import { generatePortkeyHeaders } from "../portkeyUtils.js";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:headers");

/**
 * Transform that generates provider-specific headers for the request.
 */
export async function generateHeaders(
    messages: ChatMessage[],
    options: TransformOptions,
): Promise<TransformResult> {
    if (!options.modelConfig) {
        return { messages, options };
    }

    // Bedrock signs the final body at fetch time. Other direct providers use
    // their auth header; Portkey needs the translated x-portkey-* config.
    const additionalHeaders =
        typeof options.modelConfig.directEndpoint === "string"
            ? options.modelConfig.provider === "bedrock"
                ? {}
                : options.modelConfig.directAuthHeader === "api-key"
                  ? { "api-key": String(options.modelConfig.authKey) }
                  : { Authorization: `Bearer ${options.modelConfig.authKey}` }
            : await generatePortkeyHeaders(options.modelConfig, options);

    log("Generated header keys:", Object.keys(additionalHeaders));

    return {
        messages,
        options: {
            ...options,
            additionalHeaders,
        },
    };
}
