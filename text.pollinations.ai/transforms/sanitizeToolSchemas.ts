/**
 * Sanitizes tool schemas for Gemini/Vertex AI compatibility.
 * Removes unsupported JSON Schema properties that cause 400 errors.
 *
 * See: https://github.com/Portkey-AI/gateway/issues/1473
 * Ref: https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/Schema
 */
import type { TransformFn } from "../types.js";

// Allowlist: only properties supported by Vertex AI Schema pass through.
// See: https://cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/Schema
const SUPPORTED = new Set([
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "default",
    "items",
    "minItems",
    "maxItems",
    "enum",
    "properties",
    "propertyOrdering",
    "required",
    "minProperties",
    "maxProperties",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "pattern",
    "example",
    "anyOf",
    "additionalProperties",
    "$ref",
    "$defs",
]);

// Keys whose values are maps of field-name -> sub-schema (not schema keywords)
const PROPERTY_MAPS = new Set(["properties", "$defs"]);

function sanitize(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!SUPPORTED.has(key)) continue;
        if (
            PROPERTY_MAPS.has(key) &&
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            // Preserve all field names but sanitize each sub-schema
            const map: Record<string, unknown> = {};
            for (const [field, schema] of Object.entries(
                value as Record<string, unknown>,
            )) {
                map[field] = sanitize(schema);
            }
            result[key] = map;
        } else {
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
