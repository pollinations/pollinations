import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../env.ts";

// JSON Schema types based on OpenAI's response_format
const JsonSchemaSchema = z.record(z.string(), z.any());

const ResponseFormatJsonSchemaSchema = z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
        description: z.string().optional(),
        name: z.string().optional(),
        schema: JsonSchemaSchema,
        strict: z.boolean().nullable().default(false).optional(),
    }),
});

const ResponseFormatJsonObjectSchema = z.object({
    type: z.literal("json_object"),
});

// Context variables for JSON schema enforcement
export interface JsonSchemaVariables {
    jsonSchema?: {
        type: "json_object" | "json_schema";
        schema?: Record<string, any>;
        name?: string;
        description?: string;
        strict?: boolean;
    };
}

/**
 * Middleware to enforce JSON schema compliance in responses
 * 
 * This middleware:
 * 1. Detects JSON schema requests from response_format
 * 2. Injects system prompts to enforce JSON compliance
 * 3. Validates responses against the schema
 * 4. Handles streaming responses with schema validation
 */
export const jsonSchemaEnforcement = createMiddleware<Env>(async (c, next) => {
    const requestBody = await c.req.json().catch(() => null);
    
    if (!requestBody || !requestBody.response_format) {
        // No JSON schema requested, pass through
        return next();
    }

    // Parse and validate the response_format
    let jsonSchema: JsonSchemaVariables["jsonSchema"];
    
    try {
        // Handle json_object type
        if (requestBody.response_format.type === "json_object") {
            jsonSchema = {
                type: "json_object",
            };
        }
        // Handle json_schema type
        else if (requestBody.response_format.type === "json_schema") {
            const parsed = ResponseFormatJsonSchemaSchema.parse(requestBody.response_format);
            jsonSchema = {
                type: "json_schema",
                schema: parsed.json_schema.schema,
                name: parsed.json_schema.name,
                description: parsed.json_schema.description,
                strict: parsed.json_schema.strict ?? false,
            };
        }
        else {
            // Unknown type, pass through
            return next();
        }
    } catch (error) {
        // Invalid schema format, pass through
        return next();
    }

    // Store the JSON schema in context for later use
    c.set("jsonSchema", jsonSchema);

    // Modify the request to include system prompt for JSON enforcement
    const modifiedBody = {
        ...requestBody,
        messages: injectJsonSystemPrompt(requestBody.messages, jsonSchema),
    };

    // Replace the request body with our modified version
    c.req.json = async () => modifiedBody;

    await next();
});

/**
 * Inject system prompt to enforce JSON schema compliance
 */
function injectJsonSystemPrompt(
    messages: any[],
    jsonSchema: JsonSchemaVariables["jsonSchema"]
): any[] {
    if (!jsonSchema) return messages;

    let systemPrompt = "";

    if (jsonSchema.type === "json_object") {
        systemPrompt = `You must respond with valid JSON only. Do not include any explanatory text, introductions, or conclusions. Your entire response must be a single valid JSON object that can be parsed by JSON.parse().`;
    } else if (jsonSchema.type === "json_schema" && jsonSchema.schema) {
        const schemaDescription = jsonSchema.description 
            ? ` Description: ${jsonSchema.description}`
            : "";
        
        systemPrompt = `You must respond with valid JSON that strictly adheres to the following JSON Schema:${schemaDescription}

Schema:
${JSON.stringify(jsonSchema.schema, null, 2)}

Rules:
1. Your entire response must be valid JSON that matches this schema exactly
2. Do not include any explanatory text, introductions, or conclusions
3. All required properties must be present
4. All property types must match the schema exactly
5. If the schema specifies enum values, use only those values
6. If the schema specifies patterns, ensure strings match those patterns
7. If the schema specifies minimum/maximum values, ensure numbers are within those bounds
8. Do not add any properties not specified in the schema
9. Do not wrap the JSON in markdown code blocks or any other formatting`;

        if (jsonSchema.strict) {
            systemPrompt += `
10. STRICT MODE: Any deviation from the schema will be considered a failure. Use exact property names and types as specified.`;
        }
    }

    if (!systemPrompt) return messages;

    // Create a new messages array with the system prompt injected
    const modifiedMessages = [...messages];
    
    // Check if there's already a system message
    const systemMessageIndex = modifiedMessages.findIndex(msg => msg.role === "system");
    
    if (systemMessageIndex >= 0) {
        // Append our JSON prompt to existing system message
        modifiedMessages[systemMessageIndex] = {
            ...modifiedMessages[systemMessageIndex],
            content: `${modifiedMessages[systemMessageIndex].content}\n\n${systemPrompt}`
        };
    } else {
        // Add a new system message at the beginning
        modifiedMessages.unshift({
            role: "system",
            content: systemPrompt
        });
    }

    return modifiedMessages;
}

