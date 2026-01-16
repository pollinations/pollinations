/**
 * Sanitizes tool schemas for Gemini/Vertex AI compatibility.
 * Removes unsupported JSON Schema properties that cause 400 errors.
 *
 * Vertex AI Schema only supports: type, format, title, description, nullable,
 * default, items, minItems, maxItems, enum, properties, propertyOrdering,
 * required, minProperties, maxProperties, minimum, maximum, minLength,
 * maxLength, pattern, example, anyOf, additionalProperties, ref, defs
 *
 * See: https://github.com/Portkey-AI/gateway/issues/1473
 * Ref: https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/Schema
 */

// Only these two cause the actual error - keep it minimal
const UNSUPPORTED = new Set(["exclusiveMinimum", "exclusiveMaximum"]);

function sanitize(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (!UNSUPPORTED.has(k)) {
            result[k] = typeof v === "object" ? sanitize(v) : v;
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

export function sanitizeToolSchemas() {
    return (messages: unknown[], options: Record<string, unknown>) => ({
        messages,
        options: {
            ...options,
            tools: (options.tools as Tool[] | undefined)?.map((t) =>
                t.type === "function" && t.function?.parameters
                    ? {
                          ...t,
                          function: {
                              ...t.function,
                              parameters: sanitize(t.function.parameters),
                          },
                      }
                    : t,
            ),
        },
    });
}
