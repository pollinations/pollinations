import type {
    ChatRouting,
    ChatStreamChunk,
    Message,
    MessageContentPart,
    Pollinations,
    PollinationsAgentEvent,
} from "@pollinations/sdk";
import type {
    ChatTransport,
    DynamicToolUIPart,
    FinishReason,
    UIMessage,
    UIMessageChunk,
} from "ai";
import {
    buildUserContent,
    extractStreamedMedia,
    parseAgentMessage,
    type RenderedMedia,
} from "./chat-models";

export interface PreparedAttachment {
    id: string;
    name: string;
    mimeType: string;
    kind: "image" | "video" | "audio" | "file";
    url: string;
    contentPart: MessageContentPart;
}

export interface PollinationsMessageMetadata {
    attachments?: PreparedAttachment[];
    localOnly?: boolean;
}

export type PollinationsChatData = {
    activity: {
        callId: string;
        name: string;
        status: "running" | "complete" | "failed";
    };
    media: RenderedMedia;
    responseStatus: { status: "cancelled" };
};

export type PollinationsUIMessage = UIMessage<
    PollinationsMessageMetadata,
    PollinationsChatData
>;

type PollinationsChatClient = Pick<Pollinations, "chatEventStream">;

interface PollinationsChatTransportOptions {
    client: PollinationsChatClient | null;
    model: string | null;
    routing?: ChatRouting;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "&#39;");
}

function outputText(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

function serializeToolPart(part: DynamicToolUIPart): string {
    const failed = part.state === "output-error";
    const result = failed
        ? part.errorText
        : part.state === "output-available"
          ? part.output
          : undefined;
    const details =
        `<details type="tool_calls" done="true" ` +
        `id="${escapeHtml(part.toolCallId)}" ` +
        `name="${escapeHtml(part.toolName)}" ` +
        `arguments="${escapeHtml(outputText(part.input ?? {}))}">\n` +
        `<summary>${failed ? "Tool Failed" : "Tool Executed"}</summary>\n` +
        `${escapeHtml(outputText(result))}\n` +
        "</details>";
    return details;
}

function mediaMarkdown(media: RenderedMedia): string {
    const label = media.label || `Generated ${media.kind}`;
    return media.kind === "image"
        ? `![${label}](<${media.url}>)`
        : `[${label}](<${media.url}>)`;
}

function messageText(message: PollinationsUIMessage): string {
    return message.parts
        .map((part) => {
            if (part.type === "text") return part.text;
            if (part.type === "dynamic-tool") return serializeToolPart(part);
            if (part.type === "data-media") return mediaMarkdown(part.data);
            return "";
        })
        .filter(Boolean)
        .join("\n\n");
}

/** Convert UI messages to the existing OpenAI-compatible Pollinations input. */
export function messagesForPollinations(
    messages: PollinationsUIMessage[],
): Message[] {
    return messages.flatMap((message): Message[] => {
        if (message.metadata?.localOnly) return [];
        if (message.role === "user") {
            const text = message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("\n");
            return [
                {
                    role: "user",
                    content: buildUserContent(
                        text,
                        (message.metadata?.attachments ?? []).map(
                            (attachment) => attachment.contentPart,
                        ),
                    ),
                },
            ];
        }

        const content = messageText(message).trim();
        return content ? [{ role: message.role, content }] : [];
    });
}

function finishReason(chunk: ChatStreamChunk): FinishReason | undefined {
    switch (chunk.choices[0]?.finish_reason) {
        case "stop":
        case "length":
        case "tool_calls":
            return chunk.choices[0].finish_reason.replace(
                "_",
                "-",
            ) as FinishReason;
        case "content_filter":
            return "content-filter";
        case "function_call":
            return "tool-calls";
        default:
            return undefined;
    }
}

function safeMedia(event: PollinationsAgentEvent): RenderedMedia | null {
    if (event.type !== "resource.finalized") return null;
    try {
        const url = new URL(event.url);
        if (url.protocol !== "https:") return null;
        return {
            kind: event.kind,
            url: url.href,
            ...(event.name ? { label: event.name } : {}),
        };
    } catch {
        return null;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "The response failed.";
}

function isCancellation(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "CANCELLED")
    );
}

