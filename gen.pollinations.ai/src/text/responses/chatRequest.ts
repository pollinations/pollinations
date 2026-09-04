import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import type { ChatMessage, ServiceError, TransformOptions } from "../types.js";

type JsonObject = Record<string, unknown>;

function invalidRequest(parameter: string, message: string): never {
    const error = new Error(message) as ServiceError;
    error.status = 400;
    error.errorCode = "unsupported_parameter";
    error.details = { param: parameter };
    throw error;
}

function requiredText(value: unknown, parameter: string): string {
    if (typeof value !== "string") {
        invalidRequest(parameter, `${parameter} must be a string`);
    }
    return value;
}

function promptCacheBreakpoint(value: JsonObject): JsonObject | undefined {
    if (value.prompt_cache_breakpoint !== undefined) {
        const breakpoint = value.prompt_cache_breakpoint;
        if (
            !breakpoint ||
            typeof breakpoint !== "object" ||
            Array.isArray(breakpoint) ||
            (breakpoint as JsonObject).mode !== "explicit"
        ) {
            invalidRequest(
                "messages.content.prompt_cache_breakpoint",
                'prompt_cache_breakpoint must be { "mode": "explicit" }',
            );
        }
        return { mode: "explicit" };
    }
    if (value.cache_control !== undefined) {
        const cacheControl = value.cache_control;
        if (
            !cacheControl ||
            typeof cacheControl !== "object" ||
            Array.isArray(cacheControl) ||
            (cacheControl as JsonObject).type !== "ephemeral"
        ) {
            invalidRequest(
                "messages.content.cache_control",
                'cache_control must be { "type": "ephemeral" }',
            );
        }
        return { mode: "explicit" };
    }
    return undefined;
}

function withPromptCacheBreakpoint(
    content: JsonObject,
    source: JsonObject,
): JsonObject {
    const breakpoint = promptCacheBreakpoint(source);
    return breakpoint
        ? { ...content, prompt_cache_breakpoint: breakpoint }
        : content;
}

function hasPromptCacheBreakpoint(items: JsonObject[]): boolean {
    return items.some(
        (item) =>
            Array.isArray(item.content) &&
            item.content.some(
                (part) =>
                    part != null &&
                    typeof part === "object" &&
                    "prompt_cache_breakpoint" in part,
            ),
    );
}

function messageContent(
    message: ChatMessage,
    output: boolean,
    allowImages = false,
): JsonObject[] {
    if (typeof message.content === "string") {
        return message.content
            ? [
                  {
                      type: output ? "output_text" : "input_text",
                      text: message.content,
                  },
              ]
            : [];
    }
    if (message.content == null) return [];
    if (!Array.isArray(message.content)) {
        invalidRequest("messages", "Unsupported Chat message content");
    }

    return message.content.flatMap((raw): JsonObject[] => {
        if (!raw || typeof raw !== "object") {
            invalidRequest("messages", "Unsupported Chat content part");
        }
        const part = raw as JsonObject;
        if (part.type === "text" || part.type === "input_text") {
            return [
                withPromptCacheBreakpoint(
                    {
                        type: output ? "output_text" : "input_text",
                        text: requiredText(part.text, "messages.content.text"),
                    },
                    part,
                ),
            ];
        }
        if (output && part.type === "refusal") {
            return [
                withPromptCacheBreakpoint(
                    {
                        type: "refusal",
                        refusal: requiredText(
                            part.refusal,
                            "messages.content.refusal",
                        ),
                    },
                    part,
                ),
            ];
        }
        if (
            !output &&
            allowImages &&
            (part.type === "image_url" || part.type === "input_image")
        ) {
            const image = part.image_url;
            const imageUrl =
                typeof image === "string"
                    ? image
                    : image && typeof image === "object"
                      ? (image as JsonObject).url
                      : undefined;
            if (typeof imageUrl !== "string" || !imageUrl) {
                invalidRequest(
                    "messages",
                    "Chat image content requires an image URL",
                );
            }
            const detail =
                image && typeof image === "object"
                    ? (image as JsonObject).detail
                    : part.detail;
            return [
                withPromptCacheBreakpoint(
                    {
                        type: "input_image",
                        image_url: imageUrl,
                        ...(typeof detail === "string" ? { detail } : {}),
                    },
                    part,
                ),
            ];
        }
        return invalidRequest(
            "messages",
            `Unsupported Chat content part: ${String(part.type ?? "unknown")}`,
        );
    });
}

