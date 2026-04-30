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

    const additionalHeaders = await generatePortkeyHeaders(
        options.modelConfig,
        options,
    );

    log("Generated header keys:", Object.keys(additionalHeaders));

    return {
        messages,
        options: {
            ...options,
            additionalHeaders,
        },
    };
}