function activityChunk(
    event: Extract<PollinationsAgentEvent, { type: `tool.${string}` }>,
): UIMessageChunk<unknown, PollinationsChatData> {
    return {
        type: "data-activity",
        id: event.call_id,
        data: {
            callId: event.call_id,
            name: event.name,
            status:
                event.type === "tool.started"
                    ? "running"
                    : event.type === "tool.failed"
                      ? "failed"
                      : "complete",
        },
    };
}

/**
 * Vercel AI SDK transport for the current Pollinations chat stream.
 * A future Responses API adapter only needs to emit the same UIMessageChunks.
 */
export class PollinationsChatTransport
    implements ChatTransport<PollinationsUIMessage>
{
    constructor(private readonly options: PollinationsChatTransportOptions) {}

    async sendMessages({
        messages,
        abortSignal,
    }: Parameters<ChatTransport<PollinationsUIMessage>["sendMessages"]>[0]) {
        const { client, model, routing } = this.options;
        if (!client || !model)
            throw new Error("Select an agent and connect first.");
        return new ReadableStream<UIMessageChunk>({
            async start(controller) {
                const messageId = crypto.randomUUID();
                let textId: string | null = null;
                let finalReason: FinishReason = "stop";
                let contentBuffer = "";
                const emittedMedia = new Set<string>();

                const endText = () => {
                    if (!textId) return;
                    controller.enqueue({ type: "text-end", id: textId });
                    textId = null;
                };
                const emitText = (text: string) => {
                    if (!text) return;
                    if (!textId) {
                        textId = crypto.randomUUID();
                        controller.enqueue({ type: "text-start", id: textId });
                    }
                    controller.enqueue({
                        type: "text-delta",
                        id: textId,
                        delta: text,
                    });
                };
                const emitMedia = (media: RenderedMedia, id: string) => {
                    if (emittedMedia.has(media.url)) return;
                    emittedMedia.add(media.url);
                    controller.enqueue({ type: "data-media", id, data: media });
                };
                const emitParsedContent = (content: string) => {
                    const parts = parseAgentMessage(content);
                    for (const part of parts) {
                        if (part.type === "tool-call") {
                            endText();
                            controller.enqueue({
                                type: "tool-input-available",
                                toolCallId: part.toolCallId,
                                toolName: part.toolName,
                                input: part.args,
                                dynamic: true,
                                providerExecuted: true,
                            });
                            if (part.isError) {
                                controller.enqueue({
                                    type: "tool-output-error",
                                    toolCallId: part.toolCallId,
                                    errorText: outputText(part.result),
                                    dynamic: true,
                                    providerExecuted: true,
                                });
                            } else {
                                controller.enqueue({
                                    type: "tool-output-available",
                                    toolCallId: part.toolCallId,
                                    output: part.result,
                                    dynamic: true,
                                    providerExecuted: true,
                                });
                            }
                            continue;
                        }

                        const extracted = extractStreamedMedia(part.text);
                        if (extracted.media.length === 0) {
                            emitText(part.text);
                            continue;
                        }
                        endText();
                        for (const media of extracted.media) {
                            emitMedia(media, `media:${media.url}`);
                        }
                    }
                };
                const partialToolPrefix = (content: string) => {
                    const lower = content.toLowerCase();
                    const token = "<details";
                    for (
                        let length = Math.min(token.length - 1, lower.length);
                        length > 0;
                        length--
                    ) {
                        if (token.startsWith(lower.slice(-length)))
                            return length;
                    }
                    return 0;
                };
                const flushContent = (final = false) => {
                    while (contentBuffer) {
                        const lower = contentBuffer.toLowerCase();
                        const toolIndex = lower.indexOf("<details");
                        const bracketIndex = contentBuffer.indexOf("[");
                        const linkIndex =
                            bracketIndex > 0 &&
                            contentBuffer[bracketIndex - 1] === "!"
                                ? bracketIndex - 1
                                : bracketIndex;
                        const starts = [toolIndex, linkIndex].filter(
                            (index) => index >= 0,
                        );
                        const specialIndex =
                            starts.length > 0 ? Math.min(...starts) : -1;

                        if (specialIndex < 0) {
                            if (!textId && contentBuffer.trim() === "") {
                                if (final) contentBuffer = "";
                                return;
                            }
                            const pendingLength = final
                                ? 0
                                : Math.max(
                                      partialToolPrefix(contentBuffer),
                                      contentBuffer.endsWith("!") ? 1 : 0,
                                  );
                            const safeLength =
                                contentBuffer.length - pendingLength;
                            emitText(contentBuffer.slice(0, safeLength));
                            contentBuffer = contentBuffer.slice(safeLength);
                            return;
                        }

                        if (specialIndex > 0) {
                            const prefix = contentBuffer.slice(0, specialIndex);
                            if (textId || prefix.trim()) emitText(prefix);
                            contentBuffer = contentBuffer.slice(specialIndex);
                            continue;
                        }

                        if (
                            contentBuffer.toLowerCase().startsWith("<details")
                        ) {
                            const closeIndex = contentBuffer
                                .toLowerCase()
                                .indexOf("</details>");
                            if (closeIndex < 0) {
                                if (final) {
                                    emitText(contentBuffer);
                                    contentBuffer = "";
                                }
                                return;
                            }
                            const end = closeIndex + "</details>".length;
                            emitParsedContent(contentBuffer.slice(0, end));
                            contentBuffer = contentBuffer.slice(end);
                            continue;
                        }

                        const labelEnd = contentBuffer.indexOf("]");
                        if (labelEnd < 0) {
                            if (final) {
                                emitText(contentBuffer);
                                contentBuffer = "";
                            }
                            return;
                        }
                        if (contentBuffer[labelEnd + 1] !== "(") {
                            const end = labelEnd + 1;
                            emitText(contentBuffer.slice(0, end));
                            contentBuffer = contentBuffer.slice(end);
                            continue;
                        }
                        const linkEnd = contentBuffer.indexOf(
                            ")",
                            labelEnd + 2,
                        );
                        if (linkEnd < 0) {
                            if (final) {
                                emitText(contentBuffer);
                                contentBuffer = "";
                            }
                            return;
                        }
                        const end = linkEnd + 1;
                        const candidate = contentBuffer.slice(0, end);
                        const extracted = extractStreamedMedia(candidate);
                        if (extracted.media.length === 0) {
                            emitText(candidate);
                        } else {
                            endText();
                            for (const media of extracted.media) {
                                emitMedia(media, `media:${media.url}`);
                            }
                        }
                        contentBuffer = contentBuffer.slice(end);
                    }
                };

                controller.enqueue({ type: "start", messageId });
                controller.enqueue({ type: "start-step" });
                try {
                    for await (const streamEvent of client.chatEventStream(
                        messagesForPollinations(messages),
                        { model, routing, signal: abortSignal },
                    )) {
                        if (streamEvent.type === "agent") {
                            const event = streamEvent.event;
                            if (event.type.startsWith("tool.")) {
                                controller.enqueue(
                                    activityChunk(
                                        event as Extract<
                                            PollinationsAgentEvent,
                                            { type: `tool.${string}` }
                                        >,
                                    ),
                                );
                            }
                            const media = safeMedia(event);
                            if (media)
                                emitMedia(media, `resource:${event.call_id}`);
                            continue;
                        }

                        const chunk = streamEvent.chunk;
                        finalReason = finishReason(chunk) ?? finalReason;
                        const delta = chunk.choices[0]?.delta;
                        for (const toolCall of delta?.tool_calls ?? []) {
                            const name = toolCall.function?.name?.trim();
                            if (!name) continue;
                            const callId =
                                toolCall.id?.trim() ||
                                `openai-tool-${toolCall.index}`;
                            controller.enqueue({
                                type: "data-activity",
                                id: callId,
                                data: {
                                    callId,
                                    name,
                                    status: "running",
                                },
                            });
                        }
                        if (delta?.content) {
                            contentBuffer += delta.content;
                            flushContent();
                        }
                    }
                    flushContent(true);
                    endText();
                    controller.enqueue({ type: "finish-step" });
                    controller.enqueue({
                        type: "finish",
                        finishReason: finalReason,
                    });
                    controller.close();
                } catch (error) {
                    endText();
                    if (isCancellation(error) || abortSignal?.aborted) {
                        controller.enqueue({
                            type: "data-responseStatus",
                            id: "response-status",
                            data: { status: "cancelled" },
                        });
                        controller.enqueue({
                            type: "abort",
                            reason: "cancelled",
                        });
                        controller.close();
                        return;
                    }
                    controller.error(new Error(errorMessage(error)));
                }
            },
        });
    }

    async reconnectToStream() {
        return null;
    }
}
