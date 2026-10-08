import type { CreateResponseResponse } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import { isPlainObject } from "../utils/objectCleaners.js";
import { chatCompletionToResponse } from "./chatAdaptedRequest.js";

type JsonObject = Record<string, unknown>;

/**
 * Chat Completions SSE -> Responses SSE state machine (plan v2, must-fix 2/7).
 *
 * Event order: response.created, response.in_progress, then per output item
 * (in first-appearance order): response.output_item.added, content/summary or
 * arguments deltas, matching done events; a terminal response.completed /
 * response.incomplete / response.failed carrying the full assembled response
 * with usage; then a trailing `data: [DONE]`.
 *
 * - Items open lazily: a tool-only completion never emits an empty message.
 * - A reasoning item (provider `reasoning_content` deltas) closes before the
 *   next item kind opens.
 * - sequence_number increases strictly from 0 across all events.
 * - The terminal envelope reuses the exact item payloads and ids that were
 *   streamed: closed items are preserved in emission order, so output indexes
 *   in the final response match every preceding output_item.* event.
 * - EOF or [DONE] without a usage chunk yields an `error` event (code
 *   usage_missing): the chat pipeline's stream validator is the primary
 *   guard, this is the defensive net - a response must never go unbilled
 *   silently.
 */

type Emitter = (event: JsonObject) => void;

function sseFrame(event: JsonObject): Uint8Array {
    const type = String(event.type);
    return new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
}

const DONE_FRAME = new TextEncoder().encode("data: [DONE]\n\n");

function newItemId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

class ResponsesStreamAssembler {
    private sequence = 0;
    private outputIndex = -1;
    private responseId = newItemId("resp");
    private createdAt = Math.floor(Date.now() / 1000);
    private started = false;

    private reasoningItem: {
        id: string;
        text: string;
        partOpen: boolean;
    } | null = null;
    private messageItem: {
        id: string;
        text: string;
        refusal: string;
        textIndex: number | null;
        refusalIndex: number | null;
        contentCount: number;
    } | null = null;
    private toolItems = new Map<
        number,
        { id: string; callId: string; name: string; args: string }
    >();
    /** Final item payloads in emission order - the terminal response output. */
    private completedItems: JsonObject[] = [];
    private itemOrder: string[] = [];
    private finishReason: string | null = null;
    private usage: JsonObject | null = null;
    private terminated = false;

    constructor(
        private readonly modelId: string,
        private readonly emit: Emitter,
    ) {}

    private event(type: string, fields: JsonObject) {
        this.emit({
            type,
            sequence_number: this.sequence,
            ...fields,
        });
        this.sequence += 1;
    }

    private start() {
        if (this.started) return;
        this.started = true;
        const shell = this.responseShell("in_progress", [], null);
        this.event("response.created", { response: shell });
        this.event("response.in_progress", { response: shell });
    }

    private responseShell(
        status: string,
        output: JsonObject[],
        usage: JsonObject | null,
    ): JsonObject {
        return {
            id: this.responseId,
            object: "response",
            created_at: this.createdAt,
            model: this.modelId,
            status,
            output,
            usage,
        };
    }

    private trackOrder(id: string) {
        if (!this.itemOrder.includes(id)) this.itemOrder.push(id);
    }

    private outputIndexFor(id: string): number {
        return this.itemOrder.indexOf(id);
    }

    private openReasoning() {
        if (this.reasoningItem) return;
        this.outputIndex += 1;
        this.reasoningItem = { id: newItemId("rs"), text: "", partOpen: true };
        this.trackOrder(this.reasoningItem.id);
        this.event("response.output_item.added", {
            output_index: this.outputIndex,
            item: {
                id: this.reasoningItem.id,
                type: "reasoning",
                summary: [],
            },
        });
        this.event("response.reasoning_summary_part.added", {
            output_index: this.outputIndex,
            item_id: this.reasoningItem.id,
            summary_index: 0,
            part: { type: "summary_text", text: "" },
        });
    }

    private openMessage() {
        if (this.messageItem) return;
        this.outputIndex += 1;
        this.messageItem = {
            id: newItemId("msg"),
            text: "",
            refusal: "",
            textIndex: null,
            refusalIndex: null,
            contentCount: 0,
        };
        this.trackOrder(this.messageItem.id);
        this.event("response.output_item.added", {
            output_index: this.outputIndex,
            item: {
                id: this.messageItem.id,
                type: "message",
                status: "in_progress",
                role: "assistant",
                content: [],
            },
        });
    }

