import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Env } from "../env.ts";
import { JsonSchemaVariables, validateJsonResponse } from "./json-schema.ts";

/**
 * Middleware to validate responses against JSON schemas
 * 
 * This middleware intercepts responses and validates them against
 * the JSON schema specified in the request's response_format.
 * It works for both streaming and non-streaming responses.
 */
export const jsonSchemaValidation = createMiddleware<Env & JsonSchemaVariables>(
    async (c, next) => {
        const jsonSchema = c.get("jsonSchema");
        
        if (!jsonSchema) {
            // No JSON schema to validate against, pass through
            return next();
        }

        // Check if this is a streaming request
        const requestBody = await c.req.json().catch(() => null);
        const isStreaming = requestBody?.stream === true;

        if (isStreaming) {
            // Handle streaming response validation
            return handleStreamingValidation(c, next, jsonSchema);
        } else {
            // Handle non-streaming response validation
            return handleNonStreamingValidation(c, next, jsonSchema);
        }
    }
);

/**
 * Handle validation for non-streaming responses
 */
async function handleNonStreamingValidation(
    c: any,
    next: any,
    jsonSchema: JsonSchemaVariables["jsonSchema"]
) {
    // Let the request proceed to get the response
    await next();

    // Get the response
    const response = c.res;
    
    if (!response || response.status !== 200) {
        return; // Don't validate error responses
    }

    try {
        // Clone the response to avoid consuming it
        const responseClone = response.clone();
        const responseData = await responseClone.json();
        
        // Extract the content from the response
        const content = responseData.choices?.[0]?.message?.content;
        
        if (!content) {
            return; // No content to validate
        }

        // Validate the content against the JSON schema
        const validation = validateJsonResponse(content, jsonSchema);
        
        if (!validation.valid) {
            // Create an error response
            const errorResponse = {
                error: {
                    message: `JSON schema validation failed: ${validation.error}`,
                    type: "invalid_request_error",
                    code: "json_schema_validation_failed",
                },
            };

            // Replace the response with the error
            c.res = new Response(JSON.stringify(errorResponse), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                },
            });
            return;
        }

        // Validation passed, update the response with validated data
        const updatedResponse = {
            ...responseData,
            choices: [
                {
                    ...responseData.choices[0],
                    message: {
                        ...responseData.choices[0].message,
                        content: JSON.stringify(validation.data, null, 2),
                    },
                },
            ],
        };

        c.res = new Response(JSON.stringify(updatedResponse), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    } catch (error) {
        // If we can't parse or validate the response, let it through
        // This prevents breaking the response for validation errors
        console.error("Error validating non-streaming response:", error);
    }
}

/**
 * Handle validation for streaming responses
 * 
 * THE FIX: Properly buffers incomplete lines to prevent JSON parse errors
 * when TCP packets split in the middle of SSE data lines.
 */
async function handleStreamingValidation(
    c: any,
    next: any,
    jsonSchema: JsonSchemaVariables["jsonSchema"]
) {
    // Let the request proceed to get the streaming response
    await next();

    const response = c.res;
    
    if (!response || response.status !== 200) {
        return; // Don't validate error responses
    }

    try {
        // Create a transform stream to validate the streaming content
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const reader = response.body.getReader();

        let accumulatedContent = "";
        let isValidating = false;
        let lineBuffer = ""; // THE FIX: Buffer for incomplete lines

        // Process the stream
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        // Process any remaining data in the buffer
                        if (lineBuffer.trim()) {
                            // Treat remaining buffer as a complete line
                            if (lineBuffer.startsWith("data: ")) {
                                const dataStr = lineBuffer.slice(6);
                                if (dataStr !== "[DONE]") {
                                    try {
                                        const data = JSON.parse(dataStr);
                                        const deltaContent = data.choices?.[0]?.delta?.content;
                                        if (deltaContent) {
                                            accumulatedContent += deltaContent;
                                        }
                                    } catch (error) {
                                        // Ignore parse errors in final buffer
                                    }
                                }
                            }
                        }
                        
                        // Validate the complete content
                        if (accumulatedContent.trim()) {
                            const validation = validateJsonResponse(accumulatedContent, jsonSchema);
                            
                            if (!validation.valid) {
                                // Send an error chunk
                                const errorChunk = {
                                    id: "json_validation_error",
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: "json_validator",
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {
                                                content: `\n\n[JSON Schema Validation Error: ${validation.error}]`,
                                            },
                                            finish_reason: "stop",
                                        },
                                    ],
                                };
                                
                                await writer.write(
                                    new TextEncoder().encode(`data: ${JSON.stringify(errorChunk)}\n\n`)
                                );
                            }
                        }
                        
                        await writer.close();
                        break;
                    }

                    // THE FIX: Decode and append to buffer
                    const chunk = new TextDecoder().decode(value);
                    lineBuffer += chunk;
                    
                    // Split on newlines, keeping incomplete line in buffer
                    const lines = lineBuffer.split("\n");
                    
                    // Keep last element in buffer (might be incomplete)
                    lineBuffer = lines.pop() || "";

                    // Process only complete lines
                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const dataStr = line.slice(6);
                            
                            if (dataStr === "[DONE]") {
                                await writer.write(new TextEncoder().encode(line + "\n"));
                                continue;
                            }

                            try {
                                const data = JSON.parse(dataStr);
                                
                                // Extract content from delta
                                const deltaContent = data.choices?.[0]?.delta?.content;
                                
                                if (deltaContent) {
                                    accumulatedContent += deltaContent;
                                    isValidating = true;
                                }

                                // Check if this is the final chunk
                                const finishReason = data.choices?.[0]?.finish_reason;
                                
                                if (finishReason && isValidating) {
                                    // This is the end of the content, validate it
                                    const validation = validateJsonResponse(accumulatedContent, jsonSchema);
                                    
                                    if (!validation.valid) {
                                        // Replace the final chunk with an error
                                        const errorData = {
                                            ...data,
                                            choices: [
                                                {
                                                    ...data.choices[0],
                                                    delta: {
                                                        content: `\n\n[JSON Schema Validation Error: ${validation.error}]`,
                                                    },
                                                    finish_reason: "stop",
                                                },
                                            ],
                                        };
                                        
                                        await writer.write(
                                            new TextEncoder().encode(`data: ${JSON.stringify(errorData)}\n`)
                                        );
                                        continue;
                                    }
                                }

                                // Pass through the original chunk
                                await writer.write(new TextEncoder().encode(line + "\n"));
                            } catch (error) {
                                // If we can't parse the chunk, pass it through
                                await writer.write(new TextEncoder().encode(line + "\n"));
                            }
                        } else if (line.trim() === "") {
                            await writer.write(new TextEncoder().encode(line + "\n"));
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing streaming validation:", error);
                await writer.abort(error);
            }
        })();

        // Replace the response with our validated stream
        c.res = new Response(readable, {
            status: response.status,
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        // If we can't process the stream, let it through
        console.error("Error setting up streaming validation:", error);
    }
}
