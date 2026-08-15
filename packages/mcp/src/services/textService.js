import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../utils/coreUtils.js";
import { validateTextModel } from "../utils/models.js";

async function generateText(params, context) {
    requireApiKey(context);

    const {
        messages,
        model = "openai",
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        repetition_penalty,
        seed,
        stop,
        response_format,
        stream = false,
        stream_options,
        reasoning_effort,
        tools,
        tool_choice,
        parallel_tool_calls,
        functions,
        function_call,
        modalities,
        audio,
        logprobs,
        top_logprobs,
        logit_bias,
        user,
    } = params;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required and must not be empty");
    }

    const validation = await validateTextModel(model, context);
    if (!validation.valid) {
        throw new Error(
            `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                `Use listModels with type=text to see all ${validation.availableCount} available models.`,
        );
    }

    const requestBody = {
        messages,
        model,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        repetition_penalty,
        seed,
        stop,
        response_format,
        stream,
        stream_options,
        reasoning_effort,
        tools,
        tool_choice,
        parallel_tool_calls,
        functions,
        function_call,
        modalities,
        audio,
        logprobs,
        top_logprobs,
        logit_bias,
        user,
    };

    try {
        const result = await postChatCompletion(requestBody, context);

        const choice = result.choices?.[0];
        const assistantMessage = choice?.message;

        const responseContent = [];

        if (assistantMessage?.content) {
            responseContent.push(createTextContent(assistantMessage.content));
        }

        if (assistantMessage?.reasoning_content) {
            responseContent.push(
                createTextContent(
                    {
                        reasoning: assistantMessage.reasoning_content,
                    },
                    true,
                ),
            );
        }

        if (assistantMessage?.tool_calls?.length > 0) {
            responseContent.push(
                createTextContent(
                    {
                        tool_calls: assistantMessage.tool_calls,
                    },
                    true,
                ),
            );
        }

        if (assistantMessage?.function_call) {
            responseContent.push(
                createTextContent(
                    {
                        function_call: assistantMessage.function_call,
                    },
                    true,
                ),
            );
        }

        if (assistantMessage?.audio) {
            responseContent.push({
                type: "audio",
                data: assistantMessage.audio.data,
                mimeType: `audio/${audio?.format || "mp3"}`,
            });
            if (assistantMessage.audio.transcript) {
                responseContent.push(
                    createTextContent(
                        {
                            audio_transcript: assistantMessage.audio.transcript,
                        },
                        true,
                    ),
                );
            }
        }

        if (result.citations?.length > 0) {
            responseContent.push(
                createTextContent(
                    {
                        citations: result.citations,
                    },
                    true,
                ),
            );
        }

        responseContent.push(
            createTextContent(
                {
                    model: result.model,
                    finish_reason: choice?.finish_reason,
                    usage: result.usage,
                },
                true,
            ),
        );

        return createMCPResponse(responseContent);
    } catch (error) {
        console.error("Error in chat completion:", error);
        throw error;
    }
}

const messageSchema = z.object({
    role: z
        .enum(["system", "user", "assistant", "tool", "function", "developer"])
        .describe(
            "Message role: system (set behavior), user (your input), assistant (AI response), tool (tool result)",
        ),
    content: z
        .union([z.string(), z.array(z.any())])
        .describe(
            "Message content. String for text, or array for multimodal (images, audio, video)",
        ),
    name: z
        .string()
        .optional()
        .describe("Participant name for multi-user conversations"),
    tool_call_id: z
        .string()
        .optional()
        .describe("Tool call ID (required for tool role messages)"),
    tool_calls: z
        .array(z.any())
        .optional()
        .describe("Tool calls from assistant (for continuing tool use)"),
});

const toolSchema = z.object({
    type: z
        .enum([
            "function",
            "code_execution",
            "google_search",
            "google_maps",
            "url_context",
            "file_search",
        ])
        .describe(
            "Tool type. 'function' for custom functions, others are Gemini built-in tools",
        ),
    function: z
        .object({
            name: z.string().describe("Function name"),
            description: z
                .string()
                .optional()
                .describe("Function description for the model"),
            parameters: z
                .record(z.any())
                .optional()
                .describe("JSON Schema for function parameters"),
            strict: z
                .boolean()
                .optional()
                .describe("Strict parameter validation"),
        })
        .optional()
        .describe("Function definition (required for type='function')"),
});

const audioOptionsSchema = z.object({
    voice: z
        .string()
        .describe(
            "Voice for audio output. Use listModels with type=audio to inspect live voice metadata.",
        ),
    format: z
        .enum(["wav", "mp3", "flac", "opus", "pcm16"])
        .describe("Audio format"),
});

const responseFormatSchema = z.object({
    type: z
        .enum(["text", "json_object", "json_schema"])
        .describe("Response format type"),
    json_schema: z
        .object({
            name: z.string().optional(),
            description: z.string().optional(),
            schema: z.record(z.any()),
            strict: z.boolean().optional(),
        })
        .optional()
        .describe(
            "JSON schema for structured output (when type='json_schema')",
        ),
});

const chatParamsSchema = {
    messages: z
        .array(messageSchema)
        .describe(
            "Array of messages in the conversation. Include system message first to set behavior",
        ),
    model: z
        .string()
        .optional()
        .describe(
            "Text model (default: 'openai'). Use listModels with type=text",
        ),
    temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe(
            "Creativity level (0-2, default: 1). Lower = more focused, higher = more creative",
        ),
    max_tokens: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Maximum tokens to generate"),
    top_p: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Nucleus sampling (0-1). Alternative to temperature"),
    frequency_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Reduce repetition of tokens (-2 to 2)"),
    presence_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Reduce repetition of topics (-2 to 2)"),
    repetition_penalty: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("Alternative repetition penalty (0-2)"),
    seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Random seed for reproducibility"),
    stop: z
        .union([z.string(), z.array(z.string()).max(4)])
        .optional()
        .describe(
            "Stop sequences. Generation stops when these are encountered. Max 4 sequences",
        ),
    response_format: responseFormatSchema
        .optional()
        .describe(
            "Response format. Use 'json_object' for JSON output, 'json_schema' for structured data",
        ),
    reasoning_effort: z
        .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
        .optional()
        .describe(
            "Reasoning effort level. Use 'none' to request no reasoning on supported models",
        ),
    tools: z
        .array(toolSchema)
        .optional()
        .describe(
            "Tools available to the model. For function calling or Gemini built-in tools",
        ),
    tool_choice: z
        .union([
            z.enum(["none", "auto", "required"]),
            z.object({
                type: z.literal("function"),
                function: z.object({ name: z.string() }),
            }),
        ])
        .optional()
        .describe(
            "How to handle tools: 'none' (don't use), 'auto' (model decides), 'required' (must use), or specific function",
        ),
    parallel_tool_calls: z
        .boolean()
        .optional()
        .describe("Allow parallel tool calls (default: true)"),
    functions: z
        .array(
            z.object({
                name: z.string(),
                description: z.string().optional(),
                parameters: z.record(z.any()).optional(),
            }),
        )
        .optional()
        .describe(
            "Legacy function definitions (deprecated, use 'tools' instead)",
        ),
    function_call: z
        .union([z.enum(["none", "auto"]), z.object({ name: z.string() })])
        .optional()
        .describe(
            "Legacy function call option (deprecated, use 'tool_choice' instead)",
        ),
    modalities: z
        .array(z.enum(["text", "audio"]))
        .optional()
        .describe(
            "Output modalities. Include 'audio' for voice output (openai-audio model)",
        ),
    audio: audioOptionsSchema
        .optional()
        .describe(
            "Audio output options. Requires modalities to include 'audio'",
        ),
    logprobs: z
        .boolean()
        .optional()
        .describe("Return log probabilities of tokens (default: false)"),
    top_logprobs: z
        .number()
        .int()
        .min(0)
        .max(20)
        .optional()
        .describe("Number of top logprobs to return (0-20)"),
    logit_bias: z
        .record(z.number().int())
        .optional()
        .describe(
            "Token ID to bias mapping. Adjust likelihood of specific tokens",
        ),
    user: z
        .string()
        .optional()
        .describe("Unique user identifier for tracking/abuse prevention"),
};

export const textTools = [
    [
        "generateText",
        "Call POST /v1/chat/completions for text, search, multimodal input, tool calling, structured output, reasoning, or audio output.",
        chatParamsSchema,
        generateText,
    ],
];
