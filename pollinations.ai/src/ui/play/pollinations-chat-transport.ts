import {
    type ChatTransport,
    type InferUIMessageChunk,
    jsonSchema,
    parseJsonEventStream,
    type UIMessage,
} from "ai";
import { API_BASE_URL } from "../../config";
import { errorMessage, isCancellation } from "./chat-models";

/** A raw Responses output item. Replies send theirs back unchanged. */
type OutputItem = { type: string; id?: string };

/** A tool the agent ran on the server. */
interface McpCall {
    type: "mcp_call";
    id: string;
    name: string;
    arguments: string;
    status: string;
    output: string | null;
    error: { message: string } | { content: unknown } | null;
}

type ResponseEvent =
    | { type: "response.output_text.delta"; item_id: string; delta: string }
    | {
          type: "response.output_item.added" | "response.output_item.done";
          item: OutputItem;
      }
    | {
          type: "response.completed" | "response.incomplete";
          response: { output: OutputItem[] };
      }
    | {
          type: "response.failed";
          response: { error: { message: string } | null };
      }
    | { type: "error"; message: string };

type ChatMetadata = { output: OutputItem[] };

type ChatData = { responseStatus: { status: "cancelled" } };

export type PollinationsUIMessage = UIMessage<ChatMetadata, ChatData>;

type ChatChunk = InferUIMessageChunk<PollinationsUIMessage>;

type McpContent = {
    type: string;
    text?: string;
    uri?: string;
    mimeType?: string;
};

function isMcpCall(item: OutputItem): item is McpCall {
    return item.type === "mcp_call";
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function mcpContent(value: unknown): McpContent[] | undefined {
    return value &&
        typeof value === "object" &&
        "content" in value &&
        Array.isArray(value.content)
        ? value.content
        : undefined;
}

/** MCP results show their text and links; other tools show their JSON. */
function readable(value: unknown): unknown {
    const content = mcpContent(value);
    if (!content) return value;
    return content.flatMap((part) => part.text ?? part.uri ?? []).join("\n");
}

function toolError({ error }: McpCall): string {
    if (!error) return "Tool failed";
    if ("message" in error) return error.message;
    const value = readable(error.content);
    return typeof value === "string" ? value : JSON.stringify(value);
}

/** Generated media arrives as MCP resource links; show it as files. */
function mediaFiles(value: unknown): ChatChunk[] {
    return (mcpContent(value) ?? []).flatMap((part): ChatChunk[] => {
        const mediaType = part.mimeType ?? "";
        return part.type === "resource_link" &&
            part.uri?.startsWith("https://") &&
            /^(image|audio|video)\//.test(mediaType)
            ? [{ type: "file", url: part.uri, mediaType }]
            : [];
    });
}

async function failureMessage(response: Response): Promise<string> {
    const body = await response.json().catch(() => null);
    const error = body?.error ?? body;
    return typeof error?.message === "string"
        ? error.message
        : `Request failed with status ${response.status}`;
}

type InputContent =
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" };

function userContent(part: PollinationsUIMessage["parts"][number]) {
    const content: InputContent[] = [];
    if (part.type === "text")
        content.push({ type: "input_text", text: part.text });
    if (part.type === "file")
        content.push({
            type: "input_image",
            image_url: part.url,
            detail: "auto",
        });
    return content;
}

/**
 * Responses input for a chat: user turns from their parts, agent turns as
 * the raw output items they produced. Failed or stopped replies have none.
 */
export function responsesInput(messages: PollinationsUIMessage[]) {
    return messages.flatMap((message) =>
        message.role === "user"
            ? [
                  {
                      type: "message",
                      role: "user",
                      content: message.parts.flatMap(userContent),
                  },
              ]
            : (message.metadata?.output ?? []),
    );
}

/**
 * Vercel AI SDK transport for the stateless Responses API. Text streams as
 * text parts, server-run tools as dynamic tool parts, and the finished
 * reply's output items ride along as message metadata for the next turn.
 */
export function pollinationsChatTransport({
    apiKey,
    model,
}: {
    apiKey: string | null;
    model: string | null;
}): ChatTransport<PollinationsUIMessage> {
    return {
        async sendMessages({ messages, abortSignal }) {
            if (!apiKey || !model)
                throw new Error("Select an agent and connect first.");
            return new ReadableStream<ChatChunk>({
                async start(controller) {
                    const send = (chunk: ChatChunk) =>
                        controller.enqueue(chunk);
                    const openText = new Set<string>();
                    const endText = () => {
                        for (const id of openText)
                            send({ type: "text-end", id });
                        openText.clear();
                    };
                    const tool = { dynamic: true, providerExecuted: true };

                    send({ type: "start", messageId: crypto.randomUUID() });
                    send({ type: "start-step" });
                    try {
                        const response = await fetch(
                            `${API_BASE_URL}/v1/responses`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${apiKey}`,
                                },
                                body: JSON.stringify({
                                    model,
                                    input: responsesInput(messages),
                                    stream: true,
                                    store: false,
                                }),
                                signal: abortSignal,
                            },
                        );
                        if (!response.ok || !response.body)
                            throw new Error(await failureMessage(response));
                        const reader = parseJsonEventStream({
                            stream: response.body,
                            schema: jsonSchema<ResponseEvent>({}),
                        }).getReader();
                        let finished = false;
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            if (!value.success) throw value.error;
                            const event = value.value;
                            if (event.type === "response.output_text.delta") {
                                if (!openText.has(event.item_id)) {
                                    openText.add(event.item_id);
                                    send({
                                        type: "text-start",
                                        id: event.item_id,
                                    });
                                }
                                send({
                                    type: "text-delta",
                                    id: event.item_id,
                                    delta: event.delta,
                                });
                            } else if (
                                event.type === "response.output_item.added" &&
                                isMcpCall(event.item)
                            ) {
                                endText();
                                send({
                                    type: "tool-input-available",
                                    toolCallId: event.item.id,
                                    toolName: event.item.name,
                                    input: parseJson(event.item.arguments),
                                    ...tool,
                                });
                            } else if (
                                event.type === "response.output_item.done" &&
                                isMcpCall(event.item)
                            ) {
                                const item = event.item;
                                const output =
                                    item.output === null
                                        ? null
                                        : parseJson(item.output);
                                if (item.status === "failed" || item.error) {
                                    send({
                                        type: "tool-output-error",
                                        toolCallId: item.id,
                                        errorText: toolError(item),
                                        ...tool,
                                    });
                                } else {
                                    send({
                                        type: "tool-output-available",
                                        toolCallId: item.id,
                                        output: readable(output),
                                        ...tool,
                                    });
                                    for (const file of mediaFiles(output))
                                        send(file);
                                }
                            } else if (
                                event.type === "response.completed" ||
                                event.type === "response.incomplete"
                            ) {
                                finished = true;
                                endText();
                                send({ type: "finish-step" });
                                send({
                                    type: "finish",
                                    messageMetadata: {
                                        output: event.response.output,
                                    },
                                });
                            } else if (event.type === "response.failed") {
                                throw new Error(
                                    event.response.error?.message ??
                                        "The agent could not finish this response.",
                                );
                            } else if (event.type === "error") {
                                throw new Error(event.message);
                            }
                        }
                        if (!finished)
                            throw new Error("The response ended early.");
                        controller.close();
                    } catch (error) {
                        endText();
                        if (isCancellation(error) || abortSignal?.aborted) {
                            send({
                                type: "data-responseStatus",
                                id: "response-status",
                                data: { status: "cancelled" },
                            });
                            send({ type: "abort", reason: "cancelled" });
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
