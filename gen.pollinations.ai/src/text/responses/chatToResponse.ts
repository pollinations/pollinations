import type {
    CreateResponseRequest,
    CreateResponseResponse,
    ResponseUsage,
} from "@shared/schemas/openai.ts";
import type { EventSourceMessage } from "eventsource-parser/stream";
import { EventSourceParserStream } from "eventsource-parser/stream";
import type { ChatCompletion, ChatMessage, ServiceError } from "../types.js";

type JsonObject = Record<string, unknown>;

function serviceError(message: string, details?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = 502;
    error.details = details;
    return error;
}

function isObject(value: unknown): value is JsonObject {
    return Boolean(value) && typeof value === "object";
}

function num(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : undefined;
}

const encoder = new TextEncoder();

/** OpenAI-style id with a crypto-random suffix (shared by both paths). */
function newId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * Copy the request controls the Responses response object echoes back, so
 * the created / completed / failed envelopes stay consistent.
 */
function echoRequestControls(
    target: JsonObject,
    request: CreateResponseRequest | undefined,
): void {
    if (!request) return;
    if (request.parallel_tool_calls != null) {
        target.parallel_tool_calls = request.parallel_tool_calls;
    }
    if (request.tool_choice !== undefined) {
        target.tool_choice = request.tool_choice;
    }
    if (request.tools !== undefined) {
        target.tools = request.tools;
    }
    if (request.temperature != null) {
        target.temperature = request.temperature;
    }
    if (request.top_p != null) {
        target.top_p = request.top_p;
    }
    if (request.max_output_tokens != null) {
        target.max_output_tokens = request.max_output_tokens;
    }
    if (request.metadata != null) {
        target.metadata = request.metadata;
    }
    if (request.instructions != null) {
        target.instructions = request.instructions;
    }
    if (request.text !== undefined) {
        target.text = request.text;
    }
    if (request.reasoning != null) {
        target.reasoning = request.reasoning;
    }
    if (typeof request.service_tier === "string") {
        target.service_tier = request.service_tier;
    }
    target.store = request.store ?? false;
}

/**
 * Chat usage -> Responses usage (inverse of chatUsage() in chatResponse.ts).
 * Any missing TOP-LEVEL bucket (input/output/total) yields null — success
 * paths must treat null as loud failure, same rule as responsesToChatCompletion
 * requireUsage (a quiet usage:null success violates the response schema).
 */
export function chatUsageToResponsesUsage(
    usage: ChatCompletion["usage"],
): ResponseUsage | null {
    if (!isObject(usage)) return null;
    const prompt = num(usage.prompt_tokens);
    const completion = num(usage.completion_tokens);
    if (prompt === undefined || completion === undefined) {
        return null;
    }
    // Some providers omit total_tokens; derive it instead of failing the
    // whole success path (the response schema requires the field).
    const total = num(usage.total_tokens) ?? prompt + completion;
    const promptDetails = isObject(usage.prompt_tokens_details)
        ? (usage.prompt_tokens_details as JsonObject)
        : {};
    const completionDetails = isObject(usage.completion_tokens_details)
        ? (usage.completion_tokens_details as JsonObject)
        : {};
    // Symmetric with chatUsage() in chatResponse.ts: every bucket it expands
    // must survive the reverse trip or billing/cache aggregates undercount
    // on re-entry.
    const out: JsonObject = {
        input_tokens: prompt,
        output_tokens: completion,
        total_tokens: total,
    };
    // The spec always carries cached_tokens / reasoning_tokens; default them
    // to 0 so SDK consumers never see missing detail buckets.
    const inDetails: JsonObject = {
        cached_tokens: num(promptDetails.cached_tokens) ?? 0,
    };
    for (const k of [
        "cache_creation_input_tokens",
        "cache_write_tokens",
        "audio_tokens",
        "image_tokens",
        "video_tokens",
    ]) {
        const v = promptDetails[k];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
            inDetails[k] = Math.floor(v);
        }
    }
    if (typeof promptDetails.cache_type === "string") {
        inDetails.cache_type = promptDetails.cache_type;
    }
    const outDetails: JsonObject = {
        reasoning_tokens: num(completionDetails.reasoning_tokens) ?? 0,
    };
    for (const k of [
        "audio_tokens",
        "image_tokens",
        "accepted_prediction_tokens",
        "rejected_prediction_tokens",
    ]) {
        const v = completionDetails[k];
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
            outDetails[k] = Math.floor(v);
        }
    }
    const toolDetails = isObject(usage.server_tool_use_details)
        ? (usage.server_tool_use_details as JsonObject)
        : null;
    const webSearchRaw = isObject(toolDetails)
        ? (toolDetails as JsonObject).web_search_requests
        : undefined;
    // Validated like every other bucket — usage feeds billing, so an
    // unvalidated passthrough could smuggle strings/negatives (2026-10-08).
    const webSearch =
        typeof webSearchRaw === "number" &&
        Number.isFinite(webSearchRaw) &&
        webSearchRaw >= 0
            ? Math.floor(webSearchRaw)
            : undefined;
    out.input_tokens_details = inDetails;
    out.output_tokens_details = outDetails;
    if (webSearch !== undefined) {
        out.server_tool_use_details = { web_search_requests: webSearch };
    }
    return out as ResponseUsage;
}