/**
 * Validate response content against JSON schema
 * This function can be used to validate both streaming and non-streaming responses
 */
export function validateJsonResponse(
    content: string,
    jsonSchema: JsonSchemaVariables["jsonSchema"]
): { valid: boolean; error?: string; data?: any } {
    if (!jsonSchema) return { valid: true };

    try {
        // Try to parse the content as JSON
        const data = JSON.parse(content);

        if (jsonSchema.type === "json_object") {
            // Basic JSON object validation
            if (typeof data !== "object" || data === null || Array.isArray(data)) {
                return { 
                    valid: false, 
                    error: "Response must be a JSON object, not an array or primitive" 
                };
            }
            return { valid: true, data };
        }

        if (jsonSchema.type === "json_schema" && jsonSchema.schema) {
            // Validate against the specific schema
            const validationResult = validateAgainstSchema(data, jsonSchema.schema);
            if (!validationResult.valid) {
                return { 
                    valid: false, 
                    error: `Schema validation failed: ${validationResult.error}` 
                };
            }
            return { valid: true, data };
        }

        return { valid: true, data };
    } catch (error) {
        return { 
            valid: false, 
            error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` 
        };
    }
}

/**
 * Basic JSON schema validation
 * This is a simplified validator - for production use, consider a library like ajv
 */
function validateAgainstSchema(data: any, schema: Record<string, any>): { valid: boolean; error?: string } {
    // Handle basic type validation
    if (schema.type) {
        const actualType = Array.isArray(data) ? "array" : typeof data;
        if (actualType !== schema.type) {
            return { 
                valid: false, 
                error: `Expected type ${schema.type}, got ${actualType}` 
            };
        }
    }

    // Handle object properties
    if (schema.type === "object" && schema.properties) {
        // Check required properties
        if (schema.required) {
            for (const requiredProp of schema.required) {
                if (!(requiredProp in data)) {
                    return { 
                        valid: false, 
                        error: `Missing required property: ${requiredProp}` 
                    };
                }
            }
        }

        // Validate each property
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            if (propName in data) {
                const propValidation = validateAgainstSchema(data[propName], propSchema as Record<string, any>);
                if (!propValidation.valid) {
                    return { 
                        valid: false, 
                        error: `Property ${propName}: ${propValidation.error}` 
                    };
                }
            }
        }
    }

    // Handle array items
    if (schema.type === "array" && schema.items) {
        if (!Array.isArray(data)) {
            return { valid: false, error: "Expected array" };
        }
        for (let i = 0; i < data.length; i++) {
            const itemValidation = validateAgainstSchema(data[i], schema.items);
            if (!itemValidation.valid) {
                return { 
                    valid: false, 
                    error: `Item ${i}: ${itemValidation.error}` 
                };
            }
        }
    }

    // Handle enum validation
    if (schema.enum) {
        if (!schema.enum.includes(data)) {
            return { 
                valid: false, 
                error: `Value must be one of: ${schema.enum.join(", ")}` 
            };
        }
    }

    // Handle string patterns
    if (schema.pattern && typeof data === "string") {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
            return { 
                valid: false, 
                error: `String does not match required pattern: ${schema.pattern}` 
            };
        }
    }

    // Handle numeric constraints
    if (typeof data === "number") {
        if (schema.minimum !== undefined && data < schema.minimum) {
            return { 
                valid: false, 
                error: `Number must be >= ${schema.minimum}` 
            };
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
            return { 
                valid: false, 
                error: `Number must be <= ${schema.maximum}` 
            };
        }
    }

    // Handle string length constraints
    if (typeof data === "string") {
        if (schema.minLength !== undefined && data.length < schema.minLength) {
            return { 
                valid: false, 
                error: `String must be at least ${schema.minLength} characters` 
            };
        }
        if (schema.maxLength !== undefined && data.length > schema.maxLength) {
            return { 
                valid: false, 
                error: `String must be at most ${schema.maxLength} characters` 
            };
        }
    }

    return { valid: true };
}