function functionCalls(message: ChatMessage): JsonObject[] {
    if (message.function_call != null) {
        invalidRequest(
            "messages.function_call",
            "Legacy Chat function calls are not supported by this model",
        );
    }
    if (!Array.isArray(message.tool_calls)) return [];

    return message.tool_calls.map((raw): JsonObject => {
        if (!raw || typeof raw !== "object") {
            invalidRequest("messages.tool_calls", "Invalid Chat tool call");
        }
        const call = raw as JsonObject;
        const fn = call.function;
        if (
            call.type !== "function" ||
            !fn ||
            typeof fn !== "object" ||
            typeof call.id !== "string"
        ) {
            invalidRequest(
                "messages.tool_calls",
                "Only named Chat function tool calls are supported",
            );
        }
        const definition = fn as JsonObject;
        if (typeof definition.name !== "string") {
            invalidRequest("messages.tool_calls", "Tool call name is required");
        }
        return {
            type: "function_call",
            call_id: call.id,
            name: definition.name,
            arguments:
                typeof definition.arguments === "string"
                    ? definition.arguments
                    : JSON.stringify(definition.arguments ?? {}),
        };
    });
}

function messageItems(message: ChatMessage): JsonObject[] {
    if (["system", "developer", "user"].includes(message.role)) {
        const content = messageContent(message, false, message.role === "user");
        const messageBreakpoint = promptCacheBreakpoint(message);
        if (messageBreakpoint && content.length) {
            content[content.length - 1].prompt_cache_breakpoint =
                messageBreakpoint;
        }
        return [
            {
                role: message.role,
                content,
            },
        ];
    }
    if (message.role === "assistant") {
        const content = messageContent(message, true);
        if (message.refusal != null) {
            content.push({
                type: "refusal",
                refusal: requiredText(message.refusal, "messages.refusal"),
            });
        }
        const messageBreakpoint = promptCacheBreakpoint(message);
        if (messageBreakpoint && content.length) {
            content[content.length - 1].prompt_cache_breakpoint =
                messageBreakpoint;
        }
        return [
            ...(content.length ? [{ role: "assistant", content }] : []),
            ...functionCalls(message),
        ];
    }
    if (message.role === "tool") {
        if (typeof message.tool_call_id !== "string") {
            invalidRequest(
                "messages.tool_call_id",
                "Chat tool output requires tool_call_id",
            );
        }
        const output = (() => {
            if (typeof message.content === "string") return message.content;
            if (message.content == null) return "";
            if (!Array.isArray(message.content)) {
                invalidRequest(
                    "messages.content",
                    "Chat tool output must be text",
                );
            }
            return message.content
                .map((raw) => {
                    if (
                        !raw ||
                        typeof raw !== "object" ||
                        (raw as JsonObject).type !== "text"
                    ) {
                        invalidRequest(
                            "messages.content",
                            "Only text Chat tool output is supported",
                        );
                    }
                    return requiredText(
                        (raw as JsonObject).text,
                        "messages.content.text",
                    );
                })
                .join("");
        })();
        return [
            {
                type: "function_call_output",
                call_id: message.tool_call_id,
                output,
            },
        ];
    }
    invalidRequest(
        "messages.role",
        `Unsupported Chat message role: ${message.role}`,
    );
}

function functionTools(tools: unknown[] | undefined): JsonObject[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((raw): JsonObject => {
        if (!raw || typeof raw !== "object") {
            invalidRequest("tools", "Invalid Chat tool");
        }
        const tool = raw as JsonObject;
        const fn = tool.function;
        if (tool.type !== "function" || !fn || typeof fn !== "object") {
            invalidRequest("tools", "Only Chat function tools are supported");
        }
        const definition = fn as JsonObject;
        if (typeof definition.name !== "string") {
            invalidRequest("tools", "Function tool name is required");
        }
        return {
            type: "function",
            name: definition.name,
            ...(typeof definition.description === "string"
                ? { description: definition.description }
                : {}),
            ...(definition.parameters === undefined
                ? {}
                : { parameters: definition.parameters }),
            strict: definition.strict === true,
        };
    });
}

function toolChoice(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    const choice = value as JsonObject;
    if (choice.type !== "function") {
        invalidRequest(
            "tool_choice",
            "Only Chat function tool choices are supported",
        );
    }
    const fn = choice.function;
    if (
        !fn ||
        typeof fn !== "object" ||
        typeof (fn as JsonObject).name !== "string"
    ) {
        invalidRequest("tool_choice", "Function tool choice requires a name");
    }
    return { type: "function", name: (fn as JsonObject).name };
}

