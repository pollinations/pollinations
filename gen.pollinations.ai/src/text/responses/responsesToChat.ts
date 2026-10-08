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
    return value as string;
}

function isObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Responses `input_text`/`output_text` item content part -> Chat `text` part.
 * Mirrors messageContent() in chatRequest.ts (which maps Chat `text` to
 * Responses `input_text`/`output_text`).
 */
function textPart(text: unknown, parameter: string): JsonObject {
    return { type: "text", text: requiredText(text, parameter) };
}

function inputTextContent(content: unknown, parameter: string): JsonObject[] {
    if (typeof content === "string") {
        return content ? [textPart(content, parameter)] : [];
    }
    if (!Array.isArray(content)) {
        invalidRequest(parameter, "Unsupported Responses input content");
    }
    const parts: JsonObject[] = [];
    for (const raw of content) {
        if (!isObject(raw)) {
            invalidRequest(parameter, "Unsupported Responses content part");
        }
        if (
            raw.type === "input_text" ||
            raw.type === "text" ||
            raw.type === "output_text"
        ) {
            const t = textPart(raw.text, `${parameter}.text`);
            if ((t.text as string).length) parts.push(t);
        } else if (raw.type === "refusal") {
            // Assistant refusals resend as plain text: Chat has no request-side
            // refusal part.
            const refusal = typeof raw.refusal === "string" ? raw.refusal : "";
            if (refusal) parts.push(textPart(refusal, `${parameter}.refusal`));
        } else if (raw.type === "input_image") {
            const url =
                typeof raw.image_url === "string"
                    ? raw.image_url
                    : isObject(raw.image_url)
                      ? (raw.image_url as JsonObject).url
                      : undefined;
            if (typeof url !== "string" || !url) {
                invalidRequest(
                    parameter,
                    "Responses image content requires an image URL",
                );
            }
            // detail affects tokens/billing/behavior — never silently dropped
            // (mirrors chatRequest.ts which preserves it). Present-but-invalid
            // (e.g. a number from a typo) is a loud 400, not a quiet drop.
            const rawDetail =
                typeof raw.detail !== "undefined"
                    ? raw.detail
                    : isObject(raw.image_url)
                      ? (raw.image_url as JsonObject).detail
                      : undefined;
            if (
                rawDetail !== undefined &&
                rawDetail !== "auto" &&
                rawDetail !== "low" &&
                rawDetail !== "high"
            ) {
                invalidRequest(
                    parameter,
                    `Unsupported image detail: ${String(rawDetail)}`,
                );
            }
            parts.push({
                type: "image_url",
                image_url: {
                    url: url,
                    ...(typeof rawDetail === "string"
                        ? { detail: rawDetail }
                        : {}),
                },
            });
        } else {
            invalidRequest(
                parameter,
                `Unsupported Responses content part: ${String(raw.type ?? "unknown")}`,
            );
        }
    }
    return parts;
}

/**
 * One Responses `input` item -> zero or more Chat messages.
 * Covered item kinds: message-shaped ({role, content}), function_call,
 * function_call_output, reasoning (folded into reasoning_content).
 * Anything else is rejected loudly — silent drops would corrupt tool flows.
 */
