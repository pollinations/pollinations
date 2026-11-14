import type { TransformFn } from "../types.ts";

export type GeminiToolName = "code_execution" | "google_search";

function toOpenAIFunctionFormat(name: GeminiToolName) {
    return {
        type: "function" as const,
        function: { name },
    };
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

export function isGoogleSearchTool(tool: unknown): boolean {
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

/** Vercel's Responses endpoint maps web_search to Google grounding. */
export const adaptGoogleSearchToolForVercel: TransformFn = (
    messages,
    options,
) => ({
    messages,
    options: {
        ...options,
        tools: options.tools?.map((tool) =>
            isGoogleSearchTool(tool) ? { type: "web_search" } : tool,
        ),
        tool_choice: isGoogleSearchTool(options.tool_choice)
            ? "required"
            : options.tool_choice,
    },
});

/** Converts Pollinations' public Gemini search tool to OpenRouter's native tool. */
export const createOpenRouterGoogleSearchTransform =
    (engine: "native" | "exa"): TransformFn =>
    (messages, options) => ({
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
                                    parameters: { engine },
                                }
                              : tool,
                      ),
                  }),
        },
    });

export const adaptGoogleSearchToolForOpenRouter =
    createOpenRouterGoogleSearchTransform("native");
