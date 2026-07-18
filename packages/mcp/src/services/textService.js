import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    createMCPResponse,
    createTextContent,
    postChatCompletion,
} from "../utils/coreUtils.js";
import { getTextModels } from "../utils/models.js";

async function chatCompletion(params) {
    requireApiKey();

    const {
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
        reasoning_effort,
        tools,
        tool_choice,
        parallel_tool_calls,
    } = params;

    const response = await postChatCompletion({
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
        reasoning_effort,
        tools,
        tool_choice,
        parallel_tool_calls,
    });

    return createMCPResponse([createTextContent(await response.json(), true)]);
}

async function listTextModels() {
    return createMCPResponse([createTextContent(await getTextModels(), true)]);
}

const messageSchema = z.object({
    role: z
        .enum(["system", "user", "assistant", "tool", "developer"])
        .describe("Message role"),
    content: z
        .union([z.string(), z.array(z.any())])
        .describe("Text or multimodal message content"),
    name: z.string().optional().describe("Participant name"),
    tool_call_id: z
        .string()
        .optional()
        .describe("Tool call ID for tool results"),
    tool_calls: z
        .array(z.any())
        .optional()
        .describe("Tool calls from an assistant message"),
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
        .describe("Tool type"),
    function: z
        .object({
            name: z.string(),
            description: z.string().optional(),
            parameters: z.record(z.any()).optional(),
            strict: z.boolean().optional(),
        })
        .optional()
        .describe("Function definition when type is 'function'"),
});

const responseFormatSchema = z.object({
    type: z.enum(["text", "json_object", "json_schema"]),
    json_schema: z
        .object({
            name: z.string().optional(),
            description: z.string().optional(),
            schema: z.record(z.any()),
            strict: z.boolean().optional(),
        })
        .optional(),
});

const chatParamsSchema = {
    messages: z.array(messageSchema).min(1).describe("Conversation messages"),
    model: z
        .string()
        .optional()
        .describe(
            "Text model or alias. Omit for the Gen default; use listTextModels for the live registry.",
        ),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    repetition_penalty: z.number().min(0).max(2).optional(),
    seed: z.number().int().min(0).optional(),
    stop: z.union([z.string(), z.array(z.string()).max(4)]).optional(),
    response_format: responseFormatSchema.optional(),
    reasoning_effort: z
        .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
        .optional(),
    tools: z.array(toolSchema).optional(),
    tool_choice: z
        .union([
            z.enum(["none", "auto", "required"]),
            z.object({
                type: z.literal("function"),
                function: z.object({ name: z.string() }),
            }),
        ])
        .optional(),
    parallel_tool_calls: z.boolean().optional(),
};

export const textTools = [
    [
        "chatCompletion",
        "Proxy an OpenAI-compatible chat completion through Gen and return its raw JSON response.",
        chatParamsSchema,
        chatCompletion,
    ],
    [
        "listTextModels",
        "Return the live text model registry from Gen.",
        {},
        listTextModels,
    ],
];