function inputItem(item: unknown, index: number): ChatMessage[] {
    const parameter = `input[${index}]`;
    if (typeof item === "string") {
        return item ? [{ role: "user", content: item }] : [];
    }
    if (!isObject(item)) {
        invalidRequest(parameter, "Unsupported Responses input item");
    }
    const kind = item.type;
    if (kind === undefined || kind === "message") {
        const role = item.role;
        if (
            role !== "system" &&
            role !== "developer" &&
            role !== "user" &&
            role !== "assistant"
        ) {
            invalidRequest(
                `${parameter}.role`,
                `Unsupported Responses message role: ${String(role)}`,
            );
        }
        const parts = inputTextContent(item.content, `${parameter}.content`);
        return [
            {
                // Chat has no `developer` role; fold it into system.
                role: role === "developer" ? "system" : (role as string),
                // Chat content arrays require at least one part; an empty
                // message stays a plain empty string instead of [].
                content: parts.length ? parts : "",
            },
        ];
    }
    if (kind === "function_call") {
        if (typeof item.call_id !== "string" || typeof item.name !== "string") {
            invalidRequest(
                parameter,
                "Responses function_call requires call_id and name",
            );
        }
        return [
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: item.call_id,
                        type: "function",
                        function: {
                            name: item.name,
                            arguments:
                                typeof item.arguments === "string"
                                    ? item.arguments
                                    : JSON.stringify(item.arguments ?? {}),
                        },
                    },
                ],
            },
        ];
    }
    if (kind === "function_call_output") {
        if (typeof item.call_id !== "string") {
            invalidRequest(
                parameter,
                "Responses function_call_output requires call_id",
            );
        }
        // Responses allows content parts here; Chat tool messages take a
        // single string, so text parts are concatenated.
        let output: string;
        if (typeof item.output === "string") {
            output = item.output;
        } else if (Array.isArray(item.output)) {
            // Text parts join; anything else is preserved as JSON so no tool
            // output is silently dropped.
            output = item.output
                .map((part) =>
                    isObject(part) && typeof part.text === "string"
                        ? part.text
                        : JSON.stringify(part ?? ""),
                )
                .join("");
        } else {
            output = JSON.stringify(item.output ?? "");
        }
        return [{ role: "tool", tool_call_id: item.call_id, content: output }];
    }
    if (kind === "reasoning") {
        // Folded into the Chat-side `reasoning_content` observability field;
        // chatRequest.ts messageItems restores it to a reasoning item, so both
        // the completion path (chatToResponsesResponse) and the request path
        // (chatToResponsesRequest) round-trip.
        const chunks: string[] = [];
        for (const bucket of [item.summary, item.content]) {
            if (!Array.isArray(bucket)) continue;
            for (const part of bucket) {
                if (isObject(part) && typeof part.text === "string") {
                    chunks.push(part.text);
                }
            }
        }
        if (!chunks.length) return [];
        return [
            {
                role: "assistant",
                content: null,
                reasoning_content: chunks.join("\n"),
            } as ChatMessage,
        ];
    }
    invalidRequest(
        parameter,
        `Unsupported Responses input item type: ${String(kind)}`,
    );
}

function responseTools(tools: unknown[] | undefined): unknown[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((raw): JsonObject => {
        if (!isObject(raw)) {
            invalidRequest("tools", "Invalid Responses tool");
        }
        if (raw.type !== "function") {
            invalidRequest(
                "tools",
                "Only Responses function tools are supported",
            );
        }
        if (typeof raw.name !== "string") {
            invalidRequest("tools", "Function tool name is required");
        }
        const fn: JsonObject = { name: raw.name };
        if (typeof raw.description === "string") {
            fn.description = raw.description;
        }
        if (raw.parameters != null) {
            fn.parameters = raw.parameters;
        }
        if (raw.strict === true) {
            fn.strict = true;
        }
        return { type: "function", function: fn };
    });
}

function responseToolChoice(value: unknown): unknown {
    if (value == null) return undefined;
    if (typeof value === "string") {
        if (value === "none") return "none";
        if (value === "auto" || value === "required") return value;
        invalidRequest("tool_choice", `Unsupported tool_choice: ${value}`);
    }
    if (!isObject(value)) {
        invalidRequest("tool_choice", "Invalid Responses tool_choice");
    }
    if (value.type !== "function" || typeof value.name !== "string") {
        invalidRequest(
            "tool_choice",
            "Only Responses function tool choices are supported",
        );
    }
    return { type: "function", function: { name: value.name } };
}

