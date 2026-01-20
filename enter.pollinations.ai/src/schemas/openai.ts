// AI generated based on `https://github.com/Portkey-AI/openapi/blob/master/openapi.yaml` and adaped

import { z } from "zod";
import {
    DEFAULT_TEXT_MODEL,
    AUDIO_VOICES,
    TEXT_SERVICES,
} from "../../../shared/registry/text.ts";

// Build list of valid model names: service IDs + all aliases
const VALID_TEXT_MODELS = [
    ...Object.keys(TEXT_SERVICES),
    ...Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
] as const;

const FunctionParametersSchema = z.record(z.string(), z.any());

const FunctionObjectSchema = z.object({
    description: z.string().optional(),
    name: z.string(),
    parameters: FunctionParametersSchema.optional(),
    strict: z.boolean().nullable().default(false).optional(),
});

const ChatCompletionFunctionsSchema = z
    .object({
        description: z.string().optional(),
        name: z.string(),
        parameters: FunctionParametersSchema.optional(),
    })
    .strict();

const ChatCompletionFunctionCallOptionSchema = z.object({
    name: z.string(),
});

// Standard OpenAI function tool
const FunctionToolSchema = z.object({
    type: z.literal("function"),
    function: FunctionObjectSchema,
});

// Gemini-specific built-in tools (no additional config needed)
// See: https://ai.google.dev/gemini-api/docs/tools
const GeminiBuiltInToolSchema = z.object({
    type: z.enum([
        "code_execution", // Run Python code in sandbox
        "google_search", // Real-time web search grounding
        "google_maps", // Location/maps grounding
        "url_context", // Read/ground on specific URLs
        "computer_use", // Browser automation (Preview)
        "file_search", // Search uploaded files
    ]),
});

const ChatCompletionToolSchema = z.union([
    FunctionToolSchema,
    GeminiBuiltInToolSchema,
]);

const ChatCompletionNamedToolChoiceSchema = z.object({
    type: z.literal("function"),
    function: z.object({ name: z.string() }),
});

const ChatCompletionToolChoiceOptionSchema = z.union([
    z.enum(["none", "auto", "required"]),
    ChatCompletionNamedToolChoiceSchema,
]);

const ChatCompletionRequestMessageContentPartImageSchema = z.object({
    type: z.literal("image_url"),
    image_url: z.object({
        url: z.string(),
        detail: z.enum(["auto", "low", "high"]).optional(),
        mime_type: z.string().optional(), // For explicit MIME type (e.g., "image/jpeg")
    }),
});

// Video URL content type - currently supported by Gemini models only
// Enables native YouTube video analysis (visual frames + audio) without manual extraction
const ChatCompletionRequestMessageContentPartVideoSchema = z.object({
    type: z.literal("video_url"),
    video_url: z.object({
        url: z.string(), // Supports YouTube URLs, gs://, https://, or data: URLs
        mime_type: z.string().optional(), // Auto-detected for YouTube URLs as "video/mp4"
    }),
});

// Anthropic prompt caching support
const CacheControlSchema = z
    .object({
        type: z.enum(["ephemeral"]),
    })
    .optional()
    .meta({ $id: "CacheControl" });