    private openTextPart(item: NonNullable<typeof this.messageItem>) {
        if (item.textIndex !== null) return;
        item.textIndex = item.contentCount;
        item.contentCount += 1;
        this.event("response.content_part.added", {
            output_index: this.outputIndexFor(item.id),
            item_id: item.id,
            content_index: item.textIndex,
            part: { type: "output_text", text: "", annotations: [] },
        });
    }

    private openRefusalPart(item: NonNullable<typeof this.messageItem>) {
        if (item.refusalIndex !== null) return;
        item.refusalIndex = item.contentCount;
        item.contentCount += 1;
        this.event("response.content_part.added", {
            output_index: this.outputIndexFor(item.id),
            item_id: item.id,
            content_index: item.refusalIndex,
            part: { type: "refusal", refusal: "" },
        });
    }

    private closeReasoning() {
        const item = this.reasoningItem;
        if (!item) return;
        if (item.partOpen) {
            this.event("response.reasoning_summary_text.done", {
                output_index: this.outputIndexFor(item.id),
                item_id: item.id,
                summary_index: 0,
                text: item.text,
            });
            this.event("response.reasoning_summary_part.done", {
                output_index: this.outputIndexFor(item.id),
                item_id: item.id,
                summary_index: 0,
                part: { type: "summary_text", text: item.text },
            });
        }
        const payload = {
            id: item.id,
            type: "reasoning",
            summary: [{ type: "summary_text", text: item.text }],
        };
        this.event("response.output_item.done", {
            output_index: this.outputIndexFor(item.id),
            item: payload,
        });
        this.completedItems.push(payload);
        this.reasoningItem = null;
    }

    private closeMessage() {
        const item = this.messageItem;
        if (!item) return;
        // Close parts in the order they opened; indexes stay the ones the
        // client saw in content_part.added.
        const openParts = [
            item.textIndex !== null
                ? { index: item.textIndex, kind: "text" as const }
                : null,
            item.refusalIndex !== null
                ? { index: item.refusalIndex, kind: "refusal" as const }
                : null,
        ]
            .filter((part) => part !== null)
            .sort((a, b) => a.index - b.index);
        const parts: JsonObject[] = [];
        for (const open of openParts) {
            if (open.kind === "text") {
                this.event("response.output_text.done", {
                    output_index: this.outputIndexFor(item.id),
                    item_id: item.id,
                    content_index: open.index,
                    text: item.text,
                });
                const part = {
                    type: "output_text",
                    text: item.text,
                    annotations: [],
                };
                this.event("response.content_part.done", {
                    output_index: this.outputIndexFor(item.id),
                    item_id: item.id,
                    content_index: open.index,
                    part,
                });
                parts.push(part);
                continue;
            }
            this.event("response.refusal.done", {
                output_index: this.outputIndexFor(item.id),
                item_id: item.id,
                content_index: open.index,
                refusal: item.refusal,
            });
            const part = { type: "refusal", refusal: item.refusal };
            this.event("response.content_part.done", {
                output_index: this.outputIndexFor(item.id),
                item_id: item.id,
                content_index: open.index,
                part,
            });
            parts.push(part);
        }
        const payload = {
            id: item.id,
            type: "message",
            status: "completed",
            role: "assistant",
            content: parts,
        };
        this.event("response.output_item.done", {
            output_index: this.outputIndexFor(item.id),
            item: payload,
        });
        this.completedItems.push(payload);
        this.messageItem = null;
    }

    private openToolItem(index: number, call: JsonObject) {
        this.closeReasoning();
        this.closeMessage();
        const fn = isPlainObject(call.function) ? call.function : {};
        const item = {
            id: newItemId("fc"),
            callId: typeof call.id === "string" ? call.id : "",
            name: typeof fn.name === "string" ? fn.name : "",
            args: "",
        };
        this.toolItems.set(index, item);
        this.outputIndex += 1;
        this.trackOrder(item.id);
        this.event("response.output_item.added", {
            output_index: this.outputIndexFor(item.id),
            item: {
                id: item.id,
                type: "function_call",
                call_id: item.callId,
                name: item.name,
                arguments: "",
                status: "in_progress",
            },
        });
    }

