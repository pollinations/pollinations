import { z } from "zod";
import { McpCallSchema, safeMcpModelOutput, safeMcpOutput } from "./mcp.ts";
import type { AgentPart } from "./runtime.ts";

const MessageSchema = z.object({
    type: z.literal("message"),
    id: z.string(),
    role: z.literal("assistant"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    content: z.array(
        z.object({
            type: z.literal("output_text"),
            text: z.string(),
            annotations: z.array(z.unknown()),
            logprobs: z.array(z.unknown()),
        }),
    ),
});
const OutputItemSchema = z.discriminatedUnion("type", [
    MessageSchema,
    McpCallSchema,
]);
export type AgentOutputItem = z.infer<typeof OutputItemSchema>;

/** One ordered output collector serves JSON responses and streaming events. */
export function collectOutput(
    send?: (type: string, payload: Record<string, unknown>) => void,
) {
    const items: AgentOutputItem[] = [];
    let message: z.infer<typeof MessageSchema> | undefined;
    const closeMessage = (status: "completed" | "incomplete" = "completed") => {
        if (!message) return;
        message.status = status;
        const position = {
            item_id: message.id,
            output_index: items.indexOf(message),
            content_index: 0,
        };
        send?.("response.output_text.done", {
            ...position,
            text: message.content[0].text,
            logprobs: [],
        });
        send?.("response.content_part.done", {
            ...position,
            part: message.content[0],
        });
        send?.("response.output_item.done", {
            output_index: position.output_index,
            item: message,
        });
        message = undefined;
    };
    return {
        items,
        onPart(part: AgentPart) {
            if (part.type === "text-delta") {
                if (!part.text) return;
                if (!message) {
                    message = {
                        id: `msg_${crypto.randomUUID()}`,
                        type: "message",
                        role: "assistant",
                        status: "in_progress",
                        content: [],
                    };
                    items.push(message);
                    send?.("response.output_item.added", {
                        output_index: items.length - 1,
                        item: message,
                    });
                    message.content.push({
                        type: "output_text",
                        text: "",
                        annotations: [],
                        logprobs: [],
                    });
                    send?.("response.content_part.added", {
                        item_id: message.id,
                        output_index: items.length - 1,
                        content_index: 0,
                        part: message.content[0],
                    });
                }
                message.content[0].text += part.text;
                send?.("response.output_text.delta", {
                    item_id: message.id,
                    output_index: items.indexOf(message),
                    content_index: 0,
                    delta: part.text,
                    logprobs: [],
                });
                return;
            }
            if (part.type === "tool-call") {
                closeMessage();
                const [, serverLabel, name] =
                    /^mcp__(.*?)__(.*)$/.exec(part.toolName) ?? [];
                const item = McpCallSchema.parse({
                    type: "mcp_call",
                    id: part.toolCallId,
                    server_label: serverLabel,
                    name,
                    arguments: JSON.stringify(part.input ?? {}),
                    status: "in_progress",
                    output: null,
                    error: null,
                });
                items.push(item);
                const position = {
                    item_id: item.id,
                    output_index: items.length - 1,
                };
                send?.("response.output_item.added", {
                    output_index: position.output_index,
                    item,
                });
                send?.("response.mcp_call.in_progress", position);
                send?.("response.mcp_call_arguments.done", {
                    ...position,
                    arguments: item.arguments,
                });
                return;
            }
            const index = items.findIndex(
                (item) => item.id === part.toolCallId,
            );
            const item = items[index];
            if (!item || item.type !== "mcp_call") {
                throw new Error("Agent tool result has no matching call");
            }
            if (part.type === "tool-error") {
                item.error =
                    part.error instanceof Error
                        ? part.error.message
                        : String(part.error);
            } else {
                const result = safeMcpOutput(part.output);
                item.output = JSON.stringify(result);
                if (result.isError) {
                    const output = safeMcpModelOutput({ output: result });
                    item.error =
                        output.type === "text"
                            ? output.value
                            : output.value.map((part) => part.text).join("\n");
                }
            }
            item.status = item.error === null ? "completed" : "failed";
            send?.(`response.mcp_call.${item.status}`, {
                item_id: item.id,
                output_index: index,
            });
            send?.("response.output_item.done", { output_index: index, item });
        },
        finish(finishReason: string): AgentOutputItem[] {
            if (
                !items.some(
                    (item) =>
                        item.type === "mcp_call" ||
                        item.content.some((part) => part.text.trim()),
                )
            ) {
                throw new Error("Agent produced no response");
            }
            closeMessage(
                finishReason === "length" || finishReason === "content_filter"
                    ? "incomplete"
                    : "completed",
            );
            return z.array(OutputItemSchema).parse(items);
        },
    };
}
