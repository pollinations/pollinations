import type {
    ChatRouting,
    ChatStreamChunk,
    Message,
    MessageContentPart,
    Pollinations,
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
    errorMessage,
    isCancellation,
    parseAgentMessage,
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
    responseStatus: { status: "cancelled" };
};

export type PollinationsUIMessage = UIMessage<
    PollinationsMessageMetadata,
    PollinationsChatData
>;

type PollinationsChatClient = Pick<Pollinations, "chatStream">;

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

function messageText(message: PollinationsUIMessage): string {
    return message.parts
        .map((part) => {
            if (part.type === "text") return part.text;
            if (part.type === "dynamic-tool") return serializeToolPart(part);
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
                let linePrefix = "";
                let codeFence: string | null = null;
                let inlineCode: string | null = null;

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

                        emitText(part.text);
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
                const consume = (length: number) => {
                    const source = contentBuffer.slice(0, length);
                    contentBuffer = contentBuffer.slice(length);
                    const newline = source.lastIndexOf("\n");
                    linePrefix =
                        newline < 0
                            ? linePrefix + source
                            : source.slice(newline + 1);
                    return source;
                };
                const flushContent = (final = false) => {
                    while (contentBuffer) {
                        // Code is literal content: do not turn example tool
                        // markup into tool-call parts. Keep delimiters across
                        // provider chunks, including a split closing fence.
                        if (codeFence) {
                            const newline = contentBuffer.indexOf("\n");
                            if (/^ {0,3}$/.test(linePrefix)) {
                                if (newline < 0 && !final) return;
                                const line =
                                    linePrefix +
                                    contentBuffer.slice(
                                        0,
                                        newline < 0 ? undefined : newline,
                                    );
                                if (
                                    new RegExp(
                                        `^ {0,3}${codeFence[0]}{${codeFence.length},}[\\t \\r]*$`,
                                    ).test(line)
                                )
                                    codeFence = null;
                            }
                            emitText(
                                consume(
                                    newline < 0
                                        ? contentBuffer.length
                                        : newline + 1,
                                ),
                            );
                            continue;
                        }
                        if (inlineCode) {
                            const nextTick = contentBuffer.indexOf("`");
                            if (nextTick !== 0) {
                                emitText(
                                    consume(
                                        nextTick < 0
                                            ? contentBuffer.length
                                            : nextTick,
                                    ),
                                );
                                continue;
                            }
                            const delimiter = contentBuffer.match(/^`+/)?.[0];
                            if (!delimiter) return;
                            if (
                                delimiter.length === contentBuffer.length &&
                                !final
                            )
                                return;
                            if (delimiter === inlineCode) inlineCode = null;
                            emitText(consume(delimiter.length));
                            continue;
                        }
                        const lower = contentBuffer.toLowerCase();
                        const toolIndex = lower.indexOf("<details");
                        const literalIndex = contentBuffer.search(/[`~]/);
                        const starts = [toolIndex, literalIndex].filter(
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
                                : partialToolPrefix(contentBuffer);
                            const safeLength =
                                contentBuffer.length - pendingLength;
                            emitText(consume(safeLength));
                            return;
                        }

                        if (specialIndex > 0) {
                            const prefix = consume(specialIndex);
                            if (textId || prefix.trim()) emitText(prefix);
                            continue;
                        }

                        if (/^[`~]/.test(contentBuffer)) {
                            const delimiter =
                                contentBuffer.match(/^(`+|~+)/)?.[0];
                            if (!delimiter) return;
                            if (
                                delimiter.length === contentBuffer.length &&
                                !final
                            )
                                return;
                            if (
                                delimiter.length >= 3 &&
                                /^ {0,3}$/.test(linePrefix)
                            )
                                codeFence = delimiter;
                            else if (delimiter[0] === "`")
                                inlineCode = delimiter;
                            emitText(consume(delimiter.length));
                            continue;
                        }

                        // Only remaining case at specialIndex 0: "<details".
                        const closeIndex = contentBuffer
                            .toLowerCase()
                            .indexOf("</details>");
                        if (closeIndex < 0) {
                            if (final) {
                                emitText(consume(contentBuffer.length));
                            }
                            return;
                        }
                        const end = closeIndex + "</details>".length;
                        emitParsedContent(consume(end));
                    }
                };

                controller.enqueue({ type: "start", messageId });
                controller.enqueue({ type: "start-step" });
                try {
                    for await (const chunk of client.chatStream(
                        messagesForPollinations(messages),
                        { model, routing, signal: abortSignal },
                    )) {
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