    private closeToolItem(index: number) {
        const item = this.toolItems.get(index);
        if (!item) return;
        this.event("response.function_call_arguments.done", {
            output_index: this.outputIndexFor(item.id),
            item_id: item.id,
            arguments: item.args,
        });
        const payload = {
            id: item.id,
            type: "function_call",
            call_id: item.callId,
            name: item.name,
            arguments: item.args,
            status: "completed",
        };
        this.event("response.output_item.done", {
            output_index: this.outputIndexFor(item.id),
            item: payload,
        });
        this.completedItems.push(payload);
        this.toolItems.delete(index);
    }

    /**
     * Close every still-open item in first-appearance order, so the terminal
     * response output matches the streamed output_index sequence exactly -
     * even for exotic interleavings like text after tool calls.
     */
    private closeAllInOrder() {
        for (;;) {
            const openId = this.itemOrder.find(
                (id) =>
                    this.reasoningItem?.id === id ||
                    this.messageItem?.id === id ||
                    [...this.toolItems.values()].some((tool) => tool.id === id),
            );
            if (!openId) return;
            if (this.reasoningItem?.id === openId) {
                this.closeReasoning();
                continue;
            }
            if (this.messageItem?.id === openId) {
                this.closeMessage();
                continue;
            }
            const entry = [...this.toolItems.entries()].find(
                ([, tool]) => tool.id === openId,
            );
            if (entry) this.closeToolItem(entry[0]);
        }
    }

    feed(chunk: JsonObject) {
        if (this.terminated) return;
        this.start();
        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const choice = choices[0];
        if (isPlainObject(chunk.usage)) this.usage = chunk.usage;

        if (isPlainObject(choice)) {
            const delta = isPlainObject(choice.delta) ? choice.delta : {};
            const reasoningDelta =
                typeof delta.reasoning_content === "string"
                    ? delta.reasoning_content
                    : typeof delta.reasoning === "string"
                      ? delta.reasoning
                      : "";
            if (reasoningDelta) {
                if (!this.reasoningItem) {
                    this.closeMessage();
                    this.openReasoning();
                }
                const item = this.reasoningItem;
                if (item) {
                    item.text += reasoningDelta;
                    this.event("response.reasoning_summary_text.delta", {
                        output_index: this.outputIndexFor(item.id),
                        item_id: item.id,
                        summary_index: 0,
                        delta: reasoningDelta,
                    });
                }
            }
            const textDelta =
                typeof delta.content === "string" ? delta.content : "";
            if (textDelta) {
                if (!this.messageItem) {
                    this.closeReasoning();
                    this.openMessage();
                }
                const item = this.messageItem;
                if (item) {
                    this.openTextPart(item);
                    item.text += textDelta;
                    this.event("response.output_text.delta", {
                        output_index: this.outputIndexFor(item.id),
                        item_id: item.id,
                        content_index: 0,
                        delta: textDelta,
                    });
                }
            }
            const refusalDelta =
                typeof delta.refusal === "string" ? delta.refusal : "";
            if (refusalDelta) {
                if (!this.messageItem) {
                    this.closeReasoning();
                    this.openMessage();
                }
                const item = this.messageItem;
                if (item) {
                    this.openRefusalPart(item);
                    item.refusal += refusalDelta;
                    this.event("response.refusal.delta", {
                        output_index: this.outputIndexFor(item.id),
                        item_id: item.id,
                        content_index: item.refusalIndex ?? 0,
                        delta: refusalDelta,
                    });
                }
            }
            const toolCalls = Array.isArray(delta.tool_calls)
                ? delta.tool_calls
                : [];
            for (const raw of toolCalls) {
                if (!isPlainObject(raw)) continue;
                const index = typeof raw.index === "number" ? raw.index : 0;
                let item = this.toolItems.get(index);
                if (!item) {
                    this.openToolItem(index, raw);
                    item = this.toolItems.get(index);
                    if (!item) continue;
                }
                const fn = isPlainObject(raw.function) ? raw.function : {};
                if (typeof fn.name === "string" && fn.name && !item.name) {
                    item.name = fn.name;
                }
                if (typeof raw.id === "string" && raw.id && !item.callId) {
                    item.callId = raw.id;
                }
                if (typeof fn.arguments === "string" && fn.arguments) {
                    item.args += fn.arguments;
                    this.event("response.function_call_arguments.delta", {
                        output_index: this.outputIndexFor(item.id),
                        item_id: item.id,
                        delta: fn.arguments,
                    });
                }
            }
            if (typeof choice.finish_reason === "string") {
                this.finishReason = choice.finish_reason;
            }
        }

        // A usage-bearing chunk without choices still terminates the stream.
        if (this.usage && (choices.length === 0 || this.finishReason)) {
            this.finish();
        }
    }

