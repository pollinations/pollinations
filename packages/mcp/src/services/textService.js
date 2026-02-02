import {
    createMCPResponse,
    createTextContent,
    API_BASE_URL,
    parseApiError,
} from "../utils/coreUtils.js";
import { getTextModels, validateTextModel } from "../utils/modelCache.js";
import { getAuthHeaders, requireApiKey } from "../utils/authUtils.js";
import { z } from "zod";

async function generateText(params) {
    requireApiKey();

    const {
        prompt,
        model = "openai",
        seed,
        system,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        json: jsonMode,
        private: isPrivate,
    } = params;

    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt is required and must be a string");
    }

    const validation = await validateTextModel(model);
    if (!validation.valid) {
        throw new Error(
            `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                `Use listTextModels to see all ${validation.availableCount} available models.`,
        );
    }

    const messages = [];
    if (system) {
        messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: prompt });

    const requestBody = {
        messages,
        model,
        seed,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        stream: false,
    };

    if (jsonMode) {
        requestBody.response_format = { type: "json_object" };
    }

    const cleanedBody = {};
    Object.entries(requestBody).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            cleanedBody[key] = value;
        }
    });

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(cleanedBody),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const errorText = await response
                .text()
                .catch(() => "Unknown error");
            if (response.status === 429) {
                throw new Error("Rate limited. Please wait before retrying.");
            }
            throw new Error(parseApiError(response.status, errorText));
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";

        return createMCPResponse([createTextContent(content)]);
    } catch (error) {
        console.error("Error generating text:", error);
        throw error;
    }
}

async function chatCompletion(params) {
    requireApiKey();

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
        thinking,
        reasoning_effort,
        thinking_budget,
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

    const validation = await validateTextModel(model);
    if (!validation.valid) {
        throw new Error(
            `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                `Use listTextModels to see all ${validation.availableCount} available models.`,
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
        thinking,
        reasoning_effort,
        thinking_budget,
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

    const cleanedBody = {};
    Object.entries(requestBody).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            cleanedBody[key] = value;
        }
    });

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(cleanedBody),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const errorText = await response
                .text()
                .catch(() => "Unknown error");
            if (response.status === 429) {
                throw new Error("Rate limited. Please wait before retrying.");
            }
            throw new Error(parseApiError(response.status, errorText));
        }

        const result = await response.json();

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
                    user_tier: result.user_tier,
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

async function listTextModels(params) {
    try {
        const models = await getTextModels();

        const generalModels = models.filter((m) => !m.is_specialized);
        const specializedModels = models.filter((m) => m.is_specialized);
        const reasoningModels = models.filter((m) => m.reasoning);
        const audioModels = models.filter(
            (m) =>
                m.output_modalities?.includes("audio") ||
                m.name === "openai-audio",
        );
        const visionModels = models.filter(
            (m) => m.input_modalities?.includes("image") || m.vision,
        );
        const toolCapableModels = models.filter((m) => m.tools);

        const result = {
            models: models.map((m) => ({
                name: m.name,
                description: m.description,
                aliases: m.aliases || [],
                inputModalities: m.input_modalities,
                outputModalities: m.output_modalities,
                tools: m.tools,
                reasoning: m.reasoning,
                voices: m.voices,
                isSpecialized: m.is_specialized,
            })),
            categories: {
                general: generalModels.map((m) => m.name),
                specialized: specializedModels.map((m) => m.name),
                reasoning: reasoningModels.map((m) => m.name),
                audio: audioModels.map((m) => m.name),
                vision: visionModels.map((m) => m.name),
                toolCapable: toolCapableModels.map((m) => m.name),
            },
            summary: {
                totalModels: models.length,
                generalModels: generalModels.length,
                reasoningModels: reasoningModels.length,
                audioModels: audioModels.length,
                visionModels: visionModels.length,
                toolCapableModels: toolCapableModels.length,
            },
            usage: {
                simple: "Use generateText for simple prompts",
                advanced:
                    "Use chatCompletion for multi-turn conversations, tool calling, audio output",
                reasoning:
                    "True reasoning models: kimi-k2-thinking, perplexity-reasoning, openai-large, gemini-large. Use reasoning_effort or thinking params",
                audio: "Use openai-audio with modalities=['text','audio'] for voice output",
            },
        };

        return createMCPResponse([createTextContent(result, true)]);
    } catch (error) {
        console.error("Error listing text models:", error);
        throw error;
    }
}

async function webSearch(params) {
    requireApiKey();

    const { query, model = "perplexity-fast", detailed = false } = params;

    if (!query || typeof query !== "string") {
        throw new Error("Query is required and must be a string");
    }

    const searchModels = [
        "perplexity-fast",
        "perplexity-reasoning",
        "gemini-search",
    ];
    if (!searchModels.includes(model)) {
        throw new Error(
            `Model "${model}" doesn't support web search. Use: ${searchModels.join(", ")}`,
        );
    }

    const systemPrompt = detailed
        ? "Search the web and provide a comprehensive answer with sources. Include relevant details and cite your sources."
        : "Search the web and provide a concise, accurate answer. Include source URLs.";

    const requestBody = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
        ],
    };

    try {
        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response
                .text()
                .catch(() => "Unknown error");
            throw new Error(parseApiError(response.status, errorText));
        }

        const result = await response.json();
        const answer = result.choices?.[0]?.message?.content || "";

        const responseData = {
            answer,
            query,
            model: result.model || model,
        };

        if (result.citations?.length > 0) {
            responseData.sources = result.citations;
        }

        return createMCPResponse([createTextContent(responseData, true)]);
    } catch (error) {
        console.error("Error in web search:", error);
        throw error;
    }
}