function responseFormat(
    value: TransformOptions["response_format"],
): JsonObject | undefined {
    if (!value) return undefined;
    if (value.type === "text") return { type: "text" };
    if (value.type === "json_object") return { type: "json_object" };
    if (value.type !== "json_schema") {
        invalidRequest("response_format", "Unsupported Chat response format");
    }
    const jsonSchema = value.json_schema;
    if (!jsonSchema || typeof jsonSchema !== "object") {
        invalidRequest(
            "response_format",
            "JSON schema response format is incomplete",
        );
    }
    const schema = jsonSchema as JsonObject;
    return {
        type: "json_schema",
        name: schema.name,
        ...(typeof schema.description === "string"
            ? { description: schema.description }
            : {}),
        schema: schema.schema,
        strict: schema.strict === true,
    };
}

function rejectUnsupported(options: TransformOptions): void {
    const unsupported: Array<[string, boolean]> = [
        ["n", options.n != null && options.n !== 1],
        ["stop", options.stop != null],
        ["seed", options.seed != null],
        ["logit_bias", options.logit_bias != null],
        ["logprobs", options.logprobs === true],
        ["top_logprobs", options.top_logprobs != null],
        ["repetition_penalty", options.repetition_penalty != null],
        ["functions", options.functions != null],
        ["function_call", options.function_call != null],
        ["web_search_options", options.web_search_options != null],
        ["audio", options.audio != null],
        ["previous_response_id", options.previous_response_id != null],
        ["conversation", options.conversation != null],
        ["background", options.background === true],
        ["store", options.store === true],
        [
            "include",
            Array.isArray(options.include) && options.include.length > 0,
        ],
    ];
    const parameter = unsupported.find(([, rejected]) => rejected)?.[0];
    if (parameter) {
        invalidRequest(
            parameter,
            `${parameter} is not supported by this model's stateless Responses adapter`,
        );
    }
    if (
        Array.isArray(options.modalities) &&
        options.modalities.some((modality) => modality !== "text")
    ) {
        invalidRequest(
            "modalities",
            "Only text output is supported by the stateless Responses adapter",
        );
    }
}

export function chatToResponsesRequest(
    messages: ChatMessage[],
    options: TransformOptions,
): CreateResponseRequest {
    rejectUnsupported(options);
    if (!options.model) {
        invalidRequest("model", "Model is required");
    }

    const tools = functionTools(options.tools);
    const format = responseFormat(options.response_format);
    const maxOutputTokens = options.max_completion_tokens ?? options.max_tokens;
    const input = messages.flatMap(messageItems);
    if (!input.length) {
        invalidRequest(
            "messages",
            "At least one Chat message item is required",
        );
    }

    const request: CreateResponseRequest = {
        model: options.model,
        input,
        store: false,
        stream: options.stream === true,
        safe: undefined,
    };
    if (typeof options.reasoning_effort === "string") {
        request.reasoning = {
            effort: options.reasoning_effort,
            ...(options.reasoning_effort === "none" ? {} : { summary: "auto" }),
        };
    }
    if (maxOutputTokens != null) request.max_output_tokens = maxOutputTokens;
    if (options.temperature != null) request.temperature = options.temperature;
    if (options.top_p != null) request.top_p = options.top_p;
    if (options.frequency_penalty != null) {
        request.frequency_penalty = options.frequency_penalty;
    }
    if (options.presence_penalty != null) {
        request.presence_penalty = options.presence_penalty;
    }
    if (typeof options.user === "string") {
        request.safety_identifier = options.user;
    }
    if (typeof options.service_tier === "string") {
        request.service_tier = options.service_tier;
    }
    if (typeof options.prompt_cache_key === "string") {
        request.prompt_cache_key = options.prompt_cache_key;
    }
    if (
        options.prompt_cache_options &&
        typeof options.prompt_cache_options === "object"
    ) {
        request.prompt_cache_options =
            options.prompt_cache_options as CreateResponseRequest["prompt_cache_options"];
    } else if (hasPromptCacheBreakpoint(input)) {
        request.prompt_cache_options = { mode: "explicit" };
    }
    if (typeof options.prompt_cache_retention === "string") {
        request.prompt_cache_retention =
            options.prompt_cache_retention as CreateResponseRequest["prompt_cache_retention"];
    }
    if (format) request.text = { format };
    if (tools) request.tools = tools as CreateResponseRequest["tools"];
    if (options.tool_choice != null) {
        request.tool_choice = toolChoice(options.tool_choice);
    }
    if (typeof options.parallel_tool_calls === "boolean") {
        request.parallel_tool_calls = options.parallel_tool_calls;
    }
    return request;
}