function responseFormat(value: unknown): TransformOptions["response_format"] {
    if (value == null) return undefined;
    if (!isObject(value)) {
        invalidRequest("text.format", "Invalid Responses text format");
    }
    if (value.type === "text") return { type: "text" };
    if (value.type === "json_object") return { type: "json_object" };
    if (value.type !== "json_schema") {
        invalidRequest("text.format", "Unsupported Responses text format");
    }
    // Chat wire shape is nested ({type, json_schema:{...}}), NOT the flat
    // Responses text.format shape — genericOpenAIClient spreads options
    // verbatim, so a flat shape would reach the provider and silently drop
    // the schema on strict providers.
    if (!isObject(value.schema)) {
        invalidRequest(
            "text.format",
            "JSON schema response format is incomplete",
        );
    }
    return {
        type: "json_schema",
        json_schema: {
            ...(typeof value.name === "string" ? { name: value.name } : {}),
            ...(typeof value.description === "string"
                ? { description: value.description }
                : {}),
            schema: value.schema,
            ...(value.strict === true ? { strict: true } : {}),
        },
    };
}

function rejectUnsupported(request: CreateResponseRequest): void {
    // NOTE: the route schema already constrains store/background to false/null,
    // so these reads go through unknown — defense-in-depth for direct callers
    // (tests, future transports) that bypass route validation.
    const raw = request as unknown as Record<string, unknown>;
    const unsupported: Array<[string, boolean]> = [
        [
            // The adapter cannot produce logprobs or hosted-tool artifacts, so
            // any include would change behavior — reject loudly.
            "include",
            Array.isArray(request.include) && request.include.length > 0,
        ],
        ["top_logprobs", (request.top_logprobs ?? 0) > 0],
        // Explicit "auto" promises server-side truncation the adapter cannot
        // perform — reject loudly instead of a silent no-op. "disabled" (and
        // omission) matches the adapter's never-truncate behavior.
        ["truncation", request.truncation === "auto"],
        ["background", raw.background === true],
        // Stateless uphill adapter: conversation chaining fields would be
        // silently ignored and return a wrong-but-200 answer.
        ["previous_response_id", raw.previous_response_id != null],
        ["conversation", raw.conversation != null],
        ["prompt", raw.prompt != null],
    ];
    const parameter = unsupported.find(([, rejected]) => rejected)?.[0];
    if (parameter) {
        invalidRequest(
            parameter,
            `${parameter} is not supported by the Chat uphill adapter`,
        );
    }
    if (raw.store === true) {
        invalidRequest(
            "store",
            "Only stateless (store=false) requests adapt uphill",
        );
    }
}

/**
 * Responses request -> Chat messages + options (the uphill half of #16674).
 * Inverse of chatToResponsesRequest in chatRequest.ts: every field it emits
 * from Chat must round-trip, and every Responses-only field must either map
 * or reject loudly (never silently dropped where it changes behavior).
 */
