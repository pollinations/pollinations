import {
    type CreateChatCompletionRequest,
    CreateChatCompletionRequestSchema,
    type CreateResponseRequest,
    type CreateResponseResponse,
} from "@shared/schemas/openai.ts";
import { EventSourceParserStream } from "eventsource-parser/stream";
import type { ChatCompletion, ChatMessage } from "./types.js";

type JsonObject = Record<string, unknown>;

function invalid(parameter: string, message: string): never {
    const error = new Error(`${parameter}: ${message}`) as Error & {
        status: number;
        code: string;
        param: string;
        details: unknown;
    };
    error.status = 400;
    error.code = "invalid_request_error";
    error.param = parameter;
    error.details = {
        error: {
            type: "invalid_request_error",
            code: "unsupported_parameter",
            param: parameter,
            message,
        },
    };
    throw error;
}

function invalidUpstream(message: string): never {
    const error = new Error(message) as Error & { status: number };
    error.status = 502;
    throw error;
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseId(): string {
    return `resp_${crypto.randomUUID().replaceAll("-", "")}`;
}

function itemId(prefix: "msg" | "fc"): string {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function responseContentToChat(content: unknown, parameter: string): unknown {
    if (typeof content === "string") return content;
    if (!Array.isArray(content))
        invalid(parameter, "must be a string or array");

    return content.map((part, index) => {
        const partParameter = `${parameter}[${index}]`;
        if (!isObject(part)) invalid(partParameter, "must be an object");
        if (part.type === "input_text" || part.type === "output_text") {
            if (typeof part.text !== "string") {
                invalid(`${partParameter}.text`, "must be a string");
            }
            return { type: "text", text: part.text };
        }
        if (part.type === "input_image") {
            if (typeof part.image_url !== "string") {
                invalid(
                    `${partParameter}.image_url`,
                    "must be a URL or data URL; file_id is not supported",
                );
            }
            return {
                type: "image_url",
                image_url: {
                    url: part.image_url,
                    ...(typeof part.detail === "string"
                        ? { detail: part.detail }
                        : {}),
                },
            };
        }
        if (part.type === "input_file") {
            if (typeof part.file_data !== "string") {
                invalid(
                    `${partParameter}.file_data`,
                    "is required; file_id storage is not supported",
                );
            }
            return {
                type: "file",
                file: {
                    file_data: part.file_data,
                    ...(typeof part.filename === "string"
                        ? { file_name: part.filename }
                        : {}),
                },
            };
        }
        return invalid(
            `${partParameter}.type`,
            `unsupported content type ${String(part.type)}`,
        );
    });
}

function inputToMessages(input: CreateResponseRequest["input"]): ChatMessage[] {
    if (typeof input === "string") return [{ role: "user", content: input }];

    const messages: ChatMessage[] = [];
    for (let index = 0; index < input.length; index += 1) {
        const item = input[index];
        const parameter = `input[${index}]`;
        if (!isObject(item)) invalid(parameter, "must be an object");

        if (item.type === "message" || item.type === undefined) {
            if (
                item.role !== "user" &&
                item.role !== "assistant" &&
                item.role !== "system" &&
                item.role !== "developer"
            ) {
                invalid(`${parameter}.role`, "is unsupported");
            }
            messages.push({
                role: item.role,
                content: responseContentToChat(
                    item.content,
                    `${parameter}.content`,
                ) as string | unknown[],
            });
            continue;
        }

        if (item.type === "function_call") {
            if (
                typeof item.call_id !== "string" ||
                typeof item.name !== "string" ||
                typeof item.arguments !== "string"
            ) {
                invalid(
                    parameter,
                    "function call is missing call_id, name, or arguments",
                );
            }
            const previous = messages.at(-1);
            const toolCall = {
                id: item.call_id,
                type: "function",
                function: { name: item.name, arguments: item.arguments },
            };
            if (previous?.role === "assistant" && previous.content === null) {
                previous.tool_calls = [
                    ...((previous.tool_calls as unknown[]) || []),
                    toolCall,
                ];
            } else {
                messages.push({
                    role: "assistant",
                    content: null,
                    tool_calls: [toolCall],
                });
            }
            continue;
        }

        if (item.type === "function_call_output") {
            if (typeof item.call_id !== "string") {
                invalid(`${parameter}.call_id`, "must be a string");
            }
            if (typeof item.output !== "string") {
                invalid(`${parameter}.output`, "must be a string");
            }
            messages.push({
                role: "tool",
                tool_call_id: item.call_id,
                content: item.output,
            });
            continue;
        }

        invalid(
            `${parameter}.type`,
            `unsupported item type ${String(item.type)}`,
        );
    }
    return messages;
}

function responseToolsToChat(
    tools: CreateResponseRequest["tools"],
): unknown[] | undefined {
    return tools?.map((tool, index) => {
        if (tool.type !== "function") {
            invalid(
                `tools[${index}].type`,
                "only function tools are supported",
            );
        }
        if (typeof tool.name !== "string") {
            invalid(`tools[${index}].name`, "must be a string");
        }
        return {
            type: "function",
            function: {
                name: tool.name,
                ...(typeof tool.description === "string"
                    ? { description: tool.description }
                    : {}),
                ...(isObject(tool.parameters)
                    ? { parameters: tool.parameters }
                    : {}),
                ...(typeof tool.strict === "boolean"
                    ? { strict: tool.strict }
                    : {}),
            },
        };
    });
}

function responseToolChoiceToChat(toolChoice: unknown): unknown {
    if (!isObject(toolChoice) || toolChoice.type !== "function")
        return toolChoice;
    if (typeof toolChoice.name !== "string") {
        invalid("tool_choice.name", "must be a string");
    }
    return { type: "function", function: { name: toolChoice.name } };
}

function responseFormatToChat(
    text: CreateResponseRequest["text"],
): JsonObject | undefined {
    if (text && Object.keys(text).some((key) => key !== "format")) {
        invalid("text", "only text.format is supported");
    }
    const format = text?.format;
    if (!isObject(format) || format.type === "text") return undefined;
    if (format.type === "json_object") return { type: "json_object" };
    if (format.type === "json_schema") {
        if (typeof format.name !== "string" || !isObject(format.schema)) {
            invalid("text.format", "json_schema requires name and schema");
        }
        return {
            type: "json_schema",
            json_schema: {
                name: format.name,
                schema: format.schema,
                ...(typeof format.description === "string"
                    ? { description: format.description }
                    : {}),
                ...(typeof format.strict === "boolean"
                    ? { strict: format.strict }
                    : {}),
            },
        };
    }
    invalid("text.format.type", `unsupported format ${String(format.type)}`);
}

export function responseRequestToChatRequest(
    request: CreateResponseRequest,
): CreateChatCompletionRequest {
    const messages = inputToMessages(request.input);
    const responseFormat = responseFormatToChat(request.text);
    if (request.instructions) {
        messages.unshift({ role: "developer", content: request.instructions });
    }

    return CreateChatCompletionRequestSchema.parse({
        model: request.model,
        messages: messages as CreateChatCompletionRequest["messages"],
        stream: request.stream,
        ...(request.stream ? { stream_options: { include_usage: true } } : {}),
        ...(request.max_output_tokens != null
            ? { max_completion_tokens: request.max_output_tokens }
            : {}),
        ...(request.reasoning?.effort
            ? { reasoning_effort: request.reasoning.effort }
            : {}),
        ...(request.temperature != null
            ? { temperature: request.temperature }
            : {}),
        ...(request.top_p != null ? { top_p: request.top_p } : {}),
        ...(request.frequency_penalty != null
            ? { frequency_penalty: request.frequency_penalty }
            : {}),
        ...(request.presence_penalty != null
            ? { presence_penalty: request.presence_penalty }
            : {}),
        ...(request.tools ? { tools: responseToolsToChat(request.tools) } : {}),
        ...(request.tool_choice !== undefined
            ? { tool_choice: responseToolChoiceToChat(request.tool_choice) }
            : {}),
        ...(request.parallel_tool_calls !== undefined
            ? { parallel_tool_calls: request.parallel_tool_calls }
            : {}),
        ...(request.user ? { user: request.user } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        safe: request.safe,
    });
}

function chatUsageToResponse(usage: unknown): JsonObject | undefined {
    if (!isObject(usage)) return undefined;
    const inputTokens = Number(usage.prompt_tokens || 0);
    const outputTokens = Number(usage.completion_tokens || 0);
    const promptDetails = isObject(usage.prompt_tokens_details)
        ? usage.prompt_tokens_details
        : {};
    const completionDetails = isObject(usage.completion_tokens_details)
        ? usage.completion_tokens_details
        : {};
    return {
        input_tokens: inputTokens,
        input_tokens_details: {
            cached_tokens: Number(
                promptDetails.cached_tokens ||
                    usage.cache_read_input_tokens ||
                    0,
            ),
        },
        output_tokens: outputTokens,
        output_tokens_details: {
            reasoning_tokens: Number(
                completionDetails.reasoning_tokens ||
                    usage.reasoning_tokens ||
                    0,
            ),
        },
        total_tokens: Number(usage.total_tokens || inputTokens + outputTokens),
    };
}

function baseResponse(
    request: CreateResponseRequest,
    id: string,
    model: string,
    createdAt: number,
): CreateResponseResponse {
    return {
        id,
        object: "response",
        created_at: createdAt,
        completed_at: null,
        model,
        status: "completed",
        incomplete_details: null,
        error: null,
        output: [],
        instructions: request.instructions ?? null,
        metadata: request.metadata || {},
        parallel_tool_calls: request.parallel_tool_calls ?? true,
        tool_choice: request.tool_choice ?? "auto",
        tools: (request.tools || []).map((tool) => ({
            ...tool,
            description:
                typeof tool.description === "string" ? tool.description : null,
            parameters: isObject(tool.parameters) ? tool.parameters : null,
            strict: typeof tool.strict === "boolean" ? tool.strict : null,
        })),
        temperature: request.temperature ?? 1,
        top_p: request.top_p ?? 1,
        frequency_penalty: request.frequency_penalty ?? 0,
        presence_penalty: request.presence_penalty ?? 0,
        top_logprobs: 0,
        max_output_tokens: request.max_output_tokens ?? null,
        max_tool_calls: null,
        previous_response_id: null,
        store: false,
        background: false,
        reasoning: request.reasoning
            ? {
                  effort: request.reasoning.effort ?? null,
                  summary: null,
              }
            : null,
        text: request.text || { format: { type: "text" } },
        truncation: "disabled",
        service_tier: "default",
        safety_identifier: null,
        prompt_cache_key: null,
        usage: null,
    };
}

export function chatCompletionToResponse(
    completion: ChatCompletion,
    request: CreateResponseRequest,
): CreateResponseResponse {
    const choice = completion.choices?.[0];
    if (!choice?.message)
        invalidUpstream("Upstream returned no assistant message");
    const id = responseId();
    const created = Number(completion.created || Math.floor(Date.now() / 1000));
    const createdAt =
        created > 10_000_000_000 ? Math.floor(created / 1000) : created;
    const response = baseResponse(
        request,
        id,
        completion.model || request.model,
        createdAt,
    );
    response.completed_at = Math.floor(Date.now() / 1000);
    const message = choice.message;
    const output: (JsonObject & { type: string })[] = [];
    if (typeof message.content === "string") {
        output.push({
            type: "message",
            id: itemId("msg"),
            status: "completed",
            role: "assistant",
            content: [
                {
                    type: "output_text",
                    text: message.content,
                    annotations: [],
                },
            ],
        });
        response.output_text = message.content;
    }
    if (Array.isArray(message.tool_calls)) {
        for (const [index, rawCall] of message.tool_calls.entries()) {
            if (
                !isObject(rawCall) ||
                !isObject(rawCall.function) ||
                typeof rawCall.function.name !== "string" ||
                typeof rawCall.function.arguments !== "string"
            ) {
                invalidUpstream(
                    `Upstream returned an invalid tool call at choices[0].message.tool_calls[${index}]`,
                );
            }
            output.push({
                type: "function_call",
                id: itemId("fc"),
                call_id:
                    typeof rawCall.id === "string" ? rawCall.id : itemId("fc"),
                name: String(rawCall.function.name || ""),
                arguments: String(rawCall.function.arguments || ""),
                status: "completed",
            });
        }
    }
    response.output = output;
    response.usage = (chatUsageToResponse(completion.usage) ??
        null) as CreateResponseResponse["usage"];
    if (choice.finish_reason === "length") {
        response.status = "incomplete";
        response.incomplete_details = { reason: "max_output_tokens" };
    } else if (choice.finish_reason === "content_filter") {
        response.status = "incomplete";
        response.incomplete_details = { reason: "content_filter" };
    }
    return response;
}

export function responsesErrorResponse(error: unknown): Response {
    const value = error as {
        message?: unknown;
        code?: unknown;
        param?: unknown;
    };
    return Response.json(
        {
            error: {
                message:
                    typeof value.message === "string"
                        ? value.message
                        : "Invalid Responses API request",
                type: "invalid_request_error",
                param: typeof value.param === "string" ? value.param : null,
                code:
                    typeof value.code === "string"
                        ? value.code
                        : "invalid_request_error",
            },
        },
        { status: 400 },
    );
}

function encodeEvent(type: string, data: JsonObject): Uint8Array {
    return new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
    );
}

export function chatCompletionStreamToResponseStream(
    source: ReadableStream<Uint8Array>,
    request: CreateResponseRequest,
): ReadableStream<Uint8Array> {
    const id = responseId();
    const createdAt = Math.floor(Date.now() / 1000);
    const response = baseResponse(request, id, request.model, createdAt);
    response.status = "in_progress";
    const message = {
        type: "message",
        id: itemId("msg"),
        status: "in_progress",
        role: "assistant",
        content: [] as JsonObject[],
    };
    let text = "";
    let textStarted = false;
    let sequence = 0;
    let usage: JsonObject | undefined;
    let finishReason: string | null = null;
    let failed = false;
    let nextOutputIndex = 0;
    let messageOutputIndex: number | undefined;
    const toolCalls = new Map<
        number,
        { item: JsonObject & { type: string }; outputIndex: number }
    >();

    const emit = (
        controller: TransformStreamDefaultController<Uint8Array>,
        type: string,
        data: JsonObject,
    ) => {
        controller.enqueue(
            encodeEvent(type, { sequence_number: sequence++, ...data }),
        );
    };

    const parsed = source
        .pipeThrough(
            new TextDecoderStream() as TransformStream<Uint8Array, string>,
        )
        .pipeThrough(new EventSourceParserStream());

    return parsed.pipeThrough(
        new TransformStream<unknown, Uint8Array>({
            start(controller) {
                emit(controller, "response.created", {
                    response: { ...response, status: "in_progress" },
                });
                emit(controller, "response.in_progress", { response });
            },
            transform(event, controller) {
                const dataText = isObject(event) ? event.data : undefined;
                if (dataText === "[DONE]") return;
                if (typeof dataText !== "string" || failed) return;
                let chunk: JsonObject;
                try {
                    const parsedChunk = JSON.parse(dataText);
                    if (!isObject(parsedChunk))
                        throw new Error("not an object");
                    chunk = parsedChunk;
                } catch {
                    const error = {
                        code: "server_error",
                        message: "Upstream returned malformed streaming JSON",
                        param: null,
                    };
                    failed = true;
                    response.status = "failed";
                    response.error = error;
                    emit(controller, "error", {
                        error: { type: "server_error", ...error },
                    });
                    return;
                }
                if (isObject(chunk.error)) {
                    failed = true;
                    response.status = "failed";
                    response.error = chunk.error;
                    emit(controller, "error", {
                        error: {
                            type: "server_error",
                            code: chunk.error.code || "server_error",
                            message:
                                chunk.error.message ||
                                "Upstream streaming error",
                            param: chunk.error.param || null,
                        },
                    });
                    return;
                }
                if (typeof chunk.model === "string")
                    response.model = chunk.model;
                if (chunk.usage) usage = chatUsageToResponse(chunk.usage);
                const choices = Array.isArray(chunk.choices)
                    ? chunk.choices
                    : [];
                const choice = isObject(choices[0]) ? choices[0] : undefined;
                if (!choice) return;
                if (typeof choice.finish_reason === "string") {
                    finishReason = choice.finish_reason;
                }
                const delta = isObject(choice.delta) ? choice.delta : {};
                if (
                    typeof delta.content === "string" &&
                    delta.content.length > 0
                ) {
                    if (!textStarted) {
                        textStarted = true;
                        messageOutputIndex = nextOutputIndex++;
                        emit(controller, "response.output_item.added", {
                            output_index: messageOutputIndex,
                            item: message,
                        });
                        emit(controller, "response.content_part.added", {
                            item_id: message.id,
                            output_index: messageOutputIndex,
                            content_index: 0,
                            part: {
                                type: "output_text",
                                text: "",
                                annotations: [],
                            },
                        });
                    }
                    text += delta.content;
                    emit(controller, "response.output_text.delta", {
                        item_id: message.id,
                        output_index: messageOutputIndex,
                        content_index: 0,
                        delta: delta.content,
                    });
                }
                if (Array.isArray(delta.tool_calls)) {
                    for (const rawDelta of delta.tool_calls) {
                        if (!isObject(rawDelta)) continue;
                        const index = Number(rawDelta.index || 0);
                        const fn = isObject(rawDelta.function)
                            ? rawDelta.function
                            : {};
                        let trackedCall = toolCalls.get(index);
                        const isNewCall = !trackedCall;
                        if (!trackedCall) {
                            const item = {
                                type: "function_call",
                                id: itemId("fc"),
                                call_id:
                                    typeof rawDelta.id === "string"
                                        ? rawDelta.id
                                        : itemId("fc"),
                                name:
                                    typeof fn.name === "string" ? fn.name : "",
                                arguments: "",
                                status: "in_progress",
                            };
                            trackedCall = {
                                item,
                                outputIndex: nextOutputIndex++,
                            };
                            toolCalls.set(index, trackedCall);
                            emit(controller, "response.output_item.added", {
                                output_index: trackedCall.outputIndex,
                                item,
                            });
                        }
                        const { item: call, outputIndex } = trackedCall;
                        if (typeof rawDelta.id === "string")
                            call.call_id = rawDelta.id;
                        if (!isNewCall && typeof fn.name === "string") {
                            call.name = `${String(call.name)}${fn.name}`;
                        }
                        if (typeof fn.arguments === "string") {
                            call.arguments = `${String(call.arguments)}${fn.arguments}`;
                            emit(
                                controller,
                                "response.function_call_arguments.delta",
                                {
                                    item_id: call.id,
                                    output_index: outputIndex,
                                    delta: fn.arguments,
                                },
                            );
                        }
                    }
                }
            },
            flush(controller) {
                const output: Array<{
                    item: JsonObject & { type: string };
                    outputIndex: number;
                }> = [];
                if (textStarted) {
                    const part = { type: "output_text", text, annotations: [] };
                    message.content = [part];
                    message.status = "completed";
                    output.push({
                        item: message,
                        outputIndex: messageOutputIndex as number,
                    });
                    emit(controller, "response.output_text.done", {
                        item_id: message.id,
                        output_index: messageOutputIndex,
                        content_index: 0,
                        text,
                    });
                    emit(controller, "response.content_part.done", {
                        item_id: message.id,
                        output_index: messageOutputIndex,
                        content_index: 0,
                        part,
                    });
                    emit(controller, "response.output_item.done", {
                        output_index: messageOutputIndex,
                        item: message,
                    });
                }
                for (const { item: call, outputIndex } of toolCalls.values()) {
                    call.status = "completed";
                    output.push({ item: call, outputIndex });
                    emit(controller, "response.function_call_arguments.done", {
                        item_id: call.id,
                        output_index: outputIndex,
                        arguments: call.arguments,
                    });
                    emit(controller, "response.output_item.done", {
                        output_index: outputIndex,
                        item: call,
                    });
                }
                response.output = output
                    .sort((a, b) => a.outputIndex - b.outputIndex)
                    .map(({ item }) => item);
                response.output_text = text;
                response.usage = (usage ??
                    null) as CreateResponseResponse["usage"];
                response.completed_at = Math.floor(Date.now() / 1000);
                if (failed) {
                    emit(controller, "response.failed", { response });
                } else {
                    const incompleteReason =
                        finishReason === "length"
                            ? "max_output_tokens"
                            : finishReason === "content_filter"
                              ? "content_filter"
                              : null;
                    response.status = incompleteReason
                        ? "incomplete"
                        : "completed";
                    if (incompleteReason) {
                        response.incomplete_details = {
                            reason: incompleteReason,
                        };
                        emit(controller, "response.incomplete", { response });
                    } else {
                        emit(controller, "response.completed", { response });
                    }
                }
                controller.enqueue(
                    new TextEncoder().encode("data: [DONE]\n\n"),
                );
            },
        }),
    );
}

export function responsesStreamResponse(
    chatResponse: Response,
    request: CreateResponseRequest,
): Response {
    if (!chatResponse.body)
        invalid("response", "upstream returned an empty stream");
    const headers = new Headers(chatResponse.headers);
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Cache-Control", "no-cache");
    return new Response(
        chatCompletionStreamToResponseStream(chatResponse.body, request),
        { status: chatResponse.status, headers },
    );
}
