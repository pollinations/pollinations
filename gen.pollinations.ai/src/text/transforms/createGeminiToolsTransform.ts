import type { TransformFn } from "../types.ts";
import { addDefaultTools } from "./pipe.ts";

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
                      typeof tool === "object" &&
                      tool !== null &&
                      "type" in tool &&
                      tool.type === "google_search"
                          ? {
                                type: "openrouter:web_search",
                                parameters: { engine: "native" },
                            }
                          : tool,
                  ),
              }),
    },
});

/** Adds OpenRouter's provider-native Google Search tool without an Exa route. */
export function createOpenRouterNativeWebSearchTransform() {
    return addDefaultTools([
        {
            type: "openrouter:web_search",
            parameters: { engine: "native" },
        },
    ]);
}
