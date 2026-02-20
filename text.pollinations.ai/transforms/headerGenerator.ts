import debug from "debug";
import { generatePortkeyHeaders } from "../portkeyUtils.js";

const log = debug("pollinations:transforms:headers");

/**
 * Transform that generates provider-specific headers for the request.
 */
export async function generateHeaders(
    messages: unknown[],
    options: Record<string, any>,
): Promise<{ messages: unknown[]; options: Record<string, any> }> {
    if (!options.modelConfig) {
        return { messages, options };
    }

    const additionalHeaders = await generatePortkeyHeaders(
        options.modelConfig,
        options,
    );

    log("Generated headers:", JSON.stringify(additionalHeaders, null, 2));

    return {
        messages,
        options: {
            ...options,
            additionalHeaders,
        },
    };
}