function textContent(message: ChatMessage): string {
    if (typeof message.content === "string") return message.content;
    if (!Array.isArray(message.content)) return "";
    return message.content
        .map((part) => {
            if (!isObject(part) || part.type !== "text") return "";
            return typeof part.text === "string" ? part.text : "";
        })
        .join("");
}

function toolCallsOf(message: ChatMessage): ResponseOutItem[] {
    if (!Array.isArray(message.tool_calls)) return [];
    const out: ResponseOutItem[] = [];
    for (const raw of message.tool_calls) {
        if (!isObject(raw)) {
            throw serviceError(
                "Chat provider returned malformed tool call",
                message.tool_calls,
            );
        }
        const fn = isObject(raw.function) ? raw.function : {};
        // A broken tool flow must fail loudly, never evaporate the call
        // (mirrors chatRequest.ts loud-400).
        if (raw.type !== "function" || typeof fn.name !== "string") {
            throw serviceError(
                "Chat provider returned malformed tool call",
                raw,
            );
        }
        out.push({
            // Synthesize one stable id for both fields: call_id has min(1) in
            // ResponseFunctionCallSchema, so "" would fail re-entry with 502.
            type: "function_call",
            id:
                typeof raw.id === "string" && raw.id
                    ? `fc_${raw.id}`
                    : newId("fc"),
            call_id:
                typeof raw.id === "string" && raw.id ? raw.id : newId("call"),
            name: fn.name,
            arguments:
                typeof fn.arguments === "string"
                    ? fn.arguments
                    : JSON.stringify(fn.arguments ?? {}),
            status: "completed",
        });
    }
    return out;
}

/**
 * Chat completion -> Responses response object (the downhill half of #16674).
 * Inverse of responsesToChatCompletion in chatResponse.ts: every field it reads
 * from a Responses response is produced here, so a Chat -> Responses -> Chat
 * round-trip preserves text, refusal, reasoning, tool calls and usage.
 */