async function getPricing(params) {
    const { type = "all" } = params;

    try {
        const results = {};

        if (type === "all" || type === "text") {
            const textModels = await getTextModels();
            results.textModels = textModels
                .map((m) => ({
                    name: m.name,
                    description: m.description,
                    pricing: m.pricing,
                }))
                .filter((m) => m.pricing);
        }

        if (type === "all" || type === "image") {
            const { getImageModels } = await import("../utils/modelCache.js");
            const imageModels = await getImageModels();
            results.imageModels = imageModels
                .map((m) => ({
                    name: m.name,
                    description: m.description,
                    pricing: m.pricing,
                }))
                .filter((m) => m.pricing);
        }

        results.currency = "pollen";
        results.note = "Prices are in pollen. 1 pollen = $0.001 USD";

        return createMCPResponse([createTextContent(results, true)]);
    } catch (error) {
        console.error("Error getting pricing:", error);
        throw error;
    }
}

const textParamsSchema = {
    prompt: z
        .string()
        .describe("Text prompt to generate a response for (required)"),
    model: z
        .string()
        .optional()
        .describe(
            "Text model to use (default: 'openai'). Popular options:\n" +
                "- openai/openai-fast/openai-large: GPT models (balanced/fast/powerful)\n" +
                "- claude/claude-fast/claude-large: Anthropic Claude models\n" +
                "- gemini/gemini-fast/gemini-large: Google Gemini models\n" +
                "- deepseek: Advanced reasoning model\n" +
                "- grok: xAI's Grok model\n" +
                "- mistral, qwen-coder, perplexity-fast, perplexity-reasoning\n" +
                "Use listTextModels for complete list.",
        ),
    seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Random seed for reproducible results"),
    system: z
        .string()
        .optional()
        .describe(
            "System prompt to set context/behavior. Example: 'You are a helpful coding assistant'",
        ),
    temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe(
            "Controls creativity (default: 1). 0 = deterministic, 2 = very creative",
        ),
    max_tokens: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Maximum tokens to generate. Leave empty for model default"),
    top_p: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
            "Nucleus sampling (default: 1). Alternative to temperature. Use one or the other",
        ),
    frequency_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Reduce repetition of token sequences (-2 to 2, default: 0)"),
    presence_penalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Reduce repetition of topics (-2 to 2, default: 0)"),
    json: z
        .boolean()
        .optional()
        .describe(
            "Return response in JSON format (default: false). Model will output valid JSON",
        ),
    private: z
        .boolean()
        .optional()
        .describe("Hide from public feeds (default: false)"),
};

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
        .enum([
            "alloy",
            "echo",
            "fable",
            "onyx",
            "nova",
            "shimmer",
            "coral",
            "verse",
            "ballad",
            "ash",
            "sage",
            "amuch",
            "dan",
        ])
        .describe("Voice for audio output"),
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

const thinkingSchema = z.object({
    type: z
        .enum(["enabled", "disabled"])
        .describe("Enable/disable thinking mode"),
    budget_tokens: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Token budget for thinking"),
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
            "Text model (default: 'openai'). See listTextModels for all options",
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
    thinking: thinkingSchema
        .optional()
        .describe(
            "Thinking mode for reasoning models. Use with kimi-k2-thinking, perplexity-reasoning, openai-large, gemini-large",
        ),
    reasoning_effort: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe(
            "Reasoning effort level. Works with reasoning models like kimi-k2-thinking, openai-large",
        ),
    thinking_budget: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Token budget for model thinking/reasoning"),
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
        "Generate text from a simple prompt. Easy-to-use text generation with essential parameters. For advanced features (tool calling, multi-turn, audio), use chatCompletion instead.",
        textParamsSchema,
        generateText,
    ],
    [
        "chatCompletion",
        "OpenAI-compatible chat completions with ALL parameters. Supports:\n- Multi-turn conversations with message history\n- Function/tool calling for AI agents\n- Audio input/output (openai-audio model)\n- Reasoning mode (kimi-k2-thinking, perplexity-reasoning, openai-large, gemini-large)\n- JSON/structured output\n- Built-in Gemini tools (google_search, code_execution, etc.)\n- Perplexity web search with citations",
        chatParamsSchema,
        chatCompletion,
    ],
    [
        "listTextModels",
        "List all available text generation models with their capabilities. Shows which models support reasoning, tools, audio, vision, etc. Models are fetched dynamically from the API.",
        {},
        listTextModels,
    ],
    [
        "webSearch",
        "Search the web for real-time information using search-enabled models. Returns answers with source citations. Great for current events, facts, research.",
        {
            query: z.string().describe("The search query or question"),
            model: z
                .enum([
                    "perplexity-fast",
                    "perplexity-reasoning",
                    "gemini-search",
                ])
                .optional()
                .describe(
                    "Search model (default: 'perplexity-fast'):\n- perplexity-fast: Quick answers with web search\n- perplexity-reasoning: Deeper analysis with web search\n- gemini-search: Google's Gemini with Google Search",
                ),
            detailed: z
                .boolean()
                .optional()
                .describe(
                    "Get comprehensive answer with more details (default: false)",
                ),
        },
        webSearch,
    ],
    [
        "getPricing",
        "Get pricing information for all models. Shows cost per token/image in pollen.",
        {
            type: z
                .enum(["all", "text", "image"])
                .optional()
                .describe("Which models to get pricing for (default: 'all')"),
        },
        getPricing,
    ],
];