    private terminalResponse(): CreateResponseResponse {
        // Status/usage mapping stays with the shared non-stream converter;
        // the output comes from the items actually streamed (ids and order).
        const synthetic = {
            id: this.responseId,
            created: this.createdAt,
            choices: [
                {
                    finish_reason: this.finishReason ?? "stop",
                    message: { role: "assistant", content: "" },
                },
            ],
            usage: this.usage,
        };
        const response = chatCompletionToResponse(
            synthetic as never,
            this.modelId,
        );
        return {
            ...response,
            output: this.completedItems,
        } as CreateResponseResponse;
    }

    finish() {
        if (this.terminated) return;
        this.terminated = true;
        this.closeAllInOrder();
        if (!this.usage) {
            // Defensive: [DONE] without a usage chunk is unbillable; the chat
            // stream validator is the primary guard, this is the net.
            this.event("error", {
                code: "usage_missing",
                message:
                    "Chat provider stream ended without a terminal usage chunk",
                param: null,
            });
            return;
        }
        const response = this.terminalResponse();
        const status = response.status;
        const type =
            status === "completed"
                ? "response.completed"
                : status === "incomplete"
                  ? "response.incomplete"
                  : "response.failed";
        this.event(type, { response });
    }

    /** Returns true when a terminal event was already emitted. */
    endOfStream(): boolean {
        if (this.terminated) return true;
        this.terminated = true;
        // Defensive: the chat stream validator should have failed the stream
        // already. Never let a silently unbilled stream end cleanly.
        this.event("error", {
            code: "usage_missing",
            message:
                "Chat provider stream ended without a terminal usage chunk",
            param: null,
        });
        return false;
    }
}

/**
 * Convert a Chat Completions SSE byte stream into a Responses SSE byte
 * stream. The parser lives for the whole stream so partial SSE lines and
 * split UTF-8 sequences survive chunk boundaries; cancellation propagates to
 * the source reader. An upstream [DONE] terminates the converted stream
 * immediately - an idle-but-open provider connection cannot stall the client.
 */
export function chatStreamToResponsesStream(
    body: ReadableStream<Uint8Array>,
    modelId: string,
): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let closed = false;
    let doneReceived = false;

    // The controller is captured in start(); events emit into it.
    let streamController: ReadableStreamDefaultController<Uint8Array> | null =
        null;
    let emitted = 0;
    const assembler = new ResponsesStreamAssembler(modelId, (event) => {
        emitted += 1;
        streamController?.enqueue(sseFrame(event));
    });
    const parser = createParser({
        onEvent(message) {
            if (message.data === "[DONE]") {
                assembler.finish();
                doneReceived = true;
                return;
            }
            let chunk: unknown;
            try {
                chunk = JSON.parse(message.data);
            } catch {
                return; // keepalive comments / malformed lines
            }
            if (isPlainObject(chunk)) assembler.feed(chunk);
        },
    });
    return new ReadableStream<Uint8Array>({
        start(controller) {
            streamController = controller;
        },
        async pull(controller) {
            if (closed) return;
            // Keep reading until this pull produces output: a chat chunk that
            // emits no events (role prelude, empty deltas) must not stall the
            // stream - some runtimes never re-pull after an empty pull.
            for (;;) {
                const before = emitted;
                const { done, value } = await reader.read();
                if (done) {
                    closed = true;
                    const hadTerminal = assembler.endOfStream();
                    if (hadTerminal) controller.enqueue(DONE_FRAME);
                    controller.close();
                    return;
                }
                parser.feed(decoder.decode(value, { stream: true }));
                if (doneReceived) {
                    // The upstream ended its logical stream; close without
                    // waiting for transport EOF and release the source.
                    closed = true;
                    if (assembler.endOfStream()) {
                        controller.enqueue(DONE_FRAME);
                    }
                    controller.close();
                    await reader.cancel().catch(() => {});
                    return;
                }
                if (emitted > before) return;
            }
        },
        async cancel(reason) {
            closed = true;
            await reader.cancel(reason).catch(() => {});
        },
    });
}