export function chatToResponsesResponse(
    completion: ChatCompletion,
    requestedModel: string,
    request?: CreateResponseRequest,
): CreateResponseResponse {
    if (completion.error) {
        throw serviceError(
            typeof completion.error === "string"
                ? completion.error
                : (completion.error.message ??
                      "Chat provider failed the request"),
            completion.error,
        );
    }
    const choice = completion.choices?.[0];
    if (!choice) {
        throw serviceError("Chat completion has no choices", completion);
    }
    const message = (choice.message ?? {}) as ChatMessage;
    const output: ResponseOutItem[] = [];
    const text = textContent(message);
    // Reasoning items precede the assistant message per the item order.
    if (
        typeof message.reasoning_content === "string" &&
        message.reasoning_content
    ) {
        output.push({
            type: "reasoning",
            id: newId("rs"),
            summary: [
                { type: "summary_text", text: message.reasoning_content },
            ],
        });
    }
    if (text) {
        output.push({
            type: "message",
            id: newId("msg"),
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text, annotations: [] }],
        });
    }
    if (typeof message.refusal === "string" && message.refusal) {
        output.push({
            type: "message",
            id: newId("msg"),
            status: "completed",
            role: "assistant",
            content: [{ type: "refusal", refusal: message.refusal }],
        });
    }
    for (const call of toolCallsOf(message)) output.push(call);

    const mappedUsage = chatUsageToResponsesUsage(completion.usage);
    if (!mappedUsage) {
        // Same rule as the reverse parser: success without usage must fail
        // loudly (the handler rejects it anyway) — never a quiet usage:null.
        throw serviceError(
            "Chat provider omitted valid token usage",
            completion.usage,
        );
    }

    const finish = choice.finish_reason ?? "stop";
    const incomplete =
        finish === "length"
            ? { reason: "max_output_tokens" as const }
            : finish === "content_filter"
              ? { reason: "content_filter" as const }
              : null;
    // Truncated generations mark their message/tool items incomplete, like the
    // terminal response itself.
    const itemStatus =
        finish === "length" ? ("incomplete" as const) : ("completed" as const);
    for (const item of output) {
        if (item.type === "message" || item.type === "function_call") {
            item.status = itemStatus;
        }
    }
    // NOTE: Chat citations/search_results carry URLs only (no offsets), so no
    // valid url_citation annotation can be produced — documented limitation.
    const response: JsonObject = {
        id: newId("resp"),
        object: "response",
        created_at: completion.created ?? Math.floor(Date.now() / 1000),
        model: completion.model ?? requestedModel,
        status: incomplete ? "incomplete" : "completed",
        incomplete_details: incomplete,
        output,
        error: null,
        usage: mappedUsage,
    };
    echoRequestControls(response, request);
    return response as CreateResponseResponse;
}

type ResponseOutItem = JsonObject & { type: string };

/** Minimal sink shared by the transform controller and the pump wrapper. */
type StreamSink = {
    enqueue(chunk: Uint8Array<ArrayBuffer>): void;
};

type AccumulatedCall = {
    id: string;
    name: string;
    arguments: string;
    fcId: string;
    /** output_index fixed at first sight; shared by delta/done/terminal. */
    outIdx: number;
    /** added emitted once the name is known (never with empty name). */
    added: boolean;
    /** call_id used in added, reused by done for consistency. */
    addedCallId: string;
};

function slotKey(raw: JsonObject, calls: Map<string, AccumulatedCall>): string {
    // Index-first: standard OpenAI streaming sends `id` only on the first
    // chunk, so id-first keying orphans later chunks. Id-less and index-less
    // chunks reuse the only open slot when unambiguous, so a single call
    // split across name/arguments chunks stays one call; genuinely parallel
    // open slots get a fresh solo slot and are resolved by the caller.
    if (typeof raw.index === "number") return `idx:${raw.index}`;
    if (typeof raw.id === "string" && raw.id) {
        // An id-only continuation chunk (no index) rejoins the slot that
        // already stored this id instead of opening a phantom nameless slot.
        for (const [key, call] of calls) {
            if (call.id === raw.id) return key;
        }
        return `id:${raw.id}`;
    }
    if (calls.size === 1) return [...calls.keys()][0];
    return `solo:${calls.size}`;
}