export function responsesToChatRequest(request: CreateResponseRequest): {
    messages: ChatMessage[];
    options: TransformOptions;
} {
    rejectUnsupported(request);

    const messages: ChatMessage[] = [];
    if (typeof request.instructions === "string" && request.instructions) {
        messages.push({ role: "system", content: request.instructions });
    }
    const input = request.input;
    if (typeof input !== "string" && !Array.isArray(input)) {
        invalidRequest("input", "Responses input is required");
    }
    const items = typeof input === "string" ? [input] : input;
    items.forEach((item, index) => {
        messages.push(...inputItem(item, index));
    });
    // Merge adjacent function_call items into one assistant message so
    // parallel tool calls resend as a single Chat assistant message with
    // tool_calls[] (Chat has no per-call message shape).
    const merged: ChatMessage[] = [];
    for (const message of messages) {
        const prev = merged[merged.length - 1];
        const toolCallOnly = (m: ChatMessage) =>
            m.role === "assistant" &&
            (m.content == null || m.content === "") &&
            Array.isArray(m.tool_calls);
        // Fold a tool-call item into the previous assistant message (text,
        // reasoning or a previous call list): strict providers reject two
        // consecutive assistant messages, and Chat allows reasoning_content
        // and tool_calls on the same message.
        const mergeTarget = (m: ChatMessage) => m.role === "assistant";
        const reasoningOnly = (m: ChatMessage) =>
            m.role === "assistant" &&
            (m.content == null || m.content === "") &&
            !Array.isArray(m.tool_calls) &&
            typeof m.reasoning_content === "string";
        if (toolCallOnly(message) && prev && mergeTarget(prev)) {
            prev.tool_calls = [
                ...(prev.tool_calls ?? []),
                ...(message.tool_calls ?? []),
            ];
        } else if (
            prev &&
            reasoningOnly(prev) &&
            message.role === "assistant" &&
            !(message.content == null || message.content === "")
        ) {
            // Fold a reasoning-only assistant message into the following
            // assistant message so reasoning + text + tools stay one message.
            merged.pop();
            message.reasoning_content =
                message.reasoning_content == null
                    ? prev.reasoning_content
                    : `${prev.reasoning_content}\n${message.reasoning_content}`;
            merged.push(message);
        } else if (reasoningOnly(message) && prev && mergeTarget(prev)) {
            // A later reasoning-only item joins the previous assistant message
            // (text, calls, or earlier reasoning) instead of starting a
            // consecutive assistant message that strict providers reject.
            prev.reasoning_content =
                prev.reasoning_content == null
                    ? message.reasoning_content
                    : `${prev.reasoning_content}\n${message.reasoning_content}`;
        } else {
            merged.push(message);
        }
    }
    messages.length = 0;
    messages.push(...merged);
    if (!messages.length) {
        invalidRequest("input", "At least one Chat message item is required");
    }

    const options: TransformOptions = { model: request.model };
    if (request.stream) {
        options.stream = true;
        // Uphill adapters must ask the Chat stream for usage, otherwise the
        // terminal Responses event cannot carry any (quiet null usage would
        // violate the success-requires-usage rule).
        // (Responses stream_options only carries include_obfuscation — not
        // forwarded; Chat needs include_usage instead.)
        options.stream_options = { include_usage: true };
    }
    if (request.temperature != null) options.temperature = request.temperature;
    if (request.top_p != null) options.top_p = request.top_p;
    if (request.frequency_penalty != null) {
        options.frequency_penalty = request.frequency_penalty;
    }
    if (request.presence_penalty != null) {
        options.presence_penalty = request.presence_penalty;
    }
    if (request.max_output_tokens != null) {
        options.max_completion_tokens = request.max_output_tokens;
    }
    const tools = responseTools(request.tools);
    if (tools) options.tools = tools;
    const toolChoice = responseToolChoice(request.tool_choice);
    if (toolChoice !== undefined) options.tool_choice = toolChoice;
    if (request.parallel_tool_calls != null) {
        options.parallel_tool_calls = request.parallel_tool_calls;
    }
    const format = responseFormat(request.text?.format);
    if (format) options.response_format = format;
    if (typeof request.reasoning?.effort === "string") {
        options.reasoning_effort = request.reasoning.effort;
    }
    if (request.metadata != null) options.metadata = request.metadata;
    if (typeof request.user === "string") options.user = request.user;
    else if (typeof request.safety_identifier === "string") {
        options.user = request.safety_identifier;
    }
    if (typeof request.service_tier === "string") {
        options.service_tier = request.service_tier;
    }
    if (typeof request.prompt_cache_key === "string") {
        options.prompt_cache_key = request.prompt_cache_key;
    }
    if (request.prompt_cache_options != null) {
        options.prompt_cache_options = request.prompt_cache_options as Record<
            string,
            unknown
        >;
    }
    if (typeof request.prompt_cache_retention === "string") {
        options.prompt_cache_retention = request.prompt_cache_retention;
    }
    // NOTE: max_tool_calls has no Chat equivalent — the Chat side runs tools to
    // completion. Dropping it is documented, not silent: callers needing a cap
    // must enforce it above this adapter.
    return { messages, options };
}
