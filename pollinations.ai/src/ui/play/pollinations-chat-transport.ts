import type {
    Message,
    MessageContentPart,
    Pollinations,
} from "@pollinations/sdk";
import type { ChatTransport, FileUIPart, UIMessage, UIMessageChunk } from "ai";
import {
    audioFormat,
    buildUserContent,
    errorMessage,
    fileKind,
    isCancellation,
} from "./chat-models";

type PollinationsChatData = {
    activity: { name: string };
    responseStatus: { status: "cancelled" };
};

export type PollinationsUIMessage = UIMessage<unknown, PollinationsChatData>;

type PollinationsChatClient = Pick<Pollinations, "chatStream">;

interface PollinationsChatTransportOptions {
    client: PollinationsChatClient | null;
    model: string | null;
}

function messageText(message: PollinationsUIMessage): string {
    return message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
}

/** Uploaded files go by URL; audio travels inline because the API takes it as base64. */
function filePart({
    url,
    mediaType,
    filename = "",
}: FileUIPart): MessageContentPart {
    const file = { name: filename, type: mediaType };
    const kind = fileKind(file);
    if (kind === "image")
        return { type: "image_url", image_url: { url, mime_type: mediaType } };
    if (kind === "video")
        return { type: "video_url", video_url: { url, mime_type: mediaType } };
    if (kind === "audio") {
        const format = audioFormat(file);
        if (!format)
            throw new Error(`${filename} uses an unsupported audio format.`);
        return {
            type: "input_audio",
            input_audio: { data: url.slice(url.indexOf(",") + 1), format },
        };
    }
    return {
        type: "file",
        file: { file_url: url, file_name: filename, mime_type: mediaType },
    };
}

/**
 * Convert UI messages to the OpenAI-compatible Pollinations input. Agent
 * replies go back verbatim, tool markup included.
 */
export function messagesForPollinations(
    messages: PollinationsUIMessage[],
): Message[] {
    return messages.flatMap((message): Message[] => {
        const text = messageText(message);
        if (message.role === "user") {
            return [
                {
                    role: "user",
                    content: buildUserContent(
                        text,
                        message.parts.flatMap((part) =>
                            part.type === "file" ? [filePart(part)] : [],
                        ),
                    ),
                },
            ];
        }
        const content = text.trim();
        return content ? [{ role: message.role, content }] : [];
    });
}

/**
 * Vercel AI SDK transport for the Pollinations chat stream. The reply stays
 * one raw text part; Chat draws tool cards from its markup.
 */
export function pollinationsChatTransport({
    client,
    model,
}: PollinationsChatTransportOptions): ChatTransport<PollinationsUIMessage> {
    return {
        async sendMessages({ messages, abortSignal }) {
            if (!client || !model)
                throw new Error("Select an agent and connect first.");
            return new ReadableStream<UIMessageChunk>({
                async start(controller) {
                    const textId = crypto.randomUUID();
                    let textStarted = false;
                    const endText = () => {
                        if (textStarted)
                            controller.enqueue({
                                type: "text-end",
                                id: textId,
                            });
                        textStarted = false;
                    };

                    controller.enqueue({
                        type: "start",
                        messageId: crypto.randomUUID(),
                    });
                    controller.enqueue({ type: "start-step" });
                    try {
                        for await (const chunk of client.chatStream(
                            messagesForPollinations(messages),
                            { model, signal: abortSignal },
                        )) {
                            const delta = chunk.choices[0]?.delta;
                            for (const toolCall of delta?.tool_calls ?? []) {
                                const name = toolCall.function?.name?.trim();
                                if (!name) continue;
                                controller.enqueue({
                                    type: "data-activity",
                                    id:
                                        toolCall.id?.trim() ||
                                        `openai-tool-${toolCall.index}`,
                                    data: { name },
                                });
                            }
                            if (!delta?.content) continue;
                            if (!textStarted) {
                                textStarted = true;
                                controller.enqueue({
                                    type: "text-start",
                                    id: textId,
                                });
                            }
                            controller.enqueue({
                                type: "text-delta",
                                id: textId,
                                delta: delta.content,
                            });
                        }
                        endText();
                        controller.enqueue({ type: "finish-step" });
                        controller.enqueue({ type: "finish" });
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
        },
        async reconnectToStream() {
            return null;
        },
    };
}