/**
 * Stream of Chat SSE chunks -> stream of Responses SSE events.
 * Inverse of responsesToChatStream in chatResponse.ts: emits the event shapes
 * that parser requires — deltas as they arrive, then output_item.done records,
 * then a terminal response.completed|incomplete carrying usage.
 */
export function chatToResponsesStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    requestedModel: string,
    request?: CreateResponseRequest,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const id = newId("resp");
    const created = Math.floor(Date.now() / 1000);
    const msgId = newId("msg");
    const refId = newId("msg");
    const rsId = newId("rs");
    let sequence = 0;
    let terminal = false;
    let createdSent = false;
    // output_index allocation in first-appearance order: every item type
    // (text/refusal/reasoning/each tool) fixes its index when first seen, so
    // delta/done/terminal share it even when tools arrive before text.
    let nextIdx = 0;
    let textIdx = -1;
    let refIdx = -1;
    let rsIdx = -1;
    const textOpen = () => textIdx >= 0;
    const refusalOpen = () => refIdx >= 0;
    const reasoningOpen = () => rsIdx >= 0;
    // Full text, kept for the terminal record: delta-only readers see deltas,
    // terminal-only readers (SDK reassembly, logs, billing post-processing)
    // must still get the body.
    let fullText = "";
    let fullRefusal = "";
    let fullReasoning = "";
    // Tool slots keyed index-first (standard providers send `id` only on the
    // first chunk).
    const calls = new Map<string, AccumulatedCall>();
    let usage: ResponseUsage | null = null;
    let finish = "stop";
    // True once the upstream stream declared its end (finish_reason or [DONE]).
    let sawTerminal = false;

    const envelope = (): JsonObject => {
        const response: JsonObject = {
            id,
            object: "response",
            created_at: created,
            status: "in_progress",
            model: requestedModel,
            output: [],
            error: null,
            incomplete_details: null,
            usage: null,
        };
        echoRequestControls(response, request);
        return response;
    };
    const emit = (controller: StreamSink, event: JsonObject) => {
        event.sequence_number = sequence++;
        const type = typeof event.type === "string" ? event.type : "message";
        controller.enqueue(
            encoder.encode(
                `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
        );
    };
    const ensureCreated = (controller: StreamSink) => {
        if (createdSent) return;
        createdSent = true;
        emit(controller, { type: "response.created", response: envelope() });
        emit(controller, {
            type: "response.in_progress",
            response: envelope(),
        });
    };
    const fail = (controller: StreamSink, message: string) => {
        if (terminal) return;
        ensureCreated(controller);
        emit(controller, {
            type: "response.failed",
            response: {
                ...envelope(),
                status: "failed",
                error: { code: "server_error", message },
            },
        });
        terminal = true;
    };

    // Parser pipeline: decode, flush a trailing blank line at EOF so a final
    // usage chunk without its own separator is not lost, then parse SSE.
    const parsed = source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(
            new TransformStream<string, string>({
                transform(chunk, controller) {
                    controller.enqueue(chunk);
                },
                flush(controller) {
                    controller.enqueue("\n\n");
                },
            }),
        )
        .pipeThrough(new EventSourceParserStream());
    const events = parsed.pipeThrough(
        new TransformStream<EventSourceMessage, Uint8Array<ArrayBuffer>>({
            transform(event, controller) {
                if (terminal) return;
                if (event.data === "[DONE]") {
                    sawTerminal = true;
                    return;
                }
                let payload: JsonObject;
                try {
                    payload = JSON.parse(event.data) as JsonObject;
                } catch {
                    // Non-JSON SSE (keep-alives): ignore, like the reverse parser.
                    return;
                }
                if (isObject(payload.error)) {
                    const msg =
                        typeof payload.error.message === "string"
                            ? payload.error.message
                            : "The model request failed";
                    fail(controller, msg);
                    controller.terminate();
                    return;
                }
                // Usage-first: OpenAI sends the terminal usage chunk as
                // {"choices":[],"usage":{...}} — parsing it after the
                // choice early-return would drop it and fail the stream.
                if (isObject(payload.usage)) {
                    const mapped = chatUsageToResponsesUsage(
                        payload.usage as ChatCompletion["usage"],
                    );
                    if (mapped) usage = mapped;
                }
                const choice = Array.isArray(payload.choices)
                    ? (payload.choices[0] as JsonObject | undefined)
                    : undefined;
                if (!choice || !isObject(choice)) return;
                const delta = isObject(choice.delta) ? choice.delta : {};
                if (typeof choice.finish_reason === "string") {
                    finish = choice.finish_reason;
                    sawTerminal = true;
                }
                const content =
                    typeof delta.content === "string" ? delta.content : "";
                if (content) {
                    ensureCreated(controller);
                    if (!textOpen()) {
                        textIdx = nextIdx++;
                        emit(controller, {
                            type: "response.output_item.added",
                            output_index: textIdx,
                            item: {
                                type: "message",
                                id: msgId,
                                status: "in_progress",
                                role: "assistant",
                                content: [],
                            },
                        });
                        emit(controller, {
                            type: "response.content_part.added",
                            item_id: msgId,
                            output_index: textIdx,
                            content_index: 0,
                            part: {
                                type: "output_text",
                                text: "",
                                annotations: [],
                            },
                        });
                    }
                    fullText += content;
                    emit(controller, {
                        type: "response.output_text.delta",
                        item_id: msgId,
                        output_index: textIdx,
                        content_index: 0,
                        delta: content,
                    });
                }
                const refusal =
                    typeof delta.refusal === "string" ? delta.refusal : "";
                if (refusal) {
                    ensureCreated(controller);
                    if (!refusalOpen()) {
                        refIdx = nextIdx++;
                        emit(controller, {
                            type: "response.output_item.added",
                            output_index: refIdx,
                            item: {
                                type: "message",
                                id: refId,
                                status: "in_progress",
                                role: "assistant",
                                content: [],
                            },
                        });
                        emit(controller, {
                            type: "response.content_part.added",
                            item_id: refId,
                            output_index: refIdx,
                            content_index: 0,
                            part: { type: "refusal", refusal: "" },
                        });
                    }
                    fullRefusal += refusal;
                    emit(controller, {
                        type: "response.refusal.delta",
                        item_id: refId,
                        output_index: refIdx,
                        content_index: 0,
                        delta: refusal,
                    });
                }
                // Chat reasoning stream (DeepSeek-R1 style delta fields),
                // emitted as summary text so the reverse parser can
                // reassemble it.
                const reasoning =
                    typeof delta.reasoning_content === "string"
                        ? delta.reasoning_content
                        : typeof delta.reasoning === "string"
                          ? delta.reasoning
                          : "";
                if (reasoning) {
                    ensureCreated(controller);
                    if (!reasoningOpen()) {
                        rsIdx = nextIdx++;
                        emit(controller, {
                            type: "response.output_item.added",
                            output_index: rsIdx,
                            item: {
                                type: "reasoning",
                                id: rsId,
                                summary: [],
                            },
                        });
                        emit(controller, {
                            type: "response.reasoning_summary_part.added",
                            item_id: rsId,
                            output_index: rsIdx,
                            summary_index: 0,
                            part: { type: "summary_text", text: "" },
                        });
                    }
                    fullReasoning += reasoning;
                    emit(controller, {
                        type: "response.reasoning_summary_text.delta",
                        item_id: rsId,
                        output_index: rsIdx,
                        summary_index: 0,
                        delta: reasoning,
                    });
                }
                const tools = Array.isArray(delta.tool_calls)
                    ? delta.tool_calls
                    : [];
                for (const raw of tools) {
                    if (!isObject(raw)) continue;
                    const fn = isObject(raw.function) ? raw.function : {};
                    const hasIndex = typeof raw.index === "number";
                    const hasId = Boolean(typeof raw.id === "string" && raw.id);
                    const hasName = Boolean(
                        typeof fn.name === "string" && fn.name,
                    );
                    const hasArgs = Boolean(
                        typeof fn.arguments === "string" && fn.arguments,
                    );
                    // Id-less AND index-less continuation: only an
                    // unambiguous single open slot may absorb it; parallel
                    // open slots make the target unknowable — loud-fail
                    // instead of silently misrouting.
                    if (!hasIndex && !hasId && !hasName && hasArgs) {
                        if (calls.size === 1) {
                            const only = [...calls.values()][0];
                            only.arguments += fn.arguments as string;
                            if (!only.fcId) {
                                only.fcId = only.id
                                    ? `fc_${only.id}`
                                    : newId("fc");
                            }
                            // Deltas for an unattributed item would precede
                            // its added event — hold them; the flush
                            // loud-fail (or the later named delta) covers
                            // the flow.
                            if (only.name) {
                                ensureCreated(controller);
                                emit(controller, {
                                    type: "response.function_call_arguments.delta",
                                    item_id: only.fcId,
                                    output_index: only.outIdx,
                                    delta: fn.arguments as string,
                                });
                            }
                            continue;
                        }
                        if (calls.size > 1) {
                            fail(
                                controller,
                                "Chat provider returned ambiguous tool call chunk without index or id",
                            );
                            controller.terminate();
                            return;
                        }
                    }
                    const key = slotKey(raw, calls);
                    let prev = calls.get(key);
                    if (!prev) {
                        // First sight: fix the output_index now so added,
                        // delta, done and terminal share it.
                        prev = {
                            id: "",
                            name: "",
                            arguments: "",
                            fcId: "",
                            outIdx: nextIdx++,
                            added: false,
                            addedCallId: "",
                        };
                        calls.set(key, prev);
                    }
                    if (typeof raw.id === "string" && raw.id) {
                        prev.id = raw.id;
                    }
                    if (typeof fn.name === "string" && fn.name) {
                        prev.name = fn.name;
                    }
                    if (!prev.fcId) {
                        prev.fcId = prev.id ? `fc_${prev.id}` : newId("fc");
                    }
                    // Emit added only once the name is known: emitting it
                    // earlier sends a schema-violating item (name/call_id
                    // min(1)) before the flush loud-fail.
                    if (prev.name && !prev.added) {
                        prev.added = true;
                        prev.addedCallId = prev.id || newId("call");
                        ensureCreated(controller);
                        emit(controller, {
                            type: "response.output_item.added",
                            output_index: prev.outIdx,
                            item: {
                                type: "function_call",
                                id: prev.fcId,
                                call_id: prev.addedCallId,
                                name: prev.name,
                                arguments: "",
                                status: "in_progress",
                            },
                        });
                        // Replay arguments that arrived before the name so
                        // delta reassembly matches the done item.
                        if (prev.arguments) {
                            emit(controller, {
                                type: "response.function_call_arguments.delta",
                                item_id: prev.fcId,
                                output_index: prev.outIdx,
                                delta: prev.arguments,
                            });
                        }
                    }
                    if (typeof fn.arguments === "string") {
                        prev.arguments += fn.arguments;
                        // Same rule as added: no delta for an item that
                        // does not exist yet.
                        if (prev.name && fn.arguments) {
                            ensureCreated(controller);
                            emit(controller, {
                                type: "response.function_call_arguments.delta",
                                item_id: prev.fcId,
                                output_index: prev.outIdx,
                                delta: fn.arguments,
                            });
                        }
                    }
                    calls.set(key, prev);
                }
            },
            flush(controller) {
                if (terminal) return;
                // A stream that never reported a terminal finish_reason (or
                // [DONE]) was cut off mid-flight — never complete it.
                if (!sawTerminal) {
                    fail(
                        controller,
                        "Chat stream ended without a terminal finish_reason",
                    );
                    return;
                }
                // Usage is required on success — same rule as the reverse
                // parser (chatResponse.ts): a text stream with no usage must
                // fail loudly, never emit a quiet usage:null success.
                if (!usage) {
                    fail(
                        controller,
                        "Chat provider omitted valid terminal usage",
                    );
                    return;
                }
                ensureCreated(controller);
                // A tool flow that accumulated arguments (or an id) without
                // a name is malformed — non-stream throws loud-400, and the
                // stream must too; id-only slots must not evaporate through
                // the arguments-only check.
                for (const call of calls.values()) {
                    if (!call.name && (call.arguments || call.id)) {
                        fail(
                            controller,
                            "Chat provider returned malformed tool call",
                        );
                        return;
                    }
                }
                // Truncated generations keep the same status on every item
                // as the terminal response.
                const itemStatus =
                    finish === "length" ? "incomplete" : "completed";
                // Emit done events and terminal output in output_index
                // order so tool-first streams stay self-consistent.
                const indexed: Array<{
                    idx: number;
                    events: JsonObject[];
                    item: ResponseOutItem;
                }> = [];
                if (textOpen()) {
                    indexed.push({
                        idx: textIdx,
                        events: [
                            {
                                type: "response.output_text.done",
                                item_id: msgId,
                                output_index: textIdx,
                                content_index: 0,
                                text: fullText,
                            },
                            {
                                type: "response.content_part.done",
                                item_id: msgId,
                                output_index: textIdx,
                                content_index: 0,
                                part: {
                                    type: "output_text",
                                    text: fullText,
                                    annotations: [],
                                },
                            },
                            {
                                type: "response.output_item.done",
                                output_index: textIdx,
                                item: {
                                    type: "message",
                                    id: msgId,
                                    status: itemStatus,
                                    role: "assistant",
                                    content: fullText
                                        ? [
                                              {
                                                  type: "output_text",
                                                  text: fullText,
                                                  annotations: [],
                                              },
                                          ]
                                        : [],
                                },
                            },
                        ],
                        item: {
                            type: "message",
                            id: msgId,
                            status: itemStatus,
                            role: "assistant",
                            content: fullText
                                ? [
                                      {
                                          type: "output_text",
                                          text: fullText,
                                          annotations: [],
                                      },
                                  ]
                                : [],
                        },
                    });
                }
                if (refusalOpen()) {
                    indexed.push({
                        idx: refIdx,
                        events: [
                            {
                                type: "response.refusal.done",
                                item_id: refId,
                                output_index: refIdx,
                                content_index: 0,
                                refusal: fullRefusal,
                            },
                            {
                                type: "response.content_part.done",
                                item_id: refId,
                                output_index: refIdx,
                                content_index: 0,
                                part: {
                                    type: "refusal",
                                    refusal: fullRefusal,
                                },
                            },
                            {
                                type: "response.output_item.done",
                                output_index: refIdx,
                                item: {
                                    type: "message",
                                    id: refId,
                                    status: itemStatus,
                                    role: "assistant",
                                    content: [
                                        {
                                            type: "refusal",
                                            refusal: fullRefusal,
                                        },
                                    ],
                                },
                            },
                        ],
                        item: {
                            type: "message",
                            id: refId,
                            status: itemStatus,
                            role: "assistant",
                            content: [
                                { type: "refusal", refusal: fullRefusal },
                            ],
                        },
                    });
                }
                if (reasoningOpen()) {
                    indexed.push({
                        idx: rsIdx,
                        events: [
                            {
                                type: "response.reasoning_summary_text.done",
                                item_id: rsId,
                                output_index: rsIdx,
                                summary_index: 0,
                                text: fullReasoning,
                            },
                            {
                                type: "response.reasoning_summary_part.done",
                                item_id: rsId,
                                output_index: rsIdx,
                                summary_index: 0,
                                part: {
                                    type: "summary_text",
                                    text: fullReasoning,
                                },
                            },
                            {
                                type: "response.output_item.done",
                                output_index: rsIdx,
                                item: {
                                    type: "reasoning",
                                    id: rsId,
                                    summary: [
                                        {
                                            type: "summary_text",
                                            text: fullReasoning,
                                        },
                                    ],
                                },
                            },
                        ],
                        item: {
                            type: "reasoning",
                            id: rsId,
                            summary: [
                                {
                                    type: "summary_text",
                                    text: fullReasoning,
                                },
                            ],
                        },
                    });
                }
                for (const call of calls.values()) {
                    if (!call.name) continue;
                    const fcId =
                        call.fcId || (call.id ? `fc_${call.id}` : newId("fc"));
                    // added was deferred until the name was known; a
                    // name-only call (or name in the final chunk) still
                    // needs it, and late ids must not desync added/done.
                    const callId = call.addedCallId || call.id || newId("call");
                    const item = {
                        type: "function_call",
                        id: fcId,
                        call_id: callId,
                        name: call.name,
                        arguments: call.arguments,
                        status: itemStatus,
                    };
                    const events: JsonObject[] = [];
                    if (!call.added) {
                        events.push({
                            type: "response.output_item.added",
                            output_index: call.outIdx,
                            item: {
                                type: "function_call",
                                id: fcId,
                                call_id: callId,
                                name: call.name,
                                arguments: "",
                                status: "in_progress",
                            },
                        });
                        // Replay accumulated arguments so a
                        // delta-reassembling client ends up with the full
                        // call.
                        if (call.arguments) {
                            events.push({
                                type: "response.function_call_arguments.delta",
                                item_id: fcId,
                                output_index: call.outIdx,
                                delta: call.arguments,
                            });
                        }
                    }
                    events.push(
                        {
                            type: "response.function_call_arguments.done",
                            item_id: fcId,
                            output_index: call.outIdx,
                            arguments: call.arguments,
                        },
                        {
                            type: "response.output_item.done",
                            output_index: call.outIdx,
                            item,
                        },
                    );
                    indexed.push({
                        idx: call.outIdx,
                        events,
                        item,
                    });
                }
                indexed.sort((a, b) => a.idx - b.idx);
                const output: ResponseOutItem[] = [];
                for (const entry of indexed) {
                    for (const event of entry.events) {
                        emit(controller, event);
                    }
                    output.push(entry.item);
                }
                const incomplete =
                    finish === "length"
                        ? { reason: "max_output_tokens" as const }
                        : finish === "content_filter"
                          ? { reason: "content_filter" as const }
                          : null;
                emit(controller, {
                    type: incomplete
                        ? "response.incomplete"
                        : "response.completed",
                    response: {
                        ...envelope(),
                        status: incomplete ? "incomplete" : "completed",
                        output,
                        ...(incomplete
                            ? { incomplete_details: incomplete }
                            : {}),
                        usage,
                    },
                });
                terminal = true;
            },
        }),
    );
    // Surface source/parser failures as a response.failed terminal event and
    // always close the client stream (never leave it hanging). The reader is
    // hoisted so a client cancel propagates to the upstream stream.
    let reader:
        | ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>
        | undefined;
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
            reader = events.getReader();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    try {
                        controller.enqueue(value);
                    } catch {
                        // Client cancelled mid-stream; stop pumping.
                        break;
                    }
                }
            } catch (error) {
                try {
                    fail(
                        controller,
                        error instanceof Error
                            ? error.message
                            : "The Chat stream failed",
                    );
                } catch {
                    // Outer stream already closed or cancelled.
                }
            } finally {
                try {
                    controller.close();
                } catch {
                    // Already closed by the failed terminal.
                }
                try {
                    reader.releaseLock();
                } catch {
                    // A pending read still holds the lock; cancellation wins.
                }
            }
        },
        cancel(reason) {
            return reader?.cancel(reason);
        },
    });
}
