import debug from "debug";
import { generatePortkeyHeaders } from "../portkeyUtils.js";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:headers");

async function generateDirectHeaders(
    config: Record<string, unknown>,
): Promise<Record<string, string>> {
    const authKey = config.authKey;
    if (!authKey) return {};

    const token =
        typeof authKey === "function"
            ? await (authKey as () => string | Promise<string>)()
            : String(authKey);
    return { Authorization: `Bearer ${token}` };
}

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

    const additionalHeaders =
        typeof options.modelConfig.directEndpoint === "string"
            ? await generateDirectHeaders(options.modelConfig)
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
