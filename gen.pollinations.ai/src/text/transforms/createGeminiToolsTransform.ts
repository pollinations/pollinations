import type { TransformFn } from "../types.ts";
import { addDefaultTools } from "./pipe.ts";

function isGoogleSearchTool(tool: unknown): boolean {
    if (typeof tool !== "object" || tool === null || !("type" in tool)) {
        return false;
    }

    if (tool.type === "google_search") return true;
    if (
        tool.type !== "function" ||
        !("function" in tool) ||
        typeof tool.function !== "object" ||
        tool.function === null ||
        !("name" in tool.function)
    ) {
        return false;
    }

    return tool.function.name === "google_search";
}

/** Converts Pollinations' public Gemini search tool to OpenRouter's native tool. */
export const adaptGoogleSearchToolForOpenRouter: TransformFn = (
    messages,
    options,
) => ({
    messages,
    options: {
        ...options,
        ...(options.tools === undefined
            ? {}
            : {
                  tools: options.tools.map((tool) =>
                      isGoogleSearchTool(tool)
                          ? {
                                type: "openrouter:web_search",
                                parameters: { engine: "native" },
                            }
                          : tool,
                  ),
              }),
    },
});

/** Gemini 2.5 rejects logit_bias when OpenRouter native search is enabled. */
export const stripLogitBiasForNativeWebSearch: TransformFn = (
    messages,
    options,
) => {
    const usesNativeWebSearch = options.tools?.some(
        (tool) =>
            typeof tool === "object" &&
            tool !== null &&
            "type" in tool &&
            tool.type === "openrouter:web_search",
    );
    if (!usesNativeWebSearch) return { messages, options };

    const supportedOptions = { ...options };
    delete supportedOptions.logit_bias;
    return { messages, options: supportedOptions };
};

/** Adds OpenRouter's provider-native Google Search tool without an Exa route. */
export function createOpenRouterNativeWebSearchTransform() {
    return addDefaultTools([
        {
            type: "openrouter:web_search",
            parameters: { engine: "native" },
        },
    ]);
}