const ChatCompletionRequestMessageContentPartTextSchema = z.object({
    type: z.literal("text"),
    text: z.string(),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestMessageContentPartAudioSchema = z.object({
    type: z.literal("input_audio"),
    input_audio: z.object({
        data: z.string(), // base64 encoded audio
        format: z.enum(["wav", "mp3", "flac", "opus", "pcm16"]),
    }),
    cache_control: CacheControlSchema,
});

// File content for document/file uploads
const ChatCompletionRequestMessageContentPartFileSchema = z.object({
    type: z.literal("file"),
    file: z.object({
        file_data: z.string().optional(),
        file_id: z.string().optional(),
        file_name: z.string().optional(),
        file_url: z.string().optional(),
        mime_type: z.string().optional(),
    }),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestMessageContentPartSchema = z
    .union([
        ChatCompletionRequestMessageContentPartTextSchema,
        ChatCompletionRequestMessageContentPartImageSchema,
        ChatCompletionRequestMessageContentPartVideoSchema,
        ChatCompletionRequestMessageContentPartAudioSchema,
        ChatCompletionRequestMessageContentPartFileSchema,
        // Allow any other content types for provider-specific extensions
        z
            .object({ type: z.string() })
            .passthrough(),
    ])
    .meta({ $id: "MessageContentPart" });

// Thinking (provider-specific; requires strict_openai_compliance=false)
const ChatCompletionMessageContentPartThinkingSchema = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
});

const ChatCompletionMessageContentPartRedactedThinkingSchema = z.object({
    type: z.literal("redacted_thinking"),
    data: z.string(),
});

const ChatCompletionRequestSystemMessageSchema = z.object({
    content: z.union([
        z.string(),
        z.array(ChatCompletionRequestMessageContentPartSchema).min(1),
    ]),
    role: z.literal("system"),
    name: z.string().optional(),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestDeveloperMessageSchema = z.object({
    content: z.union([
        z.string(),
        z.array(ChatCompletionRequestMessageContentPartSchema).min(1),
    ]),
    role: z.literal("developer"),
    name: z.string().optional(),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestUserMessageSchema = z.object({
    content: z.union([
        z.string(),
        z.array(ChatCompletionRequestMessageContentPartSchema).min(1),
    ]),
    role: z.literal("user"),
    name: z.string().optional(),
});

const ChatCompletionMessageToolCallSchema = z.object({
    id: z.string(),
    type: z.literal("function"),
    function: z.object({
        name: z.string(),
        arguments: z.string(),
    }),
});

const ChatCompletionMessageToolCallsSchema = z.array(
    ChatCompletionMessageToolCallSchema,
);

const ChatCompletionRequestAssistantMessageSchema = z.object({
    content: z
        .union([
            z.string(),
            z.array(ChatCompletionRequestMessageContentPartSchema).min(1),
        ])
        .nullable()
        .optional(),
    role: z.literal("assistant"),
    name: z.string().optional(),
    tool_calls: ChatCompletionMessageToolCallsSchema.optional(),
    function_call: z
        .object({
            arguments: z.string(),
            name: z.string(),
        })
        .nullable()
        .optional(),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestToolMessageSchema = z.object({
    role: z.literal("tool"),
    content: z
        .union([
            z.string(),
            z.array(ChatCompletionRequestMessageContentPartSchema).min(1),
        ])
        .nullable(),
    tool_call_id: z.string(),
    cache_control: CacheControlSchema,
});

const ChatCompletionRequestFunctionMessageSchema = z.object({
    role: z.literal("function"),
    content: z.string().nullable(),
    name: z.string(),
});

const ChatCompletionRequestMessageSchema = z.union([
    ChatCompletionRequestSystemMessageSchema,
    ChatCompletionRequestDeveloperMessageSchema,
    ChatCompletionRequestUserMessageSchema,
    ChatCompletionRequestAssistantMessageSchema,
    ChatCompletionRequestToolMessageSchema,
    ChatCompletionRequestFunctionMessageSchema,
]);

const ResponseFormatTextSchema = z.object({ type: z.literal("text") });

const ResponseFormatJsonObjectSchema = z.object({
    type: z.literal("json_object"),
});

const ResponseFormatJsonSchemaSchema = z.record(z.string(), z.any());

const ResponseFormatJsonSchemaSchemaContainer = z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
        description: z.string().optional(),
        name: z.string().optional(),
        schema: ResponseFormatJsonSchemaSchema,
        strict: z.boolean().nullable().default(false).optional(),
    }),
});

const ResponseFormatUnionSchema = z.union([
    ResponseFormatTextSchema,
    ResponseFormatJsonSchemaSchemaContainer,
    ResponseFormatJsonObjectSchema,
]);

const ChatCompletionStreamOptionsSchema = z
    .object({
        include_usage: z.boolean().optional(),
    })
    .nullable()
    .optional();

const ThinkingSchema = z
    .object({
        type: z.enum(["enabled", "disabled"]).default("disabled"),
        budget_tokens: z.number().int().min(1).optional(),
    })
    .nullable()
    .optional();

export const CreateChatCompletionRequestSchema = z.object({
    messages: z.array(ChatCompletionRequestMessageSchema),
    model: z
        .literal(VALID_TEXT_MODELS)
        .optional()
        .default(DEFAULT_TEXT_MODEL)
        .meta({
            description:
                "AI model for text generation. See /v1/models for full list.",
        }),
    modalities: z.array(z.enum(["text", "audio"])).optional(),
    audio: z
        .object({
            voice: z.enum(AUDIO_VOICES),
            format: z.enum(["wav", "mp3", "flac", "opus", "pcm16"]),
        })
        .optional(),
    frequency_penalty: z
        .number()
        .min(-2)
        .max(2)
        .nullable()
        .optional()
        .default(0),
    repetition_penalty: z.number().min(0).max(2).nullable().optional(),
    logit_bias: z
        .record(z.string(), z.number().int())
        .nullable()
        .optional()
        .default(null),
    logprobs: z.boolean().nullable().optional().default(false),
    top_logprobs: z.number().int().min(0).max(20).nullable().optional(),
    max_tokens: z.number().int().min(0).nullable().optional(),
    presence_penalty: z
        .number()
        .min(-2)
        .max(2)
        .nullable()
        .optional()
        .default(0),
    response_format: ResponseFormatUnionSchema.optional(),
    seed: z
        .number()
        .int()
        .min(-1)
        .max(Number.MAX_SAFE_INTEGER)
        .nullable()
        .optional(),
    stop: z
        .union([z.string().nullable(), z.array(z.string()).min(1).max(4)])
        .optional(),
    stream: z.boolean().nullable().optional().default(false),
    stream_options: ChatCompletionStreamOptionsSchema,
    thinking: ThinkingSchema,
    reasoning_effort: z
        .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
        .optional(),
    thinking_budget: z.number().int().min(0).optional(),
    temperature: z.number().min(0).max(2).nullable().optional().default(1),
    top_p: z.number().min(0).max(1).nullable().optional().default(1),
    tools: z.array(ChatCompletionToolSchema).optional(),
    tool_choice: ChatCompletionToolChoiceOptionSchema.optional(),
    parallel_tool_calls: z.boolean().optional().default(true),
    user: z.string().optional(),
    function_call: z
        .union([
            z.enum(["none", "auto"]),
            ChatCompletionFunctionCallOptionSchema,
        ])
        .optional(), // deprecated, supported
    functions: z
        .array(ChatCompletionFunctionsSchema)
        .min(1)
        .max(128)
        .optional(), // deprecated, supported
});

const ChatCompletionMessageContentBlockSchema = z.union([
    ChatCompletionRequestMessageContentPartTextSchema,
    ChatCompletionRequestMessageContentPartImageSchema,
    ChatCompletionMessageContentPartThinkingSchema,
    ChatCompletionMessageContentPartRedactedThinkingSchema,
    // Allow any other content types for provider-specific extensions (video, audio, file, etc.)
    z
        .object({ type: z.string() })
        .passthrough(),
]);

const ChatCompletionResponseMessageSchema = z.object({
    content: z.string().nullish(),
    tool_calls: ChatCompletionMessageToolCallsSchema.nullish(),
    role: z.literal("assistant"),
    function_call: z
        .object({
            arguments: z.string(),
            name: z.string(),
        })
        .nullish(),
    content_blocks: z.array(ChatCompletionMessageContentBlockSchema).nullish(),
    audio: z
        .object({
            transcript: z.string(),
            data: z.string(), // base64 encoded audio
            id: z.string().optional(),
            expires_at: z.number().int().optional(),
        })
        .nullish(),
    // DeepSeek reasoning format
    reasoning_content: z.string().nullish(),
});

const ChatCompletionTokenTopLogprobSchema = z.object({
    token: z.string(),
    logprob: z.number(),
    bytes: z.array(z.number().int()).nullable(),
});

const ChatCompletionTokenLogprobSchema = z.object({
    token: z.string(),
    logprob: z.number(),
    bytes: z.array(z.number().int()).nullable(),
    top_logprobs: z.array(ChatCompletionTokenTopLogprobSchema),
});

const ChatCompletionChoiceLogprobsSchema = z
    .object({
        content: z.array(ChatCompletionTokenLogprobSchema).nullable(),
    })
    .nullable();

export const CompletionUsageSchema = z
    .object({
        completion_tokens: z.number().int().nonnegative(),
        completion_tokens_details: z
            .object({
                accepted_prediction_tokens: z
                    .number()
                    .int()
                    .nonnegative()
                    .optional(),
                audio_tokens: z.number().int().nonnegative().optional(),
                reasoning_tokens: z.number().int().nonnegative().optional(),
                rejected_prediction_tokens: z
                    .number()
                    .int()
                    .nonnegative()
                    .optional(),
            })
            .nullish(),
        prompt_tokens: z.number().int().nonnegative(),
        prompt_tokens_details: z
            .object({
                audio_tokens: z.number().int().nonnegative().optional(),
                cached_tokens: z.number().int().nonnegative().optional(),
            })
            .nullish(),
        total_tokens: z.number().int().nonnegative(),
    })
    .meta({ $id: "CompletionUsage" });

export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

export const ContentFilterSeveritySchema = z
    .enum(["safe", "low", "medium", "high"])
    .meta({ $id: "ContentFilterSeverity" });

export type ContentFilterSeverity = z.infer<typeof ContentFilterSeveritySchema>;

export const ContentFilterResultSchema = z
    .object({
        hate: z.object({
            filtered: z.boolean(),
            severity: ContentFilterSeveritySchema,
        }),
        self_harm: z.object({
            filtered: z.boolean(),
            severity: ContentFilterSeveritySchema,
        }),
        sexual: z.object({
            filtered: z.boolean(),
            severity: ContentFilterSeveritySchema,
        }),
        violence: z.object({
            filtered: z.boolean(),
            severity: ContentFilterSeveritySchema,
        }),
        jailbreak: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
        protected_material_text: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
        protected_material_code: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
    })
    .partial()
    .meta({ $id: "ContentFilterResult" });

export type ContentFilterResult = z.infer<typeof ContentFilterResultSchema>;

export const PromptFilterResultSchema = z.array(
    z.object({
        prompt_index: z.number().int().nonnegative(),
        content_filter_results: ContentFilterResultSchema.optional(),
    }),
);

const UserTierSchema = z.literal(["anonymous", "seed", "flower", "nectar"]);
export type UserTier = z.infer<typeof UserTierSchema>;

const CompletionChoiceSchema = z.object({
    // Accept any string - backends may return various values (stop, length, error, max_tokens, etc.)
    finish_reason: z.string().nullable().optional(),
    index: z.number().int().nonnegative().optional(), // Optional for non-OpenAI providers
    message: ChatCompletionResponseMessageSchema.optional(), // Optional for non-OpenAI providers
    logprobs: ChatCompletionChoiceLogprobsSchema.nullish(),
    content_filter_results: ContentFilterResultSchema.nullish(),
});

export const CreateChatCompletionResponseSchema = z.object({
    id: z.string(),
    choices: z.array(CompletionChoiceSchema),
    prompt_filter_results: PromptFilterResultSchema.nullish(),
    created: z.number().int(),
    model: z.string(),
    system_fingerprint: z.string().nullish(),
    object: z.literal("chat.completion"),
    usage: CompletionUsageSchema,
    user_tier: UserTierSchema.optional(),
    citations: z.array(z.string()).optional(), // Perplexity citations
});

export type CreateChatCompletionResponse = z.infer<
    typeof CreateChatCompletionResponseSchema
>;

const ChatCompletionMessageToolCallChunkSchema = z.object({
    index: z.number().int().nonnegative(),
    id: z.string().optional(),
    type: z.literal("function").optional(),
    function: z
        .object({
            name: z.string().optional(),
            arguments: z.string().optional(),
        })
        .optional(),
});

const ChatCompletionStreamResponseDeltaSchema = z.object({
    content: z.string().nullable().optional(),
    function_call: z
        .object({
            arguments: z.string().optional(),
            name: z.string().optional(),
        })
        .optional(),
    tool_calls: z.array(ChatCompletionMessageToolCallChunkSchema).optional(),
    role: z.enum(["system", "user", "assistant", "tool"]).optional(),
    // Reasoning/thinking fields for streaming
    reasoning_content: z.string().optional(),
    content_blocks: z.array(ChatCompletionMessageContentBlockSchema).optional(),
});

export const CreateChatCompletionStreamResponseSchema = z.object({
    id: z.string(),
    choices: z.array(
        z.object({
            delta: ChatCompletionStreamResponseDeltaSchema,
            logprobs: ChatCompletionChoiceLogprobsSchema.optional(),
            // Accept any string - backends may return various values
            finish_reason: z.string().nullable().optional(),
            index: z.number().int().nonnegative(),
        }),
    ),
    created: z.number().int(),
    model: z.string(),
    system_fingerprint: z.string().nullish(),
    object: z.literal("chat.completion.chunk"),
    usage: z
        .object({
            completion_tokens: z.number().int(),
            prompt_tokens: z.number().int(),
            total_tokens: z.number().int(),
        })
        .optional(),
});

const OpenAIModelSchema = z
    .object({
        id: z.string(),
        object: z.literal("model"),
        created: z.number(),
    })
    .meta({ description: "OpenAI-compatible model object" });

export const GetModelsResponseSchema = z
    .object({
        object: z.literal("list"),
        data: z.array(OpenAIModelSchema),
    })
    .meta({
        description: "OpenAI-compatible list of available models.",
    });
