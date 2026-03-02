/**
 * Sanitizes tool schemas for Gemini/Vertex AI compatibility.
 * Removes unsupported JSON Schema properties that cause 400 errors.
 *
 * See: https://github.com/Portkey-AI/gateway/issues/1473
 * Ref: https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/Schema
 */
import type { TransformFn } from "../types.js";

const UNSUPPORTED_PROPERTIES = new Set([
    "exclusiveMinimum",
    "exclusiveMaximum",
]);

function sanitize(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!UNSUPPORTED_PROPERTIES.has(key)) {
            result[key] = typeof value === "object" ? sanitize(value) : value;
        }
    }
    return result;
}

interface Tool {
    type: string;
    function?: {
        parameters?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export function sanitizeToolSchemas(): TransformFn {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            tools: options.tools?.map((tool: Tool) =>
                tool.type === "function" && tool.function?.parameters
                    ? {
                          ...tool,
                          function: {
                              ...tool.function,
                              parameters: sanitize(tool.function.parameters),
                          },
                      }
                    : tool,
            ),
        },
    });
}
