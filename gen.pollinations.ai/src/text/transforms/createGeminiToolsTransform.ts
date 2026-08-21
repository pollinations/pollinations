import type { TransformFn } from "../types.ts";
import { addDefaultTools } from "./pipe.ts";

export type GeminiToolName = "code_execution" | "google_search";

function toOpenAIFunctionFormat(name: GeminiToolName) {
    return {
        type: "function" as const,
        function: { name },
    };
}

/** Adds Gemini-native tools in the format expected by the Vertex adapter. */
export function createGeminiToolsTransform(toolNames: GeminiToolName[]) {
    return addDefaultTools(toolNames.map(toOpenAIFunctionFormat));
}

/** Converts the public Google Search tool shape for the Vertex adapter. */
export const adaptGoogleSearchToolForVertex: TransformFn = (
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
                      typeof tool === "object" &&
                      tool !== null &&
                      "type" in tool &&
                      tool.type === "google_search"
                          ? toOpenAIFunctionFormat("google_search")
                          : tool,
                  ),
              }),
    },
});

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
